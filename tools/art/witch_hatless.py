"""이유식 뒤집어쓴 마녀(witch-goo-face 3프레임)에서 셰프 모자만 지움 → witch-goo-face-nohat.png

모자가 날아간 뒤 머리 위에 모자가 또 보이지 않게. 얼굴·머리·날개·옷·이유식은 원본 픽셀 그대로.
- 모자 = 머리 위의 밝은 크림색 덩어리(+ 그 테두리 선). 1번 프레임의 어지러움 말풍선(따로 떨어진 덩어리)은 남김
- 모자를 지운 자리: 칸마다 모자 맨 아래 줄까지 지움 → 머리 윗선이 들쭉날쭉하지 않게
  양옆 2칸 평균으로 둥글게 다듬고, 새로 드러난 머리 꼭대기는 바로 아래 머리카락 색 · 맨 윗줄은 원본 외곽선 색
사용: python3 tools/art/witch_hatless.py public/assets/boss
"""
import colorsys
import sys

import numpy as np
from PIL import Image
from scipy import ndimage as nd

D = sys.argv[1]
src = np.array(Image.open(f'{D}/witch-goo-face.png').convert('RGBA')).astype(np.int32)
FW, FH, N = 58, 42, 3
out = src.copy()


def creamy(px):
    r, g, b, a = px
    if a < 128:
        return False
    h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
    return 0.3 * r + 0.59 * g + 0.11 * b > 135 and s < 0.38


for f in range(N):
    fr = src[:, f * FW : (f + 1) * FW]
    m = np.array([[creamy(fr[y, x]) for x in range(FW)] for y in range(FH)])
    lab, n = nd.label(m)
    if not n:
        continue
    sizes = nd.sum(m, lab, range(1, n + 1))
    hat = lab == (np.argmax(sizes) + 1)  # 가장 큰 크림색 덩어리 = 모자
    ys, xs = np.nonzero(hat)
    outline = (34, 18, 30, 255)
    dark = [tuple(fr[y, x]) for y in range(FH) for x in range(FW) if fr[y, x, 3] > 200 and 0.3 * fr[y, x, 0] + 0.59 * fr[y, x, 1] + 0.11 * fr[y, x, 2] < 40]
    if dark:
        outline = max(set(dark), key=dark.count)
    x0, x1 = xs.min() - 1, xs.max() + 2
    bottom = {}
    for x in range(x0, x1):
        col = np.nonzero(hat[:, x])[0] if 0 <= x < FW else []
        if len(col):
            bottom[x] = col.max()
    # 모자 아래 끝 다음 줄 = 새 머리 꼭대기 (양옆 다듬기)
    top = {x: bottom[x] + 1 for x in bottom}
    xsorted = sorted(top)
    sm = {}
    for x in xsorted:
        nb = [top[k] for k in (x - 2, x - 1, x, x + 1, x + 2) if k in top]
        sm[x] = int(round(sum(nb) / len(nb)))
    # 가장자리 칸은 조금 아래로 (둥근 머리)
    if xsorted:
        for i, x in enumerate(xsorted):
            edge = min(i, len(xsorted) - 1 - i)
            if edge < 2:
                sm[x] += 2 - edge
    fo = out[:, f * FW : (f + 1) * FW]
    for x in xsorted:
        t = sm[x]
        # 모자 칸과 모자 위 테두리 지움
        for y in range(0, max(t, bottom[x] + 1)):
            fo[y, x] = 0
        # 위로 올라온 머리 꼭대기 채움: 그 칸 아래쪽에서 처음 나오는 불투명 픽셀 색
        below = [fo[y, x] for y in range(t, FH) if fo[y, x, 3] > 200]
        fill = below[0] if below else outline
        for y in range(t, FH):
            if fo[y, x, 3] > 200 and not creamy(fo[y, x]):
                break
            fo[y, x] = fill
        fo[t, x] = outline  # 머리 윗선
    # 모자 테두리 선 찌꺼기: 남은 외곽선 픽셀 중 아래로 아무것도 안 붙은 것
    a = fo[:, :, 3] > 0
    lab2, n2 = nd.label(a)
    if n2 > 1:
        sz = nd.sum(a, lab2, range(1, n2 + 1))
        for i, v in enumerate(sz):
            if v < 15:
                fo[lab2 == i + 1] = 0
Image.fromarray(out.astype(np.uint8), 'RGBA').save(f'{D}/witch-goo-face-nohat.png')
print('wrote witch-goo-face-nohat.png')
