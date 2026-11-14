"""후드리챱챱 방해 때 우는 고나 (gona-chop-cry.png · 1프레임 64×45)

승인 그림 두 장을 합침 — 새로 그리지 않음:
- 몸·자세: gona-chop 0번(난타 준비 자세) 그대로 (머리카락 한 가닥 · 연두 공룡 슈트 · 노란 등 가시 · 얼굴 테두리 그대로)
- 얼굴 속(피부 안쪽)만: gona-chair-cry 1번(눈 찡그리고 입 크게 벌려 우는 얼굴)에서 같은 크기(23×15) 그대로 옮김
사용: python3 tools/art/gona_chop_cry.py public/assets/boss
"""
import colorsys
import sys

import numpy as np
from PIL import Image
from scipy import ndimage as nd

D = sys.argv[1]
chop = np.array(Image.open(f'{D}/gona-chop.png').convert('RGBA')).astype(np.int32)
cry = np.array(Image.open(f'{D}/gona-chair-cry.png').convert('RGBA')).astype(np.int32)


def face(a):
    m = np.zeros(a.shape[:2], bool)
    for y in range(a.shape[0]):
        for x in range(a.shape[1]):
            r, g, b, al = a[y, x]
            if al < 200:
                continue
            h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            if (h < 0.11 or h > 0.95) and 0.12 < s < 0.55 and v > 0.75:
                m[y, x] = True
    lab, n = nd.label(m)
    sz = nd.sum(m, lab, range(1, n + 1))
    big = lab == (np.argmax(sz) + 1)
    return nd.binary_fill_holes(big)


body = chop[:, 0:64].copy()
fb = face(body)
bys, bxs = np.nonzero(fb)
frames = []
for cf in (1,):  # 2번 얼굴은 두 팔이 얼굴을 가려 안 맞음 → 1번 얼굴만
    c = cry[:, cf * 63 : (cf + 1) * 63]
    fc = face(c)
    # 우는 얼굴 영역: 피부 + 그 안의 눈·입 (볼록 감싸기 대신 줄마다 왼쪽~오른쪽 채움)
    fill = fc.copy()
    for y in range(fc.shape[0]):
        xs = np.nonzero(fc[y])[0]
        if len(xs):
            fill[y, xs.min() : xs.max() + 1] = True
    cys, cxs = np.nonzero(fill)
    # 두 얼굴의 가운데를 맞춤
    dx = int(round(bxs.mean() - cxs.mean()))
    dy = int(round(bys.min() - cys.min()))
    out = body.copy()
    for y, x in zip(cys, cxs):
        ty, tx = y + dy, x + dx
        # 고나 얼굴 안쪽(피부 줄 범위)만 바꿈 — 테두리·머리·슈트는 그대로
        if 0 <= ty < 45 and 0 <= tx < 64 and fb[ty].any():
            row = np.nonzero(fb[ty])[0]
            if row.min() <= tx <= row.max():
                out[ty, tx] = c[y, x]
    frames.append(out)
Image.fromarray(np.concatenate(frames, axis=1).astype(np.uint8), 'RGBA').save(f'{D}/gona-chop-cry.png')
print('wrote gona-chop-cry.png', dx, dy)
