#!/usr/bin/env python3
"""
엔딩 피날레용 황금빛 빈티지 왕궁 초상화 액자 (바로크·로코코풍 16비트 픽셀아트, 코드로 그림)
출력: public/assets/ending/golden-frame.png (투명 배경, 가운데는 비어 있음 — 가족사진은 그 안에 그대로 넣음)
      public/assets/ending/golden-frame.json (사진이 들어갈 안쪽 칸 위치·크기, 원본 픽셀 단위)

구성 (바깥 → 안):
  진한 외곽선 · 굵게 솟은 바깥 몰딩(위·왼쪽 밝게 / 아래·오른쪽 어둡게) · 홈 · 구슬 줄 · 홈 ·
  넓은 오목 띠(잎·화살 무늬) · 샴페인 골드 능선 · 안쪽 경사(빛 방향 반대) · 안쪽 진한 테두리
  네 모서리: 둥근 장식판(로제트) + 소용돌이(C 스크롤) + 아칸서스 잎 · 위 가운데: 작은 왕관 + 장식판 ·
  아래 가운데: 조개(부채) 장식 · 양옆 가운데: 작은 꽃 장식
팔레트: 앤티크 브론즈 ~ 샴페인 골드 8단계
사용법: python3 tools/build_golden_frame.py
"""
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public/assets/ending/golden-frame.png"
META = ROOT / "public/assets/ending/golden-frame.json"

PAL = [
    (0, 0, 0, 0),          # 0 투명
    (46, 26, 8, 255),      # 1 외곽선 (아주 진한 브론즈)
    (92, 56, 18, 255),     # 2 진한 브론즈 (그림자)
    (138, 90, 30, 255),    # 3 브론즈 골드
    (184, 132, 48, 255),   # 4 앤티크 골드
    (214, 168, 70, 255),   # 5 골드
    (238, 206, 120, 255),  # 6 샴페인 골드
    (255, 240, 184, 255),  # 7 하이라이트
    (156, 34, 52, 255),    # 8 루비 (왕관 보석)
    (226, 92, 104, 255),   # 9 루비 하이라이트
    (64, 120, 168, 255),   # 10 사파이어
]

IW, IH = 150, 112          # 사진 칸 (1108x828 비율 ≈ 1.338)
T = 18                     # 액자 두께
CROWN = 22                 # 왕관이 위로 솟는 높이
W = IW + T * 2
H = IH + T * 2 + CROWN
OY = CROWN                 # 액자 몸통 시작 y

g = np.zeros((H, W), np.uint8)


def put(x, y, c):
    if 0 <= x < W and 0 <= y < H:
        g[y, x] = c


def disc(cx, cy, r, c):
    for y in range(int(cy - r - 1), int(cy + r + 2)):
        for x in range(int(cx - r - 1), int(cx + r + 2)):
            if (x - cx) ** 2 + (y - cy) ** 2 <= r * r:
                put(x, y, c)


def ring(cx, cy, r, c, th=1.0):
    for y in range(int(cy - r - 2), int(cy + r + 3)):
        for x in range(int(cx - r - 2), int(cx + r + 3)):
            d = math.hypot(x - cx, y - cy)
            if r - th <= d <= r:
                put(x, y, c)


# ── 몸통 띠: 바깥에서 거리 d, 어느 변인지에 따라 빛(위·왼쪽 밝음)
def lit(side_light: bool, a: int, b: int) -> int:
    return a if side_light else b


for y in range(OY, H):
    for x in range(W):
        yy = y - OY
        hh = H - OY
        d = min(x, yy, W - 1 - x, hh - 1 - yy)
        if d >= T:
            continue
        # 어느 변에 가까운지 (모서리는 대각선으로 나눔)
        dl, dt, dr, db = x, yy, W - 1 - x, hh - 1 - yy
        m = min(dl, dt, dr, db)
        outer_light = m in (dl, dt) and not (m == dr or m == db) or (m == dt) or (m == dl and dl <= dt)
        if m == db or m == dr:
            outer_light = False
        if m == dt or (m == dl and dl < db):
            outer_light = True
        if d == 0:
            c = 1
        elif d in (1, 2):
            c = lit(outer_light, 6 if d == 1 else 5, 3 if d == 1 else 2)
        elif d == 3:
            c = 2
        elif d in (4, 5):
            # 구슬 줄: 3칸마다 구슬 (2x2)
            along = x if m in (dt, db) else yy
            k = along % 4
            c = (7 if (k == 0 and d == 4) else 6) if k in (0, 1) else 2
            if not outer_light and k in (0, 1):
                c = 5 if d == 4 else 4
        elif d == 6:
            c = 2
        elif 7 <= d <= 11:
            # 넓은 오목 띠: 바깥쪽 어둡고 안쪽 밝게 (오목) + 잎·화살 무늬
            base = {7: 3, 8: 4, 9: 4, 10: 5, 11: 5}[d]
            if not outer_light:
                base = max(2, base - 1)
            along = x if m in (dt, db) else yy
            k = along % 8
            # 잎: 위쪽 가운데로 오목하게 뾰족한 모양
            leaf = (k in (2, 3, 4, 5) and d in (8, 9, 10)) and not (d == 8 and k in (2, 5))
            dart = k == 0 and d in (8, 9, 10, 11)
            if leaf:
                c = 6 if (k in (3, 4) and d == 9) else 5
                if d == 10 and k in (2, 5):
                    c = 2
            elif dart:
                c = 2
            else:
                c = base
        elif d == 12:
            c = 7 if outer_light else 6
        elif d in (13, 14):
            # 안쪽 경사: 빛 반대 (위·왼쪽 안쪽 면은 그늘)
            c = lit(outer_light, 3 if d == 13 else 2, 5 if d == 13 else 6)
        elif d == 15:
            c = 1
        elif d == 16:
            c = 4
        else:
            c = 1
        g[y, x] = c


