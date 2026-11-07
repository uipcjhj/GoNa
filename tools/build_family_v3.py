"""
가족 엔딩 캐릭터 시트 v3 — 사람마다 따로 만든 도트 원본 그림(PNG) 기반

원본: art-src/ending/family-v3/<id>-sheet.png
  B스타일 스토리보드의 그림체(따뜻한 빈티지 도트, 2~2.2등신 SD)를 글 설명으로만 지정해 이미지 생성 모델로 만든
  인물별 동작 시트(투명 배경, 2줄 x 5칸). 가족사진·스토리보드 파일은 외부로 올리지 않음.
  칸 순서: 1 서기 2 웃기 3 손 흔들기 4 두 팔 벌리기 5 걷기A / 6 걷기B 7 안기 8 볼뽀뽀 9 킁카 10 쓰다듬기 (6~10 오른쪽 보기)

이 스크립트가 하는 일 (그림을 새로 그리지 않음 — 원본을 줄이고 정리만):
  1) 칸마다 인물을 잘라냄 (작은 조각 — 킁킁 선 등 — 은 버림)
  2) 원본 그림을 사람별 목표 키(도트 수)로 줄임 (박스 평균) → 같은 사람의 모든 동작은 같은 배율
  3) 사람마다 한 벌의 색(팔레트)으로 맞춤 → 프레임마다 색이 달라지지 않음
  4) 바깥 외곽선을 1도트 짙은 갈색으로 통일
  5) 발바닥 가운데를 기준점으로 모든 프레임을 같은 크기 칸에 정렬
  6) 안기·뽀뽀·킁카·쓰다듬기: 앞으로 뻗은 팔(소매+손)을 따로 떼어 -arms 시트로 (게임에서 고나보다 앞에 그림)

출력: public/assets/ending/fam-<id>.png, fam-<id>-arms.png  (프레임 FW x FH, 가로 10칸)
실행: python3 tools/build_family_v3.py [--preview 폴더]
"""
import os
import sys
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'art-src', 'ending', 'family-v3')
OUT = os.path.join(ROOT, 'public', 'assets', 'ending')

FW, FH = 64, 60          # 프레임 칸 (모든 인물·동작 공통)
ANCHOR_X = 32            # 발 가운데 (좌우 반전해도 같은 자리)
OUTLINE = (52, 30, 34)
NCOL = 22                # 사람별 팔레트 색 수

# 사람별 목표 키(서 있을 때, 도트) — 키·체형 차이
HEIGHT = {'glasses': 52, 'blacktee': 54, 'stripe': 48, 'ponytail': 47, 'curly': 44, 'grey': 46}
IDS = ['stripe', 'glasses', 'ponytail', 'blacktee', 'curly', 'grey']
POSES = ['idle', 'laugh', 'wave', 'open', 'walkA', 'walkB', 'hug', 'kiss', 'sniff', 'pat']
ARM_POSES = {'hug', 'kiss', 'sniff', 'pat'}
# 팔 레이어 영역 (사람·동작별, 프레임 좌표): x0 보다 오른쪽 · y0~y1 줄 — 확대 격자 이미지를 보고 턱 아래·몸통 앞의 팔만 들어가게 정함
ARM_CUT = {
    ('stripe', 'hug'): (29, 39, 50), ('stripe', 'kiss'): (30, 40, 50), ('stripe', 'sniff'): (29, 42, 51), ('stripe', 'pat'): (34, 38, 46),
    ('glasses', 'hug'): (33, 33, 46), ('glasses', 'kiss'): (33, 35, 47), ('glasses', 'sniff'): (31, 39, 49), ('glasses', 'pat'): (37, 32, 40),
    ('ponytail', 'hug'): (31, 39, 47), ('ponytail', 'kiss'): (31, 40, 48), ('ponytail', 'sniff'): (31, 45, 49), ('ponytail', 'pat'): (35, 37, 44),
    ('blacktee', 'hug'): (33, 35, 45), ('blacktee', 'kiss'): (34, 37, 46), ('blacktee', 'sniff'): (32, 41, 49), ('blacktee', 'pat'): (34, 31, 39),
    ('curly', 'hug'): (33, 37, 46), ('curly', 'kiss'): (32, 38, 47), ('curly', 'sniff'): (31, 41, 47), ('curly', 'pat'): (35, 37, 43),
    ('grey', 'hug'): (33, 38, 47), ('grey', 'kiss'): (32, 38, 47), ('grey', 'sniff'): (31, 43, 49), ('grey', 'pat'): (35, 37, 44),
}


