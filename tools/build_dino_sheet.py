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
  6. 얼굴을 3/4 뷰로 통일: 모든 포즈에서 아주 작은 검은 눈 2개를 같은 규칙으로 다시 찍음
     (원본 일부 포즈는 옆모습이라 눈이 1개뿐 → 변환할 때마다 자동 보정, 눈이 2개가 아니면 실패)
  7. 눈 감은 프레임(타이틀 눈 깜빡임용)을 자동 생성

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
    # ── 성장 단계용 포즈 ──
    ("crouch", 77, 366, 959, 1128),     # 9: 웅크리기 (기어 다니는 고나)
    ("sit", 77, 366, 1316, 1479),       # 10: 앉기 (기어 다니는 고나 2번째 프레임)
    ("sleep", 452, 732, 883, 1145),     # 11: 엎드려 눈 감기 (갓난아기 깜빡임)
    ("newborn", None, None, None, None),  # 12: 엎드린 갓난아기, 눈 뜸 (sleep 에서 자동 생성)
]

# 누워 있어서 얼굴이 기울어진 포즈 → 3/4 뷰 눈 규칙에서 제외
NO_FACE_RULE = {"sleep", "newborn"}
# sleep 의 감은 눈(짧은 선) 위치 → 지우고 뜬 눈(작은 검은 점)을 찍어 newborn 생성
#   (지울 픽셀들, 눈 점 위치) — 좌표는 복원된 sleep 스프라이트 기준
NEWBORN_EYES = {
    "erase": [(17, 11), (17, 12), (15, 16), (15, 17)],
    "dots": [(17, 12), (15, 17)],
}

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


def is_cheek(c) -> bool:
    r, g, b = (int(v) for v in c[:3])
    return r > 225 and g <= 200 and b < 170


def is_face(c) -> bool:
    return bool(c[3]) and (is_skin(c) or is_cheek(c))


def is_dark(c) -> bool:
    # 진한 갈색/검정 (입의 붉은색은 제외)
    return bool(c[3]) and int(c[:3].sum()) < 330 and int(c[0]) - int(c[1]) < 70


# 3/4 뷰 눈 규칙: 오른쪽(가까운) 눈 = 얼굴 오른쪽 끝에서 2칸 안쪽,
# 왼쪽(먼) 눈 = 그보다 EYE_GAP 칸 왼쪽. 표정 포즈(눈이 2칸 높이)는 얼굴이 커서 한 칸 더 넓게.
EYE_INSET = 2
EYE_GAP = 4
EYE_GAP_TALL = 5
EYE_COLOR = np.array([72, 42, 30], np.uint8)


def face_span(o: np.ndarray, y: int) -> tuple[int, int] | None:
    xs = [x for x in range(o.shape[1]) if is_face(o[y, x])]
    return (min(xs), max(xs)) if xs else None


def eye_runs(o: np.ndarray, y: int) -> list[tuple[int, int]]:
    """얼굴 안에서 양옆이 피부인 1~2칸짜리 진한 점 = 눈 후보"""
    runs = []
    w = o.shape[1]
    x = 1
    while x < w - 1:
        if is_dark(o[y, x]) and is_face(o[y, x - 1]):
            e = x
            while e + 1 < w and is_dark(o[y, e + 1]):
                e += 1
            if e - x <= 1 and e + 1 < w and is_face(o[y, e + 1]):
                runs.append((x, e))
            x = e + 1
        else:
            x += 1
    return runs


