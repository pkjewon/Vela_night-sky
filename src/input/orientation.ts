// 폰 방향 센서: 이벤트를 받아 부드럽게 다듬은 카메라 회전값을 내준다.
// three.js 예제의 옛 DeviceOrientationControls는 쓰지 않고 직접 구현했다.
import {
  angleDiff,
  angleLerp,
  applyYaw,
  deviceToCameraQuat,
  quatSlerp,
  topHeading,
  type Quat,
} from './orientation-math';

/** 아이폰 사파리 전용 속성 */
interface IOSOrientationEvent extends DeviceOrientationEvent {
  webkitCompassHeading?: number;
  webkitCompassAccuracy?: number;
}

interface PermissionRequester {
  requestPermission?: () => Promise<'granted' | 'denied' | 'default'>;
}

export type SensorPermission = 'granted' | 'denied' | 'unsupported';

/**
 * 방향 센서 허용을 요청한다.
 * 아이폰은 버튼을 누른 그 순간에만 허용 창을 띄울 수 있으므로,
 * 반드시 클릭 처리 함수 안에서 다른 비동기 작업보다 먼저(await 없이) 불러야 한다.
 */
export function requestOrientationPermission(): Promise<SensorPermission> {
  if (typeof DeviceOrientationEvent === 'undefined') return Promise.resolve('unsupported');
  const requester = DeviceOrientationEvent as unknown as PermissionRequester;
  if (typeof requester.requestPermission === 'function') {
    try {
      return requester.requestPermission().then(
        (state) => (state === 'granted' ? 'granted' : 'denied'),
        () => 'denied',
      );
    } catch {
      return Promise.resolve('denied');
    }
  }
  // 안드로이드 등: 허용 창 없이 이벤트가 온다. 실제로 값이 오는지는 waitForData로 확인한다.
  return Promise.resolve('granted');
}

export interface SensorReading {
  alpha: number | null;
  beta: number | null;
  gamma: number | null;
  /** 아이폰 나침반 방위(도). 없으면 null */
  compassHeading: number | null;
  /** 아이폰 나침반 정확도(도, 작을수록 좋음). 없으면 null */
  compassAccuracy: number | null;
  /** 절대 방위를 어디서 얻는지 */
  source: 'ios-compass' | 'absolute' | 'relative' | 'none';
  /** 센서에서 구한 방위 보정값(도) */
  compassOffset: number;
  screenAngle: number;
}

function screenAngle(): number {
  const o = window.screen?.orientation;
  if (o && typeof o.angle === 'number') return o.angle;
  const legacy = (window as unknown as { orientation?: number }).orientation;
  return typeof legacy === 'number' ? legacy : 0;
}

export class OrientationSensor {
  /** 다듬기 전 최신 목표값 */
  private target: Quat | null = null;
  /** 화면에 쓰는 부드러운 값 */
  private smoothed: Quat | null = null;
  private listening = false;
  private gotAbsolute = false;
  private compassOffset = 0;
  private hasCompassOffset = false;
  /** 사용자가 드래그로 맞춘 보정값(도) */
  userOffset = 0;
  /** 자기 편각(도). 진짜 북쪽 = 나침반 북쪽 + 편각 */
  declination = 0;
  reading: SensorReading = {
    alpha: null,
    beta: null,
    gamma: null,
    compassHeading: null,
    compassAccuracy: null,
    source: 'none',
    compassOffset: 0,
    screenAngle: 0,
  };

  private readonly onRelative = (e: DeviceOrientationEvent) => this.handle(e, false);
  private readonly onAbsolute = (e: DeviceOrientationEvent) => this.handle(e, true);

  start(): void {
    if (this.listening) return;
    this.listening = true;
    window.addEventListener('deviceorientation', this.onRelative);
    // 안드로이드 크롬: 절대 방위(나침반 기준)가 따로 온다
    window.addEventListener('deviceorientationabsolute' as 'deviceorientation', this.onAbsolute);
  }

