#!/usr/bin/env python3
"""
엔딩 액자 컷신용 그림 — 확정 엔딩 스토리보드(art-src/ending/framed/storyboard.png, 1024x1536)에서
장면 일러스트만 잘라 냄 (라벨·설명칸 제외, 확대·재생성 없음) → public/assets/ending/frames/s1..s8.png

장면: s1 노을의 마을 · s2 가족 발견 · s3 달려가기 · s4 품에 안기기 · s5 뽀뽀와 킁카 · s6 단체
      s7 깨달음(단체 그림 가운데를 조금 가까이 — 같은 그림 일부) · s8 마지막(뒷모습 + 밤하늘)
s8 의 고나 뒷모습만 게임 디자인에 맞게 손봄: 해바라기처럼 둘린 노란 꽃잎 고리 → 연두 후드(외곽선) +
  가운데로 내려오는 노란 등 지느러미 + 작은 꼬리 (그 자리 몇십 px 만, 나머지 그림은 그대로)
사용법: python3 tools/build_ending_frames.py
"""
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "art-src/ending/framed/storyboard.png"
OUT = ROOT / "public/assets/ending/frames"
BOXES = {
    "s1": (20, 184, 500, 375), "s2": (527, 184, 1006, 375), "s3": (20, 500, 500, 685),
    "s4": (527, 500, 1006, 685), "s5": (20, 815, 500, 1005), "s6": (527, 815, 1006, 1005),
    "s8": (14, 1112, 1010, 1520),
}
# s7: 단체 그림(s6)의 가운데 부분 (같은 화면비 2.5:1)
S7 = (527 + 84, 815 + 32, 527 + 84 + 330, 815 + 32 + 132)

OUTLINE = np.array([46, 30, 30])
HOOD = np.array([183, 167, 63])
HOOD_SH = np.array([140, 128, 50])
FIN = np.array([250, 212, 52])
FIN_HI = np.array([255, 236, 120])


def inpaint(img: np.ndarray, hole: np.ndarray, iters: int = 400) -> np.ndarray:
    """구멍(hole)을 주변 색이 번져 들어오게 채움 (반복 평균 — 하늘·옆 사람 색이 자연스럽게 이어짐)"""
    out = img.astype(float).copy()
    known = ~hole
    out[hole] = 0
    for _ in range(iters):
        acc = np.zeros_like(out)
        cnt = np.zeros(hole.shape)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            sh = np.roll(np.roll(out, dy, 0), dx, 1)
            k = np.roll(np.roll(known, dy, 0), dx, 1)
            acc += sh * k[..., None]
            cnt += k
        fill = hole & (cnt > 0)
        out[fill] = acc[fill] / cnt[fill][:, None]
        known = known | fill
    return out


