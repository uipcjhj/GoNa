#!/usr/bin/env python3
"""
게임 플레이 배경(16:9 한 장) → 끊김 없이 반복되는 가로 스크롤 이미지

원본: art-src/game-bg/gona-background-original.png (640x360)
출력: public/assets/game/game-bg-loop.png  ([원본][연결 구간] → 오른쪽 끝이 다시 원본 왼쪽 끝과 이어짐,
      위쪽에 숲 지붕 100줄 추가 → 772x460)

원본의 왼쪽 끝(잘린 큰 버섯)과 오른쪽 끝(나무·동굴 바위)은 그림이 달라서 그대로 반복하면 경계가 보이고,
좌우 반전으로 이으면 버섯이 하트 모양으로 붙거나 동굴이 두 개 나란히 보입니다.

그래서 원본은 그대로 두고, 오른쪽 끝과 왼쪽 끝 사이에 '연결 구간'을 새로 만듭니다.
  - 연결 구간은 원본에서 잘라 온 작은 조각(패치)들로 채웁니다 (이미지 퀼팅).
  - 조각은 바로 옆(왼쪽·위·마지막엔 원본 왼쪽 끝)과 색이 가장 잘 맞는 것을, 비슷한 높이에서 고릅니다.
    → 하늘은 위에, 숲은 가운데, 풀밭은 아래에 자연스럽게 놓임
  - 조각끼리는 섞지(블렌딩) 않고, 색 차이가 가장 적은 경로를 따라 픽셀 단위로 잘라 이어 붙입니다.
    → 흐려지지 않는 선명한 픽셀
  - 폭포·동굴 입구·모닥불·깃발·엄니·뼈다귀 같은 주요 그림은 조각 재료에서 빼서 중복되지 않게 합니다.
  - 원본에서 바뀌는 곳은 이음매가 지나가는 양 끝 몇 픽셀뿐입니다.

사용법:  pip install pillow numpy
        python3 tools/build_game_bg.py            (결과가 마음에 안 들면 --seed 숫자 를 바꿔 다시)
"""
import argparse
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "art-src/game-bg/gona-background-original.png"
OUT = ROOT / "public/assets/game/game-bg-loop.png"
PREVIEW = ROOT / "art-src/game-bg/loop-seam-preview.png"

P = 36          # 조각 크기
O = 14          # 겹침 폭 (이 안에서 잘라 이음)
S = P - O       # 조각 간격
N_COLS = 6      # 연결 구간 조각 열 수 → 연결 구간 폭 = 8 + 22*(N_COLS-1) = 118px
ROW_RANGE = 28  # 조각을 가져올 높이 허용 범위 (±px)

# 조각 재료에서 뺄 주요 그림 영역 (x0, y0, x1, y1) — 중복되면 어색한 것들
LANDMARKS = [
    (295, 70, 352, 175),    # 왼쪽 폭포
    (405, 70, 450, 140),    # 오른쪽 폭포
    (485, 130, 640, 250),   # 동굴
    (375, 175, 460, 245),   # 모닥불
    (80, 100, 215, 255),    # 깃발 + 엄니
    (460, 285, 570, 330),   # 뼈다귀
    (0, 30, 160, 150),      # 큰 버섯 갓 (원본 왼쪽 끝에 이미 있음)
    (430, 60, 570, 135),    # 동굴 옆 큰 버섯 갓
    (395, 130, 470, 175),   # 모닥불 뒤 버섯 갓
    (175, 130, 265, 195),   # 가운데 왼쪽 버섯 갓
    (0, 215, 100, 280),     # 왼쪽 끝 그루터기
]

# 원본 왼쪽 끝에서 잘린 그림 → 같은 그림의 오른쪽 테두리를 중심축 기준으로 옮겨 와 닫아 줌
#   (행 범위, 중심 x, 테두리를 찾기 시작할 x, 최대 확장 폭)
COMPLETE = [
    ((222, 272), 45, 70, 10),   # 그루터기 (오른쪽 테두리를 중심축으로 뒤집어 닫음)
]
# 큰 빨간 버섯 갓: 원본 안에서 왼쪽 위 테두리가 (기둥 중심 x=60 기준) 오른쪽 테두리와 정확히 대칭임을 확인.
# 잘린 부분(행 범위)의 외곽선 '모양'만 대칭으로 계산해서 그리고, 안쪽은 바로 옆 원본 왼쪽(그늘) 픽셀로 채움.
CAP = ((61, 142), 60, 90)


