"""
최종 보스 '이유식 드래곤 셰프 마녀' 스프라이트 — 확정 레퍼런스 시트의 '기본 스프라이트(비행형)' 4장을 그대로 잘라 씀.
  · 배경(단색 보라) 제거 → 왼쪽을 보도록 좌우 반전 → 고나와 같은 도트 크기로 축소(외곽선 1px 유지)
  · 프레임 10장(게임 코드 순서): 0 대기 · 1 이동(날갯짓) · 2 숟가락 들기 · 3 분노(보라 눈빛) · 4 아픔 · 5 웃음 · 6 팔 뻗기(숟가락은 게임이 늘여 그림)
    · 7 회오리 · 8 패배 · 9 이유식 뿌리기
    (4·5·8 은 레퍼런스에 전용 그림이 없어 대기 그림을 쓰고, 게임에서 흔들림·기울임·깜빡임으로 표현)
  · 숟가락(이유식 묻은 머리)도 같은 그림에서 잘라 씀
사용: python3 tools/art/witch_from_reference.py <레퍼런스.png> <출력 폴더>
"""
import sys
import numpy as np
from PIL import Image
from scipy import ndimage

SRC, OUT = sys.argv[1], sys.argv[2]
SHEET = np.array(Image.open(SRC).convert('RGB')).astype(int)
BOXES = {'idle': (700, 129, 890, 274), 'move': (912, 129, 1095, 274), 'prep': (1100, 118, 1311, 274), 'atk': (1312, 118, 1530, 282)}
FACTOR = 3.3  # 레퍼런스 픽셀 → 게임 픽셀 (게임에서 1.6배로 그려 고나 4단계와 같은 도트 크기)
OUTLINE = np.array([38, 16, 44])


def cut(name, min_frac=0.02):
    x0, y0, x1, y1 = BOXES[name]
    c = SHEET[y0:y1, x0:x1]
    border = np.concatenate([c[0], c[-1], c[:, 0], c[:, -1]])
    bg = np.median(border, axis=0)
    near = np.sqrt(((c - bg) ** 2).sum(-1)) < 30
    lab, _ = ndimage.label(near)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    fg = ~np.isin(lab, list(edge))
    # 발밑 그림자(배경보다 조금 어두운 보라) 제거
    dark_bg = (np.abs(c - bg * 0.8).sum(-1) < 40) & (c.sum(-1) < bg.sum() * 0.95)
    fg &= ~dark_bg
    lab2, n2 = ndimage.label(fg)
    sizes = ndimage.sum(fg, lab2, range(1, n2 + 1))
    keep = np.zeros_like(fg)
    for i, s in enumerate(sizes):
        if s >= sizes.max() * min_frac:
            keep |= lab2 == i + 1
    keep = ndimage.binary_fill_holes(keep) & (keep | ~near)
    return c, keep


def shrink(rgb, mask, FACTOR=FACTOR):
    """블록마다: 덮인 비율이 절반 넘으면 픽셀 · 어두운 외곽선이 30% 넘으면 외곽선색 · 아니면 밝은 쪽 평균"""
    h, w = mask.shape
    H, W = int(round(h / FACTOR)), int(round(w / FACTOR))
    out = np.zeros((H, W, 4), np.uint8)
    lum = rgb.mean(-1)
    for j in range(H):
        for i in range(W):
            ys, ye = int(j * FACTOR), max(int(j * FACTOR) + 1, int((j + 1) * FACTOR))
            xs, xe = int(i * FACTOR), max(int(i * FACTOR) + 1, int((i + 1) * FACTOR))
            m = mask[ys:ye, xs:xe]
            if m.mean() < 0.45:
                continue
            px = rgb[ys:ye, xs:xe][m]
            l = lum[ys:ye, xs:xe][m]
            dark = l < 62
            if dark.mean() >= 0.34:
                col = px[dark].mean(0) * 0.5 + OUTLINE * 0.5
            else:
                col = px[~dark].mean(0) if (~dark).any() else px.mean(0)
            out[j, i, :3] = np.clip(col, 0, 255)
            out[j, i, 3] = 255
    return out


def outline(a):
    """투명과 맞닿은 가장자리에 외곽선이 없으면 1px 외곽선 (고나처럼 또렷하게)"""
    al = a[..., 3] > 0
    inner = ndimage.binary_erosion(al)
    edge = al & ~inner
    lum = a[..., :3].mean(-1)
    fix = edge & (lum > 70)
    grown = ndimage.binary_dilation(al) & ~al
    b = a.copy()
    b[grown, :3] = OUTLINE
    b[grown, 3] = 255
    # 원래 외곽선이 이미 있는 곳은 바깥 1px 를 더하지 않음 (두꺼워지지 않게)
    has = edge & ~fix
    near_has = ndimage.binary_dilation(has) & grown
    b[near_has, 3] = 0
    return b


def clean(a):
    """축소 뒤 떨어져 남은 작은 점(속도선·튄 조각) 제거"""
    al = a[..., 3] > 0
    lab, n = ndimage.label(al)
    if n > 1:
        sizes = ndimage.sum(al, lab, range(1, n + 1))
        for i, sz in enumerate(sizes):
            if sz < 22:
                a[lab == i + 1, 3] = 0
    return a


