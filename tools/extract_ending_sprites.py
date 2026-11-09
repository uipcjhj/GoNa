#!/usr/bin/env python3
"""
엔딩 캐릭터 스프라이트 시트(최종 확정 시안) → 캐릭터·동작별 투명 PNG 프레임 + 게임용 가로 띠(strip)

원본: art-src/ending/sprite-sheet/ending-characters-sheet.webp
      (1125x750, 투명 배경 · 고나 + 가족 6명 · 동작별 프레임 · 아래쪽 공통 이펙트)
출력:
  art-src/ending/sprite-sheet/frames/<인물>/<동작>-<번호>.png   ← 프레임마다 독립 투명 PNG (잘라 낸 그대로)
  public/assets/ending/chars/<인물>.png                      ← 게임용 가로 띠 (모든 프레임 같은 칸 크기,
                                                                   발은 같은 바닥줄, 얼굴은 칸 가운데)
  public/assets/ending/chars/fx-<이름>.png                   ← 공통 이펙트 (하트·킁카 물결·반짝이·꽃 등)
  src/scenes/endingSprites.ts                                ← 띠 안의 프레임 번호 표 (자동 생성)
  art-src/ending/sprite-sheet/extract-check.png              ← 검수용: 원본 칸 ↔ 잘라 낸 프레임 나란히

원칙: 새로 그리거나 고쳐 그리지 않음. 시트에 이미 투명 배경이 있어 사각형으로 자르지 않고
      불투명 픽셀 덩어리(연결 요소)째 떼어 냄 → 설명 글씨(크림색 이름표)·다른 인물·이펙트가 섞이지 않음.
      반투명 가장자리만 정리(알파 120 기준으로 켜기/끄기) — 도트처럼 또렷하게, 색은 그대로.

사용법:  python3 tools/extract_ending_sprites.py
"""
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "art-src/ending/sprite-sheet/ending-characters-sheet.webp"
FRAMES = ROOT / "art-src/ending/sprite-sheet/frames"
OUT = ROOT / "public/assets/ending/chars"
TS = ROOT / "src/scenes/endingSprites.ts"
CHECK = ROOT / "art-src/ending/sprite-sheet/extract-check.png"

ALPHA_CUT = 120

# 줄(인물) — 원본 시트의 세로 범위
ROWS = {
    "gona": (30, 95),
    "imo": (118, 192),
    "samchon": (210, 288),
    "mom": (306, 380),
    "dad": (396, 468),
    "halmeoni": (488, 558),
    "halabeoji": (578, 658),
}
# 동작(열) — 시트 위 이름표의 가로 범위 (고나 줄과 가족 줄이 다름)
GONA_COLS = [
    ("idle", 2, 135, 235), ("walk", 4, 240, 410), ("run", 4, 420, 590), ("happy", 3, 590, 728),
    ("wow", 3, 732, 870), ("sit", 2, 875, 970), ("held", 3, 978, 1115),
]
FAMILY_COLS = {
    "default": [("idle", 2, 135, 245), ("walk", 4, 255, 440), ("happy", 3, 445, 595), ("talk", 3, 600, 760),
                ("wave", 3, 765, 930), ("hug", 3, 935, 1115)],
}
# 다섯째 열은 인물마다 동작이 다름 · 여섯째 열도 삼촌은 킁카
COL5 = {"mom": "clap", "halmeoni": "kiss"}
COL6 = {"samchon": "sniff"}

# 공통 이펙트 (맨 아래 줄) — 이름: 가로 범위
FX = {
    "joy": (196, 240), "question": (250, 276), "note": (328, 356), "heart": (366, 401),
    "hearts": (408, 438), "sniff": (444, 470), "puff": (476, 512), "star": (520, 549), "flower": (554, 587),
}
FX_ROW = (668, 742)


def load():
    a = np.asarray(Image.open(SRC).convert("RGBA")).copy()
    return a


def blobs(a, y0, y1, x0, x1, min_area):
    """범위 안의 불투명 덩어리들 (8방향 연결) — (bbox, 마스크)"""
    sub = a[y0:y1, x0:x1]
    m = sub[..., 3] > 60
    lab, n = ndimage.label(m, structure=np.ones((3, 3)))
    out = []
    for i, sl in enumerate(ndimage.find_objects(lab)):
        mm = lab[sl] == i + 1
        if mm.sum() < min_area:
            continue
        px = sub[sl][mm][:, :3].astype(int)
        cream = ((px[:, 0] > 225) & (px[:, 1] > 205) & (px[:, 2] > 180)).mean()
        if cream > 0.3:  # 이름표(크림색 알약)
            continue
        out.append(((sl[0].start + y0, sl[0].stop + y0, sl[1].start + x0, sl[1].stop + x0), (lab == i + 1)))
    return out, (y0, x0)


def cut(a, box, mask, origin):
    """덩어리 하나만 투명 PNG 로 (같은 칸의 다른 덩어리·글씨는 지움) + 가장자리 알파 정리"""
    y0, y1, x0, x1 = box
    oy, ox = origin
    m = mask[y0 - oy:y1 - oy, x0 - ox:x1 - ox]
    img = a[y0:y1, x0:x1].copy()
    img[~m] = 0
    al = img[..., 3]
    img[..., 3] = np.where(al >= ALPHA_CUT, 255, 0)
    img[img[..., 3] == 0] = 0
    return img


def face_cx(img):
    """얼굴(위쪽 45%)의 가로 무게중심 — 프레임을 칸 가운데 맞출 기준"""
    h = img.shape[0]
    top = img[: max(1, int(h * 0.45)), :, 3] > 0
    xs = np.nonzero(top)[1]
    return float(xs.mean()) if xs.size else img.shape[1] / 2


