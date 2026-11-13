"""
방글할매 스페셜 — 사용자가 준 스프라이트 시트(2172×724, 투명 배경)에서 게임용 PNG 를 잘라 정리.
  · 캐릭터(기본·웃음·노래·등장·퇴장): 시트 표기대로 48×45 칸 · 블록 대표색으로 줄여 도트 유지 (알파 0/255)
  · 효과(음파·무적): 반투명 빛이 있어 알파를 살려 줄임
  · GONA 쿠키 4종: 32×32(HUD) · 20×20(게임 안 아이템) / 수집 HUD(160×32) · 소환 버튼 2종(160×44)
  · 새로 그리는 것 없음 — 시트의 그림만 옮김 (라벨 상자는 제외)
사용: python3 tools/art/bangeul_from_sheet.py <시트.png> <출력 폴더> [<미리보기 폴더>]
"""
import sys
import numpy as np
from PIL import Image
from scipy import ndimage

SRC, OUT = sys.argv[1], sys.argv[2]
PREVIEW = sys.argv[3] if len(sys.argv) > 3 else None
SHEET = np.array(Image.open(SRC).convert('RGBA')).astype(np.float64)

# 시트의 보라색 라벨 상자 (그림이 아님) — 잘라 쓰기 전에 지움
for y0, y1, x0, x1 in [(10, 66, 0, 2172), (266, 322, 0, 1360), (266, 322, 1370, 1785), (517, 584, 0, 1880)]:
    SHEET[y0:y1, x0:x1, 3] = 0
R1, R2, R3 = (64, 240), (296, 515), (582, 722)
CHAR = {
    'bangeul-idle': (R1, [(14, 160), (160, 315), (315, 468), (468, 622)]),
    'bangeul-laugh': (R1, [(645, 816), (816, 984), (984, 1142), (1142, 1310)]),
    'bangeul-song': (R1, [(1370, 1572), (1572, 1772), (1772, 1970), (1970, 2160)]),
    'bangeul-appear': (R2, [(20, 156), (156, 338), (338, 498), (498, 640)]),
    'bangeul-exit': (R3, [(36, 190), (190, 333), (333, 480), (480, 640)]),
}
FX = {
    'bangeul-wave': (R2, [(660, 790), (790, 960), (960, 1150), (1150, 1350)]),
    'bangeul-shield': (R2, [(1372, 1572), (1572, 1768), (1768, 1972), (1972, 2160)]),
}
CELL = (48, 45)
# 웃음 '!!' · 노래 음표 · 등장 반짝임이 48×45 밖으로 나와 잘리지 않게 실제 시트 칸은 넉넉히 (몸은 칸 가운데 · 바닥)
SHEET_CELL = (64, 58)


def crop(row, xr, thr=40):
    y0, y1 = row
    c = SHEET[y0:y1, xr[0] : xr[1]]
    m = c[..., 3] > thr
    lab, n = ndimage.label(m)
    if n:
        sizes = ndimage.sum(m, lab, range(1, n + 1))
        m = np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s >= 25])
    ys, xs = np.nonzero(m)
    return c[ys.min() : ys.max() + 1, xs.min() : xs.max() + 1], m[ys.min() : ys.max() + 1, xs.min() : xs.max() + 1]


def shrink_hard(c, m, f):
    """캐릭터: 블록마다 덮인 비율 절반 이상이면 대표색(중앙값) · 알파 0/255"""
    h, w = m.shape
    H, W = max(1, int(round(h / f))), max(1, int(round(w / f)))
    out = np.zeros((H, W, 4), np.uint8)
    rgb = c[..., :3]
    lum = rgb.mean(-1)
    for j in range(H):
        for i in range(W):
            ys, ye = int(j * f), max(int(j * f) + 1, int((j + 1) * f))
            xs, xe = int(i * f), max(int(i * f) + 1, int((i + 1) * f))
            mm = m[ys:ye, xs:xe]
            if mm.size == 0 or mm.mean() < 0.5:
                continue
            px = rgb[ys:ye, xs:xe][mm]
            l = lum[ys:ye, xs:xe][mm]
            dark = l < 70
            col = np.median(px[dark], axis=0) if dark.mean() >= 0.3 else np.median(px[~dark], axis=0) if (~dark).any() else px.mean(0)
            out[j, i, :3] = np.clip(col, 0, 255)
            out[j, i, 3] = 255
    return out


