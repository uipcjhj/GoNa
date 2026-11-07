"""
가족 엔딩 캐릭터 시트 (B스타일 스토리보드 원본 기반)

원본: art-src/ending/family/storyboard-B.jpg — 사용자가 준 B스타일 엔딩 스토리보드의
'주요 등장 캐릭터' 줄. 그 줄을 원래 도트 격자(3px = 1도트)로 되돌려 뽑고,
JPEG 번짐만 손으로 정리한 기준 그림이 art-src/ending/family/base-<id>.txt (+ .png 미리보기).
  - 얼굴·눈·입·머리 모양·머리색·옷·체형은 기준 그림 그대로 (이 스크립트는 바꾸지 않음)
  - 이 스크립트는 기준 그림을 복사한 뒤 팔·다리 위치, 머리 기울기(통째로 이동), 표정(눈·입)만 바꿔 동작 프레임을 만듦

출력 (프레임 40x36, 발바닥 = 맨 아래 줄, 가운데 x=20 이 몸 중심):
  public/assets/ending/fam-<id>.png       몸 (머리·몸통·다리, 팔을 내린 동작은 팔 포함)
  public/assets/ending/fam-<id>-arms.png  고나를 감싸는 팔 (고나 위에 그려짐) — 안기·뽀뽀·킁카·쓰다듬기
프레임 순서 (src/scenes/EndingScene.ts 의 F 와 같음):
  0 서기 · 1 눈 깜빡 · 2 웃기 · 3/4 손 흔들기 · 5 두 팔 벌리기 · 6/7 걷기
  8 안기 · 9 볼뽀뽀 · 10/11 킁카 · 12/13 쓰다듬기         (고나가 왼쪽에 있을 때 — 왼쪽으로 기울임)
  14 안기 · 15 볼뽀뽀 · 16/17 킁카 · 18/19 쓰다듬기       (고나가 오른쪽에 있을 때 — 오른쪽으로 기울임)
  좌우 반전을 쓰지 않음 (묶은 머리 방향 등 원본 디자인이 뒤집히지 않도록)

실행: python3 tools/build_family_sb.py   (Pillow 필요)
"""
import os
import sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'art-src', 'ending', 'family')
OUT = os.path.join(ROOT, 'public', 'assets', 'ending')
sys.path.insert(0, SRC)
from palette import PAL  # noqa: E402

FW, FH = 40, 36
CX = 20
# id: (기준 그림의 몸 중심 x, 소매색, 소매 그림자, 넓은 몸통, 눈[(위 행, x)], 입[(행, x)] 4점, 안경 여부)
CHARS = {
    'stripe':   dict(cx=18, A='Y', a='y', wide=False, eyes=[(13, 16), (13, 21)], mouth=[(17, 17), (18, 18), (18, 19), (17, 20)]),
    'glasses':  dict(cx=12, A='R', a='r', wide=False, eyes=[(15, 9), (15, 16)], mouth=[(18, 11), (19, 12), (19, 12), (18, 13)], glasses=True),
    'ponytail': dict(cx=17, A='Y', a='y', wide=False, eyes=[(14, 15), (14, 20)], mouth=[(18, 16), (19, 17), (19, 18), (18, 19)]),
    'blacktee': dict(cx=12, A='R', a='r', wide=False, eyes=[(14, 10), (14, 15)], mouth=[(18, 12), (19, 13), (19, 14), (18, 15)]),
    'curly':    dict(cx=15, A='P', a='p', wide=True, eyes=[(15, 12), (15, 18)], mouth=[(19, 14), (20, 15), (20, 16), (19, 17)]),
    'grey':     dict(cx=12, A='C', a='c', wide=False, eyes=[(12, 7), (12, 14)], mouth=[(16, 9), (17, 10), (17, 11), (16, 12)]),
}
HEAD_LAST = 22      # 기준 그림에서 머리(묶은 머리 포함)가 끝나는 행
SHOULDER_Y = 23     # 어깨 줄
ARM_ROWS = range(24, 29)
SKIN = 'Ssbm'


