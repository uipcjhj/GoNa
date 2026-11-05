#!/usr/bin/env python3
"""
성장 단계 컨셉 시트 → 게임용 1:1 도트 스프라이트 시트

원본: art-src/growth/gona-growth-concepts.png (성장 단계별 컨셉 이미지)
출력: public/assets/character/stages/{newborn,crawler,bigbaby}.png
      (3단계 직립보행은 기존 dino.png 의 달리기 프레임을 그대로 사용)

변환 순서 (tools/build_dino_sheet.py 와 같은 방식):
  1. 잘라낸 영역 전체에서 실제 도트 경계선을 찾아 불규칙한 격자를 복원
     (아기 피부색이 배경 크림색과 거의 같아 색으로 배경을 나누지 않음)
  2. 격자 칸 하나 = 도트 하나 (눈·외곽선 같은 작은 진한 도트 우선 보존)
  3. 발밑 잔디 받침·꽃·반짝이·속도선·'!!'·zzz 제거:
     캐릭터는 진한 외곽선으로 둘러싸여 있으므로, 바깥에서부터 '외곽선이 아닌 픽셀'을 채워 들어가
     닿는 것(배경·잔디·장식)을 지우고, 외곽선 안쪽(캐릭터)만 남김
  4. 단계별로 프레임을 같은 칸에 넣고 발은 바닥에, 얼굴(피부)은 가운데에 맞춤
  5. 눈 검사: 눈 뜬 포즈는 작은 검은 눈 2개가 있어야 함 (없으면 변환 실패)

사용법:  pip install pillow numpy
        python3 tools/build_growth_sprites.py
"""
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

from build_dino_sheet import count_eyes, is_skin, make_blink, normalize_face, rebuild

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "art-src/growth/gona-growth-concepts.png"
OUT_DIR = ROOT / "public/assets/character/stages"
PREVIEW = ROOT / "art-src/growth/growth-sheet-preview.png"

BGS = [np.array([254, 236, 209]), np.array([245, 214, 168]), np.array([250, 230, 200])]

# 단계별 기준 포즈 (컨셉 시트 위쪽의 큰 그림): (x0, y0, x1, y1)
# 컨셉 시트 아래쪽 변형 포즈들은 더 작게 그려져 있어 그대로 쓰면 도트 크기가 달라지므로,
# 기준 포즈 하나에서 도트를 '옮기기만' 해서 애니메이션 프레임을 만듭니다 (새로 그리지 않음).
STAGES = {
    "newborn": (50, 440, 295, 615),    # 엎드린 갓난아기
    "crawler": (342, 380, 602, 618),   # 네 발로 기는 고나
    "bigbaby": (962, 245, 1398, 618),  # 빅베이비 곤룡 (주먹 쥐고 선 모습)
}

# 기어가기: 아래 다리 줄 (마지막 몇 줄)에서 뒷다리/앞다리 x 범위 (기준 포즈 좌표)
CRAWL_LEGS = {"rows": 3, "back": (0, 14), "front": (14, 27)}
# 빅베이비 걸음: 아래 발 줄에서 왼발/오른발 x 범위
BIG_FEET = {"rows": 6, "left": (10, 27), "right": (28, 45), "lift": 2}


def foreground(img: np.ndarray) -> np.ndarray:
    d = np.min([np.abs(img - b).sum(2) for b in BGS], axis=0)
    return d > 48


def is_outline(c) -> bool:
    r, g, b = int(c[0]), int(c[1]), int(c[2])
    return r + g + b < 300 and r >= g - 10  # 진한 갈색/검정 (진한 초록 잎은 제외)