def components(sheet):
    a = np.asarray(sheet).astype(np.float32)
    m = a[..., 3] > 110
    lab, n = ndimage.label(m, structure=np.ones((3, 3)))
    objs = ndimage.find_objects(lab)
    sizes = ndimage.sum(m, lab, range(1, n + 1))
    big = [i for i in range(n) if sizes[i] > 3000]
    # 칸 배정: 위/아래 줄, 왼→오
    cents = []
    for i in big:
        sl = objs[i]
        cents.append(((sl[0].start + sl[0].stop) / 2, (sl[1].start + sl[1].stop) / 2, i))
    cents.sort()
    rows = [sorted(cents[:5], key=lambda c: c[1]), sorted(cents[5:], key=lambda c: c[1])]
    order = [c[2] for r in rows for c in r]
    out = []
    for i in order:
        sl = objs[i]
        y0, y1, x0, x1 = sl[0].start, sl[0].stop, sl[1].start, sl[1].stop
        mask = lab == (i + 1)
        # 가까이 붙은 작은 조각(머리카락 끝 등)은 합침, 멀리 떨어진 것(효과선)은 버림
        for j in range(n):
            if j == i or sizes[j] > 3000 or sizes[j] < 30:
                continue
            s2 = objs[j]
            if s2[0].start >= y0 - 6 and s2[0].stop <= y1 + 6 and s2[1].start >= x0 - 6 and s2[1].stop <= x1 + 6:
                mask |= lab == (j + 1)
        ys, xs = np.nonzero(mask)
        y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        crop = a[y0:y1, x0:x1].copy()
        crop[..., 3] = np.where(mask[y0:y1, x0:x1], crop[..., 3], 0)
        out.append(crop)
    assert len(out) == 10, len(out)
    return out


def shrink(crop, scale):
    """박스 평균으로 줄이기 (알파 가중)"""
    h, w = crop.shape[:2]
    nh, nw = max(1, round(h / scale)), max(1, round(w / scale))
    res = np.zeros((nh, nw, 4), np.float32)
    for y in range(nh):
        ya, yb = int(y * scale), max(int(y * scale) + 1, int((y + 1) * scale))
        for x in range(nw):
            xa, xb = int(x * scale), max(int(x * scale) + 1, int((x + 1) * scale))
            cell = crop[ya:yb, xa:xb].reshape(-1, 4)
            al = cell[:, 3] / 255.0
            cov = al.mean()
            if cov < 0.5:
                continue
            rgb = (cell[:, :3] * al[:, None]).sum(0) / max(al.sum(), 1e-6)
            res[y, x, :3] = rgb
            res[y, x, 3] = 255
    return res


def kmeans(X, k, it=25):
    rng = np.random.default_rng(7)
    C = X[rng.choice(len(X), k, replace=False)].astype(np.float64)
    for _ in range(it):
        d = ((X[:, None, :] - C[None]) ** 2).sum(2)
        lab = d.argmin(1)
        for j in range(k):
            if (lab == j).any():
                C[j] = X[lab == j].mean(0)
    return C


def quantize(frames):
    X = np.concatenate([f[f[..., 3] > 0][:, :3] for f in frames]).astype(np.float64)
    # 어두운 색(외곽선·눈)은 먼저 한 색으로 → 팔레트를 밝은 색들에 씀
    C = kmeans(X, NCOL)
    out = []
    for f in frames:
        g = f.copy()
        m = g[..., 3] > 0
        px = g[m][:, :3].astype(np.float64)
        lab = ((px[:, None, :] - C[None]) ** 2).sum(2).argmin(1)
        g[m, :3] = C[lab]
        out.append(g)
    return out


