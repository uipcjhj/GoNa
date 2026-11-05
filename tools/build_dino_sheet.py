#!/usr/bin/env python3
"""
아기 공룡 원본 시트 → 게임용 1:1 도트 스프라이트 시트 변환기

원본(art-src/baby-dino/original_character_sheet.png)은 큰 해상도로 그려진
'도트 느낌' 이미지라서, 한 도트가 화면 픽셀 약 8~11칸에 걸쳐 있고 격자 간격도 일정하지 않습니다.
그대로 축소하면 흐려지거나 도트가 뭉개지므로 다음 순서로 변환합니다.

  1. 배경색(크림색)과 바닥 그림자를 제거해 캐릭터만 분리
  2. 포즈마다 실제 도트 경계선(색이 바뀌는 선)을 찾아 불규칙한 격자를 복원
  3. 격자 칸 하나 = 도트 하나로 색을 뽑아냄 (눈·외곽선 같은 작은 진한 도트는 우선 보존)
  4. 떨어진 잡티 제거, 안쪽 구멍 메우기
  5. 모든 프레임을 같은 크기 칸에 넣고, 발은 바닥에·얼굴은 가운데에 맞춰 정렬
     → 달리기 애니메이션이 흔들리지 않고 자연스럽게 이어짐
  6. 눈 감은 프레임(타이틀 눈 깜빡임용)을 자동 생성

출력: public/assets/character/dino.png  (프레임을 가로로 이어 붙인 시트)
      프레임 순서는 FRAMES 목록 순서 = src/config.ts 의 CHARACTER_ASSET 번호

사용법:  pip install pillow numpy
        python3 tools/build_dino_sheet.py
"""
from collections import Counter, deque
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "art-src/baby-dino/original_character_sheet.png"
OUT = ROOT / "public/assets/character/dino.png"
PREVIEW = ROOT / "art-src/baby-dino/dino-sheet-preview.png"

BG = np.array([251, 237, 221])       # 원본 배경 크림색
SHADOW = np.array([183, 156, 141])   # 발밑 그림자 색

# (이름, 원본에서의 영역 y0, y1, x0, x1)
FRAMES = [
    ("idle", 77, 366, 37, 225),
    ("run1", 77, 366, 262, 433),
    ("run2", 77, 366, 434, 600),
    ("run3", 77, 366, 613, 765),
    ("run4", 77, 366, 773, 921),
    ("jump", 77, 366, 1144, 1296),
    ("blink", None, None, None, None),  # idle 에서 자동 생성
    ("happy", 452, 732, 124, 346),
    ("surprised", 452, 732, 1188, 1369),
]

MIN_CELL, MAX_CELL, NOMINAL_CELL = 6, 14, 9.6


def find_boundaries(edge_count: np.ndarray, n: int) -> list[int]:
    """색이 바뀌는 선이 많이 모이는 위치 = 도트 경계"""
    e = np.convolve(edge_count.astype(float), [0.25, 0.5, 0.25], "same")
    thr = max(2.0, e.max() * 0.12)
    picked: list[int] = []
    for i in np.argsort(-e):
        if e[i] < thr:
            break
        if all(abs(int(i) - p) >= MIN_CELL for p in picked):
            picked.append(int(i))
    cuts = [0] + sorted(p + 1 for p in picked if 0 < p + 1 < n) + [n]
    # 경계가 안 보이는 넓은 구간은 평균 도트 크기로 나눔
    out = [cuts[0]]
    for x in cuts[1:]:
        gap = x - out[-1]
        if gap > MAX_CELL:
            k = max(1, round(gap / NOMINAL_CELL))
            start = out[-1]
            out.extend(round(start + gap * t / k) for t in range(1, k))
        out.append(x)
    return out


def rebuild(img: np.ndarray, fg_all: np.ndarray, box) -> np.ndarray:
    y0, y1, x0, x1 = box
    reg = img[y0:y1, x0:x1]
    fg = fg_all[y0:y1, x0:x1]
    dx = (np.abs(np.diff(reg, axis=1)).sum(2) > 80) & (fg[:, 1:] | fg[:, :-1])
    dy = (np.abs(np.diff(reg, axis=0)).sum(2) > 80) & (fg[1:, :] | fg[:-1, :])
    bx = find_boundaries(dx.sum(0), reg.shape[1])
    by = find_boundaries(dy.sum(1), reg.shape[0])

    rows = [j for j in range(len(by) - 1) if by[j + 1] - by[j] >= 3]
    cols = [i for i in range(len(bx) - 1) if bx[i + 1] - bx[i] >= 3]
    out = np.zeros((len(rows), len(cols), 4), np.uint8)
    for jj, j in enumerate(rows):
        for ii, i in enumerate(cols):
            a, b, c, d = by[j], by[j + 1], bx[i], bx[i + 1]
            ia, ib = a + (b - a) // 5, b - (b - a) // 5
            ic, id_ = c + (d - c) // 5, d - (d - c) // 5
            m = fg[ia:ib, ic:id_]
            if m.size == 0 or m.mean() < 0.5:
                continue
            px = reg[ia:ib, ic:id_][m]
            dark = px.sum(1) < 260
            if dark.mean() >= 0.4:  # 작은 눈·외곽선 보존
                out[jj, ii, :3] = np.median(px[dark], axis=0)
            else:
                out[jj, ii, :3] = np.median(px[~dark] if (~dark).any() else px, axis=0)
            out[jj, ii, 3] = 255
    return out