def min_cut_path(err: np.ndarray) -> np.ndarray:
    """세로 방향 최소 비용 경로 (행마다 끊을 열). err: (rows, cols)"""
    h, w = err.shape
    cost = err.copy()
    back = np.zeros((h, w), np.int64)
    for y in range(1, h):
        for x in range(w):
            lo, hi = max(0, x - 1), min(w, x + 2)
            k = lo + int(np.argmin(cost[y - 1, lo:hi]))
            back[y, x] = k
            cost[y, x] += cost[y - 1, k]
    path = np.zeros(h, np.int64)
    path[-1] = int(np.argmin(cost[-1]))
    for y in range(h - 1, 0, -1):
        path[y - 1] = back[y, path[y]]
    return path


def build(seed: int) -> tuple[np.ndarray, int]:
    rng = np.random.default_rng(seed)
    src = np.array(Image.open(SRC).convert("RGB")).astype(np.int32)
    H, W = src.shape[:2]
    bridge = P - 2 * O + S * (N_COLS - 1) + O
    loop_w = W + bridge
    # 작업 캔버스: [원본][연결 구간][원본 왼쪽 O 열 (반복되어 다시 만나는 곳)]
    canvas = np.zeros((H, loop_w + O, 3), np.int32)
    filled = np.zeros((H, loop_w + O), bool)
    canvas[:, :W] = src
    filled[:, :W] = True
    canvas[:, loop_w:loop_w + O] = src[:, :O]
    filled[:, loop_w:loop_w + O] = True

    allowed = np.ones((H, W), bool)
    for x0, y0, x1, y1 in LANDMARKS:
        allowed[y0:y1, x0:x1] = False

    rows = list(range(0, H - P + 1, S))
    if rows[-1] != H - P:
        rows.append(H - P)
    x0 = W - O
    for c in range(N_COLS):
        px = x0 + c * S
        last = c == N_COLS - 1
        for py in rows:
            best = []
            for sy in range(max(0, py - ROW_RANGE), min(H - P, py + ROW_RANGE) + 1, 2):
                for sx in range(0, W - P + 1, 3):
                    if not allowed[sy:sy + P, sx:sx + P].all():
                        continue
                    patch = src[sy:sy + P, sx:sx + P]
                    region = canvas[py:py + P, px:px + P]
                    m = filled[py:py + P, px:px + P]
                    if not m.any():
                        e = 0.0
                    else:
                        d = ((patch - region) ** 2).sum(2)
                        e = float(d[m].mean())
                        if last:
                            # 마지막 열은 원본 왼쪽 끝과 잘 맞는 것을 훨씬 중요하게
                            e += 4.0 * float(d[:, P - O:].mean())
                    best.append((e, sy, sx))
            best.sort()
            tol = best[0][0] * 1.08 + 1
            cands = [b for b in best[:40] if b[0] <= tol]
            _, sy, sx = cands[rng.integers(len(cands))]
            patch = src[sy:sy + P, sx:sx + P]
            region = canvas[py:py + P, px:px + P]
            m = filled[py:py + P, px:px + P]
            take = np.ones((P, P), bool)  # True = 새 조각 사용
            err = ((patch - region) ** 2).sum(2).astype(float)
            # 왼쪽 겹침: 경로 왼쪽은 기존 그림 유지
            if m[:, :O].all():
                path = min_cut_path(err[:, :O])
                for y in range(P):
                    take[y, :path[y]] = False
            # 위쪽 겹침: 경로 위쪽은 기존 그림 유지
            if m[:O, :].all():
                path = min_cut_path(err[:O, :].T)
                for x in range(P):
                    take[:path[x], x] = False
            # 마지막 열의 오른쪽 겹침: 원본 왼쪽 끝으로 이어지도록, 경로 오른쪽은 원본 유지
            if last and m[:, P - O:].all():
                path = min_cut_path(err[:, P - O:])
                for y in range(P):
                    take[y, P - O + path[y] + 1:] = False
            region[take] = patch[take]
            filled[py:py + P, px:px + P] = True

    # 반복해서 다시 만나는 원본 왼쪽 O 열에 바뀐 픽셀을 반영 (이음매가 지나간 부분만)
    out = canvas[:, :loop_w].copy()
    out[:, :O] = canvas[:, loop_w:loop_w + O]

    def right_edge(y: int, scan_from: int) -> int:
        """그림(붉은 갓·황갈색 갓 아래·회갈색 돌)이 끝나는 오른쪽 위치 + 바로 바깥 외곽선"""
        r = -1
        for x in range(scan_from, min(W, scan_from + 80)):
            cr, cg, cb = src[y, x]
            warm = cr > 140 and cr > cg + 20
            stone = abs(cr - cg) < 30 and abs(cg - cb) < 35 and 110 < cr < 220
            if warm or stone:
                r = x
        if r >= 0:
            while r + 1 < W and src[y, r + 1].sum() < 260:
                r += 1
        return r

    def smoothed(y0: int, y1: int, scan_from: int) -> dict:
        raw = {y: right_edge(y, scan_from) for y in range(y0, y1)}
        raw = {y: r for y, r in raw.items() if r >= 0}
        return {y: int(np.median([raw[k] for k in range(y - 2, y + 3) if k in raw])) for y in raw}

    # (1) 그루터기 등: 오른쪽 테두리를 중심축으로 뒤집어 닫음
    for (y0, y1), cx, scan_from, max_d in COMPLETE:
        for y, r in smoothed(y0, y1, scan_from).items():
            out[y, :min(O, r + 1)] = src[y, :min(O, r + 1)]
            for d in range(1, max_d + 1):
                xm = 2 * cx + d - 1
                if xm > r:
                    break
                out[y, loop_w - d] = src[y, xm]

    # (2) 큰 버섯 갓: 외곽선 모양만 대칭으로, 안쪽은 원본 왼쪽 끝 픽셀로 채움
    (y0, y1), cx, scan_from = CAP

    def cap_outline(y: int) -> int:
        """갓 바깥(하늘·초록)이 처음 나오기 직전의 진한 외곽선 시작 위치"""
        for x in range(scan_from, min(W, scan_from + 90)):
            cr, cg, cb = src[y, x]
            if cr + cg + cb >= 260 and (cb > cr or cg > cr + 10):
                k = x - 1
                while k > scan_from and src[y, k].sum() < 260:
                    k -= 1
                return k + 1 if k + 1 < x else -1
        return -1

    raw = {y: cap_outline(y) for y in range(y0, y1)}
    raw = {y: r for y, r in raw.items() if r >= 0}
    rights = {y: int(np.median([raw[k] for k in range(y - 3, y + 4) if k in raw])) for y in raw}
    widths = {y: max(0, r - 2 * cx + 1) for y, r in rights.items()}
    # 돔 모양이 매끈하도록: 가장 넓은 줄까지는 줄어들지 않게, 그 아래로는 늘어나지 않게
    ys = sorted(widths)
    peak = max(ys, key=lambda y: widths[y])
    widths[ys[0]] = min(widths[ys[0]], 2)  # 맨 윗줄은 원본 안의 왼쪽 위 테두리에서 이어지도록 좁게 시작
    for i in range(1, len(ys)):
        y, prev = ys[i], ys[i - 1]
        if y <= peak:
            widths[y] = max(widths[y], widths[prev]) if widths[prev] > 0 else widths[y]
            widths[y] = min(widths[y], widths[prev] + 3) if widths[prev] > 0 else min(widths[y], 2)
    for i in range(len(ys) - 2, -1, -1):
        y, nxt = ys[i], ys[i + 1]
        if y > peak:
            widths[y] = max(widths[y], widths[nxt])
    rights = {y: w + 2 * cx - 1 for y, w in widths.items()}
    crng = np.random.default_rng(3)
    for y in range(y0, y1):
        w = widths.get(y, 0)
        if w <= 0:
            continue
        r = rights[y]
        out[y, :min(O, r + 1)] = src[y, :min(O, r + 1)]
        outline = src[y, r]
        for d in range(1, w + 1):
            if d == w:
                c = outline
            elif d >= w - 2:
                c = src[y, r - (w - d)]  # 테두리 안쪽 음영 1~2칸 (오른쪽 테두리 안쪽에서)
            else:
                c = src[y, int(crng.integers(0, 5))]  # 원본 왼쪽 끝(그늘진 쪽) 질감
            out[y, loop_w - d] = c
        # 위·아래 줄과 폭이 달라지는 계단에도 외곽선을 이어 그려 끊김 없는 곡선으로
        for ny in (y - 1, y + 1):
            nw = widths.get(ny, 0)
            if nw < w:
                for d in range(max(1, nw), w + 1):
                    out[y, loop_w - d] = outline
    return out.astype(np.uint8), bridge