def load(cid):
    rows = [r for r in open(os.path.join(SRC, f'base-{cid}.txt')).read().split('\n') if r]
    return rows


class Canvas:
    def __init__(self):
        self.g = [['.'] * FW for _ in range(FH)]

    def get(self, y, x):
        return self.g[y][x] if 0 <= y < FH and 0 <= x < FW else '.'

    def set(self, y, x, c):
        if 0 <= y < FH and 0 <= x < FW:
            self.g[y][x] = c

    def img(self):
        im = Image.new('RGBA', (FW, FH), (0, 0, 0, 0))
        px = im.load()
        for y in range(FH):
            for x in range(FW):
                c = self.g[y][x]
                if c != '.':
                    px[x, y] = PAL[c] + (255,)
        return im


def arm_cols(info):
    """기준 그림에서 팔이 차지하는 열 (왼팔, 오른팔) — 몸통 템플릿과 같은 규칙"""
    x0 = info['cx'] - (10 if info['wide'] else 9)
    right0 = x0 + (14 if info['wide'] else 12)
    return [x0 + 2, x0 + 3, x0 + 4], [right0 + 1, right0 + 2, right0 + 3], x0


def place(rows, info, cv, dx_head=0, dy_head=0, dy_all=0, arms_down=True, legs='both', face=None):
    """기준 그림을 캔버스에 복사. 머리는 통째로 (dx_head, dy_head) 만큼 옮김 — 모양은 그대로."""
    off = CX - info['cx']
    left, right, x0 = arm_cols(info)
    H = len(rows)
    body = [list(r) for r in rows]
    if not arms_down:
        for y in ARM_ROWS:
            for x in left + right:
                body[y][x] = '.'
        for x in (left[1], left[2], right[0], right[1]):
            body[29][x] = '.'
        # 몸통 옆선
        for y in ARM_ROWS:
            body[y][left[2] + 1] = 'O'
            body[y][right[0] - 1] = 'O'
        body[29][left[2] + 1] = 'O'
        body[29][right[0] - 1] = 'O'
        for x in (left[0],):
            body[SHOULDER_Y][x] = '.'
        body[SHOULDER_Y][right[2]] = '.'
        body[SHOULDER_Y][left[0] + 1] = 'O'
        body[SHOULDER_Y][right[2] - 1] = 'O'
    if legs != 'both':
        # 걷기: 한쪽 다리를 1줄 들어 올림 (발 위치만 다름)
        lx = range(x0 + 4, x0 + 9) if not info['wide'] else range(x0 + 5, x0 + 10)
        rx = range(x0 + 9, x0 + 14) if not info['wide'] else range(x0 + 10, x0 + 15)
        cols = lx if legs == 'L' else rx
        for x in cols:
            for y in range(31, H):
                body[y - 1][x] = body[y][x]
            body[H - 1][x] = '.'
    # 1) 몸 (머리 아래)
    for y in range(HEAD_LAST + 1, H):
        for x, c in enumerate(body[y]):
            if c != '.':
                cv.set(y + 1 + dy_all, x + off, c)
    # 2) 머리 — 몸 위에 덮어 그림
    head = [r[:] for r in body[:HEAD_LAST + 1]]
    if face:
        face(head)
    for y in range(HEAD_LAST + 1):
        for x, c in enumerate(head[y]):
            if c != '.':
                cv.set(y + 1 + dy_all + dy_head, x + off + dx_head, c)
    return off


# ---- 표정 (눈·입 자리만 바꿈; 크기·위치는 기준 그림의 눈·입 그대로)
def eyes_closed_happy(info):
    def f(h):
        for (y, x) in info['eyes']:
            for k in range(3 if not info.get('glasses') else 2):
                h[y + k][x] = 'S'
            if info.get('glasses'):
                h[y + 1][x - 1] = 'O'; h[y][x] = 'O'; h[y + 1][x + 1] = 'O'
            else:
                h[y + 2][x - 1] = 'O'; h[y + 1][x] = 'O'; h[y + 2][x + 1] = 'O'
    return f


