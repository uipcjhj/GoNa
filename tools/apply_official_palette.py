#!/usr/bin/env python3
"""
3단계(직립보행) 고나 시트 public/assets/character/dino.png 의 '초록 공룡옷' 색을 공식 팔레트로 맞춤.

  공식 기준: art-src/growth/gona-official-palette.png → art-src/growth/gona-official-palette.json
  (1·2·4단계 시트는 공식 시트에서 직접 잘라 만들어 이미 공식 색 그대로)

  - 바꾸는 것: 초록 계열 픽셀만, 원래 명암 순서대로 공식 초록 4단계로 (필터 아님 — 정해진 색값으로 교체)
  - 그대로: 얼굴(피부)·배·등뿔(노랑)·머리카락(갈색)·외곽선·볼터치

사용법: python3 tools/build_dino_sheet.py 뒤에 python3 tools/apply_official_palette.py  (build_dino_sheet.py 가 자동으로 부름)
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SHEET = ROOT / "public/assets/character/dino.png"
PALETTE = json.loads((ROOT / "art-src/growth/gona-official-palette.json").read_text())


def hexrgb(c):
    return [int(c[i : i + 2], 16) for i in (1, 3, 5)]


def apply(path=SHEET, preview=None):
    im = np.array(Image.open(path).convert("RGBA"))
    rgb = im[..., :3].astype(float) / 255
    mx = rgb.max(-1)
    mn = rgb.min(-1)
    s = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    hue = np.degrees(np.arctan2(np.sqrt(3) * (g - b), 2 * r - g - b)) % 360
    green = (im[..., 3] > 0) & (hue >= 58) & (hue <= 150) & (s > 0.15) & (mx > 0.35)
    lum = (rgb @ [0.3, 0.59, 0.11])[green]
    # 공식 시트의 초록 4단계 비율 (그늘 22% · 반그늘 16% · 기본 54% · 하이라이트 8%)
    qs = np.quantile(lum, [0.22, 0.38, 0.92])
    idx = np.searchsorted(qs, lum)
    cols = np.array([hexrgb(c) for c in PALETTE["green"]], np.uint8)
    before = im.copy()
    im[..., :3][green] = cols[idx]
    Image.fromarray(im).save(path)
    print(f"{path.relative_to(ROOT)}: 초록 픽셀 {int(green.sum())}개를 공식 초록 {PALETTE['green']} 로")
    if preview:
        h = before.shape[0]
        w = min(before.shape[1], 33 * 6)
        canvas = Image.new("RGBA", (w, h * 2 + 2), (255, 250, 240, 255))
        canvas.paste(Image.fromarray(before[:, :w]), (0, 0), Image.fromarray(before[:, :w]))
        canvas.paste(Image.fromarray(im[:, :w]), (0, h + 2), Image.fromarray(im[:, :w]))
        canvas.resize((w * 4, (h * 2 + 2) * 4), Image.NEAREST).save(preview)


if __name__ == "__main__":
    apply(preview=sys.argv[1] if len(sys.argv) > 1 else None)