EXTEND_TOP = 100   # 세로 화면용: 위쪽에 이어 붙일 숲 지붕(나뭇잎) 높이
# 숲 지붕 조각 재료 (x0, y0, x1, y1): 원본 맨 위의 빽빽한 나뭇잎 + 나뭇잎이 하늘과 만나는 가장자리
#  → 하늘 위쪽에는 아래가 하늘인 조각이 골라져 나뭇잎 윤곽을 따라 자연스럽게 이어짐
LEAF_DENSE = [(0, 0, 214, 40), (530, 0, 640, 40)]          # 빽빽한 나뭇잎 (위쪽 줄)
LEAF_EDGE = [(188, 0, 245, 70), (478, 0, 560, 46)]          # 나뭇잎-하늘 가장자리 (맨 아래 줄에서만)


def extend_top(loop: np.ndarray, seed: int) -> np.ndarray:
    """반복 이미지 위쪽에 나뭇잎 숲 지붕을 이어 그림 (세로 화면에서 배경을 덜 확대할 때 위를 채움).
    아래(원본 맨 위 줄)·왼쪽·마지막 열은 처음 열과 맞도록 조각을 골라 최소 비용 경로로 이어 붙임."""
    rng = np.random.default_rng(seed + 100)
    src = np.array(Image.open(SRC).convert("RGB")).astype(np.int32)
    H, W = loop.shape[:2]
    E = EXTEND_TOP
    canvas = np.zeros((E + H, W + O, 3), np.int32)
    filled = np.zeros((E + H, W + O), bool)
    canvas[E:, :W] = loop
    canvas[E:, W:] = loop[:, :O]
    filled[E:, :] = True
    def grid(regions):
        return sorted({(sy, sx) for x0, y0, x1, y1 in regions
                       for sy in range(y0, y1 - P + 1, 2) for sx in range(x0, x1 - P + 1, 2)})

    dense = grid(LEAF_DENSE)
    edge = dense + grid(LEAF_EDGE)
    rows = list(range(E - P + O, -1, -S))
    if rows[-1] != 0:
        rows.append(0)
    cols = list(range(0, W - P + O + 1, S))
    for ri, py in enumerate(rows):
        sources = edge if ri == 0 else dense
        for ci, px in enumerate(cols):
            last = ci == len(cols) - 1
            if last:
                px = W + O - P  # 마지막 조각은 처음 열(복사본)과 겹치도록
                canvas[:, W:] = canvas[:, :O]
                filled[:, W:] = filled[:, :O]
            region = canvas[py:py + P, px:px + P]
            m = filled[py:py + P, px:px + P]
            best = []
            for sy, sx in sources:
                patch = src[sy:sy + P, sx:sx + P]
                e = float(((patch - region) ** 2).sum(2)[m].mean()) if m.any() else 0.0
                best.append((e, sy, sx))
            best.sort()
            tol = best[0][0] * 1.08 + 1
            cands = [b for b in best[:30] if b[0] <= tol]
            _, sy, sx = cands[rng.integers(len(cands))]
            patch = src[sy:sy + P, sx:sx + P]
            err = ((patch - region) ** 2).sum(2).astype(float)
            take = np.ones((P, P), bool)
            if m[:, :O].all():  # 왼쪽 겹침
                path = min_cut_path(err[:, :O])
                for y in range(P):
                    take[y, :path[y]] = False
            if m[P - O:, :].all():  # 아래 겹침: 경로 아래는 기존 유지
                path = min_cut_path(err[P - O:, :].T)
                for x in range(P):
                    take[P - O + path[x] + 1:, x] = False
            if last and m[:, P - O:].all():  # 처음 열과 이어지게
                path = min_cut_path(err[:, P - O:])
                for y in range(P):
                    take[y, P - O + path[y] + 1:] = False
            region[take] = patch[take]
            filled[py:py + P, px:px + P] = True
            if last:
                canvas[:, :O] = canvas[:, W:]
    out = canvas[:, :W]

    return out.astype(np.uint8)


