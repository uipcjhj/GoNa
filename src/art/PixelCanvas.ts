/**
 * 아주 작은 픽셀 그리기 도구.
 * 문자열 도트맵 → 캔버스로 변환하거나, 점/사각형/원을 한 픽셀 단위로 찍습니다.
 */
export type Palette = Record<string, string>;

export class PixelCanvas {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    ctx.imageSmoothingEnabled = false;
    this.ctx = ctx;
  }

  px(x: number, y: number, color: string): void {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(Math.floor(x), Math.floor(y), 1, 1);
  }

  rect(x: number, y: number, w: number, h: number, color: string): void {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(Math.floor(x), Math.floor(y), Math.floor(w), Math.floor(h));
  }

  /** 가로로 이어지는(타일링) 텍스처용: x 좌표를 너비로 감싸서 찍습니다. */
  pxWrap(x: number, y: number, color: string): void {
    const wx = ((Math.floor(x) % this.width) + this.width) % this.width;
    this.px(wx, y, color);
  }

  /** 꽉 찬 픽셀 원 */
  disc(cx: number, cy: number, r: number, color: string, wrap = false): void {
    for (let y = -r; y <= r; y++) {
      for (let x = -r; x <= r; x++) {
        if (x * x + y * y <= r * r + r * 0.8) {
          if (wrap) this.pxWrap(cx + x, cy + y, color);
          else this.px(cx + x, cy + y, color);
        }
      }
    }
  }

  /** 그려진 모양 바깥쪽 둘레에 1px 외곽선 (스타듀풍 테두리) */
  outline(color: string): void {
    const { width: w, height: h } = this;
    const data = this.ctx.getImageData(0, 0, w, h).data;
    const solid = (x: number, y: number): boolean =>
      x >= 0 && y >= 0 && x < w && y < h && data[(y * w + x) * 4 + 3] > 0;
    this.ctx.fillStyle = color;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (solid(x, y)) continue;
        if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) this.ctx.fillRect(x, y, 1, 1);
      }
    }
  }

  /** 문자열 도트맵 그리기. '.' 과 ' ' 는 투명. */
  map(rows: readonly string[], palette: Palette, ox = 0, oy = 0): void {
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const ch = row[x];
        if (ch === '.' || ch === ' ') continue;
        const color = palette[ch];
        if (!color) {
          if (import.meta.env.DEV) console.warn(`팔레트에 없는 문자 '${ch}'`);
          continue;
        }
        this.px(ox + x, oy + y, color);
      }
    });
  }
}

/** 도트맵 하나를 바로 캔버스로 */
export function mapToCanvas(rows: readonly string[], palette: Palette): HTMLCanvasElement {
  const w = Math.max(...rows.map((r) => r.length));
  if (import.meta.env.DEV && rows.some((r) => r.length !== w)) {
    console.warn('도트맵의 줄 길이가 서로 다릅니다', rows);
  }
  const pc = new PixelCanvas(w, rows.length);
  pc.map(rows, palette);
  return pc.canvas;
}

/** 시드 고정 난수 (매번 같은 배경이 나오도록) */
export function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
