#!/usr/bin/env python3
"""
최종 엔딩 캐릭터 시트(스타듀밸리풍 NPC, 3차) → 원래 도트 크기의 투명 스프라이트

원본: art-src/ending/sprite-sheet-v3/source.png (1536x1024, 흰 배경 · 도트 한 칸이 약 5~6px 로 키워진 도트 그림)
방법: 확대하지 않고 거꾸로 '원래 도트 격자'를 찾아 칸마다 한 색 (tools/build_dino_sheet.py 와 같은 방식)
      → 칸 바깥 흰 배경은 바깥에서부터 채워 투명 (안쪽 흰 셔츠는 외곽선에 둘러싸여 그대로) · 떨어진 하트·반짝이·글씨 버림
출력: art-src/ending/sprite-sheet-v3/frames/<인물>/<동작>_<번호>.png (원래 도트 크기 RGBA) · check.png
      public/assets/ending/chars/v3-<인물>.png (게임용 가로 띠, 발 기준선 맞춤) · src/scenes/endingSpritesV3.ts
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
V3 = ROOT / "art-src/ending/sprite-sheet-v3"
OUT = ROOT / "public/assets/ending/chars"
MIN_CELL, MAX_CELL, NOMINAL = 4, 8, 5.6


def find_boundaries(edge_count, n):
    e = np.convolve(edge_count.astype(float), [0.25, 0.5, 0.25], "same")
    thr = max(2.0, e.max() * 0.12)
    picked = []
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
            k = max(1, round(gap / NOMINAL))
            s = out[-1]
            out.extend(round(s + gap * t / k) for t in range(1, k))
        out.append(x)
    return out


def is_bg(c):
    return c.min(-1) >= 236  # 흰 배경 (흰 셔츠는 외곽선 안쪽이라 채우기에 안 닿음)


def is_bg_edge(c):
    """바깥 채우기용: 흰 배경 + 외곽선에 섞인 옅은 회백색 가장자리 (잔여 흰 점 제거)"""
    return (c.min(-1) >= 200) & ((c.max(-1).astype(int) - c.min(-1)) <= 40)


def rebuild(src, box):
    y0, x0, y1, x1 = box
    reg = src[y0:y1, x0:x1].astype(int)
    fg = ~is_bg(reg)
    dx = (np.abs(np.diff(reg, axis=1)).sum(2) > 60) & (fg[:, 1:] | fg[:, :-1])
    dy = (np.abs(np.diff(reg, axis=0)).sum(2) > 60) & (fg[1:, :] | fg[:-1, :])
    bx = find_boundaries(dx.sum(0), reg.shape[1])
    by = find_boundaries(dy.sum(1), reg.shape[0])
    H, W = len(by) - 1, len(bx) - 1
    out = np.zeros((H, W, 3), np.uint8)
    for j in range(H):
        for i in range(W):
            a, b, c, d = by[j], by[j + 1], bx[i], bx[i + 1]
            ia, ib = a + (b - a) // 4, max(a + (b - a) // 4 + 1, b - (b - a) // 4)
            ic, id_ = c + (d - c) // 4, max(c + (d - c) // 4 + 1, d - (d - c) // 4)
            px = reg[ia:ib, ic:id_].reshape(-1, 3)
            out[j, i] = np.median(px, axis=0)
    bg = is_bg_edge(out)
    seed = np.zeros(bg.shape, bool)
    seed[0, :] = seed[-1, :] = seed[:, 0] = seed[:, -1] = True
    outside = ndimage.binary_propagation(seed & bg, mask=bg, structure=ndimage.generate_binary_structure(2, 1))
    ch = ~outside
    lab, n = ndimage.label(ch, structure=np.ones((3, 3)))
    sizes = ndimage.sum(ch, lab, range(1, n + 1)) if n else []
    keep = np.zeros_like(ch)
    for i, s in enumerate(sizes):
        if s >= max(sizes) * 0.15:
            keep |= lab == i + 1
    rgba = np.zeros((H, W, 4), np.uint8)
    rgba[..., :3] = out
    rgba[..., 3] = keep * 255
    ys, xs = np.nonzero(keep)
    return rgba[ys.min():ys.max() + 1, xs.min():xs.max() + 1], (np.mean(np.diff(bx)), np.mean(np.diff(by)))


if __name__ == "__main__" and len(__import__("sys").argv) > 1:
    import sys
    src = np.asarray(Image.open(V3 / "source.png").convert("RGB"))
    box = tuple(map(int, sys.argv[1:5]))
    img, cell = rebuild(src, box)
    print(img.shape, cell)
    Image.fromarray(img).resize((img.shape[1] * 8, img.shape[0] * 8), Image.NEAREST).save(sys.argv[5])


# ── 전체 추출 (프레임 위치: 원본 1536x1024 기준 y0, x0, y1, x1 — 이름표 아래·위는 빼고 캐릭터만)
FRAMES = {
    "imo": {"idle": [(30, 39, 240, 160)]},
    "samchon": {"idle": [(16, 184, 240, 302)]},
    "mom": {"idle": [(30, 310, 240, 438)],
            "walk": [(391, 21, 511, 98), (390, 112, 510, 187), (391, 200, 510, 275), (391, 289, 511, 363)],
            "happy": [(390, 419, 510, 502), (390, 504, 510, 618), (390, 630, 510, 723)],
            "wave": [(390, 796, 510, 877), (389, 900, 510, 989), (390, 1002, 510, 1087)],
            "open_arms": [(390, 1172, 510, 1261), (390, 1284, 510, 1384), (390, 1409, 510, 1507)]},
    "dad": {"idle": [(10, 461, 240, 577)]},
    "halmeoni": {"idle": [(35, 589, 240, 722)]},
    "halabeoji": {"idle": [(21, 738, 240, 854)]},
    # 고나: 성장 단계 그림 하나씩 (동작 프레임 없음) — 'idle' = 4단계
    "gona": {"s1": [(116, 915, 224, 1028)], "s2": [(98, 1058, 224, 1163)], "s3": [(65, 1201, 224, 1314)], "idle": [(29, 1354, 224, 1484)]},
    "mom_hug": {"mom_hug": [(609, 7, 721, 88), (617, 99, 721, 173), (608, 192, 721, 283), (597, 290, 721, 373), (606, 387, 721, 473)]},
    "grandma_kiss": {"grandma_kiss": [(608, 506, 721, 586), (620, 607, 721, 700), (613, 710, 721, 786), (609, 797, 721, 897), (608, 902, 721, 989)]},
    "uncle_sniff": {"uncle_sniff": [(602, 1016, 721, 1116), (622, 1126, 721, 1221), (623, 1233, 721, 1335), (607, 1344, 721, 1446), (598, 1446, 721, 1519)]},
}
SPECIAL = {"mom_hug", "grandma_kiss", "uncle_sniff"}


def extract_all():
    src = np.asarray(Image.open(V3 / "source.png").convert("RGB"))
    table, checks, cells = {}, [], []
    for who, acts in FRAMES.items():
        lst = []
        for act, boxes in acts.items():
            for k, box in enumerate(boxes):
                img, cell = rebuild(src, box)
                cells.append(cell)
                d = V3 / "frames" / who
                d.mkdir(parents=True, exist_ok=True)
                Image.fromarray(img).save(d / f"{act}_{k:02d}.png")
                lst.append((act, img))
                checks.append((who, act, k, box, img))
        # 띠: 발(맨 아래) 맞춤 · 한 사람 = 가운데 정렬 · 두 사람(특수) = 오른쪽 끝 정렬
        cw = max(i.shape[1] for _, i in lst) + 2
        chh = max(i.shape[0] for _, i in lst) + 1
        strip = np.zeros((chh, cw * len(lst), 4), np.uint8)
        anims = {}
        for n, (act, img) in enumerate(lst):
            h, w = img.shape[:2]
            ox = (cw - 1 - w) if who in SPECIAL else (cw - w) // 2
            m = img[..., 3] > 0
            strip[chh - h:chh, n * cw + ox:n * cw + ox + w][m] = img[m]
            anims.setdefault(act, []).append(n)
        Image.fromarray(strip).save(OUT / f"v3-{who}.png", optimize=True)
        table[who] = {"file": f"v3-{who}", "w": cw, "h": chh, "anims": anims, "special": who in SPECIAL}
    lines = ["/** 자동 생성: tools/extract_ending_npc.py — 최종 엔딩 캐릭터 시트(3차, 스타듀밸리풍 NPC)에서 원래 도트 크기로 복원 */",
             "export const ENDING_V3 = {"]
    for who, t in table.items():
        an = ", ".join(f"{k}: [{', '.join(map(str, v))}]" for k, v in t["anims"].items())
        lines.append(f"  {who}: {{ file: '{t['file']}', w: {t['w']}, h: {t['h']}, special: {str(t['special']).lower()}, anims: {{ {an} }} }},")
    lines.append("} as const;")
    (ROOT / "src/scenes/endingSpritesV3.ts").write_text("\n".join(lines) + "\n")
    # 검수: 원본 칸(배경 포함) ↔ 복원 도트 (같은 높이)
    H = 140
    tiles = []
    for who, act, k, (y0, x0, y1, x1), img in checks:
        o = Image.fromarray(src[y0:y1, x0:x1])
        o = o.resize((int(o.width * H / o.height), H), Image.NEAREST)
        r = Image.fromarray(img)
        r = r.resize((r.width * (H // r.height), r.height * (H // r.height)), Image.NEAREST)
        t = Image.new("RGBA", (o.width + r.width + 6, H), (58, 36, 72, 255))
        t.paste(o, (0, 0))
        t.alpha_composite(r, (o.width + 6, H - r.height))
        tiles.append(t)
    cols = 8
    rows = (len(tiles) + cols - 1) // cols
    cw = max(t.width for t in tiles) + 8
    sheet = Image.new("RGBA", (cols * cw, rows * (H + 8)), (30, 20, 40, 255))
    for i, t in enumerate(tiles):
        sheet.alpha_composite(t, ((i % cols) * cw, (i // cols) * (H + 8)))
    sheet.save(V3 / "check.png", optimize=True)
    c = np.array(cells)
    print("프레임", len(checks), "· 복원 도트 크기(원본 px) 평균", c.mean(0).round(2), "범위", c.min(0).round(2), c.max(0).round(2))
    for who, t in table.items():
        print(who, t["w"], t["h"], {k: len(v) for k, v in t["anims"].items()})


if __name__ == "__main__" and len(__import__("sys").argv) == 1:
    extract_all()
