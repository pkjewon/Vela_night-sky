// 하늘 위 이름표(동서남북, 별자리, 행성). 글자가 또렷하도록 캔버스가 아니라 HTML 요소로 그린다.
// 이름표끼리 겹치면 덜 중요한 쪽을 숨긴다.

export interface LabelItem {
  text: string;
  /** 화면 좌표(CSS 픽셀): 글자 가운데가 놓일 곳 */
  x: number;
  y: number;
  kind: 'cardinal' | 'body' | 'constellation';
  /** 작을수록 중요. 겹치면 큰 쪽이 숨는다 */
  priority: number;
  /** 0~1 */
  opacity?: number;
}

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const FONT_PX: Record<LabelItem['kind'], number> = { cardinal: 15, body: 13, constellation: 12 };

/** 글자 수로 어림한 이름표 상자. 한글은 글자 폭이 글자 크기와 거의 같다. */
export function labelBox(item: LabelItem): Box {
  const font = FONT_PX[item.kind];
  const w = item.text.length * font * 1.02 + 10;
  const h = font + 8;
  return { x0: item.x - w / 2, y0: item.y - h / 2, x1: item.x + w / 2, y1: item.y + h / 2 };
}

function overlaps(a: Box, b: Box): boolean {
  return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
}

/** 중요한 것부터 놓으면서, 이미 놓인 것과 겹치는 이름표는 뺀다. 순수 함수(테스트용). */
export function layoutLabels(items: LabelItem[], width: number, height: number): LabelItem[] {
  const placed: Array<{ item: LabelItem; box: Box }> = [];
  const sorted = [...items].sort((a, b) => a.priority - b.priority);
  for (const item of sorted) {
    const box = labelBox(item);
    // 화면 밖으로 거의 나간 것은 뺀다
    if (box.x1 < 0 || box.x0 > width || box.y1 < 0 || box.y0 > height) continue;
    if (placed.some((p) => overlaps(p.box, box))) continue;
    placed.push({ item, box });
  }
  return placed.map((p) => p.item);
}

export class LabelLayer {
  private readonly pool: HTMLDivElement[] = [];
  private used = 0;

  constructor(private readonly root: HTMLElement) {}

  /** 화면에 놓을 이름표 목록으로 갱신한다. 요소는 재사용한다. */
  render(items: LabelItem[], width: number, height: number): LabelItem[] {
    const visible = layoutLabels(items, width, height);
    for (let i = 0; i < visible.length; i++) {
      const item = visible[i];
      let el = this.pool[i];
      if (!el) {
        el = document.createElement('div');
        this.root.appendChild(el);
        this.pool[i] = el;
      }
      const cls = `label ${item.kind}`;
      if (el.className !== cls) el.className = cls;
      if (el.textContent !== item.text) el.textContent = item.text;
      el.style.transform = `translate(${item.x.toFixed(1)}px, ${item.y.toFixed(1)}px) translate(-50%, -50%)`;
      el.style.opacity = String(item.opacity ?? 1);
      el.style.display = '';
    }
    for (let i = visible.length; i < this.used; i++) this.pool[i].style.display = 'none';
    this.used = visible.length;
    return visible;
  }
}
