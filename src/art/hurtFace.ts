/**
 * 고나 '아파!' 표정 프레임 — 각 성장 단계의 원래 그림(같은 포즈·같은 크기)에서 얼굴만 바꿔 미리 만들어 둠 (앱 시작 때 한 번)
 *   눈: 얼굴(살색) 안의 작은 어두운 점 2개를 찾아 '> <' 로 찡그림 (안쪽이 꼭짓점 → 눈썹이 찌푸려진 느낌)
 *   입: 두 눈 아래 작은 울상 입 (∧)
 *   볼: 원래 분홍 볼을 조금 더 진하게 (얼굴 영역 안에서만 — 공룡옷 노랑·주황은 그대로)
 *   머리카락: 후드(초록) 위쪽 줄(갈색 물방울 머리카락)을 한 칸 옆으로 → 두 장을 번갈아 '흔들'
 * 고나의 외곽선·초록 공룡옷·머리카락 모양·색은 바꾸지 않음.
 */
type RGBA = [number, number, number, number];

const lum = (p: RGBA): number => 0.3 * p[0] + 0.59 * p[1] + 0.11 * p[2];
const isSkin = (p: RGBA): boolean => p[3] > 0 && p[0] > 225 && p[1] > 165 && p[1] < 235 && p[2] > 120 && p[2] < 200 && p[0] - p[2] > 35;
const isBlush = (p: RGBA): boolean => p[3] > 0 && p[0] > 215 && p[1] < 215 && p[0] - p[1] > 28 && p[2] > p[1] - 35 && p[2] > 110;
const isDark = (p: RGBA): boolean => p[3] > 0 && lum(p) < 110;
const isGreen = (p: RGBA): boolean => p[3] > 0 && p[1] > p[0] + 10 && p[1] > p[2] + 20;

/**
 * mood 'serious': 필살기용 진지한 얼굴 — 실눈(가로 한 줄) + 안쪽이 내려간 눈썹 한 점 + 꾹 다문 입(가로 한 줄). 볼·머리카락은 그대로.
 */
