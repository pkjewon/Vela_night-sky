// 마우스·터치 입력: 드래그(회전), 휠·핀치(확대), 탭(별 고르기).
// 드래그와 탭을 헷갈리지 않게: 손가락이 조금이라도(8px) 움직이면 드래그로 본다.

export interface DragHandlers {
  /** 드래그로 움직인 양(CSS 픽셀) */
  onDrag(dx: number, dy: number): void;
  /** 드래그를 놓았을 때의 속도(CSS 픽셀/초). 관성에 쓴다 */
  onRelease(vx: number, vy: number): void;
  /** 확대 배율(1보다 크면 확대) */
  onZoom(factor: number): void;
  /** 움직이지 않고 눌렀다 뗌 */
  onTap(x: number, y: number): void;
  /** 어떤 입력이든 시작될 때(관성 멈춤, 절전 해제) */
  onActivity(): void;
}

const TAP_SLOP = 8;
const TAP_MAX_MS = 600;

export class DragInput {
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private startX = 0;
  private startY = 0;
  private startTime = 0;
  private moved = false;
  private pinchDist = 0;
  private wasPinch = false;
  private velX = 0;
  private velY = 0;
  private lastMoveTime = 0;

  constructor(
    private readonly el: HTMLElement,
    private readonly handlers: DragHandlers,
  ) {
    el.addEventListener('pointerdown', this.onDown);
    el.addEventListener('pointermove', this.onMove);
    el.addEventListener('pointerup', this.onUp);
    el.addEventListener('pointercancel', this.onCancel);
    el.addEventListener('wheel', this.onWheel, { passive: false });
    // 사파리의 페이지 확대 제스처 막기
    el.addEventListener('gesturestart', (e) => e.preventDefault());
  }

  private readonly onDown = (e: PointerEvent) => {
    this.handlers.onActivity();
    try {
      this.el.setPointerCapture(e.pointerId);
    } catch {
      /* 일부 브라우저는 실패할 수 있다. 없어도 동작한다 */
    }
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 1) {
      this.startX = e.clientX;
      this.startY = e.clientY;
      this.startTime = performance.now();
      this.moved = false;
      this.wasPinch = false;
      this.velX = 0;
      this.velY = 0;
    } else if (this.pointers.size === 2) {
      this.wasPinch = true;
      this.pinchDist = this.currentPinchDist();
    }
  };

  private currentPinchDist(): number {
    const [a, b] = [...this.pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  private readonly onMove = (e: PointerEvent) => {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;

    if (this.pointers.size >= 2) {
      const dist = this.currentPinchDist();
      if (this.pinchDist > 0 && dist > 0) this.handlers.onZoom(dist / this.pinchDist);
      this.pinchDist = dist;
      return;
    }
    if (!this.moved && Math.hypot(e.clientX - this.startX, e.clientY - this.startY) < TAP_SLOP) return;
    this.moved = true;
    const now = performance.now();
    const dt = Math.max(1, now - this.lastMoveTime) / 1000;
    this.lastMoveTime = now;
    // 속도는 최근 움직임을 섞어서 구한다(마지막 한 번의 떨림에 휘둘리지 않게)
    this.velX = this.velX * 0.6 + (dx / dt) * 0.4;
    this.velY = this.velY * 0.6 + (dy / dt) * 0.4;
    this.handlers.onDrag(dx, dy);
  };

  private readonly onUp = (e: PointerEvent) => {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.delete(e.pointerId);
    if (this.pointers.size > 0) {
      this.pinchDist = 0;
      return;
    }
    const now = performance.now();
    if (!this.moved && !this.wasPinch && now - this.startTime < TAP_MAX_MS) {
      this.handlers.onTap(e.clientX, e.clientY);
    } else if (this.moved && !this.wasPinch) {
      // 손을 멈춘 뒤 뗐으면 관성 없음
      const stale = now - this.lastMoveTime > 80;
      this.handlers.onRelease(stale ? 0 : this.velX, stale ? 0 : this.velY);
    }
  };

  private readonly onCancel = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
    this.pinchDist = 0;
  };

  private readonly onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.handlers.onActivity();
    // 휠 한 칸(약 100)에 10%쯤 확대·축소
    this.handlers.onZoom(Math.exp(-e.deltaY * 0.001));
  };
}
