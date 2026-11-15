// 별·달·행성을 눌렀을 때 뜨는 정보 카드. 천문 용어 대신 쉬운 말로.
import { brightnessWords, distanceWords } from '../astro/stars';
import { BODY_NAMES_KO, moonPhaseName, type BodyState } from '../astro/solar-system';

export interface CardContent {
  name: string;
  sub: string;
  bright: string;
  dist: string;
}

export function starCard(name: string, constellation: string, mag: number, distLy: number): CardContent {
  return {
    name,
    sub: constellation || '별',
    bright: brightnessWords(mag),
    dist: distanceWords(distLy),
  };
}

function lightTime(minutes: number): string {
  if (minutes < 1) return `빛으로 약 ${Math.round(minutes * 60)}초 거리`;
  if (minutes < 90) return `빛으로 약 ${Math.round(minutes)}분 거리`;
  return `빛으로 약 ${(minutes / 60).toFixed(1)}시간 거리`;
}

export function bodyCard(body: BodyState, moon?: { fraction: number; waxing: boolean }): CardContent {
  const name = BODY_NAMES_KO[body.id];
  if (body.id === 'moon') {
    const km = Math.round((body.distAU * 149_597_870.7) / 1000) * 1000;
    return {
      name,
      sub: '지구의 위성',
      bright: moon ? `${moonPhaseName(moon.fraction, moon.waxing)} · 빛나는 부분 ${Math.round(moon.fraction * 100)}%` : '',
      dist: `약 ${km.toLocaleString('ko-KR')}km · ${lightTime(body.lightMinutes)}`,
    };
  }
  if (body.id === 'sun') {
    return { name, sub: '우리 별', bright: '맨눈으로 직접 보면 안 돼요', dist: lightTime(body.lightMinutes) };
  }
  return {
    name,
    sub: '태양계 행성',
    bright: brightnessWords(body.mag) + ' · 별과 달리 거의 반짝이지 않아요',
    dist: lightTime(body.lightMinutes),
  };
}

export class InfoCard {
  private readonly root = document.getElementById('info-card')!;
  private readonly nameEl = document.getElementById('info-name')!;
  private readonly subEl = document.getElementById('info-sub')!;
  private readonly brightEl = document.getElementById('info-bright')!;
  private readonly distEl = document.getElementById('info-dist')!;

  constructor(onClose: () => void) {
    document.getElementById('info-close')!.addEventListener('click', onClose);
  }

  show(c: CardContent): void {
    this.nameEl.textContent = c.name;
    this.subEl.textContent = c.sub;
    this.brightEl.textContent = c.bright;
    this.distEl.textContent = c.dist;
    this.root.hidden = false;
  }

  hide(): void {
    this.root.hidden = true;
  }
}
