#!/usr/bin/env python3
"""
최종 확정 캐릭터 시트(2차, 'Character Sprite Assets (Preview)') → 엔딩용 투명 프레임

원본: art-src/ending/sprite-sheet-v2/source-6x.png (받은 파일 7008x5280 = 1168x880 그림을 nearest 6배 확대한 것)
  → 6x6 칸 가운데 픽셀만 읽어 원래 1168x880 그대로 복원 (art-src/ending/sprite-sheet-v2/native.png). 새로 그리지 않음.
배경: 불투명 크림색 패널 → 프레임 칸 바깥에서 '진한 외곽선이 아닌 픽셀'을 채워 들어가 지움 (외곽선 안쪽 = 캐릭터만 남김).
      하트·느낌표처럼 외곽선 밖에 떨어진 장식도 함께 지워짐. 외곽선이 끊겨 안쪽까지 지워지면 그 프레임은 빼고 보고.
출력:
  art-src/ending/sprite-sheet-v2/frames/<인물>/<동작>_<번호>.png   — 320x384 RGBA (원본 1px = 4x4, 발은 바닥 기준선)
  public/assets/ending/chars/v2-<인물>.png · sp-<특수동작>.png · src/scenes/endingSpritesV2.ts — 게임용 원본 크기(1배) 가로 띠 + 프레임 표
  art-src/ending/sprite-sheet-v2/manifest.json · previews/*.gif · GONA_ending_assets.zip
사용법:  python3 tools/extract_ending_assets_v2.py
"""
import json
import zipfile
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
V2 = ROOT / "art-src/ending/sprite-sheet-v2"
SRC6 = V2 / "source-6x.png"
NATIVE = V2 / "native.png"
FRAMES = V2 / "frames"
PREV = V2 / "previews"
OUT = ROOT / "public/assets/ending/chars"
SCALE = 4
FW, FH = 320, 384
DARK = 300

# (x0, y0, x1, y1) — 복원한 1168x880 기준. 붙어 있는 덩어리는 split 으로 나눔
GONA = {
    "idle": [(105, 428, 150, 484), (150, 428, 195, 484)],
    "walk": [(206, 428, 251, 484), (249, 428, 360, 484, 3)],
    "run": [(373, 428, 418, 484), (415, 428, 459, 484), (457, 428, 500, 484), (499, 428, 542, 484), (539, 428, 584, 484)],
    "happy": [(594, 428, 637, 486), (635, 428, 677, 486), (674, 428, 718, 486)],
    "open_arms": [(729, 428, 774, 486), (773, 428, 817, 486), (817, 428, 862, 486)],
    "receive_kiss": [(874, 428, 920, 486), (919, 428, 964, 486), (964, 428, 1010, 486)],
    "tickle": [(1024, 428, 1070, 486), (1069, 428, 1114, 486), (1113, 428, 1160, 486)],
}
MOM = {
    "idle": [(104, 289, 154, 357), (153, 289, 202, 357)],
    "walk": [(218, 289, 304, 357, 2), (298, 289, 346, 357), (342, 289, 390, 357)],
    "happy": [(403, 289, 452, 357), (449, 289, 497, 357), (492, 289, 542, 357)],
    "wave": [(558, 289, 607, 357), (602, 289, 650, 357), (645, 289, 697, 357)],
    "open_arms": [(712, 289, 760, 357), (756, 289, 806, 357), (803, 289, 855, 357)],
    "hug": [(867, 289, 916, 357), (911, 289, 960, 357), (955, 289, 1004, 357), (999, 289, 1047, 357)],
    "smile": [(1060, 289, 1110, 357), (1104, 289, 1154, 357)],
}
SPECIAL = {
    "mom_hug": [(25, 562, 112, 640), (107, 562, 183, 640), (181, 562, 250, 640), (249, 562, 308, 640), (306, 562, 374, 640)],
    "grandma_kiss": [(405, 562, 487, 640), (483, 562, 556, 640), (554, 562, 620, 640), (618, 562, 686, 640), (685, 562, 757, 640)],
    "uncle_sniff": [(782, 560, 864, 640), (869, 560, 934, 640), (935, 560, 1001, 640), (998, 560, 1073, 640), (1071, 560, 1148, 640)],
}
FPS = {"idle": 2.5, "walk": 7, "run": 10, "happy": 5, "open_arms": 5, "receive_kiss": 4, "tickle": 6, "wave": 5, "hug": 4, "smile": 2,
       "mom_hug": 3, "grandma_kiss": 3, "uncle_sniff": 3}


