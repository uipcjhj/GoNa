#!/usr/bin/env python3
"""
대표 타이틀 그림 1장 → 움직이는 오프닝용 레이어 세트

원본: art-src/title/gona-cover-original.png (1448x1086, 단일 이미지)
출력: public/assets/title/cover/  (webp + layers.json)

  base.webp        로고를 지우고, 움직이는 요소 뒤쪽을 채워 넣은 바탕
  logo.webp        제목 로고 (세로 화면에서는 위쪽에 따로 배치)
  gona.webp        고나 몸 (머리카락 제외) — 숨쉬기
  gona-blink.webp  고나 눈 감은 패치 — 깜빡임
  hair.webp        물방울 머리카락 — 살랑
  mush-*.webp      큰 버섯들 — 미세하게 흔들림
  vine-*.webp      위에서 늘어진 덩굴·잎 — 살랑
  fall-0..3.webp   폭포 물줄기 4프레임 — 흐름
  sky-ext.webp     세로 화면 위쪽 여백용 하늘 (원본 색으로 새로 그린 도트)
  ground-ext.webp  세로 화면 아래쪽 여백용 풀밭·흙길 (원본 색으로 새로 그린 도트)

분리 방법: 원본은 진한 갈색 외곽선으로 그려져 있어서, 상자 가장자리에서부터
'외곽선이 아닌 픽셀'을 채워 들어가 닿지 않는 부분 = 그 물체. 물체가 움직이면
드러나는 바탕은 바깥 색을 안쪽으로 번져 채움(가장자리 몇 픽셀만, 머리카락·로고는 전체).

사용법:  python3 tools/build_cover_layers.py
"""
import json
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "art-src/title/gona-cover-original.png"
OUT = ROOT / "public/assets/title/cover"
DOT = 6  # 원본 도트 한 칸 ≈ 6px — 새로 그리는 여백 그림도 같은 크기로

img = np.array(Image.open(SRC).convert("RGB")).astype(np.int32)
H, W = img.shape[:2]
DARK = img.sum(2) < 330


def extract(box, seeds="lrtb", close=0, keep="largest"):
    """상자 안의 물체 마스크 (전체 이미지 크기). seeds: 바깥 채우기를 시작할 상자 변 (이미지 가장자리 변은 빼야 함)
    close: 외곽선 틈을 메우려고 외곽선을 몇 px 두껍게 볼지 / keep: 'largest' 또는 'big'(큰 덩어리 모두)"""
    x0, y0, x1, y1 = box
    dark = dilate(DARK, close)[y0:y1, x0:x1] if close else DARK[y0:y1, x0:x1]
    h, w = dark.shape
    out = np.zeros((h, w), bool)
    q = deque()

    def seed(y, x):
        if not dark[y, x] and not out[y, x]:
            out[y, x] = True
            q.append((y, x))

    if "l" in seeds:
        for y in range(h):
            seed(y, 0)
    if "r" in seeds:
        for y in range(h):
            seed(y, w - 1)
    if "t" in seeds:
        for x in range(w):
            seed(0, x)
    if "b" in seeds:
        for x in range(w):
            seed(h - 1, x)
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and not out[ny, nx] and not dark[ny, nx]:
                out[ny, nx] = True
                q.append((ny, nx))
    inside = ~out
    # 가장 큰 덩어리만
    lab = np.full((h, w), -1, np.int32)
    best, best_n, n = -1, 0, 0
    sizes = []
    for y in range(h):
        for x in range(w):
            if inside[y, x] and lab[y, x] < 0:
                st = [(y, x)]
                lab[y, x] = n
                c = 0
                while st:
                    cy, cx = st.pop()
                    c += 1
                    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        ny, nx = cy + dy, cx + dx
                        if 0 <= ny < h and 0 <= nx < w and inside[ny, nx] and lab[ny, nx] < 0:
                            lab[ny, nx] = n
                            st.append((ny, nx))
                sizes.append(c)
                if c > best_n:
                    best, best_n = n, c
                n += 1
    m = np.zeros((H, W), bool)
    if keep == "big":
        ids = [i for i, c in enumerate(sizes) if c >= best_n * 0.03]
        m[y0:y1, x0:x1] = np.isin(lab, ids)
    else:
        m[y0:y1, x0:x1] = lab == best
    if close:
        m = dilate(m, close) & ~(~m & ~dilate(DARK, close) & False)
        # 두껍게 본 외곽선만큼 원래 외곽선 픽셀을 되돌려 포함
        sub = np.zeros((H, W), bool)
        sub[y0:y1, x0:x1] = True
        m &= sub
    return m


