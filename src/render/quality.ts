// 자동 화질 조절: 느린 폰에서 스스로 화질을 낮춘다. 순수 계산.
//
// 낮추는 순서: 해상도 배율 2 → 1.5 → 1 → 은하수·오로라를 간단히.

export interface QualityLevel {
  /** 해상도 배율(기기 픽셀 비율)의 상한 */
  maxPixelRatio: number;
  /** 오로라 세부 묘사 1=보통, 0=간단히 */
  auroraDetail: number;
  /** 은하수를 그릴지 (가장 낮은 단계에서는 끔) */
  milkyWay: boolean;
  label: string;
}

export const QUALITY_LEVELS: QualityLevel[] = [
  { maxPixelRatio: 2, auroraDetail: 1, milkyWay: true, label: '높음' },
  { maxPixelRatio: 1.5, auroraDetail: 1, milkyWay: true, label: '보통' },
  { maxPixelRatio: 1, auroraDetail: 1, milkyWay: true, label: '낮음' },
  { maxPixelRatio: 1, auroraDetail: 0, milkyWay: false, label: '가장 낮음' },
];

/** 한 프레임이 이보다 오래 걸리면(약 42fps 미만) 한 단계 낮춘다 */
export const SLOW_FRAME_MS = 24;
/** 판단에 쓰는 프레임 수 */
export const SAMPLE_FRAMES = 45;

/** 평균 프레임 시간을 보고 다음 화질 단계를 정한다. 올리지는 않는다(왔다 갔다 방지). */
export function nextQualityLevel(level: number, averageFrameMs: number): number {
  if (!(averageFrameMs > SLOW_FRAME_MS)) return level;
  return Math.min(level + 1, QUALITY_LEVELS.length - 1);
}

/** 프레임 시간을 모아 화질 단계를 정하는 측정기. */
export class QualityMonitor {
  level = 0;
  private samples: number[] = [];
  private settled = false;

  /**
   * 프레임 하나의 시간(ms)을 넣는다. 화질 단계가 바뀌면 true.
   * 탭 전환 등으로 생긴 아주 긴 프레임은 버린다.
   */
  push(frameMs: number): boolean {
    if (this.settled || frameMs <= 0 || frameMs > 500) return false;
    this.samples.push(frameMs);
    if (this.samples.length < SAMPLE_FRAMES) return false;
    // 처음 몇 프레임은 준비 작업 때문에 느리므로 뺀다
    const used = this.samples.slice(10);
    const average = used.reduce((a, b) => a + b, 0) / used.length;
    this.samples = [];
    const next = nextQualityLevel(this.level, average);
    if (next === this.level) {
      // 충분히 빠르거나 더 낮출 단계가 없으면 측정을 끝낸다
      this.settled = true;
      return false;
    }
    this.level = next;
    return true;
  }

  get current(): QualityLevel {
    return QUALITY_LEVELS[this.level];
  }
}
