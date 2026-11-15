// 해의 고도에 따른 하늘색과 별이 보이는 정도. 순수 계산(Three.js 없음)이라 테스트하기 쉽다.
//
// 구간: 낮(해 > 0°) / 시민박명(0~-6°) / 항해박명(-6~-12°) / 천문박명(-12~-18°) / 밤(-18° 아래)
// 구간 경계의 색을 정해 두고 그 사이는 부드럽게 이어 붙인다.

export type RGB = [number, number, number];

export interface SkyPalette {
  /** 머리 위 하늘색 */
  zenith: RGB;
  /** 지평선 근처 하늘색 */
  horizon: RGB;
  /** 해 쪽 지평선에 더해지는 노을빛 */
  glow: RGB;
  /** 땅 색 */
  ground: RGB;
  /** 이 등급보다 어두운 별은 안 보인다 (밤 6.5, 낮에는 아무 별도 안 보임) */
  limitMag: number;
  /** 해 원반 밝기 0~1 */
  sunDisc: number;
  /** 은하수 세기 0~1 */
  milky: number;
  /** 밤인 정도 0(낮)~1(완전한 밤) */
  night: number;
}

interface Key {
  alt: number;
  zenith: RGB;
  horizon: RGB;
  glow: RGB;
  ground: RGB;
  limitMag: number;
}

// 해 고도가 높은 것부터. 디자인 방향: 완전한 검정 대신 아주 어두운 남색, 채도는 낮게.
const KEYS: Key[] = [
  { alt: 12, zenith: [0.2, 0.44, 0.84], horizon: [0.64, 0.79, 0.95], glow: [0.16, 0.13, 0.06], ground: [0.1, 0.125, 0.1], limitMag: -6 },
  { alt: 0, zenith: [0.15, 0.26, 0.54], horizon: [0.78, 0.62, 0.5], glow: [0.75, 0.38, 0.12], ground: [0.055, 0.058, 0.066], limitMag: -3.6 },
  { alt: -6, zenith: [0.052, 0.088, 0.23], horizon: [0.3, 0.27, 0.36], glow: [0.62, 0.27, 0.1], ground: [0.024, 0.027, 0.036], limitMag: 1.6 },
  { alt: -12, zenith: [0.019, 0.03, 0.085], horizon: [0.062, 0.072, 0.145], glow: [0.13, 0.065, 0.06], ground: [0.01, 0.012, 0.019], limitMag: 4.8 },
  { alt: -18, zenith: [0.008, 0.012, 0.033], horizon: [0.024, 0.032, 0.066], glow: [0, 0, 0], ground: [0.006, 0.008, 0.013], limitMag: 6.5 },
];

function smooth(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

function mixRGB(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/**
 * @param sunAlt 해 고도(도)
 * @param moonAlt 달 고도(도). 달이 떠 있고 밝으면 하늘이 조금 밝아지고 어두운 별·은하수가 약해진다
 * @param moonFraction 달의 빛난 비율 0~1
 */
export function skyPalette(sunAlt: number, moonAlt = -90, moonFraction = 0): SkyPalette {
  let a = KEYS[0];
  let b = KEYS[0];
  let t = 0;
  if (sunAlt <= KEYS[KEYS.length - 1].alt) {
    a = b = KEYS[KEYS.length - 1];
  } else if (sunAlt < KEYS[0].alt) {
    for (let i = 0; i < KEYS.length - 1; i++) {
      if (sunAlt <= KEYS[i].alt && sunAlt >= KEYS[i + 1].alt) {
        a = KEYS[i];
        b = KEYS[i + 1];
        t = smooth((KEYS[i].alt - sunAlt) / (KEYS[i].alt - KEYS[i + 1].alt));
        break;
      }
    }
  }

  const night = smooth((-sunAlt - 2) / 16); // -2°에서 0, -18°에서 1
  // 달빛: 보름달이 높이 떠 있을 때 최대
  const moonUp = smooth(moonAlt / 20);
  const moonLight = moonUp * moonFraction * night;

  let zenith = mixRGB(a.zenith, b.zenith, t);
  let horizon = mixRGB(a.horizon, b.horizon, t);
  zenith = mixRGB(zenith, [0.03, 0.045, 0.095], moonLight * 0.55);
  horizon = mixRGB(horizon, [0.05, 0.066, 0.12], moonLight * 0.5);

  const limitMag = a.limitMag + (b.limitMag - a.limitMag) * t - moonLight * 1.3;
  const milkyBase = smooth((-sunAlt - 11) / 7); // -11°부터 보이기 시작, -18°에서 최대
  return {
    zenith,
    horizon,
    glow: mixRGB(a.glow, b.glow, t),
    ground: mixRGB(a.ground, b.ground, t),
    limitMag,
    sunDisc: smooth((sunAlt + 1.5) / 3),
    milky: milkyBase * (1 - 0.75 * moonLight),
    night,
  };
}

/** 사람 눈이 느끼는 밝기(0~1 근사). 테스트와 글자색 결정에 쓴다. */
export function luminance(c: RGB): number {
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

/** 해 고도를 쉬운 말로. */
export function skyPhaseName(sunAlt: number): string {
  if (sunAlt > 0) return '낮';
  if (sunAlt > -6) return '해 질 녘·새벽 (시민박명)';
  if (sunAlt > -12) return '어스름 (항해박명)';
  if (sunAlt > -18) return '거의 밤 (천문박명)';
  return '밤';
}