def outline(f):
    g = f.copy()
    m = g[..., 3] > 0
    er = ndimage.binary_erosion(m, structure=np.array([[0, 1, 0], [1, 1, 1], [0, 1, 0]]))
    edge = m & ~er
    lum = g[..., :3].mean(2)
    # 바깥 테두리: 밝은 색이면 외곽선 색으로 (이미 어두운 외곽선은 그대로)
    fix = edge & (lum > 70)
    g[fix, :3] = OUTLINE
    return g


def place(f):
    """발바닥 가운데를 (ANCHOR_X, FH-1) 에 맞춰 FW x FH 칸에"""
    m = f[..., 3] > 0
    ys, xs = np.nonzero(m)
    bottom = ys.max()
    feet = xs[ys >= bottom - 2]
    cx = int(round((feet.min() + feet.max()) / 2))
    canvas = np.zeros((FH, FW, 4), np.float32)
    oy = FH - 1 - bottom
    ox = ANCHOR_X - cx
    h, w = f.shape[:2]
    for y in range(h):
        ty = y + oy
        if not 0 <= ty < FH:
            continue
        for x in range(w):
            tx = x + ox
            if 0 <= tx < FW and f[y, x, 3] > 0:
                canvas[ty, tx] = f[y, x]
    return canvas


def split_arms(c, pose, cid):
    """앞으로 뻗은 팔(턱 아래, 몸통 앞) → 팔 레이어. 잘린 자리에 선을 긋지 않음 (몸과 그대로 이어져 보임)"""
    m = c[..., 3] > 0
    x0, y0, y1 = ARM_CUT[(cid, pose)]
    region = np.zeros_like(m)
    region[y0:y1 + 1, x0:] = True
    region &= m
    lab, n = ndimage.label(region)
    keep = np.zeros_like(m)
    for i in range(1, n + 1):
        if (lab == i).sum() >= 4:
            keep |= lab == i
    arm = np.zeros_like(c)
    body = c.copy()
    arm[keep] = c[keep]
    body[keep] = 0
    return body, arm


def build(cid, preview=None):
    sheet = Image.open(os.path.join(SRC, f'{cid}-sheet.png')).convert('RGBA')
    crops = components(sheet)
    scale = crops[0].shape[0] / HEIGHT[cid]
    small = [shrink(c, scale) for c in crops]
    small = quantize(small)
    small = [outline(f) for f in small]
    placed = [place(f) for f in small]
    bodies, arms = [], []
    for pose, c in zip(POSES, placed):
        if pose in ARM_POSES:
            b, a = split_arms(c, pose, cid)
        else:
            b, a = c, np.zeros_like(c)
        bodies.append(b)
        arms.append(a)

    def strip(frames):
        s = np.zeros((FH, FW * len(frames), 4), np.uint8)
        for i, f in enumerate(frames):
            s[:, i * FW:(i + 1) * FW] = np.clip(f, 0, 255).astype(np.uint8)
        return Image.fromarray(s, 'RGBA')

    strip(bodies).save(os.path.join(OUT, f'fam-{cid}.png'))
    strip(arms).save(os.path.join(OUT, f'fam-{cid}-arms.png'))
    if preview:
        full = [np.where(a[..., 3:4] > 0, a, b) for a, b in zip(arms, bodies)]
        strip(full).save(os.path.join(preview, f'{cid}-full.png'))
        # 팔 레이어를 빨갛게 표시한 검수용
        tint = [np.where(a[..., 3:4] > 0, np.concatenate([np.full(a.shape[:2] + (1,), 255), a[..., 1:2] * 0.3, a[..., 2:3] * 0.3, a[..., 3:4]], 2), b) for a, b in zip(arms, bodies)]
        strip(tint).save(os.path.join(preview, f'{cid}-armcheck.png'))
    hs = [int((p[..., 3] > 0).any(1).sum()) for p in placed]
    return hs


if __name__ == '__main__':
    prev = None
    if '--preview' in sys.argv:
        prev = sys.argv[sys.argv.index('--preview') + 1]
        os.makedirs(prev, exist_ok=True)
    for cid in IDS:
        print(cid, 'heights', build(cid, prev))
