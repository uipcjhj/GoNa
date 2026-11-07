#!/usr/bin/env python3
"""엔딩 컷신 배경: art-src/ending/bg-{land,port}-original.png (AI 생성 도트풍 원본, 인물 없음)
→ 게임 도트 격자(가로 480x268 · 세로 268x480)로 줄이고 색을 64색으로 정리 → public/assets/ending/bg-{land,port}.png"""
from PIL import Image
import os
ROOT = os.path.join(os.path.dirname(__file__), '..')
for name, size in (('land', (480, 268)), ('port', (268, 480))):
    im = Image.open(os.path.join(ROOT, 'art-src', 'ending', f'bg-{name}-original.png')).convert('RGB')
    small = im.resize(size, Image.LANCZOS)
    q = small.quantize(colors=64, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert('RGB')
    q.save(os.path.join(ROOT, 'public', 'assets', 'ending', f'bg-{name}.png'), optimize=True)
    print(name, q.size)
