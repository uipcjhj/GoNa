#!/usr/bin/env python3
"""엔딩 컷신 배경 (B스타일 — 해 질 녘 버섯마을): art-src/ending/bgB-{land,port}-original.png (이미지 생성 · 텍스트 설명만 사용, 인물 없음)
→ 게임 도트 격자(가로 320x180 · 세로 180x320)로 줄이고 48색으로 정리 → public/assets/ending/bgB-{land,port}.png"""
from PIL import Image
import os
ROOT = os.path.join(os.path.dirname(__file__), '..')
for name, size in (('land', (320, 180)), ('port', (180, 320))):
    im = Image.open(os.path.join(ROOT, 'art-src', 'ending', f'bgB-{name}-original.png')).convert('RGB')
    small = im.resize(size, Image.LANCZOS)
    q = small.quantize(colors=48, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert('RGB')
    q.save(os.path.join(ROOT, 'public', 'assets', 'ending', f'bgB-{name}.png'), optimize=True)
    print(name, q.size)