def eyes_blink(info):
    def f(h):
        for (y, x) in info['eyes']:
            n = 2 if info.get('glasses') else 3
            for k in range(n):
                h[y + k][x] = 'S'
            h[y + n - 1][x] = 'O'; h[y + n - 1][x + 1] = 'O'
    return f


def mouth_open(info):
    def f(h):
        (y0, xa), _, _, (_, xb) = info['mouth'][0], None, None, info['mouth'][3]
        for x in range(xa, xb + 1):
            h[y0][x] = 'm'
        for x in range(xa + 1, xb):
            h[y0 + 1][x] = 'm'
        if xb - xa >= 3:
            h[y0 + 1][xa + 1] = 'b'
    return f


def mouth_kiss(info):
    def f(h):
        for (y, x) in info['mouth']:
            h[y][x] = 'S'
        y, x = info['mouth'][1]
        h[y][x] = 'm'; h[y - 1][x] = 'm'
    return f


def both(*fs):
    def f(h):
        for g in fs:
            g(h)
    return f


def blush_more(info):
    def f(h):
        for (y, x) in info['eyes']:
            yy = y + (2 if info.get('glasses') else 3) + 1
            for xx in (x - 1, x):
                if 0 <= yy < len(h) and 0 <= xx < len(h[0]) and h[yy][xx] in 'Ss':
                    h[yy][xx] = 'b'
    return f


# ---- 팔 (어깨 → 손), 2도트 굵기 소매 + 2x2 손 + 1도트 외곽선
def arm(cells_layer, outline_layer, sx, sy, hx, hy, A, a):
    n = max(abs(hx - sx), abs(hy - sy), 1)
    sleeve = []
    for i in range(n + 1):
        x = round(sx + (hx - sx) * i / n)
        y = round(sy + (hy - sy) * i / n)
        sleeve.append((y, x))
    pts = {}
    for k, (y, x) in enumerate(sleeve):
        for dy in (0, 1):
            for dx in (0, 1):
                pts[(y + dy, x + dx)] = A if k < len(sleeve) - 2 or True else A
    for dy in (0, 1):
        for dx in (0, 1):
            pts[(hy + dy, hx + dx)] = 'S'
    # 소매 그림자 한 줄
    for (y, x) in list(pts):
        if pts[(y, x)] == A and (y + 1, x) not in pts:
            pts[(y, x)] = a
    for (y, x), c in pts.items():
        cells_layer[(y, x)] = c
    for (y, x) in pts:
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            q = (y + dy, x + dx)
            if q not in pts:
                outline_layer.add(q)


def draw_arms(cv, specs, info, on_body):
    """specs: [(어깨 x, 어깨 y, 손 x, 손 y)] — on_body=True 면 몸 캔버스에, 아니면 팔 전용 캔버스(cv)에"""
    cells, outl = {}, set()
    for sx, sy, hx, hy in specs:
        arm(cells, outl, sx, sy, hx, hy, info['A'], info['a'])
    for q in outl:
        if q not in cells:
            cv.set(q[0], q[1], 'O')
    for (y, x), c in cells.items():
        cv.set(y, x, c)


def shoulders(info, dy=0):
    w = info['wide']
    return (CX - (7 if w else 6), SHOULDER_Y + 1 + dy), (CX + (6 if w else 5), SHOULDER_Y + 1 + dy)