def extract_from_sky(box, drop_top=True):
    """하늘(연보라·하늘색·흰 구름) 픽셀을 따라 상자 가장자리에서 채워 들어가고, 닿지 않은 큰 덩어리 = 물체.
    drop_top: 상자 윗변에 닿는 덩어리(위에서 늘어진 덩굴) 제외"""
    x0, y0, x1, y1 = box
    c = img[y0:y1, x0:x1]
    r, g, b = c[..., 0], c[..., 1], c[..., 2]
    sky = ((b >= r + 6) & (b >= g) & (c.sum(2) > 520)) | (c.sum(2) > 700)
    h, w = sky.shape
    out = np.zeros((h, w), bool)
    q = deque()
    for y in range(h):
        for x in (0, w - 1):
            if sky[y, x] and not out[y, x]:
                out[y, x] = True
                q.append((y, x))
    for x in range(w):
        for y in (0, h - 1):
            if sky[y, x] and not out[y, x]:
                out[y, x] = True
                q.append((y, x))
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and not out[ny, nx] and sky[ny, nx]:
                out[ny, nx] = True
                q.append((ny, nx))
    inside = ~out
    lab = np.full((h, w), -1, np.int32)
    comps = []
    for y in range(h):
        for x in range(w):
            if inside[y, x] and lab[y, x] < 0:
                n = len(comps)
                st = [(y, x)]
                lab[y, x] = n
                cnt, top = 0, y
                while st:
                    cy, cx = st.pop()
                    cnt += 1
                    top = min(top, cy)
                    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        ny, nx = cy + dy, cx + dx
                        if 0 <= ny < h and 0 <= nx < w and inside[ny, nx] and lab[ny, nx] < 0:
                            lab[ny, nx] = n
                            st.append((ny, nx))
                comps.append((cnt, top))
    big = max(c for c, _ in comps)
    ids = [i for i, (cnt, top) in enumerate(comps) if cnt >= big * 0.01 and not (drop_top and top == 0)]
    m = np.zeros((H, W), bool)
    m[y0:y1, x0:x1] = np.isin(lab, ids)
    return m


def inpaint(base, mask, depth=None):
    """마스크 안을 바깥 색으로 번져 채움 (depth 겹만, None 이면 전부)"""
    todo = mask.copy()
    known = ~mask
    it = 0
    while todo.any() and (depth is None or it < depth):
        k = known.astype(np.int32)
        acc = np.zeros_like(base)
        cnt = np.zeros(k.shape, np.int32)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            sk = np.roll(np.roll(k, dy, 0), dx, 1)
            sb = np.roll(np.roll(base, dy, 0), dx, 1)
            acc += sb * sk[..., None]
            cnt += sk
        front = todo & (cnt > 0)
        if not front.any():
            break
        base[front] = acc[front] // cnt[front][:, None]
        known |= front
        todo &= ~front
        it += 1
    return base


def save_layer(name, mask, src=img, pad=2):
    ys, xs = np.where(mask)
    y0, y1, x0, x1 = max(0, ys.min() - pad), min(H, ys.max() + 1 + pad), max(0, xs.min() - pad), min(W, xs.max() + 1 + pad)
    rgba = np.zeros((y1 - y0, x1 - x0, 4), np.uint8)
    rgba[..., :3] = src[y0:y1, x0:x1]
    rgba[..., 3] = mask[y0:y1, x0:x1] * 255
    Image.fromarray(rgba).save(OUT / f"{name}.webp", quality=92, method=6)
    return {"x": int(x0), "y": int(y0), "w": int(x1 - x0), "h": int(y1 - y0)}


