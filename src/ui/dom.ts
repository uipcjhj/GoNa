/** 작은 DOM 헬퍼 */
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

/** 도트 캔버스를 선명하게 확대된 <img> 로 */
export function pixelImg(canvas: HTMLCanvasElement, scale: number, cls = ''): HTMLImageElement {
  const img = new Image();
  img.src = canvas.toDataURL();
  img.width = canvas.width * scale;
  img.height = canvas.height * scale;
  img.className = `pixel ${cls}`.trim();
  img.alt = '';
  img.draggable = false;
  return img;
}

/** 이미지가 실제로 있는지 확인하며 불러오기 (없으면 null) */
export function tryLoadImage(url: string): Promise<HTMLImageElement | null> {
  if (!url) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img.naturalWidth > 0 ? img : null);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}