def frames_for(cid):
    info = CHARS[cid]
    rows = load(cid)
    body_frames, arm_frames = [], []

    def add(body, arms=None):
        body_frames.append(body.img())
        arm_frames.append((arms or Canvas()).img())

    # 0 서기
    cv = Canvas(); place(rows, info, cv); add(cv)
    # 1 깜빡
    cv = Canvas(); place(rows, info, cv, face=eyes_blink(info)); add(cv)
    # 2 웃기 (눈 ^ ^ · 입 벌림 · 볼 발그레)
    cv = Canvas(); place(rows, info, cv, dy_head=0, face=both(eyes_closed_happy(info), mouth_open(info), blush_more(info))); add(cv)
    (lx, ly), (rx, ry) = shoulders(info)
    # 3/4 손 흔들기 (오른팔 위로, 손 좌우)
    for hx in (rx + 3, rx + 1):
        cv = Canvas(); place(rows, info, cv, arms_down=False, face=mouth_open(info))
        draw_arms(cv, [(lx, ly, lx - 1, ly + 3), (rx, ry, hx, ry - 6)], info, True); add(cv)
    # 5 두 팔 벌리기
    cv = Canvas(); place(rows, info, cv, arms_down=False, face=both(eyes_closed_happy(info), mouth_open(info)))
    draw_arms(cv, [(lx, ly, lx - 5, ly - 3), (rx, ry, rx + 5, ry - 3)], info, True); add(cv)
    # 6/7 걷기
    for leg, bob in (('L', 0), ('R', 0)):
        cv = Canvas(); place(rows, info, cv, legs=leg); add(cv)

    # 8~13 (왼쪽으로) / 14~19 (오른쪽으로)
    for side in (-1, 1):
        K = 3  # 무릎 꿇기: 몸 전체를 3줄 내림 (아래로 나간 다리는 잘림 — 고나 뒤에 가려짐)
        (lx, ly), (rx, ry) = shoulders(info, K)
        # 고나 쪽 팔은 옆으로 뻗어 고나 등을 감싸고, 반대쪽 팔은 가슴 앞을 지나 고나 쪽으로
        if side < 0:
            hug = [(rx, ry, CX - 3, ry + 5), (lx, ly, lx - 7, ly + 4)]
        else:
            hug = [(lx, ly, CX + 1, ly + 5), (rx, ry, rx + 7, ry + 4)]
        # 8 안기
        cv = Canvas(); place(rows, info, cv, dy_all=K, dx_head=side, arms_down=False, face=both(eyes_closed_happy(info), mouth_open(info), blush_more(info)))
        ac = Canvas(); draw_arms(ac, hug, info, False); add(cv, ac)
        # 9 볼뽀뽀 (고나 쪽으로 머리를 기울여 쪽!)
        cv = Canvas(); place(rows, info, cv, dy_all=K, dx_head=3 * side, dy_head=2, arms_down=False, face=both(eyes_blink(info), mouth_kiss(info), blush_more(info)))
        ac = Canvas(); draw_arms(ac, hug, info, False); add(cv, ac)
        # 10/11 킁카 (머리에 코를 대고 킁킁 — 고개가 한 도트씩 오르내림)
        for d in (2, 3):
            cv = Canvas(); place(rows, info, cv, dy_all=K, dx_head=3 * side, dy_head=d, arms_down=False, face=both(eyes_closed_happy(info), blush_more(info)))
            ac = Canvas(); draw_arms(ac, hug, info, False); add(cv, ac)
        # 12/13 쓰다듬기 (고나 쪽 팔로 고나 등을 위아래로 쓸어 줌 — 팔 길이는 기준 그림과 같게 짧게)
        (lx, ly), (rx, ry) = shoulders(info)
        for d in (0, 2):
            cv = Canvas(); place(rows, info, cv, dx_head=side, arms_down=False, face=both(eyes_closed_happy(info), mouth_open(info)))
            if side < 0:
                draw_arms(cv, [(rx, ry, rx + 1, ry + 3)], info, True)
                ac = Canvas(); draw_arms(ac, [(lx, ly, lx - 7, ly + d)], info, False)
            else:
                draw_arms(cv, [(lx, ly, lx - 1, ly + 3)], info, True)
                ac = Canvas(); draw_arms(ac, [(rx, ry, rx + 7, ry + d)], info, False)
            add(cv, ac)
    return body_frames, arm_frames


def strip(frames):
    s = Image.new('RGBA', (FW * len(frames), FH), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        s.alpha_composite(f, (i * FW, 0))
    return s


def main():
    os.makedirs(OUT, exist_ok=True)
    for cid in CHARS:
        b, a = frames_for(cid)
        assert len(b) == 20, len(b)
        strip(b).save(os.path.join(OUT, f'fam-{cid}.png'))
        strip(a).save(os.path.join(OUT, f'fam-{cid}-arms.png'))
        print(cid, 'ok', len(b), 'frames')


if __name__ == '__main__':
    main()
