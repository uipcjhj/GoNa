#!/usr/bin/env python3
"""
대표 타이틀의 고나에 '공식 캐릭터 팔레트'를 입힘 — 필터 없음.

  공식 기준: art-src/growth/gona-official-palette.png (GONA Growth Sprite Concepts)
            → 색값: art-src/growth/gona-official-palette.json (시트에서 직접 뽑은 값)
  입력: art-src/title/gona-cover-original.png
  출력: art-src/title/gona-cover-graded.png  (build_cover_layers.py 가 이것으로 레이어를 만듦)

  - 배경은 원본 그대로 (한 픽셀도 바꾸지 않음)
  - 고나 외곽선 안쪽만: 부위마다 원본 그림의 명암 단계를 그 부위의 공식 색 단계로 바꿈
      얼굴 = 복숭아빛 피부 · 배 = 크림 · 등뿔 = 노랑 · 나머지 공룡옷 = 연두·초록
  - 외곽선 · 갈색 머리카락 · 볼터치 · 가방 · 가방 속 열매·잎은 원본 그대로

사용법: python3 tools/grade_cover.py && python3 tools/build_cover_layers.py
"""
import json
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "art-src/title/gona-cover-original.png"
OUT = ROOT / "art-src/title/gona-cover-graded.png"
PALETTE = json.loads((ROOT / "art-src/growth/gona-official-palette.json").read_text())
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
    s = np.where(mx > 1e-6, d / np.maximum(mx, 1e-6), 0)
    return h * 60, s, mx


def gona_mask(img):
    """고나 외곽선 안쪽 (색을 입힐 곳 — 오려내지 않음)"""
    x0, y0, x1, y1 = GONA_BOX
    dark = img[y0:y1, x0:x1].sum(-1) < 330
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
    full = np.zeros(img.shape[:2], bool)
    full[y0:y1, x0:x1] = ~out & ~dark
    return full


def hexrgb(c):
    return np.array([int(c[i : i + 2], 16) for i in (1, 3, 5)], np.uint8)


def regions(src, inside):
    """부위 나누기 (고나 상자 기준 좌표, 원본 도트 6px 단위)"""
    h0, s0, v0 = rgb2hsv(src / 255.0)
    H, W = v0.shape
    yy, xx = np.mgrid[0:H, 0:W]
    gx0, gy0, gx1, gy1 = GONA_BOX
    bx = (xx // 6) * 6 + 3 - gx0
    by = (yy // 6) * 6 + 3 - gy0

    def ell(cx, cy, rx, ry):
        return np.sqrt(((bx - cx) / rx) ** 2 + ((by - cy) / ry) ** 2)

    keep = (
        ((bx >= 150) & (bx <= 262) & (by <= 100) & (v0 < 0.9) & (s0 > 0.22))  # 갈색 머리카락
        | ((h0 < 30) & (s0 > 0.36))  # 볼터치·열매 (옅은 가장자리는 피부색으로)
        | ((s0 > 0.42) & (v0 < 0.7))  # 가방·끈
        | ((h0 >= 60) & (h0 < 170) & (s0 > 0.35))  # 가방 속 잎
        | (v0 < 0.32)  # 외곽선
    )
    body = inside & ~keep
    face = body & (ell(120, 165, 118, 82) < 1)
    belly = body & ~face & (ell(105, 355, 90, 92) < 1)
    # 등뿔: 등쪽 바깥 가장자리의 둥근 혹들 (머리 뒤 ~ 등, 꼬리 위)
    edge = np.full(H, -1)
    sub = inside[gy0:gy1, gx0:gx1]
    for r in range(sub.shape[0]):
        cols = np.nonzero(sub[r])[0]
        if len(cols):
            edge[gy0 + r] = cols.max()
    ex = edge[np.clip(yy, 0, H - 1)]
    spike = body & ~face & ~belly & (by >= 95) & (by <= 300) & (bx > 228) & ((xx - gx0) > ex - 30)
    green = body & ~face & ~belly & ~spike
    return {"skin": face, "belly": belly, "spike": spike, "green": green}, v0


# 부위별 공식 색 단계: 원본 명암 순위(어두운 쪽부터)를 이 비율로 나눠 단계마다 공식 색 하나
SPLITS = {
    "green": [0.16, 0.34, 0.9],  # 그늘 · 반그늘 · 기본 · 하이라이트
    "skin": [0.05, 0.97],  # 그늘 · 기본 · 하이라이트 (얼굴은 거의 기본색 — 공식 그림처럼 깨끗하게)
    "belly": [0.14, 0.3],  # 그늘 · 반그늘 · 기본
    "spike": [0.25, 0.88],  # 그늘 · 기본 · 하이라이트
}


def dot_grid(v, box):
    """원본 도트(6px)의 격자 위치 찾기: 도트 안 밝기 차이가 가장 작은 어긋남"""
    x0, y0, x1, y1 = box
    best = (1e9, 0, 0)
    for oy in range(6):
        for ox in range(6):
            sub = v[y0 + oy : y1, x0 + ox : x1]
            hh, ww = (sub.shape[0] // 6) * 6, (sub.shape[1] // 6) * 6
            blk = sub[:hh, :ww].reshape(hh // 6, 6, ww // 6, 6)
            var = blk.var(axis=(1, 3)).mean()
            if var < best[0]:
                best = (var, ox, oy)
    return best[1], best[2]


def main():
    src = np.array(Image.open(SRC).convert("RGB"))
    inside = gona_mask(src.astype(np.int32))
    parts, v0 = regions(src.astype(np.float64), inside)
    # 도트(6px) 단위 명암: 같은 도트는 같은 색 (잡티로 얼룩지지 않게)
    ox, oy = dot_grid(v0, GONA_BOX)
    H, W = v0.shape
    yy, xx = np.mgrid[0:H, 0:W]
    bid = ((yy - oy) // 6) * 10000 + (xx - ox) // 6
    out = src.copy()
    for name, sel in parts.items():
        if not sel.any():
            continue
        ids, inv = np.unique(bid[sel], return_inverse=True)
        sums = np.bincount(inv, weights=v0[sel])
        cnt = np.bincount(inv)
        vb = (sums / cnt)[inv]  # 그 도트의 평균 밝기
        cols = [hexrgb(c) for c in PALETTE[name]]
        qs = np.quantile(vb, SPLITS[name])
        idx = np.searchsorted(qs, vb)
        out[sel] = np.stack(cols)[np.clip(idx, 0, len(cols) - 1)]
    Image.fromarray(out).save(OUT)
    changed = int((out != src).any(-1).sum())
    outside = int(((out != src).any(-1) & ~inside).sum())
    print(f"saved {OUT.relative_to(ROOT)} · 도트 격자 어긋남 ({ox},{oy}) · 바뀐 픽셀 {changed} (고나 밖 {outside})")


if __name__ == "__main__":
    main()
