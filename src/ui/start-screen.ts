// 시작 화면, 안내 문구(토스트), 대체 화면(WebGL 미지원·데이터 실패).

export class StartScreen {
  private readonly root = document.getElementById('start')!;
  private readonly button = document.getElementById('btn-start') as HTMLButtonElement;

  /**
   * onStart는 버튼 클릭 처리 함수 안에서 바로(동기로) 불린다.
   * 아이폰의 방향 센서 허용 창은 "사용자가 누른 그 순간"에만 띄울 수 있기 때문이다.
   */
  constructor(onStart: () => void) {
    this.button.addEventListener('click', () => {
      onStart();
      this.hide();
    });
  }

  show(): void {
    this.root.hidden = false;
  }

  hide(): void {
    this.root.hidden = true;
  }
}

export class Toast {
  private readonly root = document.getElementById('toast')!;
  private timer: ReturnType<typeof setTimeout> | undefined;

  show(message: string, ms = 4500): void {
    this.root.textContent = message;
    this.root.hidden = false;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.root.hidden = true;
    }, ms);
  }

  hide(): void {
    clearTimeout(this.timer);
    this.root.hidden = true;
  }
}

/** 어떤 문제가 생겨도 흰 화면 대신 이 안내 화면을 보여 준다. */
export function showFallback(title: string, text: string, onRetry: () => void): void {
  const root = document.getElementById('fallback')!;
  document.getElementById('fallback-title')!.textContent = title;
  document.getElementById('fallback-text')!.textContent = text;
  const button = document.getElementById('btn-retry') as HTMLButtonElement;
  button.onclick = () => {
    root.hidden = true;
    onRetry();
  };
  root.hidden = false;
  document.getElementById('start')!.hidden = true;
  document.getElementById('loading')!.hidden = true;
}

/** 카카오톡 인앱 브라우저인지(사용자 에이전트 기준. 확실하지 않을 수 있어 권한 실패 때만 안내에 쓴다). */
export function isKakaoInApp(userAgent: string): boolean {
  return /KAKAOTALK/i.test(userAgent);
}

export const KAKAO_HINT = '카톡에서 움직이지 않으면 오른쪽 위 메뉴 → 다른 브라우저로 열기';
