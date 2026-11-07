#!/usr/bin/env python3
"""엔딩 컷신: 고나 타이틀 그림(gona-trot)에서 눈만 '^ ^'(눈 감고 활짝 웃음)으로 바꾼 그림 → public/assets/ending/gona-laugh.png
고나의 색·모양·머리카락·옷은 그대로 (눈 두 개만 바꿈)."""
from PIL import Image
import os
ROOT = os.path.join(os.path.dirname(__file__), '..')
im = Image.open(os.path.join(ROOT, 'public', 'assets', 'title4', 'gona-trot.png')).convert('RGBA')
OL = (56, 30, 9, 255)
lum = lambda p: 0.3 * p[0] + 0.59 * p[1] + 0.11 * p[2]
for (x0, y0, x1, y1) in ((46, 31, 51, 37), (61, 28, 66, 34)):
    # 눈(짙은 점)을 주변 살색으로 지움
    skin = im.getpixel((x0 - 2, (y0 + y1) // 2))
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            p = im.getpixel((x, y))
            if p[3] > 0 and lum(p) < 140:
                im.putpixel((x, y), skin)
    # ^ 모양 (두께 2)
    cx = (x0 + x1) // 2
    cy = (y0 + y1) // 2
    for dx, dy in ((-3, 1), (-2, 0), (-1, -1), (0, -1), (1, -1), (2, 0), (3, 1)):
        for t in (0, 1):
            im.putpixel((cx + dx, cy + dy + t), OL)
im.save(os.path.join(ROOT, 'public', 'assets', 'ending', 'gona-laugh.png'))
print('ok', im.size)