# 연결 구간이 원본 왼쪽 끝(빽빽한 덤불)과 만나는 세로 경계를 가려 줄 덤불 (원본에서 외곽선째 떼어 옴)
BUSH_SRC = (478, 160, 526, 226)
# (덤불 가운데를 놓을 x: 반복 경계 기준 오프셋, 덤불 바닥 y, 좌우 뒤집기)
BUSH_STAMPS = [(-4, 214, False), (-2, 292, True)]


def stamp_bushes(out: np.ndarray) -> None:
    src = np.array(Image.open(SRC).convert("RGB")).astype(np.int32)
    x0, y0, x1, y1 = BUSH_SRC
    b = src[y0:y1, x0:x1]
    r, g, bl = b[..., 0], b[..., 1], b[..., 2]
    leaf = (g > r + 12) & (g > bl + 10)
    dark = b.sum(2) < 230
    mask = leaf.copy()
    # 잎에 붙은 진한 외곽선 포함
    pad = np.pad(leaf, 1)
    near = pad[:-2, 1:-1] | pad[2:, 1:-1] | pad[1:-1, :-2] | pad[1:-1, 2:]
    mask |= dark & near
    # 가장 큰 덩어리만
    h, w = mask.shape
    seen = np.zeros_like(mask)
    best = []
    for yy in range(h):
        for xx in range(w):
            if mask[yy, xx] and not seen[yy, xx]:
                stack, comp = [(yy, xx)], []
                seen[yy, xx] = True
                while stack:
                    cy, cx = stack.pop()
                    comp.append((cy, cx))
                    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        ny, nx = cy + dy, cx + dx
                        if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                            seen[ny, nx] = True
                            stack.append((ny, nx))
                if len(comp) > len(best):
                    best = comp
    keep = np.zeros_like(mask)
    for p in best:
        keep[p] = True
    W = out.shape[1]
    for off, bottom, flip in BUSH_STAMPS:
        bb = b[:, ::-1] if flip else b
        kk = keep[:, ::-1] if flip else keep
        left = off - w // 2
        top = bottom - h
        for yy in range(h):
            for xx in range(w):
                if kk[yy, xx] and 0 <= top + yy < out.shape[0]:
                    out[top + yy, (left + xx) % W] = bb[yy, xx]