  stop(): void {
    if (!this.listening) return;
    this.listening = false;
    window.removeEventListener('deviceorientation', this.onRelative);
    window.removeEventListener('deviceorientationabsolute' as 'deviceorientation', this.onAbsolute);
    this.target = null;
    this.smoothed = null;
  }

  get active(): boolean {
    return this.listening && this.target !== null;
  }

  /** 센서 값이 실제로 오는지 잠깐 기다려 본다(센서 없는 기기 구분). */
  waitForData(timeoutMs = 1500): Promise<boolean> {
    return new Promise((resolve) => {
      const started = performance.now();
      const check = () => {
        if (this.target) resolve(true);
        else if (performance.now() - started > timeoutMs) resolve(false);
        else setTimeout(check, 50);
      };
      check();
    });
  }

  private handle(e: DeviceOrientationEvent, absoluteEvent: boolean): void {
    if (e.alpha === null || e.beta === null || e.gamma === null) return;
    const ios = e as IOSOrientationEvent;
    const hasIosCompass = typeof ios.webkitCompassHeading === 'number' && !Number.isNaN(ios.webkitCompassHeading);

    if (absoluteEvent) this.gotAbsolute = true;
    // 절대 방위 이벤트가 오는 기기에서는 상대 이벤트를 무시한다(둘이 섞이면 튄다)
    else if (this.gotAbsolute) return;

    const angle = screenAngle();
    const raw = deviceToCameraQuat(e.alpha, e.beta, e.gamma, 0);
    let source: SensorReading['source'] = 'relative';

    if (absoluteEvent || (e.absolute && !hasIosCompass)) {
      source = 'absolute';
      this.compassOffset = 0;
      this.hasCompassOffset = true;
    } else if (hasIosCompass) {
      source = 'ios-compass';
      // 아이폰의 alpha는 기준이 임의라서, 나침반 방위와 비교해 얼마나 돌려야 하는지 구한다.
      // 폰 위쪽이 가리키는 방위(센서 계산) vs 나침반이 알려준 방위.
      const top = topHeading(raw);
      // 폰을 똑바로 세우면 위쪽 방위가 불안정하다 → 그때는 마지막 안정적인 보정값을 유지
      if (top.confidence > 0.35) {
        const wanted = angleDiff(ios.webkitCompassHeading!, top.heading);
        if (!this.hasCompassOffset) {
          this.compassOffset = wanted;
          this.hasCompassOffset = true;
        } else {
          // 나침반은 흔들리므로 천천히 따라간다. 0°/360° 경계에서도 튀지 않는다
          this.compassOffset = angleLerp(this.compassOffset, wanted, 0.04);
        }
      }
    }

    this.reading = {
      alpha: e.alpha,
      beta: e.beta,
      gamma: e.gamma,
      compassHeading: hasIosCompass ? ios.webkitCompassHeading! : null,
      compassAccuracy: typeof ios.webkitCompassAccuracy === 'number' ? ios.webkitCompassAccuracy : null,
      source,
      compassOffset: this.compassOffset,
      screenAngle: angle,
    };
    this.target = deviceToCameraQuat(e.alpha, e.beta, e.gamma, angle);
  }

  /** 지금 적용 중인 전체 방위 보정값(도): 나침반 + 편각 + 사용자 보정 */
  totalOffset(): number {
    return this.compassOffset + this.declination + this.userOffset;
  }

  /**
   * 화면에 쓸 카메라 회전값. 손떨림을 줄이려고 목표값을 부드럽게 따라간다.
   * @param dt 지난 프레임 이후 시간(초)
   */
  update(dt: number): Quat | null {
    if (!this.target) return null;
    const goal = applyYaw(this.target, this.totalOffset());
    if (!this.smoothed) this.smoothed = goal;
    else {
      // 시간 상수 약 0.12초: 가만히 들면 떨리지 않고, 움직이면 바로 따라온다
      const t = 1 - Math.exp(-Math.max(dt, 0.001) / 0.12);
      this.smoothed = quatSlerp(this.smoothed, goal, t);
    }
    return this.smoothed;
  }
}
