#!/usr/bin/env python3
"""
엔딩 가족 원본 그림 → 게임과 같은 도트 밀도의 1:1 도트 스프라이트

원본: art-src/ending/fam-<id>.png  (확정 디자인 시트에서 배경만 투명하게 잘라 낸 그림 — tools/extract_family_sheet.py, 그대로 둠)
출력: public/assets/ending/fam-<id>-px.png  (원본 도트 한 칸 = 1px)
비교: art-src/ending/family-pixel-compare.png (원본 · 변환본을 같은 크기로 나란히)

원본 그림은 외곽선이 약 6px 도트 계단으로 그려진 '도트풍 일러스트'라서, 화면에 1/6 배율로 줄여 그리면
도트 한 칸 안의 부드러운 선·그라데이션이 그대로 남아 배경·고나(1도트 = 1칸)보다 해상도가 높아 보였음.
→ 고나 성장 스프라이트를 만든 방식(tools/build_dino_sheet.py)과 같은 방법으로 그림 자체의 도트 경계를 찾아
  칸 하나 = 도트 하나로 다시 샘플링 (새로 그리지 않음, 위치를 옮기거나 모양을 고치지 않음).
  - 칸 안에 진한 선(외곽선·눈·눈썹)이 조금이라도 크게 지나가면 그 선 색을 우선 → 1도트 선으로 보존
  - 입·볼터치 같은 붉은 색도 우선 보존
  - 나머지는 칸 가운데 색의 중앙값
  - 마지막에 인물마다 색 수를 조금 줄여(명암 단계 정리) 게임 도트처럼 또렷하게

사용법:  python3 tools/pixelize_family.py
"""
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "art-src/ending"
OUT = ROOT / "public/assets/ending"
CMP = ROOT / "art-src/ending/family-pixel-compare.png"
IDS = ["imo", "samchon", "mom", "dad", "halmeoni", "halabeoji"]

MIN_CELL, MAX_CELL, NOMINAL_CELL = 5, 8, 6.0
# 칸 크기: 원본 도트(약 6px)의 절반 = 3px → 얼굴(눈·입·안경)의 세부가 남는 가장 거친 크기
CELL = 3
DARK_SHARE = 0.34
COLORS = 40


def find_boundaries(edge_count: np.ndarray, n: int) -> list[int]:
    """색이 바뀌는 선이 많이 모이는 위치 = 도트 경계 (넓게 비면 평균 도트 크기로 나눔)"""
    e = np.convolve(edge_count.astype(float), [0.25, 0.5, 0.25], "same")
    thr = max(2.0, e.max() * 0.1)
    picked: list[int] = []
    for i in np.argsort(-e):
        if e[i] < thr:
            break
        if all(abs(int(i) - p) >= MIN_CELL for p in picked):
            picked.append(int(i))
    cuts = [0] + sorted(p + 1 for p in picked if 0 < p + 1 < n) + [n]
    out = [cuts[0]]
    for x in cuts[1:]:
        gap = x - out[-1]
        if gap > MAX_CELL:
            k = max(1, round(gap / NOMINAL_CELL))
            start = out[-1]
            out.extend(round(start + gap * t / k) for t in range(1, k))
        out.append(x)
    return out


def is_dark(px: np.ndarray) -> np.ndarray:
    return px.sum(1) < 300


def is_red(px: np.ndarray) -> np.ndarray:
    r, g, b = px[:, 0], px[:, 1], px[:, 2]
    return (r > 140) & (g < 95) & (r - g > 90) & (b < 90)


FEATURE: list[tuple[int, int]] = []


def pixelize(rgba: np.ndarray, cell: int) -> np.ndarray:
    FEATURE.clear()
    rgb = rgba[..., :3].astype(int)
    fg = rgba[..., 3] > 127
    if cell >= 5:
        dx = (np.abs(np.diff(rgb, axis=1)).sum(2) > 70) & (fg[:, 1:] | fg[:, :-1])
        dy = (np.abs(np.diff(rgb, axis=0)).sum(2) > 70) & (fg[1:, :] | fg[:-1, :])
        bx = find_boundaries(dx.sum(0), rgb.shape[1])
        by = find_boundaries(dy.sum(1), rgb.shape[0])
    else:
        # 반 도트: 바닥(발)에서 위로, 가운데에서 양옆으로 맞춘 고른 격자
        h, w = fg.shape
        by = list(range(h % cell, h + 1, cell))
        if by[0] != 0:
            by = [0] + by
        bx = list(range((w % cell) // 2, w + 1, cell))
        if bx[0] != 0:
            bx = [0] + bx
    out = np.zeros((len(by) - 1, len(bx) - 1, 4), np.uint8)
    for j in range(len(by) - 1):
        for i in range(len(bx) - 1):
            a, b, c, d = by[j], by[j + 1], bx[i], bx[i + 1]
            m = fg[a:b, c:d]
            if m.size == 0 or m.mean() < 0.5 or (b - a) < cell * 0.6 or (d - c) < cell * 0.6:
                continue
            px = rgb[a:b, c:d][m]
            dark = is_dark(px)
            red = is_red(px)
            if dark.mean() >= 0.5:  # 확실한 외곽선 (입 테두리 포함)
                col = np.median(px[dark], axis=0)
            elif red.mean() >= 0.2:  # 입 (진한 테두리보다 먼저 — 작은 입이 갈색으로 묻히지 않게)
                col = np.median(px[red], axis=0)
                FEATURE.append((j, i))
            elif dark.mean() >= DARK_SHARE:  # 외곽선·눈·눈썹
                col = np.median(px[dark], axis=0)
            else:
                # 칸 가장자리(이웃 도트와 섞인 부분)를 빼고 가운데 색
                core = px
                light = core[~is_dark(core)] if (~is_dark(core)).any() else core
                col = np.median(light, axis=0)
            out[j, i, :3] = col
            out[j, i, 3] = 255
    return out


def reduce_colors(o: np.ndarray, n: int) -> np.ndarray:
    solid = o[..., 3] > 0
    img = Image.fromarray(o[..., :3])
    q = img.quantize(colors=n, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert("RGB")
    res = o.copy()
    res[..., :3] = np.asarray(q)
    res[~solid] = 0
    return res


def main() -> None:
    tiles = []
    for id_ in IDS:
        src = np.asarray(Image.open(SRC / f"fam-{id_}.png").convert("RGBA"))
        raw = pixelize(src, CELL)
        px = reduce_colors(raw, COLORS)
        for j, i in FEATURE:  # 입 색은 색 줄이기에서 빼고 그대로
            px[j, i] = raw[j, i]
        Image.fromarray(px).save(OUT / f"fam-{id_}-px.png")
        print(f"{id_}: {src.shape[1]}x{src.shape[0]} → {px.shape[1]}x{px.shape[0]} 도트")
        h = 360
        a = Image.fromarray(src).resize((round(src.shape[1] * h / src.shape[0]), h), Image.LANCZOS)
        b = Image.fromarray(px).resize((round(px.shape[1] * h / px.shape[0]), h), Image.NEAREST)
        tiles.append((a, b))
    W = sum(a.width + b.width + 24 for a, b in tiles) + 16
    sheet = Image.new("RGBA", (W, 400), (58, 36, 72, 255))
    x = 8
    for a, b in tiles:
        sheet.alpha_composite(a, (x, 20))
        sheet.alpha_composite(b, (x + a.width + 4, 20))
        x += a.width + b.width + 24
    CMP.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(CMP)


if __name__ == "__main__":
    main()
