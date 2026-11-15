// 앱 시작점: 데이터 불러오기 → 장면 만들기 → 입력·UI 연결 → 매 프레임 그리기.
import {
  angularSeparation,
  applyMat3,
  azAltToVec,
  equatorialToWorldMatrix,
  refractionDeg,
  vecToAzAlt,
  type Mat3,
  type Vec3,
} from './astro/coords';
import { starLabel, type KoreanNames, type StarNames } from './astro/names';
import { clampView, pixelsToDegrees, unrefract, FOV_MAX, FOV_MIN, type View } from './astro/projection';
import {
  allBodies,
  BODY_NAMES_KO,
  findTonight,
  moonIsWaxing,
  moonPhase,
  PLANET_IDS,
  type BodyId,
  type BodyState,
  type MoonPhase,
} from './astro/solar-system';
import { parseStars, pickStar, starVec, type StarCatalog } from './astro/stars';
import { formatLocal } from './astro/time';
import { DragInput } from './input/drag';
import { cityPlace, DEFAULT_PLACE, requestLocation, type Place } from './input/location';
import { OrientationSensor, requestOrientationPermission, type SensorPermission } from './input/orientation';
import { cameraAzAlt, magneticDeclination } from './input/orientation-math';
import { Aurora } from './render/aurora';
import { ConstellationLines, type ConstellationData, type ConstellationFile } from './render/constellations';
import { Meteors } from './render/meteors';
import { loadMilkyWay } from './render/milkyway';
import { apparentDir, MoonAndPlanets } from './render/moon-planets';
import { QualityMonitor } from './render/quality';
import { SkyScene } from './render/scene';
import { skyPalette, type SkyPalette } from './render/sky-color';
import { StarField } from './render/stars';
import { loadCalibration, loadSettings, parseUrlParams, saveCalibration, saveSettings, type SettingKey } from './state';
import { DebugPanel, installErrorLog, logError, recentErrors } from './ui/debug-panel';
import { bodyCard, InfoCard, starCard } from './ui/info-card';
import { LabelLayer, type LabelItem } from './ui/labels';
import { GPS_OPTION, SettingsPanel } from './ui/settings';
import { isKakaoInApp, KAKAO_HINT, showFallback, StartScreen, Toast } from './ui/start-screen';

const BASE = import.meta.env.BASE_URL;
const params = parseUrlParams(window.location.search);
const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

interface SkyData {
  catalog: StarCatalog;
  names: StarNames;
  ko: KoreanNames;
  constellations: ConstellationData[];
}

