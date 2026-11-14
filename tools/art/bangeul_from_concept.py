"""방글할매 최종 디자인: 승인 레퍼런스(신규 기능 레퍼런스 시트)의 '방글할매 픽셀 캐릭터 디자인' 작은 5동작을 게임 스프라이트로.

- 시트 (615,160)~(1165,320) 영역의 5명만 사용 (실제 사진 · 큰 그림 · 글자 · 음표 · 반짝이는 쓰지 않음)
- 배경(크림색) 제거 → 사람 하나당 가장 큰 덩어리만(음표·반짝이·바닥 그림자 제외) · 안쪽 구멍 메움
- 몸 높이 45px 로 축소: 칸마다 배경이 아닌 픽셀만 평균(가장자리 번짐 없음) · 알파는 반 이상이면 불투명(픽셀 경계 선명)
- 64×58 칸(발 = 칸 바닥 · 가로 가운데)에 맞춰 기존 시트 이름으로 저장 (bangeul-idle/laugh/song/appear/exit)
  동작: 0 기본(프레첼) · 1 기본2 · 2 걷기 · 3 웃음(반짝) · 4 만세 노래
사용: python3 tools/art/bangeul_from_concept.py <레퍼런스.png> public/assets/bangeul
  (소환 버튼 얼굴은 버튼 그림을 바로 고침 — 다시 돌릴 땐 git 의 원래 summon-on/off.png 로 되돌린 뒤)
"""
import sys

import numpy as np
from PIL import Image
from scipy import ndimage as nd

SRC, OUT = sys.argv[1], sys.argv[2]
CELL = (64, 58)
BODY_H = 44

im = np.array(Image.open(SRC).convert('RGB')).astype(np.float64)
H0, W0 = im.shape[:2]
s = W0 / 1536
c = im[int(160 * s) : int(320 * s), int(615 * s) : int(1165 * s)]
bg = np.median(np.concatenate([c[0], c[-1], c[:, 0], c[:, -1]]), axis=0)
fg = np.abs(c - bg).sum(-1) > 45
lab, n = nd.label(fg)
sizes = nd.sum(fg, lab, range(1, n + 1))
figs = sorted([i + 1 for i, v in enumerate(sizes) if v > 0.5 * sizes.max()], key=lambda i: np.nonzero(lab == i)[1].min())
assert len(figs) == 5, len(figs)


def cut(i):
    m = nd.binary_fill_holes(lab == i)
    # 발 아래 바닥 그림자 줄 제거: 아래쪽에서 색이 연한(배경과 가까운) 가로줄
    ys, xs = np.nonzero(m)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    rgb = c[y0:y1, x0:x1]
    mm = m[y0:y1, x0:x1].copy()
    soft = np.abs(rgb - bg).sum(-1) < 110  # 그림자처럼 연한 칸
    for y in range(mm.shape[0] - 1, int(mm.shape[0] * 0.8), -1):
        row = mm[y]
        if row.any() and soft[y][row].mean() > 0.6:
            mm[y] = False
        else:
            break
    return rgb, mm


cuts = [cut(i) for i in figs]
hs = [m.shape[0] for _, m in cuts]
k = BODY_H / np.median(hs)


def shrink(rgb, m):
    h, w = m.shape
    nh, nw = max(1, round(h * k)), max(1, round(w * k))
    out = np.zeros((nh, nw, 4), np.uint8)
    for y in range(nh):
        for x in range(nw):
            ya, yb = int(y / k), max(int(y / k) + 1, int((y + 1) / k))
            xa, xb = int(x / k), max(int(x / k) + 1, int((x + 1) / k))
            mm = m[ya:yb, xa:xb]
            if mm.mean() < 0.5:
                continue
            px = rgb[ya:yb, xa:xb][mm]
            # 가운데 값(중앙값) — 선·윤곽이 흐려지지 않게
            out[y, x, :3] = np.median(px, axis=0)
            out[y, x, 3] = 255
    return out