def restore_native():
    big = np.asarray(Image.open(SRC6).convert("RGBA"))
    h, w = big.shape[0] // 6, big.shape[1] // 6
    blk = big[: h * 6, : w * 6].reshape(h, 6, w, 6, 4)
    assert (blk.max(axis=(1, 3)).astype(int) - blk.min(axis=(1, 3))).max() == 0, "6배 nearest 확대가 아님"
    nat = blk[:, 2, :, 2, :].copy()
    Image.fromarray(nat).save(NATIVE)
    return nat


def cut(nat, box):
    """칸 안에서 외곽선 밖(배경·장식)을 지우고 캐릭터만 남김. (그림, 실패 사유)"""
    x0, y0, x1, y1 = box[:4]
    reg = nat[y0:y1, x0:x1].astype(int)
    dk = reg[..., :3].sum(2) < DARK
    seed = np.zeros(dk.shape, bool)
    seed[0, :] = seed[-1, :] = seed[:, 0] = seed[:, -1] = True
    outside = ndimage.binary_propagation(seed & ~dk, mask=~dk, structure=ndimage.generate_binary_structure(2, 1))
    ch = ~outside
    lab, n = ndimage.label(ch, structure=np.ones((3, 3)))
    if n == 0:
        return None, "비어 있음"
    sizes = ndimage.sum(ch, lab, range(1, n + 1))
    keep = np.zeros_like(ch)
    for i, s in enumerate(sizes):
        if s >= sizes.max() * 0.08:  # 큰 덩어리(두 사람 그림은 둘 다)만, 떨어진 장식·숫자 조각은 버림
            keep |= lab == i + 1
    out = np.zeros(reg.shape, np.uint8)
    out[keep] = reg[keep]
    out[..., 3] = np.where(keep, 255, 0)
    ys, xs = np.nonzero(keep)
    out = out[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    # 외곽선이 끊겨 안쪽이 새면 속이 빈 윤곽만 남아 '진한 외곽선 픽셀' 비율이 크게 오름
    # (정상 프레임은 머리·옷이 진해도 0.65 이하, 속이 빈 프레임은 0.8 이상)
    dark_ratio = (out[..., :3].astype(int).sum(2)[out[..., 3] > 0] < DARK).mean()
    if dark_ratio > 0.75:
        return out, f"외곽선 끊김 — 안쪽이 지워짐 (외곽선 비율 {dark_ratio:.2f})"
    return out, None


def split(img, k):
    """옆으로 붙은 k 장을 세로 빈틈(불투명 픽셀이 가장 적은 열)으로 나눔"""
    col = (img[..., 3] > 0).sum(0)
    w = img.shape[1]
    cuts = []
    for i in range(1, k):
        c = int(w * i / k)
        lo, hi = max(1, c - 8), min(w - 1, c + 8)
        cuts.append(lo + int(np.argmin(col[lo:hi])))
    parts, prev = [], 0
    for c in cuts + [w]:
        p = img[:, prev:c]
        m = p[..., 3] > 0
        ys, xs = np.nonzero(m)
        parts.append(p[ys.min():ys.max() + 1, xs.min():xs.max() + 1])
        prev = c
    return parts


def to_frame(img):
    """320x384 투명 칸 · 원본 1px = 4x4 (nearest, 정수배) · 가운데 · 발은 바닥에서 8px 위"""
    big = np.repeat(np.repeat(img, SCALE, 0), SCALE, 1)
    h, w = big.shape[:2]
    if w > FW or h > FH:
        return None
    f = np.zeros((FH, FW, 4), np.uint8)
    x = (FW - w) // 2
    y = FH - 8 - h
    f[y:y + h, x:x + w] = big
    return f


def main():
    nat = restore_native()
    groups = {"gona": GONA, "mom": MOM}
    groups.update({k: {k: v} for k, v in SPECIAL.items()})
    manifest = {"source": "art-src/ending/sprite-sheet-v2/source-6x.png (1168x880 x6 nearest)", "frame_size": [FW, FH],
                "pixel_scale": SCALE, "anchor": "bottom-center (feet 8px above frame bottom)", "characters": {}}
    rejected, made = [], 0
    natives = {}
    for who, acts in groups.items():
        manifest["characters"][who] = {}
        for act, boxes in acts.items():
            imgs = []
            for box in boxes:
                img, err = cut(nat, box)
                if err:
                    rejected.append(f"{who}/{act}: {err}")
                    continue
                imgs += split(img, box[4]) if len(box) > 4 else [img]
            files = []
            for i, img in enumerate(imgs):
                fr = to_frame(img)
                if fr is None:
                    rejected.append(f"{who}/{act}_{i:02d}: 320x384 에 4배로 안 들어감")
                    continue
                d = FRAMES / who
                d.mkdir(parents=True, exist_ok=True)
                p = d / f"{act}_{i:02d}.png"
                Image.fromarray(fr).save(p)
                files.append(str(p.relative_to(V2)))
                natives.setdefault(who, []).append((act, img))
                made += 1
            manifest["characters"][who][act] = {"frames": files, "fps": FPS.get(act, 5)}
            # GIF 미리보기
            if files:
                PREV.mkdir(parents=True, exist_ok=True)
                ims = []
                for f in files:
                    im = Image.open(V2 / f).convert("RGBA")
                    bg = Image.new("RGBA", im.size, (58, 36, 72, 255))
                    bg.alpha_composite(im)
                    ims.append(bg.convert("P", palette=Image.ADAPTIVE))
                ims[0].save(PREV / f"{who}_{act}.gif", save_all=True, append_images=ims[1:], duration=int(1000 / FPS.get(act, 5)), loop=0)
    (V2 / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1))
    # 게임용 1배 띠 — 한 사람 동작: 얼굴(위 45%) 가운데 · 두 사람 특수 동작: 고나(오른쪽) 끝 맞춤 · 모두 발 바닥 맞춤
    table = {}
    for who, lst in natives.items():
        special = who in SPECIAL
        if special:
            refs = [img.shape[1] for _, img in lst]  # 오른쪽 끝
            cw = max(refs) + 1
            offs = [cw - 1 - img.shape[1] for _, img in lst]
        else:
            lefts = []
            for _, img in lst:
                top = img[: max(1, int(img.shape[0] * 0.45)), :, 3] > 0
                xs = np.nonzero(top)[1]
                lefts.append(xs.mean() if xs.size else img.shape[1] / 2)
            half = int(np.ceil(max(max(lefts), max(img.shape[1] - c for (_, img), c in zip(lst, lefts))))) + 1
            cw = half * 2
            offs = [int(round(half - c)) for c in lefts]
        chh = max(img.shape[0] for _, img in lst) + 1
        strip = np.zeros((chh, cw * len(lst), 4), np.uint8)
        anims = {}
        for n, ((act, img), ox) in enumerate(zip(lst, offs)):
            h, w = img.shape[:2]
            m = img[..., 3] > 0
            strip[chh - h:chh, n * cw + ox:n * cw + ox + w][m] = img[m]
            anims.setdefault(act, []).append(n)
        name = f"sp-{who}" if special else f"v2-{who}"
        Image.fromarray(strip).save(OUT / f"{name}.png", optimize=True)
        table[who] = {"file": name, "w": cw, "h": chh, "anims": anims}
    # 고나 칸 가운데 → 몸 왼쪽 끝 (기본 프레임)
    g = np.asarray(Image.open(OUT / "v2-gona.png"))
    gw = table["gona"]["w"]
    cell = g[:, :gw, 3] > 0
    gona_left = int(np.nonzero(cell.any(0))[0].min()) - gw // 2
    gona_right = int(np.nonzero(cell.any(0))[0].max()) - gw // 2
    lines = ["/** 자동 생성: tools/extract_ending_assets_v2.py — 최종 확정 시트(2차)에서 떼어 낸 고나·엄마·특수 동작 (원본 1배) */",
             "export const ENDING_SPRITES_V2 = {"]
    for who, t in table.items():
        anims = ", ".join(f"{k}: [{', '.join(map(str, v))}]" for k, v in t["anims"].items())
        lines.append(f"  {who}: {{ file: '{t['file']}', w: {t['w']}, h: {t['h']}, special: {str(who in SPECIAL).lower()}, anims: {{ {anims} }} }},")
    lines.append("} as const;")
    lines.append(f"/** 고나 기본 프레임: 칸 가운데에서 몸 왼쪽·오른쪽 끝 (px) */\nexport const GONA_V2_EDGE = [{gona_left}, {gona_right}] as const;")
    (ROOT / "src/scenes/endingSpritesV2.ts").write_text("\n".join(lines) + "\n")
    # ZIP
    with zipfile.ZipFile(V2 / "GONA_ending_assets.zip", "w", zipfile.ZIP_DEFLATED) as z:
        for p in sorted(FRAMES.rglob("*.png")) + sorted(PREV.glob("*.gif")) + [V2 / "manifest.json"]:
            z.write(p, p.relative_to(V2))
    print("PNG", made, "GIF", len(list(PREV.glob("*.gif"))))
    for r in rejected:
        print("제외:", r)


if __name__ == "__main__":
    main()