def dilate(m, r):
    out = m.copy()
    for _ in range(r):
        o = out.copy()
        o[1:] |= out[:-1]
        o[:-1] |= out[1:]
        o[:, 1:] |= out[:, :-1]
        o[:, :-1] |= out[:, 1:]
        out = o
    return out


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    layers = {}
    base = img.copy()

    # ── 로고
    logo = extract_from_sky((228, 4, 1232, 452), drop_top=False)
    logo[:122, 930:] = False  # 로고 오른쪽 위로 늘어진 덩굴 제외 (알 장식은 y 125 아래)
    logo[:16, :] = False
    logo[:, :247] = False  # 양옆 큰 버섯 조각 제외
    logo[:, 1214:] = False
    logo[:128, :440] = False  # 왼쪽 위 큰 버섯 갓
    logo[:195, 1150:] = False  # 오른쪽 위 큰 버섯 갓
    layers["logo"] = save_layer("logo", logo)
    # 로고 뒤 하늘: 세로줄마다 위·아래 하늘색을 이어 칠함 (번짐 줄무늬 없이)
    lm = dilate(logo, 3)
    for x in range(W):
        col = lm[:, x]
        y = 0
        while y < H:
            if col[y]:
                y1 = y
                while y1 < H and col[y1]:
                    y1 += 1
                top = base[y - 1, x] if y > 0 else base[min(H - 1, y1), x]
                bot = base[y1, x] if y1 < H else top
                for k in range(y, y1):
                    t = (k - y + 1) / (y1 - y + 1)
                    base[k, x] = top * (1 - t) + bot * t
                y = y1
            y += 1

    # ── 고나 + 머리카락
    gona = extract((535, 528, 965, 1018))
    hair = gona.copy()
    hair[:, :715] = False
    hair[:, 816:] = False
    hair[612:, :] = False
    hair[612:626, 770:814] = gona[612:626, 770:814]
    hair[600:, :768] = False  # 머리 윗선 조각 제외
    body = gona & ~hair
    layers["gona"] = save_layer("gona", body)
    layers["hair"] = save_layer("hair", hair)
    layers["hair"]["pivot"] = [792, 622]
    # 눈 감은 패치: 얼굴 안의 작은 진한 점(눈) → 얼굴색으로 덮고 아래쪽에 가는 선
    face_box = (600, 650, 770, 735)
    fx0, fy0, fx1, fy1 = face_box
    eyes = DARK[fy0:fy1, fx0:fx1] & gona[fy0:fy1, fx0:fx1]
    # 외곽선과 붙은 건 제외: 작은 덩어리만
    em = np.zeros((H, W), bool)
    seen = np.zeros_like(eyes)
    blobs = []
    for y in range(eyes.shape[0]):
        for x in range(eyes.shape[1]):
            if eyes[y, x] and not seen[y, x]:
                st = [(y, x)]
                seen[y, x] = True
                pts = []
                while st:
                    cy, cx = st.pop()
                    pts.append((cy, cx))
                    for dy in (-1, 0, 1):
                        for dx in (-1, 0, 1):
                            ny, nx = cy + dy, cx + dx
                            if 0 <= ny < eyes.shape[0] and 0 <= nx < eyes.shape[1] and eyes[ny, nx] and not seen[ny, nx]:
                                seen[ny, nx] = True
                                st.append((ny, nx))
                ys_ = [p[0] for p in pts]
                xs_ = [p[1] for p in pts]
                # 눈: 상자 가장자리에 닿지 않는 작고 뭉툭한 점 (외곽선 조각 제외)
                touches = min(ys_) == 0 or min(xs_) == 0 or max(ys_) == eyes.shape[0] - 1 or max(xs_) == eyes.shape[1] - 1
                if 80 <= len(pts) <= 900 and not touches:
                    blobs.append(pts)
    blink = np.zeros((H, W, 3), np.int32)
    bmask = np.zeros((H, W), bool)
    face_col = np.median(img[fy0:fy1, fx0:fx1][~DARK[fy0:fy1, fx0:fx1]], axis=0).astype(np.int32)
    eye_col = np.median(np.array([img[fy0 + y, fx0 + x] for b in blobs for y, x in b]), axis=0).astype(np.int32)
    for b in blobs:
        ys = [fy0 + y for y, _ in b]
        xs = [fx0 + x for _, x in b]
        for y, x in zip(ys, xs):
            em[y, x] = True
        reg = dilate(em, 2) & gona
        bmask |= reg
        blink[reg] = face_col
        # 감은 눈: 눈 아래쪽에 두 도트 높이의 짧은 선
        yb = max(ys)
        for x in range(min(xs) - 2, max(xs) + 3):
            for y in range(yb - DOT, yb + 1):
                blink[y, x] = eye_col
                bmask[y, x] = True
        em[:] = False
    print(f"  눈 {len(blobs)}개", [(fx0 + min(x for _, x in b), fy0 + min(y for y, _ in b), len(b)) for b in blobs])
    if len(blobs) != 2:
        raise SystemExit("고나 눈을 2개 찾지 못했습니다")
    layers["blink"] = save_layer("gona-blink", bmask, src=blink)
    base = inpaint(base, dilate(hair, 2))

    # ── 큰 버섯 · 덩굴: 외곽선이 끊겨 있어 깔끔히 오려낼 수 없으므로,
    #    '가장자리가 부드럽게 사라지는 영역'(feather)만 지정 → 화면에서 그 안의 그림을 몇 px 살랑 (이음매 없음)
    #    (x, y, w, h, 기준점: 'bottom' 아래 고정 / 'top' 위 고정)
    layers["sway"] = {
        "mush-tl": [0, 0, 250, 200, "bottom"],
        "mush-l2": [0, 270, 275, 160, "bottom"],
        "mush-tr": [1195, 50, 253, 220, "bottom"],
        "mush-ml": [240, 598, 190, 110, "bottom"],
        "mush-r": [1030, 665, 222, 120, "bottom"],
        "vine-t": [940, 0, 290, 130, "top"],
        "vine-r": [1280, 0, 168, 420, "top"],
        "vine-l": [0, 0, 140, 270, "top"],
    }

    # ── 폭포 (물 픽셀을 아래로 순환 이동한 4프레임)
    fx0, fy0, fx1, fy1 = 1028, 568, 1104, 702
    reg = img[fy0:fy1, fx0:fx1]
    water = (reg[..., 2] > reg[..., 0] + 4) & (reg[..., 2] > 170) | (reg.sum(2) > 690)
    wm = np.zeros((H, W), bool)
    wm[fy0:fy1, fx0:fx1] = water
    for k in range(4):
        fr = img.copy()
        for x in range(fx1 - fx0):
            col = np.where(water[:, x])[0]
            if len(col) < 4:
                continue
            vals = reg[col, x]
            shift = (k * 9) % len(col)
            fr[fy0 + col, fx0 + x] = np.roll(vals, shift, axis=0)
        info = save_layer(f"fall-{k}", wm, src=fr, pad=0)
    layers["fall"] = info

    # ── 바탕
    Image.fromarray(base.astype(np.uint8)).save(OUT / "base.webp", quality=90, method=6)

    # ── 세로 화면용 여백: 하늘(위) · 풀밭(아래), 원본 색으로 도트 크기 6px 에 맞춰 새로 그림
    crop_x0, crop_x1, crop_top = 404, 1136, 446
    cw = (crop_x1 - crop_x0) // DOT
    sky_bottom = np.array([np.median(base[crop_top:crop_top + 8, crop_x0 + i * DOT:crop_x0 + (i + 1) * DOT].reshape(-1, 3), axis=0) for i in range(cw)])
    top_col = np.array([150, 190, 238])
    sky_h = 140
    sky = np.zeros((sky_h, cw, 3))
    rng = np.random.default_rng(5)
    for y in range(sky_h):
        t = y / (sky_h - 1)
        band = np.floor(t * 9) / 9  # 띠 모양 그라데이션
        nxt = min(1, band + 1 / 9)
        for x in range(cw):
            use = nxt if ((x + y) % 2 == 0 and (t * 9) % 1 > 0.65) else band  # 띠 경계 디더링
            sky[y, x] = top_col * (1 - use) + sky_bottom[x] * use
    # 구름 (원본처럼 흰색 + 연보라 그림자)
    for cx, cy, s in [(18, 70, 1.0), (90, 50, 1.2), (60, 100, 0.8), (110, 112, 0.9)]:
        for dx, dy, r in [(0, 0, 5), (6, -3, 6), (13, 0, 5), (-6, 1, 4)]:
            rr = r * s
            for y in range(int(cy + dy - rr - 1), int(cy + dy + rr + 2)):
                for x in range(int(cx + dx * s - rr - 1), int(cx + dx * s + rr + 2)):
                    if 0 <= y < sky_h and 0 <= x < cw and (x - cx - dx * s) ** 2 + (y - cy - dy) ** 2 <= rr * rr:
                        sky[y, x] = [236, 232, 248] if y < cy + dy + rr * 0.35 else [205, 200, 232]
    sky_img = Image.fromarray(np.clip(sky, 0, 255).astype(np.uint8)).resize((cw * DOT, sky_h * DOT), Image.NEAREST)
    sky_img.save(OUT / "sky-ext.webp", quality=92)

    gr_h = 70
    # 원본 아래쪽(풀밭·흙길)의 실제 색을 뽑아서 사용
    zone = img[960:H, 300:1150].reshape(-1, 3)
    pathlike = zone[(zone[:, 0] > 235) & (zone[:, 1] > 170) & (zone[:, 2] > 100) & (zone[:, 2] < 160)]
    grasslike = zone[(zone[:, 1] > 150) & (zone[:, 2] < 100) & (zone[:, 1] >= zone[:, 0] - 25) & (zone[:, 0] > 150)]
    path = np.median(pathlike, axis=0)
    grass = np.median(grasslike, axis=0)
    path_d = path * 0.9
    path_l = np.minimum(255, path * 1.04)
    grass_d = grass * 0.78
    grass_l = np.minimum(255, grass * 1.12)
    bottom_row = np.array([np.median(img[H - 6:H, crop_x0 + i * DOT:crop_x0 + (i + 1) * DOT].reshape(-1, 3), axis=0) for i in range(cw)])
    # 흙길: 원본 맨 아래 줄에서 길 색인 칸을 찾아 그 가운데에서 아래로 넓어지게
    is_path = [(c[0] > 230 and c[2] > 95 and c[2] < 165) for c in bottom_row]
    pcols = [i for i, v in enumerate(is_path) if v] or [cw // 2]
    pc = (min(pcols) + max(pcols)) / 2
    pw0 = max(6, (max(pcols) - min(pcols)) / 2)
    g = np.zeros((gr_h, cw, 3))
    for y in range(gr_h):
        half = pw0 + y * 0.45
        centre = pc + np.sin(y * 0.08) * 3
        for x in range(cw):
            onpath = abs(x - centre) < half
            r = rng.random()
            if onpath:
                col = path_d if r < 0.1 else path_l if r < 0.16 else path
            else:
                col = grass_d if r < 0.16 else grass_l if r < 0.24 else grass
            if y < 6:  # 위 6줄: 원본 아랫줄 색에서 디더링으로 자연스럽게 넘어감
                if rng.random() > y / 6:
                    col = bottom_row[x]
            # 아래로 갈수록 살짝 어둡게 (버튼이 잘 보이게)
            g[y, x] = col * (1 - 0.18 * (y / gr_h))
    # 풀 포기 · 꽃 · 조약돌 · 작은 버섯 (원본 소품과 같은 색)
    def onp(x, y):
        return abs(x - pc) < pw0 + y * 0.45 + 2
    for _ in range(46):
        x, y = int(rng.integers(0, cw)), int(rng.integers(8, gr_h - 2))
        if onp(x, y):
            continue
        g[y, x] = grass_d
        g[y - 1, x] = grass_d
        g[y - 2, x] = grass_l
        if x + 1 < cw:
            g[y - 1, x + 1] = grass_d
    for col in ([255, 250, 240], [250, 180, 190]):
        for _ in range(5):
            x, y = int(rng.integers(2, cw - 2)), int(rng.integers(10, gr_h - 3))
            if onp(x, y):
                continue
            for dx, dy in ((0, -1), (-1, 0), (1, 0), (0, 1)):
                g[y + dy, x + dx] = col
            g[y, x] = [245, 180, 70]
    stone = np.median(img[975:990, 365:410].reshape(-1, 3), axis=0)
    for _ in range(7):
        x, y = int(rng.integers(3, cw - 4)), int(rng.integers(10, gr_h - 3))
        g[y, x:x + 3] = stone
        g[y - 1, x:x + 2] = np.minimum(255, stone * 1.15)
        g[y + 1, x:x + 3] = stone * 0.7
    for x, y in [(int(pc - pw0 - 14), 34), (int(pc + pw0 + 16), 48), (8, 60)]:
        if 2 < x < cw - 3:
            g[y - 3, x - 2:x + 3] = [235, 105, 75]
            g[y - 4, x - 1:x + 2] = [235, 105, 75]
            g[y - 3, x] = [255, 238, 215]
            g[y - 2:y + 1, x - 1:x + 1] = [244, 228, 200]
    gimg = Image.fromarray(np.clip(g, 0, 255).astype(np.uint8)).resize((cw * DOT, gr_h * DOT), Image.NEAREST)
    gimg.save(OUT / "ground-ext.webp", quality=92)

    layers["portrait"] = {"cropX0": crop_x0, "cropX1": crop_x1, "cropTop": crop_top, "skyH": sky_h * DOT, "groundH": gr_h * DOT, "w": cw * DOT}
    layers["size"] = [W, H]
    (OUT / "layers.json").write_text(json.dumps(layers, indent=1))
    # 게임 코드가 바로 읽도록 소스 폴더에도 복사
    (ROOT / "src/ui/cover-layers.json").write_text(json.dumps(layers, indent=1))
    print("ok", list(layers))


if __name__ == "__main__":
    main()