# ── 모서리 장식: 로제트 + C 스크롤 + 아칸서스 잎
def corner(cx, cy, sx, sy):
    # 장식판 (둥근 메달)
    disc(cx, cy, 9.5, 1)
    disc(cx, cy, 8.5, 4)
    disc(cx - sx * 1.5, cy - sy * 1.5, 6.5, 5)
    disc(cx - sx * 2.5, cy - sy * 2.5, 3.5, 6)
    disc(cx - sx * 3, cy - sy * 3, 1.5, 7)
    ring(cx, cy, 9.5, 1, 1.2)
    # 로제트 꽃잎 8장 (점)
    for i in range(8):
        a = i * math.pi / 4
        put(round(cx + math.cos(a) * 6.5), round(cy + math.sin(a) * 6.5), 7 if (math.cos(a) * sx + math.sin(a) * sy) < 0 else 3)
    # 가운데 보석
    disc(cx, cy, 2.2, 1)
    disc(cx, cy, 1.4, 8)
    put(round(cx - sx), round(cy - sy), 9)
    # C 스크롤 두 개 (가로 변 · 세로 변을 따라)
    for horiz in (True, False):
        for t in np.linspace(0, 1, 70):
            r = 5.5 * (1 - t) + 1.2
            a = t * math.pi * 2.2
            ox = (14 * sx if horiz else 0) + math.cos(a) * r * (1 if horiz else 1)
            oy = (0 if horiz else 14 * sy) + math.sin(a) * r
            px, py = round(cx + ox), round(cy + oy)
            put(px, py, 1)
            put(px - sx, py - sy, 6)
        bx, by = (cx + 14 * sx, cy) if horiz else (cx, cy + 14 * sy)
        disc(bx, by, 1.2, 7)
    # 아칸서스 잎 (변을 따라 뻗는 잎 세 장)
    for horiz in (True, False):
        for i, (dist, size) in enumerate(((21, 3.2), (26, 2.6), (30, 2.0))):
            lx = cx + (dist * sx if horiz else 0)
            ly = cy + (0 if horiz else dist * sy)
            disc(lx, ly, size + 0.8, 1)
            disc(lx, ly, size, 5)
            disc(lx - sx * 0.8, ly - sy * 0.8, size * 0.5, 7)


C = T // 2 + 0.5
corner(C, OY + C, 1, 1)
corner(W - 1 - C, OY + C, -1, 1)
corner(C, H - 1 - C, 1, -1)
corner(W - 1 - C, H - 1 - C, -1, -1)


# ── 위 가운데: 장식판 + 왕관
def cartouche(cx, cy, rw, rh):
    for y in range(int(cy - rh - 2), int(cy + rh + 3)):
        for x in range(int(cx - rw - 2), int(cx + rw + 3)):
            e = ((x - cx) / rw) ** 2 + ((y - cy) / rh) ** 2
            if e <= 1:
                put(x, y, 6 if (y < cy - rh * 0.2 and x < cx + rw * 0.3) else 5 if y < cy + rh * 0.4 else 4)
            elif e <= 1.35:
                put(x, y, 1)


