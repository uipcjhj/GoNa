#!/usr/bin/env python3
"""엔딩 컷신 배경 (B스타일 — 해 질 녘 버섯마을): art-src/ending/bgB-{land,port}-original.png (이미지 생성 · 텍스트 설명만 사용, 인물 없음)
→ 게임 도트 격자(가로 320x180 · 세로 180x320)로 줄이고 → 차분한 빈티지 색보정 → 44색으로 정리
→ public/assets/ending/bgB-{land,port}.png

빈티지 색보정 (보랏빛 노을·분홍 하늘·버섯집·따뜻한 불빛은 그대로, 조금 더 차분하게):
  - 채도 약간 낮춤 (×0.9)
  - 가장 어두운 곳은 짙은 보라로 살짝 띄우고(검정 → 보라), 가장 밝은 곳은 따뜻한 크림색으로 살짝 누름 → 대비가 부드러워짐
  - 색 수를 48 → 44 로 줄여 명암 단계를 가족·고나 도트와 비슷하게
"""
from PIL import Image, ImageEnhance
import numpy as np
import os

ROOT = os.path.join(os.path.dirname(__file__), '..')
SHADOW = np.array([42, 26, 58], float)   # 짙은 보라 (#2a1a3a — 엔딩 카메라 배경색과 같음)
HIGHLIGHT = np.array([255, 236, 206], float)  # 따뜻한 크림


def vintage(im: Image.Image) -> Image.Image:
    im = ImageEnhance.Color(im).enhance(0.9)
    a = np.asarray(im).astype(float) / 255.0
    lum = (a * [0.299, 0.587, 0.114]).sum(2, keepdims=True)
    # 어두운 쪽은 보라로 8% 섞고, 밝은 쪽은 크림으로 5% 섞음 (중간 톤은 거의 그대로)
    sh = np.clip(1 - lum * 2.2, 0, 1) * 0.08
    hi = np.clip((lum - 0.62) * 2.6, 0, 1) * 0.05
    out = a * (1 - sh - hi) + SHADOW / 255 * sh + HIGHLIGHT / 255 * hi
    return Image.fromarray(np.clip(out * 255 + 0.5, 0, 255).astype(np.uint8))


for name, size in (('land', (320, 180)), ('port', (180, 320))):
    im = Image.open(os.path.join(ROOT, 'art-src', 'ending', f'bgB-{name}-original.png')).convert('RGB')
    small = vintage(im.resize(size, Image.LANCZOS))
    q = small.quantize(colors=44, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert('RGB')
    q.save(os.path.join(ROOT, 'public', 'assets', 'ending', f'bgB-{name}.png'), optimize=True)
    print(name, q.size)
