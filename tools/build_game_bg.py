#!/usr/bin/env python3
"""
게임 플레이 배경(16:9 한 장) → 끊김 없이 반복되는 가로 스크롤 이미지

원본: art-src/game-bg/gona-background-original.png (640x360)
출력: public/assets/game/game-bg-loop.png (1280x360) = [원본][좌우 반전한 원본]

원본의 왼쪽 끝과 오른쪽 끝은 그림이 달라서 그대로 이어 붙이면 경계선이 보입니다.
원본 옆에 좌우 반전본을 붙이면 두 이음매(가운데, 그리고 반복될 때 끝→처음)가
같은 픽셀 열끼리 만나므로 경계선이 생기지 않습니다.
픽셀을 섞거나 다시 그리지 않으므로 버섯·동굴·폭포·나무 등 디자인은 그대로입니다.

사용법:  pip install pillow
        python3 tools/build_game_bg.py
"""
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "art-src/game-bg/gona-background-original.png"
OUT = ROOT / "public/assets/game/game-bg-loop.png"


def main() -> None:
    src = Image.open(SRC).convert("RGB")
    w, h = src.size
    loop = Image.new("RGB", (w * 2, h))
    loop.paste(src, (0, 0))
    loop.paste(ImageOps.mirror(src), (w, 0))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    loop.save(OUT, optimize=True)

    # 이음매 검사: 맞닿는 두 열이 완전히 같은지
    px = loop.load()
    seams = [(w - 1, w), (w * 2 - 1, 0)]
    for a, b in seams:
        diff = sum(sum(abs(p - q) for p, q in zip(px[a, y], px[b, y])) for y in range(h))
        print(f"seam {a}|{b}: diff {diff}")
        assert diff == 0, "이음매가 맞지 않습니다"
    print(f"{SRC.name} {w}x{h} -> {OUT.relative_to(ROOT)} {w * 2}x{h}")


if __name__ == "__main__":
    main()