def keep_largest(o: np.ndarray) -> np.ndarray:
    """도트 복원 결과에서 가장 큰 덩어리만 남기고 잘라냄"""
    h, w = o.shape[:2]
    out = o.copy()
    # 가장 큰 덩어리만 (떨어진 반짝이·'!!'·zzz 제거)
    solid = out[..., 3] > 0
    lab = -np.ones((h, w), int)
    sizes = []
    for y in range(h):
        for x in range(w):
            if solid[y, x] and lab[y, x] < 0:
                n = len(sizes)
                stack = [(y, x)]
                lab[y, x] = n
                cnt = 0
                while stack:
                    cy, cx = stack.pop()
                    cnt += 1
                    for dy in (-1, 0, 1):
                        for dx in (-1, 0, 1):
                            ny, nx = cy + dy, cx + dx
                            if 0 <= ny < h and 0 <= nx < w and solid[ny, nx] and lab[ny, nx] < 0:
                                lab[ny, nx] = n
                                stack.append((ny, nx))
                sizes.append(cnt)
    if sizes:
        big = int(np.argmax(sizes))
        out[lab != big] = 0
    ys, xs = np.where(out[..., 3] > 0)
    out = out[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    # 외곽선 밖으로 튀어나온 1칸짜리 잔디 조각 정리: 아래쪽 외곽선 아래에 남은 비외곽선 칸 제거
    return out


def char_mask(img: np.ndarray, box) -> np.ndarray:
    """원본 해상도에서 캐릭터 영역 찾기: 두꺼운 외곽선이 끊김 없이 이어져 있으므로
    영역 가장자리부터 '외곽선이 아닌 픽셀'을 채워 들어가 닿지 않은 부분 = 캐릭터.
    (잔디 받침은 공룡 옷과 색이 거의 같아 색으로는 나눌 수 없음)"""
    x0, y0, x1, y1 = box
    c = img[y0:y1, x0:x1]
    h, w = c.shape[:2]
    dark = (c.sum(2) < 330) & (c[..., 0] >= c[..., 1] - 10)
    outside = np.zeros((h, w), bool)
    q = deque()
    for y in range(h):
        for x in (0, w - 1):
            if not dark[y, x] and not outside[y, x]:
                outside[y, x] = True
                q.append((y, x))
    for x in range(w):
        for y in (0, h - 1):
            if not dark[y, x] and not outside[y, x]:
                outside[y, x] = True
                q.append((y, x))
    while q:
        cy, cx = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = cy + dy, cx + dx
            if 0 <= ny < h and 0 <= nx < w and not outside[ny, nx] and not dark[ny, nx]:
                outside[ny, nx] = True
                q.append((ny, nx))
    inside = ~outside
    # 가장 큰 덩어리만 (반짝이·'!!'·zzz·속도선 제거)
    lab = np.full((h, w), -1, np.int32)
    best, best_n, n = -1, 0, 0
    for y in range(h):
        for x in range(w):
            if inside[y, x] and lab[y, x] < 0:
                stack = [(y, x)]
                lab[y, x] = n
                cnt = 0
                while stack:
                    sy, sx = stack.pop()
                    cnt += 1
                    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        ny, nx = sy + dy, sx + dx
                        if 0 <= ny < h and 0 <= nx < w and inside[ny, nx] and lab[ny, nx] < 0:
                            lab[ny, nx] = n
                            stack.append((ny, nx))
                if cnt > best_n:
                    best, best_n = n, cnt
                n += 1
    return lab == best


def face_center_x(o: np.ndarray) -> float:
    xs = [x for y in range(o.shape[0]) for x in range(o.shape[1]) if o[y, x, 3] and is_skin(o[y, x])]
    return float(np.mean(xs)) if xs else o.shape[1] / 2


def build_sheet(frames: list[np.ndarray]) -> np.ndarray:
    centers = [face_center_x(f) for f in frames]
    left = max(centers)
    right = max(f.shape[1] - c for f, c in zip(frames, centers))
    fw = int(np.ceil(left + right)) + 2
    fh = max(f.shape[0] for f in frames) + 1
    sheet = np.zeros((fh, fw * len(frames), 4), np.uint8)
    for k, (f, c) in enumerate(zip(frames, centers)):
        ox = k * fw + int(round(left + 1 - c))
        oy = fh - f.shape[0]
        m = f[..., 3] > 0
        sheet[oy:oy + f.shape[0], ox:ox + f.shape[1]][m] = f[m]
    return sheet


def shift_block(o: np.ndarray, y0: int, y1: int, x0: int, x1: int, dy: int, dx: int) -> np.ndarray:
    """영역 안의 도트를 (dy, dx) 만큼 옮김 (도트 색은 그대로). 옮긴 자리가 비면 투명"""
    pad = 2
    c = np.zeros((o.shape[0] + pad * 2, o.shape[1] + pad * 2, 4), np.uint8)
    c[pad:-pad, pad:-pad] = o
    block = c[pad + y0:pad + y1, pad + x0:pad + x1].copy()
    c[pad + y0:pad + y1, pad + x0:pad + x1] = 0
    m = block[..., 3] > 0
    region = c[pad + y0 + dy:pad + y1 + dy, pad + x0 + dx:pad + x1 + dx]
    region[m] = block[m]
    return c[pad:-pad, pad:-pad] if not (c[:pad].any() or c[-pad:].any() or c[:, :pad].any() or c[:, -pad:].any()) else trim(c)


def trim(o: np.ndarray) -> np.ndarray:
    ys, xs = np.where(o[..., 3] > 0)
    return o[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


def stretch_row(o: np.ndarray, y: int) -> np.ndarray:
    """y 번째 줄을 한 번 더 넣어 몸을 1칸 늘림 (꿈틀/숨쉬기)"""
    return np.concatenate([o[:y + 1], o[y:]], axis=0)


def ensure_two_eyes(o: np.ndarray, name: str) -> np.ndarray:
    if count_eyes(o) != 2:
        o = normalize_face(o, name)  # 기존 고나와 같은 3/4 뷰 규칙으로 작은 검은 눈 2개
    if count_eyes(o) != 2:
        raise SystemExit(f"[{name}] 눈이 2개가 아닙니다")
    return o


def make_frames(stage: str, base: np.ndarray) -> list[np.ndarray]:
    h, w = base.shape[:2]
    if stage == "newborn":
        squirm = stretch_row(base, h // 2)          # 몸을 살짝 늘이며 꼬물
        blink = make_blink(base)                     # 눈 깜빡
        return [base, squirm, blink]
    if stage == "crawler":
        r = CRAWL_LEGS["rows"]
        # 다리 줄에서 완전히 빈 세로줄(다리 사이)을 찾아 그 위치에서 뒷다리/앞다리를 나눔
        empty = [x for x in range(w) if not base[h - r:h, x, 3].any()]
        inner = [x for x in empty if 0 < x < w - 1]
        split = min(inner, key=lambda x: abs(x - w / 2)) if inner else CRAWL_LEGS["front"][0]
        f = shift_block(base, h - r, h, 0, split, 0, -1)   # 뒷다리 뒤로
        f = shift_block(f, h - r, h, split, w, 0, 1)       # 앞다리 앞으로
        return [base, f]
    if stage == "bigbaby":
        r, lift = BIG_FEET["rows"], BIG_FEET["lift"]
        step_l = shift_block(base, h - r, h, *BIG_FEET["left"], -lift, 0)
        step_r = shift_block(base, h - r, h, *BIG_FEET["right"], -lift, 0)
        return [base, step_l, step_r]
    return [base]


def main() -> None:
    img = np.array(Image.open(SRC).convert("RGB")).astype(int)
    # 아기 얼굴(피부)은 배경 크림색과, 잔디는 공룡 옷 초록색과 거의 같아서 색으로는 나눌 수 없음
    # → 원본 해상도에서 외곽선 안쪽(캐릭터) 영역을 먼저 구한 뒤 도트 격자 복원
    fg = np.zeros(img.shape[:2], bool)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    previews = []
    for stage, box in STAGES.items():
        x0, y0, x1, y1 = box
        fg[:] = False
        fg[y0:y1, x0:x1] = char_mask(img, box)
        base = keep_largest(rebuild(img, fg, (y0, y1, x0, x1)))
        base = ensure_two_eyes(base, stage)
        frames = make_frames(stage, base)
        for i, f in enumerate(frames):
            print(f"  {stage}[{i}]: {f.shape[1]}x{f.shape[0]} 눈 {count_eyes(f)}")
        sheet = build_sheet(frames)
        Image.fromarray(sheet).save(OUT_DIR / f"{stage}.png")
        print(f"{stage}.png: 프레임 {sheet.shape[1] // len(frames)}x{sheet.shape[0]} x {len(frames)}")
        previews.append(sheet)
    W = sum(p.shape[1] + 6 for p in previews)
    H = max(p.shape[0] for p in previews)
    pv = Image.new("RGBA", (W, H), (120, 190, 220, 255))
    x = 0
    for p in previews:
        pv.alpha_composite(Image.fromarray(p), (x, H - p.shape[0]))
        x += p.shape[1] + 6
    pv.resize((W * 8, H * 8), Image.NEAREST).save(PREVIEW)


if __name__ == "__main__":
    main()
