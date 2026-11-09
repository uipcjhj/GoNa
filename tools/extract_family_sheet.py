"""
가족 캐릭터 원본 분리 — 사용자가 준 확정 디자인 시트(art-src/ending/family-sheet/family-cast-concept-sheet.png)에서
여섯 명을 그대로 잘라 투명 배경 PNG 로 저장. 그림(인물 픽셀)은 한 픽셀도 바꾸지 않음:
  - 배경(크림색 종이)과 발밑 풀밭·꽃만 투명하게 (바깥 테두리에서부터 채우기 — 짙은 외곽선 안쪽은 건드리지 않음)
  - 반짝이 선·하트·이름표처럼 떨어진 조각은 버림 (가장 큰 덩어리 = 인물만 남김)
  - 남은 픽셀의 색은 원본 그대로 (알파만 0/255)
출력: art-src/ending/fam-<id>.png (예전 엔딩 원본 · 지금 엔딩은 tools/extract_ending_sprites.py 의 캐릭터 시트 사용)  (id: imo, samchon, mom, dad, halmeoni, halabeoji)
실행: python3 tools/extract_family_sheet.py
"""
import os
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'art-src', 'ending', 'family-sheet', 'family-cast-concept-sheet.png')
OUT = os.path.join(ROOT, 'art-src', 'ending')
# 시트에서 각 인물이 들어 있는 영역 (x0, y0, x1, y1) — 이름표 위까지
BOXES = {
    'imo': (85, 185, 360, 560),
    'samchon': (395, 185, 660, 560),
    'mom': (695, 195, 1000, 560),
    'dad': (1080, 185, 1370, 560),
    'halmeoni': (330, 630, 650, 985),
    'halabeoji': (720, 625, 1080, 985),
}


def bg_like(rgb):
    r, g, b = rgb[..., 0].astype(int), rgb[..., 1].astype(int), rgb[..., 2].astype(int)
    lum = (r + g + b) / 3
    sat = rgb.max(-1).astype(int) - rgb.min(-1).astype(int)
    cream = (lum > 214) & (sat < 60)                     # 종이 배경
    grass = (g > r + 8) & (g > b + 25)                    # 풀 (연두·초록)
    flower_y = (r > 200) & (g > 160) & (b < 120) & (r - b > 120)  # 꽃 가운데(노랑)
    return cream | grass | flower_y


def extract(cid):
    im = np.asarray(Image.open(SRC).convert('RGB'))
    x0, y0, x1, y1 = BOXES[cid]
    crop = im[y0:y1, x0:x1]
    cand = bg_like(crop)
    # 바깥 테두리에서 이어진 배경만 (안쪽의 흰 셔츠·크림색 옷은 그대로)
    seeds = np.zeros_like(cand)
    seeds[0, :] = seeds[-1, :] = True
    seeds[:, 0] = seeds[:, -1] = True
    bg = ndimage.binary_propagation(seeds & cand, mask=cand)
    fg = ~bg
    # 발밑 풀밭 테두리(올리브색 선)·풀잎 남은 것: 아래쪽 띠에서 초록 기운이 있는 픽셀만 지움
    # (신발·바지·짙은 갈색 외곽선은 초록이 아니라 그대로 남음)
    ys0 = np.nonzero(fg.any(1))[0]
    band = max(ys0.max() - 55, 0)
    r_, g_, b_ = crop[..., 0].astype(int), crop[..., 1].astype(int), crop[..., 2].astype(int)
    greenish = (g_ >= r_ - 4) & (g_ - b_ > 12)
    low = np.zeros_like(fg)
    low[band:, :] = True
    fg &= ~(low & greenish)
    lab, n = ndimage.label(fg, structure=np.ones((3, 3)))
    sizes = ndimage.sum(fg, lab, range(1, n + 1))
    keep = lab == (int(np.argmax(sizes)) + 1)
    keep = ndimage.binary_fill_holes(keep)
    ys, xs = np.nonzero(keep)
    t, b, l, r = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    rgba = np.zeros((b - t, r - l, 4), np.uint8)
    rgba[..., :3] = crop[t:b, l:r]
    rgba[..., 3] = np.where(keep[t:b, l:r], 255, 0)
    Image.fromarray(rgba, 'RGBA').save(os.path.join(OUT, f'fam-{cid}.png'), optimize=True)
    return rgba.shape[1], rgba.shape[0]


if __name__ == '__main__':
    for cid in BOXES:
        print(cid, extract(cid))