def main():
    a = load()
    FRAMES.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    table = {}
    problems = []
    checks = []
    for who, (ry0, ry1) in ROWS.items():
        cols = GONA_COLS if who == "gona" else [
            (COL5.get(who, n) if i == 4 else COL6.get(who, n) if i == 5 else n, k, c0, c1)
            for i, (n, k, c0, c1) in enumerate(FAMILY_COLS["default"])
        ]
        frames = []  # (action, idx, img)
        for action, count, c0, c1 in cols:
            bl, origin = blobs(a, ry0, ry1, c0, c1, 600)
            bl.sort(key=lambda b: b[0][2])
            if len(bl) != count:
                problems.append(f"{who} {action}: 프레임 {len(bl)}개 (시트 표기 {count}개)")
            for i, (box, mask) in enumerate(bl):
                img = cut(a, box, mask, origin)
                d = FRAMES / who
                d.mkdir(parents=True, exist_ok=True)
                Image.fromarray(img).save(d / f"{action}-{i}.png")
                frames.append((action, i, img, box))
        # 칸 크기 통일: 얼굴 중심을 칸 가운데, 발(맨 아래 불투명 줄)을 칸 바닥에
        hs = [f[2].shape[0] for f in frames]
        lefts = [face_cx(f[2]) for f in frames]
        rights = [f[2].shape[1] - c for f, c in zip(frames, lefts)]
        half = int(np.ceil(max(max(lefts), max(rights)))) + 1
        cw, chh = half * 2, max(hs) + 1
        strip = np.zeros((chh, cw * len(frames), 4), np.uint8)
        idx = {}
        for n, ((action, i, img, box), cx) in enumerate(zip(frames, lefts)):
            h, w = img.shape[:2]
            x = n * cw + int(round(half - cx))
            y = chh - h
            region = strip[y:y + h, x:x + w]
            m = img[..., 3] > 0
            region[m] = img[m]
            idx.setdefault(action, []).append(n)
            checks.append((who, action, i, box, img))
        Image.fromarray(strip).save(OUT / f"{who}.png", optimize=True)
        table[who] = {"w": cw, "h": chh, "anims": idx}
        print(f"{who}: {len(frames)} 프레임, 칸 {cw}x{chh}")
    # 이펙트
    fx_names = []
    for name, (x0, x1) in FX.items():
        y0, y1 = FX_ROW
        sub = a[y0:y1, x0:x1].copy()
        m = sub[..., 3] > 60
        if not m.any():
            problems.append(f"이펙트 {name}: 비어 있음")
            continue
        ys, xs = np.nonzero(m)
        img = sub[ys.min():ys.max() + 1, xs.min():xs.max() + 1].copy()
        px = img[img[..., 3] > 60][:, :3].astype(int)
        if ((px[:, 0] > 225) & (px[:, 1] > 205) & (px[:, 2] > 180)).mean() > 0.6 and name != "puff":
            problems.append(f"이펙트 {name}: 이름표와 섞임")
        img[..., 3] = np.where(img[..., 3] >= ALPHA_CUT, 255, 0)
        img[img[..., 3] == 0] = 0
        Image.fromarray(img).save(OUT / f"fx-{name}.png", optimize=True)
        (FRAMES / "fx").mkdir(parents=True, exist_ok=True)
        Image.fromarray(img).save(FRAMES / "fx" / f"{name}.png")
        fx_names.append(name)
    # 프레임 번호 표 (TS)
    lines = [
        "/** 자동 생성: tools/extract_ending_sprites.py — 엔딩 캐릭터 가로 띠(public/assets/ending/chars/<인물>.png)의 칸 크기와 동작별 프레임 번호 */",
        "export const ENDING_SPRITES = {",
    ]
    for who, t in table.items():
        anims = ", ".join(f"{k}: [{', '.join(map(str, v))}]" for k, v in t["anims"].items())
        lines.append(f"  {who}: {{ w: {t['w']}, h: {t['h']}, anims: {{ {anims} }} }},")
    lines.append("} as const;")
    lines.append(f"export const ENDING_FX = [{', '.join(repr(n) for n in fx_names)}] as const;")
    lines.append("export type EndingCharId = keyof typeof ENDING_SPRITES;")
    TS.write_text("\n".join(lines).replace("'", "'") + "\n")
    # 검수 그림: 원본 칸(배경 포함 그대로) ↔ 잘라 낸 프레임 (4배 확대)
    S = 4
    cell = 70
    per_row = 23
    rowsn = (len(checks) + per_row - 1) // per_row
    sheet = Image.new("RGBA", (per_row * cell * S // 2 * 2, rowsn * cell * S), (58, 36, 72, 255))
    for n, (who, action, i, box, img) in enumerate(checks):
        y0, y1, x0, x1 = box
        orig = Image.fromarray(a[y0:y1, x0:x1])
        bgc = Image.new("RGBA", orig.size, (58, 36, 72, 255))
        bgc.alpha_composite(orig)
        cx, cy = (n % per_row) * cell * S // 2 * 2, (n // per_row) * cell * S
        sheet.alpha_composite(bgc.resize((orig.width * 2, orig.height * 2), Image.NEAREST), (cx + 4, cy + 4))
        sheet.alpha_composite(Image.fromarray(img).resize((img.shape[1] * 2, img.shape[0] * 2), Image.NEAREST), (cx + 4, cy + 4 + orig.height * 2 + 4))
    sheet.save(CHECK, optimize=True)
    if problems:
        print("확인 필요:")
        for p in problems:
            print("  -", p)
    else:
        print("모든 칸의 프레임 수가 시트 표기와 같음")


if __name__ == "__main__":
    main()