export function hurtFace(src: HTMLCanvasElement, hairShift: number, mood: 'hurt' | 'serious' = 'hurt'): HTMLCanvasElement {
  const W = src.width;
  const H = src.height;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  g.drawImage(src, 0, 0);
  const img = g.getImageData(0, 0, W, H);
  const d = img.data;
  const get = (x: number, y: number): RGBA => {
    const i = (y * W + x) * 4;
    return [d[i], d[i + 1], d[i + 2], d[i + 3]];
  };
  const set = (x: number, y: number, p: RGBA): void => {
    const i = (y * W + x) * 4;
    d[i] = p[0];
    d[i + 1] = p[1];
    d[i + 2] = p[2];
    d[i + 3] = p[3];
  };
  const inb = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < W && y < H;
  const isFace = (x: number, y: number): boolean => inb(x, y) && (isSkin(get(x, y)) || isBlush(get(x, y)));

  // 1) 얼굴 안의 작은 어두운 덩어리 (눈·입)
  const seen = new Uint8Array(W * H);
  const comps: [number, number][][] = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (seen[y * W + x] || !isDark(get(x, y))) continue;
      const stack: [number, number][] = [[x, y]];
      seen[y * W + x] = 1;
      const comp: [number, number][] = [];
      while (stack.length) {
        const [a, b] = stack.pop()!;
        comp.push([a, b]);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const qx = a + dx;
          const qy = b + dy;
          if (inb(qx, qy) && !seen[qy * W + qx] && isDark(get(qx, qy))) {
            seen[qy * W + qx] = 1;
            stack.push([qx, qy]);
          }
        }
      }
      if (comp.length > 6) continue;
      const own = new Set(comp.map(([a, b]) => b * W + a));
      let ring = 0;
      let face = 0;
      for (const [a, b] of comp) {
        for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            const qx = a + dx;
            const qy = b + dy;
            if (own.has(qy * W + qx)) continue;
            ring++;
            if (isFace(qx, qy)) face++;
          }
        }
      }
      if (ring > 0 && face / ring >= 0.6) comps.push(comp);
    }
  }
  const cy = (cp: [number, number][]): number => cp.reduce((s, [, b]) => s + b, 0) / cp.length;
  const cx = (cp: [number, number][]): number => cp.reduce((s, [a]) => s + a, 0) / cp.length;
  comps.sort((p, q) => Math.min(...p.map(([, b]) => b)) - Math.min(...q.map(([, b]) => b)) || cx(p) - cx(q));
  const eyes: [number, number][][] = [];
  for (const cp of comps) {
    if (!eyes.length || Math.abs(cy(cp) - cy(eyes[0])) <= 2) eyes.push(cp);
    if (eyes.length === 2) break;
  }
  if (!eyes.length) return c; // 얼굴을 못 찾으면 원래 그림 그대로
  const eyeY = Math.max(...eyes.map(cy));
  const erase = [...eyes, ...comps.filter((cp) => !eyes.includes(cp) && Math.min(...cp.map(([, b]) => b)) > eyeY)];
  // 2) 눈·입 자리를 주변 살색으로 지움
  const skinNear = (x: number, y: number): RGBA => {
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-2, 0], [2, 0], [-1, -1], [1, 1]]) {
      if (inb(x + dx, y + dy) && isSkin(get(x + dx, y + dy))) return get(x + dx, y + dy);
    }
    return [254, 214, 168, 255];
  };
  const fill: [number, number, RGBA][] = [];
  for (const cp of erase) for (const [a, b] of cp) fill.push([a, b, skinNear(a, b)]);
  const erased = new Set(fill.map(([a, b]) => b * W + a));
  for (const [a, b, p] of fill) set(a, b, p);
  const canDraw = (x: number, y: number): boolean => inb(x, y) && (isFace(x, y) || erased.has(y * W + x));
  const DK: RGBA = [58, 36, 24, 255];
  const MO: RGBA = [150, 60, 50, 255];
  eyes.sort((p, q) => cx(p) - cx(q));
  const wide = eyes.length === 2 && cx(eyes[1]) - cx(eyes[0]) > 3;
  const mx0 = Math.round(eyes.reduce((s, cp) => s + cx(cp), 0) / eyes.length);
  if (mood === 'serious') {
    // 실눈 — 와 안쪽 눈썹 \ /
    eyes.forEach((cp, i) => {
      const x = Math.round(cx(cp));
      const y = Math.round(cy(cp));
      const o = i === 0 ? 1 : -1;
      const pts = wide ? [[x - 1, y], [x, y], [x + 1, y], [x + o, y - 2], [x, y - 2]] : [[x - 1, y], [x, y], [x + 1, y]];
      for (const [px, py] of pts) if (canDraw(px, py)) set(px, py, DK);
    });
    const my0 = Math.round(eyeY) + 3;
    for (const [px, py] of [[mx0 - 1, my0], [mx0, my0], [mx0 + 1, my0]]) if (canDraw(px, py)) set(px, py, MO);
    g.putImageData(img, 0, 0);
    return c;
  }
  // 3) 찡그린 눈 > <
  eyes.forEach((cp, i) => {
    const x = Math.round(cx(cp));
    const y = Math.round(cy(cp));
    const o = i === 0 ? 1 : -1;
    const pts = wide ? [[x - o, y - 1], [x, y], [x - o, y + 1]] : [[x - 1, y], [x, y], [x + 1, y]];
    for (const [px, py] of pts) if (canDraw(px, py)) set(px, py, DK);
  });
  // 4) 울상 입 ∧
  const mx = Math.round(eyes.reduce((s, cp) => s + cx(cp), 0) / eyes.length);
  const my = Math.round(eyeY) + 3;
  for (const [px, py] of [[mx - 1, my + 1], [mx, my], [mx + 1, my + 1]]) if (canDraw(px, py)) set(px, py, MO);
  // 5) 볼을 조금 더 진하게 (얼굴 범위 안에서만)
  let x0 = W;
  let x1 = 0;
  let y0 = H;
  let y1 = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!isSkin(get(x, y))) continue;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
  }
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (isBlush(get(x, y))) set(x, y, [240, 120, 140, 255]);
  // 6) 머리카락 흔들림: 후드(초록) 맨 윗줄보다 위(머리카락 물방울)를 한 칸 옆으로
  if (hairShift) {
    let top = 0;
    outer: for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (isGreen(get(x, y))) { top = y; break outer; }
    for (let y = 0; y < top; y++) {
      const row: RGBA[] = [];
      for (let x = 0; x < W; x++) row.push(get(x, y));
      for (let x = 0; x < W; x++) set(x, y, x - hairShift >= 0 && x - hairShift < W ? row[x - hairShift] : [0, 0, 0, 0]);
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}