def clean(f):
    """가장자리의 배경색 번짐·바닥 그림자 칸 제거(2번) → 기존 게임 스프라이트처럼 1칸 어두운 외곽선"""
    f = f.copy()
    rgb = f[:, :, :3].astype(float)
    lum = rgb @ np.array([0.3, 0.59, 0.11])
    # 발 밑 바닥 그림자(연한 분홍 회색) — 아래 6줄의 밝은 칸
    h = f.shape[0]
    f[h - 6 :, :, 3][lum[h - 6 :] > 120] = 0
    for _ in range(3):
        a = f[:, :, 3] > 0
        edge = a & ~nd.binary_erosion(a, border_value=0)
        light = (np.abs(rgb - bg).sum(-1) < 170) | (lum > 205)
        f[edge & light, 3] = 0
    # 떨어져 남은 부스러기 제거 (가장 큰 덩어리만)
    lab2, n2 = nd.label(f[:, :, 3] > 0)
    if n2 > 1:
        sz = nd.sum(lab2 > 0, lab2, range(1, n2 + 1))
        f[(lab2 != (np.argmax(sz) + 1))] = 0
    a = f[:, :, 3] > 0
    f = np.pad(f, ((1, 1), (1, 1), (0, 0)))
    a = np.pad(a, 1)
    ring = nd.binary_dilation(a) & ~a
    f[ring] = (34, 20, 18, 255)
    return f


frames = [clean(shrink(*ct)) for ct in cuts]


def place(f, dx=0, dy=0, alpha=1.0, tint=None):
    cell = np.zeros((CELL[1], CELL[0], 4), np.uint8)
    h, w = f.shape[:2]
    x0 = (CELL[0] - w) // 2 + dx
    y0 = CELL[1] - h + dy
    g = f.copy()
    if tint is not None:
        a = g[:, :, 3] > 0
        g[a, :3] = (g[a, :3] * (1 - tint[1]) + np.array(tint[0]) * tint[1]).astype(np.uint8)
    g[:, :, 3] = (g[:, :, 3] * alpha).astype(np.uint8)
    ys, xs = slice(max(0, y0), y0 + h), slice(max(0, x0), x0 + w)
    sub = g[max(0, -y0) :, max(0, -x0) :][: CELL[1] - max(0, y0), : CELL[0] - max(0, x0)]
    cell[ys, xs][: sub.shape[0], : sub.shape[1]] = sub
    return cell


def sheet(cells):
    return Image.fromarray(np.concatenate(cells, axis=1), 'RGBA')


A, B, WALK, LAUGH, UP = frames
GOLD = (255, 232, 140)
sheets = {
    'idle': [place(A), place(B), place(A, dy=-1), place(B)],
    'laugh': [place(LAUGH), place(A, dy=-1), place(LAUGH, dy=-1), place(B)],
    'song': [place(UP), place(LAUGH, dy=-1), place(UP, dy=-1), place(LAUGH)],
    # 등장: 황금빛 실루엣 → 반쯤 금빛 → 본모습 (같은 그림을 색만 바꿈)
    'appear': [place(A, tint=((255, 250, 225), 0.92)), place(A, tint=(GOLD, 0.6)), place(A, tint=(GOLD, 0.2)), place(A)],
    'exit': [place(WALK), place(WALK, dx=2, alpha=0.8), place(WALK, dx=4, alpha=0.55), place(WALK, dx=6, alpha=0.3)],
}
for name, cells in sheets.items():
    sheet(cells).save(f'{OUT}/bangeul-{name}.png')
    print('wrote', name, len(cells), 'frames', CELL)
# 비교용 원본 크기 5동작
Image.fromarray(np.concatenate([place(f) for f in frames], axis=1), 'RGBA').save(f'{OUT}/../../../tools/art/bangeul-concept-5.png')
print('body heights', [f.shape[0] for f in frames], 'scale', round(k, 3))