def shrink_soft(c, size):
    """효과·UI: 알파를 살려 줄임 (빛 번짐 유지) — 미리 곱한 알파로 평균"""
    a = c[..., 3:4] / 255.0
    pre = np.concatenate([c[..., :3] * a, a * 255], -1).astype(np.float32)
    im = Image.fromarray(np.clip(pre, 0, 255).astype(np.uint8), 'RGBA')
    small = np.array(im.resize(size, Image.BOX)).astype(np.float64)
    al = small[..., 3:4] / 255.0
    rgb = np.where(al > 0, small[..., :3] / np.maximum(al, 1e-6), 0)
    out = np.concatenate([np.clip(rgb, 0, 255), small[..., 3:4]], -1).astype(np.uint8)
    out[out[..., 3] < 10] = 0
    return out


def pack(imgs, cell=None, bottom=True):
    fw = cell[0] if cell else max(i.shape[1] for i in imgs)
    fh = cell[1] if cell else max(i.shape[0] for i in imgs)
    sheet = np.zeros((fh, fw * len(imgs), 4), np.uint8)
    for k, a in enumerate(imgs):
        h, w = a.shape[:2]
        if h > fh or w > fw:  # 칸보다 크면 칸에 맞춰 잘라 냄 (가운데·바닥 기준)
            y0 = max(0, h - fh)
            x0 = max(0, (w - fw) // 2)
            a = a[y0 : y0 + fh, x0 : x0 + fw]
            h, w = a.shape[:2]
        y = fh - h if bottom else (fh - h) // 2
        x = k * fw + (fw - w) // 2
        sheet[y : y + h, x : x + w] = a
    return sheet


def pack_anchor(imgs, anchors, cell):
    fw, fh = cell
    sheet = np.zeros((fh, fw * len(imgs), 4), np.uint8)
    for k, (a, ax) in enumerate(zip(imgs, anchors)):
        h, w = a.shape[:2]
        x = int(round(k * fw + fw / 2 - ax))
        y = fh - h
        x0, y0 = max(x, k * fw), max(y, 0)
        sx, sy = x0 - x, y0 - y
        x1 = min(x + w, (k + 1) * fw)
        sheet[y0 : y0 + h - sy, x0:x1] = a[sy:, sx : sx + (x1 - x0)]
    return sheet


def main():
    report = {}
    prev = []
    # 배율: 기본 첫 프레임 키를 45px 칸(바닥·머리 여백 1px)에 맞춤
    _, m0 = crop(CHAR['bangeul-idle'][0], CHAR['bangeul-idle'][1][0])
    f = m0.shape[0] / (CELL[1] - 1)
    print('char factor', round(f, 2))
    for name, (row, frames) in CHAR.items():
        imgs, anchors = [], []
        for xr in frames:
            c, m = crop(row, xr)
            # 몸통(가장 큰 덩어리) 가운데 = 칸 가운데 (표시 기호가 한쪽에 붙어도 몸이 흔들리지 않게)
            lab, n = ndimage.label(m)
            big = np.argmax(ndimage.sum(m, lab, range(1, n + 1))) + 1
            bx = np.nonzero((lab == big).any(0))[0]
            anchors.append(((bx.min() + bx.max()) / 2) / f)
            imgs.append(shrink_hard(c, m, f))
        over = [i.shape[:2] for i in imgs if i.shape[0] > CELL[1] or i.shape[1] > CELL[0]]
        sheet = pack_anchor(imgs, anchors, SHEET_CELL)
        Image.fromarray(sheet).save(f'{OUT}/{name}.png', optimize=True)
        report[name] = {'frames': len(imgs), 'cell': SHEET_CELL, 'body': CELL, 'bigger_than_body_cell': len(over)}
        prev.append(sheet)
    # 효과: 같은 배율 (음파는 점점 커짐 · 무적 보호막은 고나를 감쌈)
    for name, (row, frames) in FX.items():
        imgs = []
        for xr in frames:
            c, _ = crop(row, xr, thr=12)
            h, w = c.shape[:2]
            imgs.append(shrink_soft(c, (max(1, round(w / f)), max(1, round(h / f)))))
        if name == 'bangeul-shield':
            # 무적 보호막: 시트 그림은 방울 안에 방글할매가 들어 있음 → 고나에게 씌우려고 바깥 빛 테두리·반짝임만 남김 (안쪽 인물은 지움 · 새로 그린 것 없음)
            ring = []
            for a in imgs:
                al = a[..., 3] > 60
                lab, n = ndimage.label(al)
                big = np.argmax(ndimage.sum(al, lab, range(1, n + 1))) + 1
                ys, xs = np.nonzero(lab == big)
                cy, cx = (ys.min() + ys.max()) / 2, (xs.min() + xs.max()) / 2
                ry, rx = (ys.max() - ys.min()) / 2, (xs.max() - xs.min()) / 2
                yy, xx = np.mgrid[0 : a.shape[0], 0 : a.shape[1]]
                inner = ((yy - cy) / (ry * 0.82)) ** 2 + ((xx - cx) / (rx * 0.82)) ** 2 < 1
                inner |= (yy > cy) & (np.abs(xx - cx) < rx * 0.74)  # 아래쪽 발·신발 자리 (고나 발은 땅에)
                b = a.copy()
                b[inner] = 0
                ring.append(b)
            imgs = ring
        sheet = pack(imgs, None, bottom=False)
        Image.fromarray(sheet).save(f'{OUT}/{name}.png', optimize=True)
        report[name] = {'frames': len(imgs), 'cell': [sheet.shape[1] // len(imgs), sheet.shape[0]]}
        prev.append(sheet)
    # GONA 쿠키 4종 (시트의 쿠키 줄을 4등분 · 각자 다시 맞춤)
    cy = R3
    c, m = crop(cy, (646, 1012))
    ys, xs = np.nonzero(m)
    cols = np.nonzero(m.any(0))[0]
    # 쿠키 사이 빈 열로 나눔
    gaps = [x for x in range(1, m.shape[1] - 1) if not m[:, x].any() and m[:, x - 1].any()]
    starts = [0] + [g for g in gaps]
    parts = []
    xs_any = m.any(0)
    run = None
    for x in range(m.shape[1] + 1):
        on = x < m.shape[1] and xs_any[x]
        if on and run is None:
            run = x
        if not on and run is not None:
            if x - run > 20:
                parts.append((run, x))
            run = None
    if len(parts) != 4:  # 쿠키끼리 붙어 있으면 4등분
        w4 = m.shape[1] / 4
        parts = [(int(i * w4), int((i + 1) * w4)) for i in range(4)]
    for letter, (a0, a1) in zip('gona', parts):
        sub = c[:, a0:a1]
        sm = sub[..., 3] > 40
        yy, xx = np.nonzero(sm)
        sub = sub[yy.min() : yy.max() + 1, xx.min() : xx.max() + 1]
        for size, suffix in ((32, ''), (20, '-s')):
            img = shrink_soft(sub, (size, size))
            img[..., 3] = np.where(img[..., 3] > 110, 255, 0)  # 아이템은 또렷하게
            Image.fromarray(img).save(f'{OUT}/gona-cookie-{letter}{suffix}.png', optimize=True)
        prev.append(np.array(Image.open(f'{OUT}/gona-cookie-{letter}.png')))
    report['gona-cookie'] = {'letters': 'GONA', 'sizes': ['32x32', '20x20']}
    # HUD · 소환 버튼 (DOM UI — 알파 살림)
    for name, xr, size in (('gona-hud', (1036, 1445), (160, 32)), ('summon-off', (1466, 1803), (160, 44)), ('summon-on', (1808, 2160), (160, 52))):
        c, _ = crop((540 if name == 'summon-on' else 582, 722), xr, thr=12)
        h, w = c.shape[:2]
        size = (size[0], max(1, round(h * size[0] / w)))
        img = shrink_soft(c, size)
        Image.fromarray(img).save(f'{OUT}/{name}.png', optimize=True)
        report[name] = list(img.shape[1::-1])
        prev.append(img)
    print(report)
    if PREVIEW:
        k = 5
        W = max(p.shape[1] for p in prev) * k
        H = sum(p.shape[0] * k + 10 for p in prev)
        cv = Image.new('RGBA', (W, H), (40, 60, 40, 255))
        y = 0
        for p in prev:
            im = Image.fromarray(p).resize((p.shape[1] * k, p.shape[0] * k), Image.NEAREST)
            cv.alpha_composite(im, (0, y))
            y += im.height + 10
        cv.save(f'{PREVIEW}/bangeul-preview.png')


main()