async function fetchOk(url: string): Promise<Response> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} 불러오기 실패 (${res.status})`);
  return res;
}

async function loadData(): Promise<SkyData> {
  const [bin, names, ko, cons] = await Promise.all([
    fetchOk(`${BASE}data/stars.bin`).then((r) => r.arrayBuffer()),
    fetchOk(`${BASE}data/star-names.json`).then((r) => r.json() as Promise<StarNames>),
    fetchOk(`${BASE}data/names-ko.json`).then((r) => r.json() as Promise<KoreanNames>),
    fetchOk(`${BASE}data/constellations.json`).then((r) => r.json() as Promise<ConstellationFile>),
  ]);
  return { catalog: parseStars(bin), names, ko, constellations: cons.constellations };
}

type Selection = { kind: 'star'; index: number } | { kind: 'body'; id: BodyId } | null;

const CARDINALS: Array<[string, number]> = [
  ['북', 0],
  ['동', 90],
  ['남', 180],
  ['서', 270],
];

class App {
  private readonly settings = loadSettings(params);
  private place: Place =
    params.lat !== null && params.lon !== null
      ? { name: '지정한 위치', lat: params.lat, lon: params.lon, source: 'url' }
      : DEFAULT_PLACE;
  private view: View = clampView({ az: params.az ?? 180, alt: params.alt ?? 35, fov: params.fov ?? 70 });
  private mode: 'drag' | 'sensor' = 'drag';

  // 시간: t 파라미터가 있으면 그 순간에 멈춘다. 없으면 실제 시간이 흐른다.
  private frozenTime: Date | null = params.t;
  private timeOffsetMs = 0;
  private jumpedToTonight = false;

  // 무작위 연출: seed가 있으면 움직임을 멈춘 한 장면(같은 URL = 같은 화면)
  private readonly seed = params.seed ?? Math.floor(Math.random() * 1_000_000);
  private readonly staticScene = params.seed !== null;
  private animTime = 0;

  private readonly canvas = el<HTMLCanvasElement>('sky');
  private readonly sky: SkyScene;
  private readonly stars: StarField;
  private readonly lines: ConstellationLines;
  private readonly moonPlanets = new MoonAndPlanets();
  private readonly meteors: Meteors;
  private readonly aurora: Aurora;
  private readonly quality = new QualityMonitor();
  private readonly sensor = new OrientationSensor();

  private readonly labels = new LabelLayer(el('labels'));
  private readonly toast = new Toast();
  private readonly card = new InfoCard(() => this.select(null));
  private readonly panel: SettingsPanel;
  private readonly debug = new DebugPanel(params.debug === '1');
  private readonly ring = el('ring');
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  private matrix: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  private bodies: BodyState[] = [];
  private phase: MoonPhase = { fraction: 0, phaseAngle: 180 };
  private palette: SkyPalette = skyPalette(-30);
  private lastMatrixTime = NaN;
  private lastBodiesTime = NaN;
  private lastClockText = '';

  private selection: Selection = null;
  private velAz = 0;
  private velAlt = 0;
  private lastActivity = performance.now();
  private lastRender = 0;
  private raf = 0;
  private running = false;
  private dirty = true;
  private fps = 60;
  private visibleLabels: LabelItem[] = [];
  private meteorVisible = false;
  private calibrationTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly data: SkyData) {
    this.sky = new SkyScene(this.canvas);
    this.stars = new StarField(data.catalog, this.seed);
    this.lines = new ConstellationLines(data.constellations, data.catalog);
    this.meteors = new Meteors(this.seed);
    this.aurora = new Aurora(this.seed);
    this.sky.scene.add(
      this.aurora.mesh,
      this.lines.mesh,
      this.stars.points,
      this.moonPlanets.planets,
      this.moonPlanets.moon,
      this.meteors.mesh,
    );

    if (this.staticScene) {
      // 고정 장면: 첫 별똥별이 한창 지나가는 순간에 시간을 멈춘다
      const first = this.meteors.schedule.get(0);
      this.animTime = first.start + first.duration * 0.55;
    }

    this.sensor.userOffset = loadCalibration();
    this.panel = new SettingsPanel({
      onChange: (key, value) => this.changeSetting(key, value),
      onCity: (value) => void this.changeCity(value),
      onCalibrationReset: () => {
        this.sensor.userOffset = 0;
        saveCalibration(0);
        this.panel.setCalibration(0);
        this.toast.show('나침반 보정을 처음으로 되돌렸어요');
      },
    });
    this.panel.sync(this.settings);
    this.panel.setCalibration(this.sensor.userOffset);
    this.panel.setPlace(this.place.name, this.place.source === 'city' || this.place.source === 'default');

    new DragInput(this.canvas, {
      onActivity: () => this.touch(),
      onDrag: (dx, dy) => this.onDrag(dx, dy),
      onRelease: (vx, vy) => this.onRelease(vx, vy),
      onZoom: (factor) => this.onZoom(factor),
      onTap: (x, y) => this.onTap(x, y),
    });

    el('btn-tonight').addEventListener('click', () => this.goTonight());
    el('btn-now').addEventListener('click', () => this.goNow());
    el('btn-mode').addEventListener('click', () => this.toggleMode());
    el('btn-about').addEventListener('click', () => {
      this.panel.close();
      el('about').hidden = !el('about').hidden;
    });
    el('about-close').addEventListener('click', () => (el('about').hidden = true));
    el('btn-settings').addEventListener('click', () => (el('about').hidden = true));

    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 200));
    document.addEventListener('visibilitychange', () => (document.hidden ? this.stop() : this.start()));

    // 그래픽 장치를 잃었을 때(다른 앱이 가져가는 등): 멈췄다가 돌아오면 다시 그린다
    let lostTimer: ReturnType<typeof setTimeout> | undefined;
    this.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.stop();
      this.toast.show('화면을 다시 준비하는 중…', 4000);
      lostTimer = setTimeout(() => {
        showFallback('화면이 멈췄어요', '그래픽 화면을 다시 켜지 못했어요. 아래 버튼으로 다시 열어 주세요.', () =>
          window.location.reload(),
        );
      }, 4000);
    });
    this.canvas.addEventListener('webglcontextrestored', () => {
      clearTimeout(lostTimer);
      this.dirty = true;
      this.updateAstro(true);
      this.start();
    });

    this.resize();
    this.updateAstro(true);
    this.applySettings();
    this.setMode('drag');
  }

  // ───────── 시간 ─────────

  private simTime(): Date {
    return this.frozenTime ?? new Date(Date.now() + this.timeOffsetMs);
  }

  private goTonight(): void {
    const result = findTonight(this.simTime(), this.place.lat, this.place.lon);
    if (params.t) this.frozenTime = result.date;
    else this.timeOffsetMs = result.date.getTime() - Date.now();
    this.jumpedToTonight = true;
    this.updateAstro(true);
    this.toast.show(
      result.kind === 'astronomical'
        ? '오늘 밤, 하늘이 완전히 어두워지는 시각으로 옮겼어요'
        : '여기는 지금 밤이 완전히 어두워지지 않아요. 가장 어두운 시각으로 옮겼어요',
    );
  }

  private goNow(): void {
    this.frozenTime = params.t;
    this.timeOffsetMs = 0;
    this.jumpedToTonight = false;
    this.updateAstro(true);
  }

  // ───────── 천체 위치 갱신 ─────────

  private body(id: BodyId): BodyState {
    return this.bodies.find((b) => b.id === id)!;
  }

  /** 시간이 흐른 만큼 하늘을 돌린다. 행렬은 0.5초, 달·행성은 5초에 한 번이면 충분하다. */
  private updateAstro(force = false): void {
    const time = this.simTime();
    const ms = time.getTime();
    if (!force && Math.abs(ms - this.lastMatrixTime) < 500) return;
    this.lastMatrixTime = ms;
    this.matrix = equatorialToWorldMatrix(time, this.place.lat, this.place.lon);
    this.stars.setRotation(this.matrix);
    this.lines.setRotation(this.matrix);

    if (force || !(Math.abs(ms - this.lastBodiesTime) < 5000)) {
      this.lastBodiesTime = ms;
      this.bodies = allBodies(time, this.place.lat, this.place.lon);
      this.phase = moonPhase(time);
      const sun = this.body('sun');
      const moon = this.body('moon');
      this.palette = skyPalette(sun.alt, moon.alt, this.phase.fraction);
      this.moonPlanets.setBodies(this.bodies, this.phase, this.palette.night);
      // 해가 -6°보다 높으면(낮·해 질 녘) "오늘 밤으로 보기"
      el('btn-tonight').hidden = !(sun.alt > -6) || this.jumpedToTonight;
      el('btn-now').hidden = !this.jumpedToTonight;
      if (this.selection?.kind === 'body') this.showCard();
    }
    this.sky.updateSky(this.palette, apparentDir(this.body('sun')), this.matrix);
    this.updateClock(time);
    this.dirty = true;
  }

  private updateClock(time: Date): void {
    const where = this.place.source === 'gps' ? this.place.name : `${this.place.name} 기준`;
    const text = `${where}|${formatLocal(time)}${this.jumpedToTonight ? ' · 오늘 밤' : ''}`;
    if (text === this.lastClockText) return;
    this.lastClockText = text;
    const [placeText, clockText] = text.split('|');
    el('place').textContent = placeText;
    el('clock').textContent = clockText;
  }

  // ───────── 설정 ─────────

  private changeSetting(key: SettingKey, value: boolean): void {
    this.settings[key] = value;
    saveSettings(this.settings);
    this.applySettings();
    if (key === 'sensor') {
      if (value) void this.enableSensor(requestOrientationPermission(), true);
      else this.setMode('drag');
    }
    if (key === 'aurora' && value) this.toast.show('오로라 꿈 모드: 북쪽 하늘을 보세요. 실제가 아닌 상상 모드예요');
  }

  private applySettings(): void {
    this.sky.setMilkyWayEnabled(this.settings.milkyway && this.quality.current.milkyWay);
    el('aurora-badge').hidden = !this.settings.aurora;
    this.sensor.declination = this.settings.declination ? magneticDeclination(this.place.lat, this.place.lon) : 0;
    this.dirty = true;
  }

  private async changeCity(value: string): Promise<void> {
    if (value === GPS_OPTION) {
      const result = await requestLocation();
      if (result.ok) this.setPlace(result.place);
      else {
        this.toast.show('위치를 쓸 수 없어요. 도시를 골라 주세요');
        this.panel.setPlace(this.place.name, this.place.source !== 'gps' && this.place.source !== 'url');
      }
      return;
    }
    const place = cityPlace(value);
    if (place) this.setPlace(place);
  }

  private setPlace(place: Place): void {
    this.place = place;
    this.panel.setPlace(place.name, place.source === 'city' || place.source === 'default');
    this.applySettings();
    this.lastClockText = '';
    this.updateAstro(true);
  }

  // ───────── 시작: 방향·위치 허용 ─────────

  /**
   * "하늘 보기 시작" 버튼의 클릭 처리 함수에서 바로 불린다.
   * 방향 센서 허용 요청은 await 없이 맨 먼저 해야 한다(아이폰 규칙).
   */
  begin(): void {
    const permission = this.settings.sensor ? requestOrientationPermission() : null;
    void (async () => {
      const notes: string[] = [];
      if (permission) {
        const note = await this.enableSensor(permission, false);
        if (note) notes.push(note);
      }
      // 이어서 위치. URL로 장소를 정했으면 묻지 않는다
      if (this.place.source !== 'url') {
        const result = await requestLocation();
        if (result.ok) this.setPlace(result.place);
        else {
          notes.push('위치를 쓸 수 없어서 서울 기준으로 보여 줘요. 설정에서 도시를 고를 수 있어요');
          if (isKakaoInApp(navigator.userAgent) && !notes.includes(KAKAO_HINT)) notes.push(KAKAO_HINT);
        }
      }
      if (notes.length > 0) this.toast.show(notes.join('\n'), 7000);
    })();
  }

  /**
   * 센서 모드를 켠다. 안 되면 드래그 모드로 조용히 넘어가고 안내 문구를 돌려준다.
   * @param announce true면 안내 문구를 바로 띄운다
   */
  private async enableSensor(permission: Promise<SensorPermission>, announce: boolean): Promise<string | null> {
    const touchDevice = window.matchMedia('(pointer: coarse)').matches;
    let note: string | null = null;
    const state = await permission;
    if (state === 'granted') {
      this.sensor.start();
      if (await this.sensor.waitForData()) {
        this.setMode('sensor');
        note = '폰을 하늘로 들어 보세요. 방향이 어긋나면 좌우로 드래그해서 맞출 수 있어요';
      } else {
        this.sensor.stop();
        this.setMode('drag');
        // 컴퓨터에서는 당연한 일이라 말하지 않는다
        if (touchDevice || announce) {
          note = window.isSecureContext
            ? '방향 센서를 쓸 수 없어서 손가락으로 둘러보는 모드로 열었어요'
            : '보안 연결(https)이 아니라서 방향 센서를 쓸 수 없어요. 손가락으로 둘러보세요';
          if (isKakaoInApp(navigator.userAgent)) note += `\n${KAKAO_HINT}`;
        }
      }
    } else {
      this.setMode('drag');
      note =
        state === 'denied'
          ? '방향 허용이 꺼져 있어서 손가락으로 둘러보는 모드예요. 다시 켜려면 이 탭을 닫고 새로 열어 주세요'
          : '이 기기에는 방향 센서가 없어서 손가락으로 둘러보는 모드예요';
      if (!touchDevice && !announce && state !== 'denied') note = null;
      if (note && isKakaoInApp(navigator.userAgent)) note += `\n${KAKAO_HINT}`;
    }
    if (announce && note) this.toast.show(note, 6000);
    return note;
  }

  private toggleMode(): void {
    if (this.mode === 'sensor') {
      this.settings.sensor = false;
      this.setMode('drag');
    } else {
      this.settings.sensor = true;
      void this.enableSensor(requestOrientationPermission(), true);
    }
    saveSettings(this.settings);
    this.panel.sync(this.settings);
  }

  private setMode(mode: 'drag' | 'sensor'): void {
    if (mode === 'drag' && this.mode === 'sensor') {
      // 센서로 보던 방향 그대로 드래그 모드로 이어간다
      const p = vecToAzAlt(this.sky.forward());
      this.view = clampView({ az: p.az, alt: p.alt, fov: this.view.fov });
      this.sensor.stop();
    }
    this.mode = mode;
    this.velAz = 0;
    this.velAlt = 0;
    const button = el('btn-mode');
    button.textContent = mode === 'sensor' ? '폰 방향 모드' : '드래그 모드';
    button.setAttribute('aria-pressed', String(mode === 'sensor'));
    this.dirty = true;
    this.touch();
  }

  // ───────── 입력 ─────────

  private touch(): void {
    this.lastActivity = performance.now();
    this.velAz = 0;
    this.velAlt = 0;
  }

  /** 화면 1픽셀이 몇 도인지(화면 가운데 기준). */
  private degPerPixel(): number {
    return this.sky.camera.fov / this.sky.height;
  }

  private onDrag(dx: number, dy: number): void {
    this.lastActivity = performance.now();
    const k = this.degPerPixel();
    if (this.mode === 'sensor') {
      // 센서 모드에서 좌우 드래그 = 나침반 보정. 하늘을 손으로 잡아 옮기는 느낌으로.
      this.sensor.userOffset = ((this.sensor.userOffset - dx * k + 540) % 360) - 180;
      this.panel.setCalibration(this.sensor.userOffset);
      clearTimeout(this.calibrationTimer);
      this.calibrationTimer = setTimeout(() => saveCalibration(this.sensor.userOffset), 400);
      return;
    }
    this.view = clampView({ az: this.view.az - dx * k, alt: this.view.alt + dy * k, fov: this.view.fov });
    this.dirty = true;
  }

  private onRelease(vx: number, vy: number): void {
    if (this.mode === 'sensor') {
      this.toast.show(`나침반 보정: ${this.sensor.userOffset > 0 ? '+' : ''}${this.sensor.userOffset.toFixed(0)}° (다음에도 유지돼요)`, 2500);
      return;
    }
    const k = this.degPerPixel();
    this.velAz = -vx * k;
    this.velAlt = vy * k;
  }

  private onZoom(factor: number): void {
    this.lastActivity = performance.now();
    this.view = { ...this.view, fov: Math.max(FOV_MIN, Math.min(FOV_MAX, this.view.fov / factor)) };
    this.dirty = true;
  }

  /** 별의 겉보기 방향(굴절 반영). 화면에 그려지는 자리. */
  private starApparentDir(index: number): Vec3 {
    const p = vecToAzAlt(applyMat3(this.matrix, starVec(this.data.catalog, index)));
    return azAltToVec(p.az, p.alt + refractionDeg(p.alt));
  }

  private onTap(x: number, y: number): void {
    if (this.panel.isOpen || !el('about').hidden) {
      this.panel.close();
      el('about').hidden = true;
      return;
    }
    const dir = this.sky.unproject(x, y);
    // 손가락 크기(지름 약 44px)를 지금 시야각에서 각도로 바꾼다
    const radius = Math.max(0.4, pixelsToDegrees({ az: 0, alt: 0, fov: this.sky.fov }, this.sky.width, this.sky.height, 22));

    // 달·행성·해가 손가락 안에 있으면 먼저 고른다(별보다 훨씬 눈에 띄므로)
    let bestBody: BodyId | null = null;
    let bestSep = Infinity;
    for (const b of this.bodies) {
      if (b.alt < -1) continue;
      const isPlanet = PLANET_IDS.includes(b.id);
      if (isPlanet && b.mag > this.palette.limitMag + 0.5) continue; // 하늘이 밝아 안 보이는 행성
      if (b.id === 'sun' && this.palette.sunDisc < 0.05) continue;
      const sep = angularSeparation(apparentDir(b), dir) - (isPlanet ? 0 : 0.27);
      if (sep < radius && sep < bestSep) {
        bestSep = sep;
        bestBody = b.id;
      }
    }
    if (bestBody) {
      this.select({ kind: 'body', id: bestBody });
      return;
    }
    const index = pickStar(this.data.catalog, this.matrix, {
      dir: unrefract(dir),
      radiusDeg: radius,
      limitMag: this.palette.limitMag + 0.3,
    });
    this.select(index >= 0 ? { kind: 'star', index } : null);
  }

  private select(selection: Selection): void {
    this.selection = selection;
    this.showCard();
    this.dirty = true;
  }

  private showCard(): void {
    const s = this.selection;
    if (!s) {
      this.card.hide();
      this.ring.hidden = true;
      return;
    }
    if (s.kind === 'star') {
      const c = this.data.catalog;
      const label = starLabel(s.index, c.con[s.index], c.hip[s.index], this.data.names, this.data.ko);
      this.card.show(starCard(label.name, label.constellation, c.mag[s.index], c.distLy[s.index]));
    } else {
      const moon = s.id === 'moon' ? { fraction: this.phase.fraction, waxing: moonIsWaxing(this.simTime()) } : undefined;
      this.card.show(bodyCard(this.body(s.id), moon));
    }
  }

  // ───────── 화면 크기·화질 ─────────

  private pixelRatio(): number {
    return Math.min(window.devicePixelRatio || 1, this.quality.current.maxPixelRatio);
  }

  private resize(): void {
    this.sky.resize(window.innerWidth, window.innerHeight, this.pixelRatio());
    this.dirty = true;
  }

  // ───────── 그리기 ─────────

  start(): void {
    if (this.running || document.hidden) return;
    this.running = true;
    this.lastRender = 0;
    this.raf = requestAnimationFrame(this.frame);
  }

  /** 탭이 숨겨지면 그리기를 멈춘다(배터리). */
  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  /** 가만히 있을 때는 프레임 수를 낮춘다(배터리). 센서 모드는 폰이 계속 움직이므로 제외. */
  private isIdle(now: number): boolean {
    return this.mode === 'drag' && this.velAz === 0 && this.velAlt === 0 && now - this.lastActivity > 3000;
  }

  private readonly frame = (now: number): void => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.frame);
    const idle = this.isIdle(now);
    // 쉬는 중에는 약 20fps로 (반짝임·오로라는 계속 보이게)
    if (idle && this.lastRender > 0 && now - this.lastRender < 48) return;
    const frameMs = this.lastRender > 0 ? now - this.lastRender : 16.7;
    this.lastRender = now;
    const dt = Math.min(0.1, frameMs / 1000);
    this.fps += (1000 / Math.max(frameMs, 1) - this.fps) * 0.1;

    // 자동 화질 조절 (쉬는 중이거나 고정 장면이면 재지 않는다)
    if (!idle && !this.staticScene && this.quality.push(frameMs)) {
      this.resize();
      this.applySettings();
    }

    if (!this.staticScene) this.animTime += dt;
    this.updateAstro();
    this.updateCamera(dt);

    const twinkle = this.settings.twinkle ? (this.reducedMotion ? 0.3 : 1) : 0;
    const common = {
      limitMag: this.palette.limitMag,
      time: this.animTime,
      twinkle,
      pixelRatio: this.sky.pixelRatio,
      fov: this.sky.fov,
    };
    this.stars.update(common);
    this.moonPlanets.update(common);
    this.lines.update({
      visible: this.settings.lines,
      night: this.palette.night,
      bufferSize: this.sky.bufferSize(),
      pixelRatio: this.sky.pixelRatio,
    });
    this.meteorVisible = this.meteors.update(this.animTime, this.settings.meteors, this.palette.night);
    this.aurora.update(
      this.animTime,
      this.staticScene ? 0 : dt,
      this.settings.aurora,
      this.palette.night,
      this.quality.current.auroraDetail,
    );

    if (this.dirty) {
      this.updateOverlay();
      this.dirty = false;
    }
    this.sky.render();
    this.debug.update(now, () => this.debugInfo());
  };

  private updateCamera(dt: number): void {
    if (this.mode === 'sensor') {
      const q = this.sensor.update(dt);
      if (q) {
        this.sky.setQuaternion(q, this.view.fov);
        this.dirty = true; // 폰이 계속 조금씩 움직이므로 이름표도 매번 옮긴다
        return;
      }
    }
    if (this.velAz !== 0 || this.velAlt !== 0) {
      // 관성: 손을 떼도 조금 더 돌다가 부드럽게 멈춘다
      this.view = clampView({
        az: this.view.az + this.velAz * dt,
        alt: this.view.alt + this.velAlt * dt,
        fov: this.view.fov,
      });
      const decay = Math.exp(-dt / 0.32);
      this.velAz *= decay;
      this.velAlt *= decay;
      if (Math.hypot(this.velAz, this.velAlt) < 0.4) {
        this.velAz = 0;
        this.velAlt = 0;
      }
      this.dirty = true;
    }
    if (this.dirty) this.sky.setView(this.view);
  }

  /** 이름표와 선택 고리를 지금 카메라에 맞춰 옮긴다. */
  private updateOverlay(): void {
    const items: LabelItem[] = [];
    const w = this.sky.width;
    const h = this.sky.height;

    for (const [text, az] of CARDINALS) {
      const p = this.sky.project(azAltToVec(az, 0));
      if (p) items.push({ text, x: p.x, y: p.y - 14, kind: 'cardinal', priority: 0 });
    }

    if (this.settings.names) {
      for (const b of this.bodies) {
        if (b.alt < 0) continue;
        if (b.id === 'sun' && this.palette.sunDisc < 0.05) continue;
        if (PLANET_IDS.includes(b.id) && b.mag > this.palette.limitMag) continue;
        const p = this.sky.project(apparentDir(b));
        if (p) items.push({ text: BODY_NAMES_KO[b.id], x: p.x, y: p.y + 20, kind: 'body', priority: 1 });
      }
      if (this.palette.night > 0.3) {
        // 넓게 볼 때는 잘 알려진 별자리만
        const maxRank = this.sky.fov > 85 ? 2 : 3;
        for (const c of this.data.constellations) {
          if (c.rank > maxRank) continue;
          const dir = applyMat3(this.matrix, c.label);
          if (dir[1] < 0.03) continue;
          const p = this.sky.project(dir);
          if (!p) continue;
          const text = this.data.ko.constellations[c.id] ?? c.id;
          items.push({ text, x: p.x, y: p.y, kind: 'constellation', priority: 2 + c.rank, opacity: this.palette.night });
        }
      }
    }
    this.visibleLabels = this.labels.render(items, w, h);

    const s = this.selection;
    if (s) {
      const dir = s.kind === 'star' ? this.starApparentDir(s.index) : apparentDir(this.body(s.id));
      const p = this.sky.project(dir);
      this.ring.hidden = !p;
      if (p) this.ring.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
    }
  }

  private debugInfo() {
    const forward = vecToAzAlt(this.sky.forward());
    return {
      fps: this.fps,
      quality: this.quality.current.label,
      pixelRatio: this.sky.pixelRatio,
      mode: this.mode === 'sensor' ? '센서' : '드래그',
      viewAz: forward.az,
      viewAlt: forward.alt,
      fov: this.sky.fov,
      place: this.place.name,
      lat: this.place.lat,
      lon: this.place.lon,
      time: formatLocal(this.simTime()),
      sunAlt: this.body('sun').alt,
      sensor: this.sensor.reading,
      totalOffset: this.sensor.totalOffset(),
      userOffset: this.sensor.userOffset,
      declination: this.sensor.declination,
      secure: window.isSecureContext,
      userAgent: navigator.userAgent,
    };
  }

  /** 은하수 그림은 별이 먼저 보인 뒤에 받는다(첫 화면을 가볍게). */
  loadMilkyWayLater(): void {
    loadMilkyWay(`${BASE}textures/milkyway.webp`)
      .then((texture) => {
        this.sky.setMilkyWayTexture(texture);
        this.dirty = true;
        document.documentElement.dataset.milkyway = 'ready';
      })
      .catch((e: Error) => logError(e.message));
  }

  /** 자동 테스트와 디버깅에서 들여다보는 상태. */
  snapshot() {
    const forward = vecToAzAlt(this.sky.forward());
    const sensorAzAlt = this.mode === 'sensor' ? cameraAzAlt([...this.sky.camera.quaternion.toArray()] as [number, number, number, number]) : null;
    return {
      mode: this.mode,
      time: this.simTime().toISOString(),
      place: { ...this.place },
      view: { az: forward.az, alt: forward.alt, fov: this.sky.fov },
      sensorAzAlt,
      settings: { ...this.settings },
      sunAlt: this.body('sun').alt,
      limitMag: this.palette.limitMag,
      night: this.palette.night,
      quality: this.quality.level,
      pixelRatio: this.sky.pixelRatio,
      running: this.running,
      labels: this.visibleLabels.map((l) => ({ text: l.text, x: l.x, y: l.y, kind: l.kind })),
      meteorVisible: this.meteorVisible,
      meteorAzAlt: this.meteors.head ? vecToAzAlt(this.meteors.head) : null,
      userOffset: this.sensor.userOffset,
      starCount: this.data.catalog.count,
      errors: recentErrors(),
    };
  }
}

// ───────── ?debug=table: 그림 없이 천체 위치 표 ─────────

async function showTable(): Promise<void> {
  const data = await loadData();
  const place: Place =
    params.lat !== null && params.lon !== null
      ? { name: '지정한 위치', lat: params.lat, lon: params.lon, source: 'url' }
      : DEFAULT_PLACE;
  const time = params.t ?? new Date();
  const m = equatorialToWorldMatrix(time, place.lat, place.lon);
  const rows: Array<[string, number, number, string]> = [];
  for (const b of allBodies(time, place.lat, place.lon)) {
    if (b.alt > 0) rows.push([BODY_NAMES_KO[b.id], b.az, b.alt, b.mag.toFixed(1)]);
  }
  let count = 0;
  for (let i = 0; i < data.catalog.count && count < 20; i++) {
    const p = vecToAzAlt(applyMat3(m, starVec(data.catalog, i)));
    if (p.alt <= 0) continue;
    const label = starLabel(i, data.catalog.con[i], data.catalog.hip[i], data.names, data.ko);
    rows.push([label.name, p.az, p.alt, data.catalog.mag[i].toFixed(1)]);
    count++;
  }
  const root = el('table');
  const title = document.createElement('h2');
  title.textContent = `${place.name} (${place.lat.toFixed(2)}, ${place.lon.toFixed(2)}) · ${formatLocal(time)} · 지평선 위 천체`;
  const note = document.createElement('p');
  note.textContent = '방위각: 북=0° 동=90° 남=180° 서=270° · 고도: 지평선=0° 천정=90° · 대기 굴절 없이 계산한 값';
  const table = document.createElement('table');
  const head = table.insertRow();
  for (const text of ['이름', '방위각(°)', '고도(°)', '등급']) {
    const th = document.createElement('th');
    th.textContent = text;
    head.appendChild(th);
  }
  for (const [name, az, alt, mag] of rows) {
    const tr = table.insertRow();
    for (const text of [name, az.toFixed(2), alt.toFixed(2), mag]) tr.insertCell().textContent = text;
  }
  root.append(title, note, table);
  root.hidden = false;
  for (const id of ['start', 'loading', 'sky']) el(id).hidden = true;
}

// ───────── 시작 ─────────

declare global {
  interface Window {
    __nightSky?: { ready: boolean; snapshot: () => ReturnType<App['snapshot']> };
  }
}

function webglAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

async function boot(): Promise<void> {
  const loading = el('loading');
  loading.hidden = false;
  loading.textContent = '밤하늘 준비 중…';

  if (params.debug === 'table') {
    await showTable();
    return;
  }

  // 3D(WebGL)를 못 켜는 브라우저: 흰 화면 대신 안내
  if (!webglAvailable()) {
    showFallback(
      '이 브라우저에서는 하늘을 그릴 수 없어요',
      '3D 화면(WebGL)을 켤 수 없어요. 사파리나 크롬 같은 다른 브라우저로 열어 보세요.',
      () => void boot(),
    );
    return;
  }

  let data: SkyData;
  try {
    data = await loadData();
  } catch (e) {
    logError((e as Error).message);
    showFallback('별 데이터를 불러오지 못했어요', '인터넷 연결을 확인하고 다시 시도해 주세요.', () => void boot());
    return;
  }

  let app: App;
  try {
    app = new App(data);
  } catch (e) {
    logError((e as Error).message);
    showFallback(
      '이 브라우저에서는 하늘을 그릴 수 없어요',
      '3D 화면(WebGL)을 켤 수 없어요. 사파리나 크롬 같은 다른 브라우저로 열어 보세요.',
      () => void boot(),
    );
    return;
  }

  // az나 alt를 URL로 고정했으면(공유 링크·테스트) 시작 화면 없이 바로 드래그 모드
  const fixedView = params.az !== null || params.alt !== null;
  const startScreen = new StartScreen(() => {
    app.begin();
    el('topbar').hidden = false;
    el('bottombar').hidden = false;
  });
  if (fixedView) {
    startScreen.hide();
    el('topbar').hidden = false;
    el('bottombar').hidden = false;
  } else {
    startScreen.show();
  }

  app.start();
  loading.hidden = true;
  app.loadMilkyWayLater();
  window.__nightSky = { ready: true, snapshot: () => app.snapshot() };
  document.documentElement.dataset.ready = 'true';
}

installErrorLog();
boot().catch((e: Error) => {
  logError(e.message);
  showFallback('하늘을 불러오지 못했어요', '잠시 뒤 다시 시도해 주세요.', () => window.location.reload());
});