# 소환 버튼 얼굴도 새 디자인으로 (버튼 바탕·글자는 그대로 · 옛 얼굴 동그라미 자리만 바꿈)
def button_face(path, cy):
    b = np.array(Image.open(path).convert('RGBA')).astype(np.int32)
    h, w = b.shape[:2]
    cx, r = 27, 20
    yy, xx = np.mgrid[0:h, 0:w]
    circle = (xx - cx) ** 2 + (yy - cy) ** 2 <= r * r
    for y in range(h):
        row = circle[y]
        if row.any():
            b[y, row] = b[y, cx + r + 3]  # 같은 줄 버튼 바탕색
    head = A[:27].copy()  # 머리~턱 (기본 동작)
    ys, xs = np.nonzero(head[:, :, 3])
    head = head[: ys.max() + 1, xs.min() : xs.max() + 1]
    # 아랫줄(목) 외곽선
    bot = head.shape[0] - 1
    head[bot][head[bot, :, 3] > 0] = (34, 20, 18, 255)
    hh, hw = head.shape[:2]
    y0, x0 = cy - hh // 2, cx - hw // 2
    for y in range(hh):
        for x in range(hw):
            if head[y, x, 3] > 0 and 0 <= y0 + y < h and 0 <= x0 + x < w:
                b[y0 + y, x0 + x] = head[y, x]
    Image.fromarray(b.astype(np.uint8), 'RGBA').save(path)
    print('button face', path, (hw, hh))


import os

if os.path.exists(f'{OUT}/summon-on.png') and not os.environ.get('SKIP_BUTTON'):
    button_face(f'{OUT}/summon-on.png', 44)
    button_face(f'{OUT}/summon-off.png', 22)


# ── 효과 그림 (레퍼런스 '주요 이펙트 요소' 줄): 황금 고리 · 황금 폭발 빛살 · 황금 음표 · 음표 물결
#   크림색 바탕 위 빛 그림 → 바탕을 빼서 투명하게 (노란빛 = 파란 성분이 빠진 만큼 · 흰 빛 = 바탕보다 밝은 만큼)
#   → 게임 크기로 줄이고 알파를 4단계로 (도트처럼 또렷하게)
FX = {'ring': (801, 928, 0.36), 'burst': (932, 1066, 0.36)}  # 음표·음표 물결은 줄이면 뭉개져 안 씀 (코드 음표 효과)


def fx(name, x0, x1, k):
    g = im[int(705 * s) : int(815 * s), int(x0 * s) : int(x1 * s)]
    bgc = np.array([254.0, 247.0, 237.0])
    # 노란 빛: 파란 성분이 바탕보다 빠진 정도 · 흰 빛(선·음표 속): 파란 성분이 바탕보다 높은 정도
    drop = np.clip((bgc[2] - g[:, :, 2]) / 190, 0, 1)
    white = np.clip((g[:, :, 2] - bgc[2] - 2) / 12, 0, 1)
    a = np.clip(drop * 2.2 + white * 1.5, 0, 1)
    light, deep = np.array([255.0, 226.0, 110.0]), np.array([236.0, 150.0, 18.0])
    t = np.clip((drop - 0.15) / 0.6, 0, 1)[..., None]
    col = light * (1 - t) + deep * t
    col = np.where((white > drop)[..., None], np.array([255.0, 252.0, 228.0]), col)
    rgba = np.dstack([col, a * 255]).astype(np.uint8)
    img = Image.fromarray(rgba, 'RGBA')
    w, h = img.size
    img = img.resize((max(1, round(w * k / s)), max(1, round(h * k / s))), Image.BOX)
    arr = np.array(img).astype(np.float64)
    al = arr[:, :, 3] / 255
    steps = np.select([al < 0.45, al < 0.7], [0, 0.75], 1.0)
    arr[:, :, 3] = steps * 255
    ys, xs = np.nonzero(arr[:, :, 3])
    arr = arr[ys.min() : ys.max() + 1, xs.min() : xs.max() + 1]
    Image.fromarray(arr.astype(np.uint8), 'RGBA').save(f'{OUT}/bangeul-fx-{name}.png')
    print('fx', name, arr.shape[1], 'x', arr.shape[0])


for name, (x0, x1, k) in FX.items():
    fx(name, x0, x1, k)
