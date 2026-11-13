"""
최종 보스 신규 연출 그림 — 사용자가 준 시안 한 장(2172×724, 흰 배경)에서 프레임을 잘라 게임용 PNG 6종으로.
  · 배경(거의 흰색 · 옅은 체크무늬) 제거 → 알파 · 프레임별로 같은 칸 크기 · 바닥 기준 정렬
  · 시안은 흐릿한 큰 그림이라, 기존 승인 스프라이트와 같은 도트 크기로 줄임 (블록 대표색 · 외곽선 유지 · nearest)
      고나 그림(의자 우는 고나·난타) = bigbaby.png 고나 키(44px)에 맞춤 · 의자·이유식 덩어리는 같은 줄 배율
      마녀(이유식 뒤집어씀)·모자 = witch-sheet.png 마녀 키(41px)에 맞춤 · 게임처럼 왼쪽을 보도록 좌우 반전
  · 새로 그리는 것 없음 — 시안의 그림만 옮김
사용: python3 tools/art/witch_finale_from_sheet.py <시안.png> <출력 폴더(public/assets/boss)> [<미리보기 폴더>]
"""
import sys
import numpy as np
from PIL import Image
from scipy import ndimage

SRC, OUT = sys.argv[1], sys.argv[2]
PREVIEW = sys.argv[3] if len(sys.argv) > 3 else None
SHEET = np.array(Image.open(SRC).convert('RGB')).astype(int)
OUTLINE = np.array([46, 24, 30])

# 시안 안의 프레임 상자 (x0, x1) · 줄(y0, y1)
ROW1, ROW2, ROW3 = (0, 262), (262, 465), (465, 724)
ASSETS = {
    # 이름: (줄, [프레임 x 범위], 배율 기준, 좌우 반전)
    'witch-chair': (ROW1, [(82, 302), (339, 506), (543, 761), (782, 996)], 'gona', False),
    'gona-chair-cry': (ROW1, [(1184, 1350), (1422, 1593), (1643, 1853), (1873, 2089)], 'gona', False),
    'gona-chop': (ROW2, [(82, 258), (315, 536), (553, 770), (796, 1013)], 'gona', False),
    'giant-goo': (ROW2, [(1138, 1361), (1385, 1618), (1631, 1857), (1873, 2112)], 'gona', False),
    'witch-goo-face': (ROW3, [(99, 364), (394, 675), (700, 1014)], 'witch', True),
    'witch-hat': (ROW3, [(1210, 1334), (1376, 1531), (1577, 1703), (1739, 1877), (1924, 2041)], 'witch', True),
}
GONA_H = 44  # bigbaby.png 고나 키 (px)
WITCH_H = 41  # witch-sheet.png 마녀 키 (px, 모자 포함)


def mask_of(c):
    d = np.abs(c - 247).max(-1)
    # 흐릿한 가장자리(배경과 섞인 회색 띠)는 빼고 그림만 — 외곽선이 두 겹으로 두꺼워지지 않게
    fg = d > 42
    fg = ndimage.binary_closing(fg, iterations=1)
    fg = ndimage.binary_fill_holes(fg)
    lab, n = ndimage.label(fg)
    if n:
        sizes = ndimage.sum(fg, lab, range(1, n + 1))
        keep = np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s >= 60])
        fg &= keep
    return fg


def crop(row, xr):
    y0, y1 = row
    x0, x1 = xr
    c = SHEET[y0:y1, x0 - 6 : x1 + 6]
    m = mask_of(c)
    ys, xs = np.nonzero(m)
    return c[ys.min() : ys.max() + 1, xs.min() : xs.max() + 1], m[ys.min() : ys.max() + 1, xs.min() : xs.max() + 1]


def shrink(rgb, mask, f):
    h, w = mask.shape
    H, W = max(1, int(round(h / f))), max(1, int(round(w / f)))
    out = np.zeros((H, W, 4), np.uint8)
    lum = rgb.mean(-1)
    for j in range(H):
        for i in range(W):
            ys, ye = int(j * f), max(int(j * f) + 1, int((j + 1) * f))
            xs, xe = int(i * f), max(int(i * f) + 1, int((i + 1) * f))
            m = mask[ys:ye, xs:xe]
            if m.size == 0 or m.mean() < 0.5:
                continue
            px = rgb[ys:ye, xs:xe][m]
            l = lum[ys:ye, xs:xe][m]
            dark = l < 80
            if dark.mean() >= 0.3:
                col = px[dark].mean(0) * 0.4 + OUTLINE * 0.6
            else:
                col = np.median(px[~dark], axis=0) if (~dark).any() else px.mean(0)
            out[j, i, :3] = np.clip(col, 0, 255)
            out[j, i, 3] = 255
    return out


def outline(a):
    """투명과 맞닿은 밝은 가장자리에 1px 외곽선 (기존 스프라이트처럼 또렷하게)"""
    al = a[..., 3] > 0
    edge = al & ~ndimage.binary_erosion(al)
    lum = a[..., :3].astype(int).mean(-1)
    b = a.copy()
    fix = edge & (lum > 95)
    b[fix, :3] = (b[fix, :3] * 0.25 + OUTLINE * 0.75).astype(np.uint8)
    return b


def main():
    # 배율: 고나 = 난타 첫 프레임(대기 자세) 키 → bigbaby 고나 키 · 마녀 = 첫 프레임 키 → witch-sheet 마녀 키
    _, gm = crop(ROW2, ASSETS['gona-chop'][1][0])
    _, wm = crop(ROW3, ASSETS['witch-goo-face'][1][0])
    F = {'gona': gm.shape[0] / GONA_H, 'witch': wm.shape[0] / WITCH_H}
    print('factor', {k: round(v, 2) for k, v in F.items()})
    report = {}
    previews = []
    for name, (row, frames, base, flip) in ASSETS.items():
        imgs = []
        for xr in frames:
            c, m = crop(row, xr)
            a = shrink(c, m, F[base])
            if flip:
                a = a[:, ::-1]
            imgs.append(a)
        fw = max(i.shape[1] for i in imgs) + 2
        fh = max(i.shape[0] for i in imgs) + 1
        sheet = np.zeros((fh, fw * len(imgs), 4), np.uint8)
        for k, a in enumerate(imgs):
            h, w = a.shape[:2]
            # 바닥 맞춤 · 가로 가운데
            y = fh - h
            x = k * fw + (fw - w) // 2
            sheet[y : y + h, x : x + w] = a
        Image.fromarray(sheet).save(f'{OUT}/{name}.png', optimize=True)
        report[name] = {'frames': len(imgs), 'frame': [fw, fh], 'sheet': [sheet.shape[1], sheet.shape[0]]}
        previews.append(sheet)
    print(report)
    if PREVIEW:
        W = max(p.shape[1] for p in previews) * 6
        H = sum(p.shape[0] * 6 + 12 for p in previews)
        canvas = Image.new('RGBA', (W, H), (60, 40, 80, 255))
        y = 0
        for p in previews:
            im = Image.fromarray(p).resize((p.shape[1] * 6, p.shape[0] * 6), Image.NEAREST)
            canvas.alpha_composite(im, (0, y))
            y += im.height + 12
        canvas.save(f'{PREVIEW}/new-art-preview.png')


main()