def seam_score(out: np.ndarray, bridge: int) -> float:
    """연결 구간 양쪽 이음매 부근의 이웃 픽셀 색 차이 (낮을수록 경계가 안 보임). 땅에 가려지는 아래쪽은 제외"""
    a = out[:300].astype(int)
    w = a.shape[1]
    cols = [(w - bridge - 1 + k) for k in range(-6, 7)] + [(w - 1 + k) % w for k in range(-6, 7)]
    return float(np.mean([np.abs(a[:, c] - a[:, (c + 1) % w]).sum(1).mean() for c in cols]))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", type=int, default=-1, help="-1 이면 여러 시드 중 이음매가 가장 덜 보이는 것 자동 선택")
    args = ap.parse_args()
    seeds = [args.seed] if args.seed >= 0 else list(range(24))
    results = []
    for sd in seeds:
        o, b = build(sd)
        results.append((seam_score(o, b), sd, o, b))
        print(f"  seed {sd}: 이음매 점수 {results[-1][0]:.1f}")
    score, seed, out, bridge = min(results, key=lambda r: r[0])
    print(f"선택: seed {seed} (점수 {score:.1f})")
    stamp_bushes(out)
    out = extend_top(out, seed)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(out).save(OUT, optimize=True)
    h, w = out.shape[:2]
    # 반복 이음매(끝 → 처음)의 색 차이 = 다른 곳의 이웃 열 차이와 비교
    wrap = np.abs(out[:, -1].astype(int) - out[:, 0].astype(int)).sum(1).mean()
    inner = np.abs(np.diff(out.astype(int), axis=1)).sum(2).mean()
    print(f"loop {w}x{h} (원본 640 + 연결 구간 {bridge}), 반복 경계 평균 색 차이 {wrap:.1f} / 일반 이웃 픽셀 {inner:.1f}")
    # 미리보기: 반복 경계가 가운데 오도록 [연결 구간 주변 | 원본 앞부분] 확대
    view = np.concatenate([out[EXTEND_TOP:, w - bridge - 120:], out[EXTEND_TOP:, :160]], axis=1)
    Image.fromarray(out).resize((w * 2, h * 2), Image.NEAREST).save(PREVIEW.with_name("loop-full-preview.png"))
    Image.fromarray(view).resize((view.shape[1] * 3, h * 3), Image.NEAREST).save(PREVIEW)


if __name__ == "__main__":
    main()