mx = W // 2
cartouche(mx, OY + T // 2, 15, 7.5)
# 장식판 속 작은 하트 모양 문장 (가족)
for (dx, dy) in [(-2, -2), (-1, -2), (1, -2), (2, -2), (-3, -1), (-2, -1), (-1, -1), (0, -1), (1, -1), (2, -1), (3, -1),
                 (-3, 0), (-2, 0), (-1, 0), (0, 0), (1, 0), (2, 0), (3, 0), (-2, 1), (-1, 1), (0, 1), (1, 1), (2, 1), (-1, 2), (0, 2), (1, 2), (0, 3)]:
    put(mx + dx, OY + T // 2 + dy, 8)
put(mx - 2, OY + T // 2 - 2, 9)
# 양쪽 스크롤
for s in (-1, 1):
    for t in np.linspace(0, 1, 60):
        r = 4.5 * (1 - t) + 1
        a = t * math.pi * 2.0
        px, py = round(mx + s * (19 + math.cos(a) * r)), round(OY + T // 2 + math.sin(a) * r)
        put(px, py, 1)
        put(px - s, py - 1, 6)
# 왕관 (몸통 위로 솟음)
cy0 = OY + 2
base_y = cy0 - 1
for x in range(mx - 13, mx + 14):
    for y in range(base_y - 3, base_y + 1):
        put(x, y, 5 if y < base_y else 3)
for x in range(mx - 14, mx + 15):
    put(x, base_y - 4, 1)
    put(x, base_y + 1, 1)
for y in range(base_y - 4, base_y + 2):
    put(mx - 14, y, 1)
    put(mx + 14, y, 1)
# 띠의 보석
for i, dx in enumerate((-9, -3, 3, 9)):
    put(mx + dx, base_y - 2, 10 if i % 2 else 8)
    put(mx + dx, base_y - 1, 1)
# 다섯 봉우리: 봉우리 사이는 둥근 골짜기 (왕관 실루엣)
peaks = ((-12, 7), (-6, 9), (0, 12), (6, 9), (12, 7))
def crown_top(x):
    best = 0.0
    for dx, hgt in peaks:
        best = max(best, hgt - abs(x - dx) * 1.35)
    return max(best, 2.5)
shape = {}
for x in range(-13, 14):
    top = base_y - 4 - round(crown_top(x))
    shape[x] = top
    for y in range(top, base_y - 3):
        c = 6 if x < -4 else 5 if x < 4 else 4
        if y == top + 1 and x <= 0:
            c = 7
        put(mx + x, y, c)
for x in range(-13, 14):
    put(mx + x, shape[x] - 1, 1)
    for nx in (x - 1, x + 1):
        if -13 <= nx <= 13 and shape[nx] > shape[x]:
            for y in range(shape[x] - 1, shape[nx]):
                put(mx + x, y, 1)
for y in range(shape[-13] - 1, base_y - 3):
    put(mx - 14, y, 1)
    put(mx + 14, y, 1)
# 봉우리 끝 구슬 · 가운데 보석
for k, (dx, hgt) in enumerate(peaks):
    ty = base_y - 4 - hgt
    disc(mx + dx, ty - 2, 1.7, 1)
    disc(mx + dx, ty - 2, 1.0, 7 if k == 2 else 6)
disc(mx, base_y - 9, 2.0, 1)
disc(mx, base_y - 9, 1.2, 8)
put(mx - 1, base_y - 10, 9)
# 가운데 십자
cy_top = base_y - 4 - 12 - 4
for y in range(cy_top - 4, cy_top):
    put(mx, y, 7)
    put(mx + 1, y, 1) if y == cy_top - 1 else None
put(mx - 1, cy_top - 3, 7)
put(mx + 1, cy_top - 3, 7)

# ── 아래 가운데: 조개(부채) 장식
by = H - 1 - T // 2
for y in range(by - 9, by + 4):
    for x in range(mx - 13, mx + 14):
        dx, dy = x - mx, y - (by + 3)
        r = math.hypot(dx, dy)
        if dy <= 0 and r <= 12:
            a = math.atan2(-dy, dx)
            rib = int(a / (math.pi / 9)) % 2
            put(x, y, 1 if r > 11 else (6 if rib else 4) if r > 3 else 5)
        elif dy <= 0 and r <= 13:
            put(x, y, 1)
disc(mx, by + 3, 2.2, 1)
disc(mx, by + 3, 1.3, 7)


# ── 양옆 가운데: 작은 꽃
def flower(cx, cy):
    for i in range(6):
        a = i * math.pi / 3
        disc(cx + math.cos(a) * 3, cy + math.sin(a) * 3, 1.8, 1)
    for i in range(6):
        a = i * math.pi / 3
        disc(cx + math.cos(a) * 3, cy + math.sin(a) * 3, 1.1, 6 if math.cos(a) + math.sin(a) < 0 else 4)
    disc(cx, cy, 1.6, 1)
    disc(cx, cy, 0.9, 8)


flower(T // 2, OY + T + IH // 2)
flower(W - 1 - T // 2, OY + T + IH // 2)

img = np.array([PAL[i] for i in g.flatten()], np.uint8).reshape(H, W, 4)
OUT.parent.mkdir(parents=True, exist_ok=True)
Image.fromarray(img).save(OUT, optimize=True)
META.write_text(json.dumps({"w": W, "h": H, "inner": [T, OY + T, IW, IH]}))
Image.fromarray(img).resize((W * 4, H * 4), Image.NEAREST).save(ROOT / "art-src/ending/golden-frame-preview.png")
print(W, H, "inner", T, OY + T, IW, IH)
