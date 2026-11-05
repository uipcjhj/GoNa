#!/usr/bin/env python3
"""
간식 아이템 원본 → 게임용 1:1 도트 이미지 변환기

공룡 캐릭터와 같은 방식(tools/build_dino_sheet.py)으로
원본 시트(art-src/baby-dino/original_character_sheet.png) 아래 줄의 간식을
도트 격자 복원 → 배경·잡티 제거 → 같은 크기 칸에 가운데 정렬해서 저장합니다.

출력: public/assets/snacks/strawberry.png, banana.png, cookie.png
      (모두 17×17, 원래 도트 크기 그대로 바닥 맞춤·가운데 정렬)

사용법:  pip install pillow numpy
        python3 tools/build_snack_sprites.py
"""
from pathlib import Path

import numpy as np
from PIL import Image

from build_dino_sheet import BG, SHADOW, SRC, clean, rebuild

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "public/assets/snacks"
PREVIEW = ROOT / "art-src/baby-dino/snack-preview.png"

# (파일 이름, 원본 영역 y0, y1, x0, x1)  — 원본 시트 맨 아래 줄
SNACKS = [
    ("strawberry", 796, 976, 123, 267),
    ("banana", 796, 976, 296, 447),
    ("cookie", 796, 976, 651, 784),
]

# 모든 간식을 같은 크기 칸에 넣어 스타일·크기를 통일.
# 줄이면 도트가 뭉개지므로 원래 크기 그대로 두고, 가장 큰 간식에 맞춘 칸을 씁니다.
SIZE = 17


def fit(sprite: np.ndarray) -> np.ndarray:
    """SIZE 칸 가운데·바닥에 원래 크기 그대로 배치"""
    h, w = sprite.shape[:2]
    assert max(h, w) <= SIZE, f"간식이 {SIZE}px 보다 큽니다 ({w}x{h}) — SIZE 를 키워 주세요"
    out = np.zeros((SIZE, SIZE, 4), np.uint8)
    ox = (SIZE - w) // 2
    oy = SIZE - h  # 바닥 맞춤 (게임에서 아이템 기준점이 아래쪽)
    out[oy:oy + h, ox:ox + w] = sprite
    return out


def main() -> None:
    img = np.array(Image.open(SRC).convert("RGB")).astype(int)
    fg = (np.abs(img - BG).sum(2) > 60) & (np.abs(img - SHADOW).sum(2) > 50)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    tiles = []
    for name, *box in SNACKS:
        raw = clean(rebuild(img, fg, box))
        tile = fit(raw)
        Image.fromarray(tile).save(OUT_DIR / f"{name}.png")
        tiles.append(tile)
        print(f"{name}: 복원 {raw.shape[1]}x{raw.shape[0]} -> {SIZE}x{SIZE}")

    prev = Image.new("RGBA", ((SIZE + 2) * len(tiles), SIZE), (120, 190, 220, 255))
    for i, t in enumerate(tiles):
        prev.alpha_composite(Image.fromarray(t), (i * (SIZE + 2), 0))
    prev.resize((prev.width * 10, prev.height * 10), Image.NEAREST).save(PREVIEW)


if __name__ == "__main__":
    main()