def components(mask: np.ndarray) -> list[list[tuple[int, int]]]:
    h, w = mask.shape
    seen = np.zeros_like(mask, bool)
    comps = []
    for y in range(h):
        for x in range(w):
            if mask[y, x] and not seen[y, x]:
                q = deque([(y, x)])
                seen[y, x] = True
                pts = []
                while q:
                    cy, cx = q.popleft()
                    pts.append((cy, cx))
                    for ddy in (-1, 0, 1):
                        for ddx in (-1, 0, 1):
                            ny, nx = cy + ddy, cx + ddx
                            if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                                seen[ny, nx] = True
                                q.append((ny, nx))
                comps.append(pts)
    return comps


def clean(o: np.ndarray) -> np.ndarray:
    o = o.copy()
    solid = o[..., 3] > 0
    comps = components(solid)
    biggest = max(len(c) for c in comps)
    keep = np.zeros_like(solid)
    for c in comps:  # 반짝이·느낌표 같은 떨어진 조각 제거
        if len(c) >= biggest * 0.5:
            for p in c:
                keep[p] = True
    o[~keep] = 0
    # 바깥과 이어지지 않은 투명 칸 = 안쪽 구멍 → 주변 색으로 메움
    h, w = keep.shape
    outside = np.zeros_like(keep)
    q = deque()
    for y in range(h):
        for x in range(w):
            if (y in (0, h - 1) or x in (0, w - 1)) and not keep[y, x]:
                outside[y, x] = True
                q.append((y, x))
    while q:
        cy, cx = q.popleft()
        for ddy, ddx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = cy + ddy, cx + ddx
            if 0 <= ny < h and 0 <= nx < w and not outside[ny, nx] and not keep[ny, nx]:
                outside[ny, nx] = True
                q.append((ny, nx))
    for y in range(h):
        for x in range(w):
            if not keep[y, x] and not outside[y, x]:
                nb = [tuple(o[y + a, x + b, :3]) for a, b in ((1, 0), (-1, 0), (0, 1), (0, -1))
                      if 0 <= y + a < h and 0 <= x + b < w and o[y + a, x + b, 3]]
                if nb:
                    o[y, x, :3] = Counter(nb).most_common(1)[0][0]
                    o[y, x, 3] = 255
    ys, xs = np.where(o[..., 3] > 0)
    return o[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


def is_skin(c) -> bool:
    r, g, b = (int(v) for v in c[:3])
    return r > 225 and 165 < g < 235 and 120 < b < 200


def face_center_x(o: np.ndarray) -> float:
    ys, xs = np.where([[o[y, x, 3] > 0 and is_skin(o[y, x]) for x in range(o.shape[1])] for y in range(o.shape[0])])
    return float(xs.mean()) if len(xs) else o.shape[1] / 2


def make_blink(o: np.ndarray) -> np.ndarray:
    """얼굴 안의 작은 진한 도트(눈)를 눈꺼풀 색으로 바꿔 눈 감은 프레임 생성"""
    b = o.copy()
    h, w = o.shape[:2]
    skin = [o[y, x, :3] for y in range(h) for x in range(w) if o[y, x, 3] and is_skin(o[y, x])]
    lid = (np.median(skin, axis=0) * 0.85).astype(np.uint8)
    for y in range(1, h - 1):
        for x in range(1, w - 1):
            c = o[y, x]
            if not c[3] or int(c[:3].sum()) >= 330:
                continue
            around = [o[y + a, x + d] for a, d in ((0, -1), (0, 1), (-1, 0), (1, 0), (-1, -1), (-1, 1), (1, -1), (1, 1))]
            skin_n = sum(1 for n in around if n[3] and is_skin(n))
            if skin_n >= 5:  # 피부로 둘러싸인 진한 점 = 눈
                b[y, x, :3] = lid
    return b


def main() -> None:
    img = np.array(Image.open(SRC).convert("RGB")).astype(int)
    fg = (np.abs(img - BG).sum(2) > 60) & (np.abs(img - SHADOW).sum(2) > 50)

    sprites: dict[str, np.ndarray] = {}
    for name, *box in FRAMES:
        if box[0] is None:
            continue
        sprites[name] = clean(rebuild(img, fg, box))
    sprites["blink"] = make_blink(sprites["idle"])

    # 공통 프레임 크기: 얼굴 중심을 가운데로, 발은 바닥에
    centers = {n: face_center_x(s) for n, s in sprites.items()}
    left = max(centers[n] for n in sprites)
    right = max(s.shape[1] - centers[n] for n, s in sprites.items())
    fw = int(np.ceil(left + right)) + 2
    fh = max(s.shape[0] for s in sprites.values()) + 1
    cx = left + 1

    order = [n for n, *_ in FRAMES]
    sheet = np.zeros((fh, fw * len(order), 4), np.uint8)
    for k, n in enumerate(order):
        s = sprites[n]
        ox = k * fw + int(round(cx - centers[n]))
        oy = fh - s.shape[0]
        region = sheet[oy:oy + s.shape[0], ox:ox + s.shape[1]]
        mask = s[..., 3] > 0
        region[mask] = s[mask]

    OUT.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(sheet).save(OUT)
    prev = Image.new("RGBA", (sheet.shape[1], fh), (120, 190, 220, 255))
    prev.alpha_composite(Image.fromarray(sheet))
    prev.resize((prev.width * 8, prev.height * 8), Image.NEAREST).save(PREVIEW)
    print(f"frame {fw}x{fh}, {len(order)} frames -> {OUT.relative_to(ROOT)}")
    for k, n in enumerate(order):
        print(f"  {k}: {n} {sprites[n].shape[1]}x{sprites[n].shape[0]}")


if __name__ == "__main__":
    main()