def normalize_face(o: np.ndarray, name: str) -> np.ndarray:
    """눈을 지우고 3/4 뷰 규칙에 맞춰 작은 검은 눈 2개를 다시 찍음 (입은 두 눈 가운데로)"""
    o = o.copy()
    h = o.shape[0]
    rows = []
    for y in range(h):
        span = face_span(o, y)
        if span and span[1] - span[0] >= 7:
            runs = eye_runs(o, y)
            if runs:
                rows.append((len(runs), -y, y))
    if not rows:
        raise SystemExit(f"[{name}] 얼굴에서 눈 위치를 찾지 못했습니다")
    eye_y = max(rows)[2]
    xs_here = {x for a, b in eye_runs(o, eye_y) for x in range(a, b + 1)}
    overlap = lambda y: any(x in xs_here for a, b in eye_runs(o, y) for x in range(a, b + 1)) if 0 <= y < h else False
    tall = False
    if overlap(eye_y - 1):  # 2칸 높이 눈: 윗줄부터
        eye_y -= 1
        tall = True
    elif overlap(eye_y + 1):
        tall = True
    eh = 2 if tall else 1

    skin = np.median([o[y, x, :3] for y in range(h) for x in range(o.shape[1]) if o[y, x, 3] and is_skin(o[y, x])], axis=0).astype(np.uint8)

    # 기존 눈 지우기
    for y in range(eye_y - 1, eye_y + eh + 1):
        if 0 <= y < h:
            for a, b in eye_runs(o, y):
                o[y, a:b + 1, :3] = skin

    span = face_span(o, eye_y)
    assert span is not None
    right = span[1] - EYE_INSET
    left = right - (EYE_GAP_TALL if tall else EYE_GAP)
    for y in range(eye_y, eye_y + eh):
        for x in (left, right):
            o[y, x, :3] = EYE_COLOR
            o[y, x, 3] = 255

    # 입(표정 포즈): 눈 아래 얼굴 안의 붉은 픽셀을 두 눈 가운데로 옮김
    mouth = [(y, x) for y in range(eye_y + eh, min(h, eye_y + eh + 4)) for x in range(o.shape[1])
             if o[y, x, 3] and int(o[y, x, 0]) > 140 and int(o[y, x, 0]) - int(o[y, x, 1]) >= 70
             and not is_cheek(o[y, x])
             and (face_span(o, y) or (99, -1))[0] < x < (face_span(o, y) or (99, -1))[1]]
    if mouth:
        cx = sum(x for _, x in mouth) / len(mouth)
        # 원래 위치 쪽으로 반올림 (볼터치에 붙지 않게)
        shift = int((left + right) / 2 - cx)
        if shift:
            colors = {(y, x): o[y, x].copy() for y, x in mouth}
            for y, x in mouth:
                o[y, x, :3] = skin
            for (y, x), c in colors.items():
                o[y, x + shift] = c
    return o


def count_eyes(o: np.ndarray) -> int:
    best = 0
    for y in range(o.shape[0]):
        span = face_span(o, y)
        if span and span[1] - span[0] >= 7:
            best = max(best, len(eye_runs(o, y)))
    return best


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
    for n in list(sprites):
        if n in NO_FACE_RULE:
            continue
        sprites[n] = normalize_face(sprites[n], n)
        eyes = count_eyes(sprites[n])
        if eyes != 2:
            raise SystemExit(f"[{n}] 눈이 {eyes}개입니다 — 모든 포즈는 눈이 2개여야 합니다")
    # 갓난아기(눈 뜸): 엎드려 자는 포즈의 감은 눈을 지우고 작은 검은 점 2개
    nb = sprites["sleep"].copy()
    skin = np.median([nb[y, x, :3] for y in range(nb.shape[0]) for x in range(nb.shape[1])
                      if nb[y, x, 3] and is_skin(nb[y, x])], axis=0).astype(np.uint8)
    for y, x in NEWBORN_EYES["erase"]:
        if not (nb[y, x, 3] and not is_skin(nb[y, x])):
            raise SystemExit(f"[newborn] ({y},{x}) 가 감은 눈 픽셀이 아닙니다 — 원본이 바뀌었으면 NEWBORN_EYES 를 고쳐 주세요")
        nb[y, x, :3] = skin
    for y, x in NEWBORN_EYES["dots"]:
        nb[y, x, :3] = EYE_COLOR
    sprites["newborn"] = nb
    sprites["blink"] = make_blink(sprites["idle"])
    if count_eyes(sprites["blink"]) != 0:
        raise SystemExit("[blink] 눈 감은 프레임에 눈이 남아 있습니다")

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
    # 공식 캐릭터 팔레트(art-src/growth/gona-official-palette.png)의 초록으로 맞춤
    import apply_official_palette

    apply_official_palette.apply(OUT)
    prev = Image.new("RGBA", (sheet.shape[1], fh), (120, 190, 220, 255))
    prev.alpha_composite(Image.fromarray(sheet))
    prev.resize((prev.width * 8, prev.height * 8), Image.NEAREST).save(PREVIEW)
    print(f"frame {fw}x{fh}, {len(order)} frames -> {OUT.relative_to(ROOT)}")
    for k, n in enumerate(order):
        print(f"  {k}: {n} {sprites[n].shape[1]}x{sprites[n].shape[0]}")


if __name__ == "__main__":
    main()