def skin_anchor(a):
    r, g, bb = a[..., 0].astype(int), a[..., 1].astype(int), a[..., 2].astype(int)
    skin = (a[..., 3] > 0) & (r > 200) & (g > 170) & (bb < 170) & (r - bb > 60)
    ys, xs = np.where(skin)
    return int(round(xs.mean())), int(round(ys.mean()))


frames = {}
for n in BOXES:
    rgb, m = cut(n, 0.03 if n == 'move' else 0.004)
    a = clean(outline(shrink(rgb, m)))
    a = a[:, ::-1]  # 왼쪽(고나 쪽)을 보도록
    frames[n] = a


def rage(a):
    """눈만 보라색으로 번뜩 (레퍼런스 '공격 집중' 표정) — 얼굴 피부 안쪽의 어두운 점(눈)만 바꿈"""
    b = a.copy()
    r, g, bb = b[..., 0].astype(int), b[..., 1].astype(int), b[..., 2].astype(int)
    skin = (b[..., 3] > 0) & (r > 200) & (g > 170) & (bb < 170) & (r - bb > 60)
    ys, xs = np.where(skin)
    top, bot = ys.min(), ys.max()
    face = ndimage.binary_fill_holes(ndimage.binary_closing(skin, iterations=3))
    band = np.zeros_like(face)
    band[top + int((bot - top) * 0.25): top + int((bot - top) * 0.6) + 1] = True
    eye = face & band & ~skin & (b[..., :3].mean(-1) < 110)
    b[eye, :3] = (232, 96, 255)
    # 눈 위에 작은 하이라이트
    hi = eye & ~ndimage.binary_dilation(eye, structure=np.array([[0, 1, 0], [0, 0, 0], [0, 0, 0]]))
    b[hi, :3] = (255, 200, 255)
    return b


frames['rage'] = rage(frames['idle'])


def arm_out(a):
    """공격 그림에서 이유식 덩어리(초록)와 그 외곽선만 지움 → 손에 쥔 손잡이는 남아, 게임에서 그 끝으로 숟가락이 늘어남"""
    b = a.copy()
    r, g, bb = b[..., 0].astype(int), b[..., 1].astype(int), b[..., 2].astype(int)
    al = b[..., 3] > 0
    left = np.zeros_like(al)
    left[:, :22] = True  # 이유식은 손 앞(왼쪽)에만 — 꼬리 가시(노랑)·얼굴은 그대로
    green = al & (g > 140) & (bb < 110) & (g > r - 40) & left
    skin = al & (r > 200) & (g > 170) & (bb < 170) & (r - bb > 60)
    dark = b[..., :3].mean(-1) < 75
    erase = green | (ndimage.binary_dilation(green, iterations=2) & dark & ~ndimage.binary_dilation(skin, iterations=2))
    b[erase, 3] = 0
    return clean(b)


frames['arm'] = arm_out(frames['atk'])

order = ['idle', 'move', 'prep', 'rage', 'idle', 'idle', 'arm', 'move', 'idle', 'atk']
anchors = {k: skin_anchor(v) for k, v in frames.items()}
anchors['arm'] = anchors['atk']
# 공통 칸: 얼굴(피부) 가운데 x · 턱 아래 y 를 같은 자리에
L = max(anchors[k][0] for k in frames)
R = max(frames[k].shape[1] - anchors[k][0] for k in frames)
T = max(anchors[k][1] for k in frames)
B = max(frames[k].shape[0] - anchors[k][1] for k in frames)
FW, FH = L + R, T + B
sheet = np.zeros((FH, FW * len(order), 4), np.uint8)
for i, k in enumerate(order):
    a = frames[k]
    ax, ay = anchors[k]
    ox, oy = i * FW + L - ax, T - ay
    sheet[oy:oy + a.shape[0], ox:ox + a.shape[1]] = np.where(a[..., 3:] > 0, a, sheet[oy:oy + a.shape[0], ox:ox + a.shape[1]])
Image.fromarray(sheet).save(f'{OUT}/witch-sheet.png')
print('frame', FW, FH, 'face anchor', L, T, {k: v.shape for k, v in frames.items()})

# 숟가락: '공격 준비' 그림의 이유식 묻은 숟가락 (머리 + 손잡이 윗부분) → 머리가 왼쪽 · 손잡이 가로로 돌림
rgb, m = cut('prep', 0.004)
ys, xs = np.where(m)
oy, ox = ys.min(), xs.min()
rgb, m = rgb[oy:, ox:], m[oy:, ox:]
sub = (slice(0, 100), slice(148, rgb.shape[1]))
rgba = np.dstack([rgb[sub], m[sub] * 255]).astype(np.uint8)
im = Image.fromarray(rgba)
# 손 쪽(왼쪽 아래)에서 머리 쪽(오른쪽 위)으로 기운 숟가락 → 머리가 왼쪽을 보게 돌림
im = im.rotate(122, resample=Image.NEAREST, expand=True)
arr = np.array(im)
mm = arr[..., 3] > 0
# 숟가락은 크게 (같은 도트 크기에서 1.5배 — '커다란 숟가락'이 확실히 보이게)
a = clean(outline(shrink(arr[..., :3].astype(int), mm, FACTOR / 1.5)))
ys, xs = np.where(a[..., 3] > 0)
a = a[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
Image.fromarray(a).save(f'{OUT}/witch-spoon.png')
print('spoon', a.shape)
