#!/usr/bin/env python3
"""
대표 타이틀 원본 색 보정 → 밝고 화사한 파스텔 톤 (픽셀은 그대로, 색만 바꿈 — 아무것도 오려내거나 메우지 않음)

  입력: art-src/title/gona-cover-original.png
  출력: art-src/title/gona-cover-graded.png  (build_cover_layers.py 가 이것으로 레이어를 만듦)

  - 전체: 누런 안개 빼기(화이트밸런스) + 중간 톤 밝게
  - 하늘: 맑은 파스텔 블루 / 풀밭: 밝은 연두 / 버섯·꽃·열매: 생기 있게 / 흙길: 덜 탁하게
  - 고나: 고나 외곽선 안쪽의 밝은 몸 색만 더 뽀얗게 (외곽선·가방·볼터치는 그대로)

사용법: python3 tools/grade_cover.py && python3 tools/build_cover_layers.py
"""
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "art-src/title/gona-cover-original.png"
OUT = ROOT / "art-src/title/gona-cover-graded.png"
GONA_BOX = (561, 548, 941, 1016)  # 원본에서 고나가 있는 상자 (x0, y0, x1, y1)


def rgb2hsv(rgb):
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    mx = rgb.max(-1)
    mn = rgb.min(-1)
    d = mx - mn
    h = np.zeros_like(mx)
    m = d > 1e-6
    rm = m & (mx == r)
    gm = m & (mx == g) & ~rm
    bm = m & ~rm & ~gm
    h[rm] = ((g - b)[rm] / d[rm]) % 6
    h[gm] = (b - r)[gm] / d[gm] + 2
    h[bm] = (r - g)[bm] / d[bm] + 4
    h = h * 60
    s = np.where(mx > 1e-6, d / np.maximum(mx, 1e-6), 0)
    return h, s, mx


def hsv2rgb(h, s, v):
    h = (h % 360) / 60
    i = np.floor(h).astype(int) % 6
    f = h - np.floor(h)
    p = v * (1 - s)
    q = v * (1 - s * f)
    t = v * (1 - s * (1 - f))
    out = np.zeros(h.shape + (3,))
    for k, (a, b, c) in enumerate([(v, t, p), (q, v, p), (p, v, t), (p, q, v), (t, p, v), (v, p, q)]):
        sel = i == k
        out[sel, 0], out[sel, 1], out[sel, 2] = a[sel], b[sel], c[sel]
    return out


def gona_mask(img):
    """고나 외곽선 안쪽 (색 보정용 — 오려내지 않음). 상자 가장자리에서 어두운 외곽선을 넘지 않고 채운 바깥의 반대"""
    x0, y0, x1, y1 = GONA_BOX
    dark = img[y0:y1, x0:x1].sum(-1) < 330
    # 외곽선 틈 메우기 (1px 두껍게)
    pad = np.pad(dark, 1)
    thick = pad[1:-1, 1:-1] | pad[:-2, 1:-1] | pad[2:, 1:-1] | pad[1:-1, :-2] | pad[1:-1, 2:]
    h, w = thick.shape
    out = np.zeros((h, w), bool)
    q = deque()
    for y in range(h):
        for x in (0, w - 1):
            if not thick[y, x] and not out[y, x]:
                out[y, x] = True
                q.append((y, x))
    for x in range(w):
        for y in (0, h - 1):
            if not thick[y, x] and not out[y, x]:
                out[y, x] = True
                q.append((y, x))
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and not out[ny, nx] and not thick[ny, nx]:
                out[ny, nx] = True
                q.append((ny, nx))
    inside = ~out & ~dark
    full = np.zeros(img.shape[:2], bool)
    full[y0:y1, x0:x1] = inside
    return full


def main():
    src = np.array(Image.open(SRC).convert("RGB")).astype(np.float64)
    inside = gona_mask(src.astype(np.int32))
    x = src / 255.0
    # 1) 누런 안개 빼기: 파랑은 살짝 올리고 빨강·초록은 살짝 내림 (밝은 곳일수록 약하게)
    x[..., 0] *= 0.985
    x[..., 2] = np.minimum(1, x[..., 2] * 1.05 + 0.01)
    h, s, v = rgb2hsv(np.clip(x, 0, 1))
    dark = v < 0.32  # 외곽선·그림자는 그대로
    # 2) 중간 톤 밝게
    v = np.where(dark, v, np.minimum(1, v ** 0.88 * 1.02))
    sky = (h >= 180) & (h <= 295) & (s > 0.04) & (v > 0.55)
    green = (h >= 55) & (h < 160) & (s > 0.12)
    red = ((h < 25) | (h >= 330)) & (s > 0.25)
    yellow = (h >= 25) & (h < 55)
    # 하늘: 맑은 파스텔 블루
    h = np.where(sky, h + (206 - h) * 0.75, h)
    s = np.where(sky, np.clip(s * 1.18, 0, 0.5), s)
    v = np.where(sky, np.minimum(1, v * 1.04), v)
    # 풀밭·잎: 노란기 빼고 밝은 연두
    h = np.where(green & ~dark, h + (100 - h) * 0.22, h)
    s = np.where(green & ~dark, np.clip(s * 1.22, 0, 0.85), s)
    v = np.where(green & ~dark, np.minimum(1, v * 1.07), v)
    # 버섯·꽃·열매: 생기
    s = np.where(red & ~dark, np.clip(s * 1.18, 0, 0.95), s)
    v = np.where(red & ~dark, np.minimum(1, v * 1.04), v)
    # 흙길·누런 곳: 덜 탁하게 (채도 살짝 빼고 밝게)
    s = np.where(yellow & ~dark & ~inside, s * 0.86, s)
    v = np.where(yellow & ~dark & ~inside, np.minimum(1, v * 1.05), v)
    # 고나 몸: 밝은 부분만 더 뽀얗게 (외곽선·가방 갈색·진한 볼은 제외)
    body = inside & (v > 0.55) & (s < 0.42)
    s = np.where(body, s * 0.72, s)
    v = np.where(body, v + (1 - v) * 0.38, v)
    out = hsv2rgb(h, np.clip(s, 0, 1), np.clip(v, 0, 1))
    Image.fromarray((out * 255 + 0.5).astype(np.uint8)).save(OUT)
    print(f"saved {OUT.relative_to(ROOT)} · 고나 몸 보정 픽셀 {int(body.sum())}")


if __name__ == "__main__":
    main()