def fix_gona_back(a: np.ndarray) -> np.ndarray:
    """s8(원본 좌표) 고나 뒷모습 손보기: 꽃잎 고리만 지우고(배경으로 메움) 등 지느러미·꼬리를 더함.
    후드·머리카락·몸은 원본 그대로"""
    a = a.copy()
    x0, y0, x1, y1 = 478, 1386, 566, 1470
    reg = a[y0:y1, x0:x1].astype(int)
    hsv = np.asarray(Image.fromarray(reg.astype(np.uint8)).convert("HSV")).astype(int)
    h, s, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    H, W = reg.shape[:2]
    yy, xx = np.mgrid[0:H, 0:W]
    cx = 522 - x0
    head = ((xx - cx) / 21.5) ** 2 + ((yy - (1429 - y0)) / 19.5) ** 2 <= 1
    body = (((xx - (520 - x0)) / 27) ** 2 + ((yy - (1462 - y0)) / 14) ** 2 <= 1) & (yy >= 1447 - y0)
    shape = head | body
    keep_hair = (xx >= 510 - x0) & (xx <= 536 - x0) & (yy <= 1409 - y0)
    # 지울 곳 = 꽃잎(노랑~주황) + 꽃잎을 두른 진한 외곽선 (후드·몸·머리카락의 외곽선은 남김)
    petal = (h >= 14) & (h <= 46) & (s >= 100) & (v >= 140) & ~shape & ~keep_hair
    near = petal.copy()
    for _ in range(3):
        g = near.copy()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            g |= np.roll(np.roll(near, dy, 0), dx, 1)
        near = g
    pad1 = shape.copy()
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        pad1 |= np.roll(np.roll(shape, dy, 0), dx, 1)
    zone = (petal | (near & (v < 120))) & ~pad1 & ~keep_hair & (yy >= 1393 - y0)
    ell = ((((xx - cx) / 36) ** 2 + ((yy - (1431 - y0)) / 36) ** 2) <= 1) & (xx <= 553 - x0)
    zone &= ell
    # 고리 자리에 남은 진한 점(꽃잎 외곽선 조각)도
    zone |= ell & (v < 120) & ~pad1 & ~keep_hair & (yy >= 1393 - y0) & (yy <= 1450 - y0)
    # 고리 바깥 테두리의 밝은 테(번짐 픽셀)도 — 보라 하늘색이 아닌 것
    purple = ((h >= 165) | (h <= 6)) & (s >= 30)
    zone |= ell & ~purple & ~pad1 & ~keep_hair & (yy >= 1393 - y0) & (yy <= 1450 - y0)
    # 1px 더 (경계의 섞인 색)
    g = zone.copy()
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        g |= np.roll(np.roll(zone, dy, 0), dx, 1)
    zone = g & ell & ~pad1 & ~keep_hair & (yy >= 1393 - y0)
    # 줄마다: 고나 바로 옆(같은 줄) 배경(보라 하늘) 색의 중앙값으로 채움 — 주변과 같은 밝기, 번짐 없이
    out = reg.astype(float).copy()
    # 배경 = 보라·분홍 하늘 + 지평선의 주황 노을 (옆 사람의 갈색 머리·크림색 옷은 제외)
    bg_like = ((((h >= 165) | (h <= 6)) & (s >= 30) & (v >= 60)) | ((h >= 7) & (h <= 30) & (s >= 80) & (v >= 190))) & ~zone & ~shape & ~keep_hair
    last = None
    for r in range(H):
        lo, hi = max(0, r - 1), min(H, r + 2)
        m = bg_like[lo:hi]
        if m.sum() >= 4:
            last = np.median(reg[lo:hi][m], axis=0)
        if last is not None:
            out[r][zone[r]] = last
    # 모양 안쪽에 남은 꽃잎 조각은 후드 색
    out[shape & (h >= 14) & (h <= 46) & (s >= 100) & (v >= 222)] = HOOD
    # 모양 둘레 2px 외곽선 (고리를 지운 쪽만)
    pad = shape.copy()
    for _ in range(2):
        g = pad.copy()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            g |= np.roll(np.roll(pad, dy, 0), dx, 1)
        pad = g
    out[pad & ~shape & zone] = OUTLINE
    # 작은 꼬리 (오른쪽 아래, 엉덩이 옆)
    tx, ty = 548 - x0, 1463 - y0
    tail = ((xx - tx) / 6) ** 2 + ((yy - ty) / 3.5) ** 2 <= 1
    tail_o = (((xx - tx) / 8) ** 2 + ((yy - ty) / 5.5) ** 2 <= 1) & ~tail & ~shape
    out[tail_o] = OUTLINE
    out[tail & ~shape] = HOOD_SH
    # 등 지느러미: 머리카락 바로 아래부터 등 가운데로 노란 비늘 4개 (작게)
    for k, fy in enumerate([1412, 1422, 1432, 1442]):
        hw = 3.5 if k < 3 else 3
        d = np.abs(xx - cx) / hw + np.abs(yy - (fy - y0)) / 4.5
        out[(d <= 1.4) & head] = OUTLINE
        out[(d <= 1.0) & head] = FIN
        out[(d <= 0.45) & head & (yy < fy - y0)] = FIN_HI
    a[y0:y1, x0:x1] = np.clip(out, 0, 255)
    return a


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    src = np.asarray(Image.open(SRC).convert("RGB"))
    fixed = fix_gona_back(src)
    for k, (x0, y0, x1, y1) in BOXES.items():
        img = fixed if k == "s8" else src
        Image.fromarray(img[y0:y1, x0:x1].astype(np.uint8)).save(OUT / f"{k}.png", optimize=True)
    x0, y0, x1, y1 = S7
    Image.fromarray(src[y0:y1, x0:x1].astype(np.uint8)).save(OUT / "s7.png", optimize=True)
    # 달려가기 발걸음용 두 번째 그림: 고나 부분만 위로 2px·앞으로 2px (번갈아 보여 주면 통통 걸음) — 그림은 그대로
    s3 = np.asarray(Image.open(OUT / "s3.png").convert("RGB")).copy()
    gx0, gy0, gx1, gy1 = 182, 28, 322, 172
    s3b = s3.copy()
    s3b[gy0 - 2:gy1 - 2, gx0 + 2:gx1 + 2] = s3[gy0:gy1, gx0:gx1]
    Image.fromarray(s3b).save(OUT / "s3b.png", optimize=True)
    # 효과: 스토리보드의 하트·킁카 냄새 그림을 배경 없이 (그림 그대로, 색으로 분리)
    def fx(name: str, cx: int, cy: int, r: int, keep) -> None:
        reg = src[cy - r:cy + r, cx - r:cx + r].astype(int)
        hsv = np.asarray(Image.fromarray(reg.astype(np.uint8)).convert("HSV")).astype(int)
        m = keep(hsv)
        from scipy import ndimage
        lab, n = ndimage.label(m)
        if n:
            sizes = ndimage.sum(m, lab, range(1, n + 1))
            m = lab == (int(np.argmax(sizes)) + 1)
            m = ndimage.binary_closing(m, iterations=1)
            m = ndimage.binary_dilation(m, iterations=1)
        rgba = np.zeros(reg.shape[:2] + (4,), np.uint8)
        rgba[..., :3] = reg
        rgba[..., 3] = m * 255
        ys, xs = np.nonzero(m)
        Image.fromarray(rgba[ys.min():ys.max() + 1, xs.min():xs.max() + 1]).save(OUT / f"fx-{name}.png")
    fx("heart", 190, 849, 26, lambda h: (((h[..., 0] >= 225) | (h[..., 0] <= 8)) & (h[..., 1] >= 70) & (h[..., 2] >= 150)))
    fx("sniff", 355, 852, 34, lambda h: ((h[..., 0] >= 22) & (h[..., 0] <= 62) & (h[..., 1] >= 40) & (h[..., 2] >= 90)))
    for f in sorted(OUT.glob("*.png")):
        print(f.name, Image.open(f).size)


if __name__ == "__main__":
    main()
