#!/usr/bin/env python3
"""
엔딩 컷신 전용 대형 가족 캐릭터 도트 시트 → public/assets/ending/family-{id}.png

고나 타이틀 그림(public/assets/title4/gona-*.png, 약 75x98)과 같은 그림체에 맞춤:
  두꺼운 2px 짙은 갈색 외곽선(56,30,9) · 큰 둥근 머리 · 작은 몸 · 왼쪽 위에서 빛(밝은 테두리)·오른쪽 아래 그림자 · 부드러운 색
가족 캐릭터 시안의 특징(머리 모양·옷 색·안경·키 차이)을 따름. 시안의 아기는 넣지 않음(엔딩의 아기는 고나).

출력: family-{id}.png (몸) + family-{id}-arms.png (앞쪽 팔만 — 같은 프레임 규격, 몸 위에 겹쳐 그림)
프레임 112x144 (발 = 맨 아래 줄 위 2px, 몸 가운데 x=56, 정면 · 왼쪽으로 몸을 기울이는 동작은 고나가 왼쪽에 있을 때 기준 —
게임이 좌우 반전해서 오른쪽에도 씀), 가로 14프레임:
  0 활짝 웃기 · 1 웃기(들썩) · 2·3 손 흔들기 · 4 두 팔 벌리기 · 5·6 걷기 · 7 안아 주기 · 8 볼 뽀뽀 · 9·10 킁카 · 11·12 쓰다듬기 · 13 깔깔(두 손 모음)
사용법: python3 tools/build_family_cine.py
"""
from PIL import Image
import math
import os

FW, FH, N = 112, 144, 14
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'assets', 'ending')
OL = (56, 30, 9, 255)
SKIN = (253, 216, 163, 255)
SKIN_D = (243, 184, 118, 255)
SKIN_L = (255, 232, 196, 255)
BLUSH = (246, 150, 140, 255)
EYE = (56, 30, 9, 255)
MOUTH = (150, 46, 52, 255)
TONGUE = (236, 112, 118, 255)
TEETH = (255, 250, 240, 255)


def hx(h):
    h = h.lstrip('#')
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), 255)


def mix(c, k):
    """k<1 어둡게, k>1 밝게"""
    if k < 1:
        return tuple(int(v * k) for v in c[:3]) + (255,)
    return tuple(int(v + (255 - v) * (k - 1)) for v in c[:3]) + (255,)


class Part:
    """한 부위 (채우기 → 테두리 명암 → 2px 외곽선)"""

    def __init__(self, base, shade=True):
        self.px = {}
        self.base = base
        self.shade = shade
        self.detail = {}

    def put(self, x, y, c=None):
        if 0 <= x < FW and 0 <= y < FH:
            self.px[(x, y)] = c or self.base

    def rect(self, x, y, w, h, c=None):
        for yy in range(int(y), int(y + h)):
            for xx in range(int(x), int(x + w)):
                self.put(xx, yy, c)

    def ellipse(self, cx, cy, rx, ry, c=None):
        for yy in range(int(cy - ry) - 1, int(cy + ry) + 2):
            for xx in range(int(cx - rx) - 1, int(cx + rx) + 2):
                if ((xx + 0.5 - cx) / rx) ** 2 + ((yy + 0.5 - cy) / ry) ** 2 <= 1:
                    self.put(xx, yy, c)

    def poly(self, pts, c=None):
        ys = [p[1] for p in pts]
        for y in range(int(min(ys)), int(max(ys)) + 1):
            xs = []
            n = len(pts)
            for i in range(n):
                (x0, y0), (x1, y1) = pts[i], pts[(i + 1) % n]
                if (y0 <= y + 0.5 < y1) or (y1 <= y + 0.5 < y0):
                    xs.append(x0 + (y + 0.5 - y0) * (x1 - x0) / (y1 - y0))
            xs.sort()
            for i in range(0, len(xs) - 1, 2):
                for x in range(int(round(xs[i])), int(round(xs[i + 1]))):
                    self.put(x, y, c)

    def line(self, x0, y0, x1, y1, w, c=None):
        n = int(max(abs(x1 - x0), abs(y1 - y0), 1) * 2)
        for i in range(n + 1):
            x = x0 + (x1 - x0) * i / n
            y = y0 + (y1 - y0) * i / n
            self.ellipse(x, y, w / 2, w / 2, c)

    def dot(self, x, y, c):
        """명암·외곽선 없이 위에 그리는 세부 (눈·입·무늬)"""
        if 0 <= x < FW and 0 <= y < FH:
            self.detail[(x, y)] = c

    def drect(self, x, y, w, h, c):
        for yy in range(int(y), int(y + h)):
            for xx in range(int(x), int(x + w)):
                self.dot(xx, yy, c)

    def dellipse(self, cx, cy, rx, ry, c):
        for yy in range(int(cy - ry) - 1, int(cy + ry) + 2):
            for xx in range(int(cx - rx) - 1, int(cx + rx) + 2):
                if ((xx + 0.5 - cx) / rx) ** 2 + ((yy + 0.5 - cy) / ry) ** 2 <= 1:
                    self.dot(xx, yy, c)

    def render(self, img, ox):
        P = self.px
        out = {}
        for (x, y), c in P.items():
            col = c
            if self.shade and c == self.base:
                # 오른쪽 아래 그림자 · 왼쪽 위 밝은 테두리
                if (x + 3, y) not in P or (x + 2, y + 3) not in P:
                    col = mix(c, 0.84)
                elif (x - 2, y - 2) not in P or (x - 3, y) not in P:
                    col = mix(c, 1.18)
            out[(x, y)] = col
        out.update({k: v for k, v in self.detail.items() if k in P})
        # 2px 외곽선
        ring = set()
        for (x, y) in P:
            for dx in range(-2, 3):
                for dy in range(-2, 3):
                    if abs(dx) + abs(dy) > 3:
                        continue
                    q = (x + dx, y + dy)
                    if q not in P and 0 <= q[0] < FW and 0 <= q[1] < FH:
                        ring.add(q)
        for q in ring:
            img.putpixel((ox + q[0], q[1]), OL)
        for (x, y), c in out.items():
            img.putpixel((ox + x, y), c)


# ───────── 가족 설정 (시안: 머리 모양·옷 색·안경·키) ─────────
PEOPLE = {
    'aunt': dict(h=115, hair='aunt', hc='#3b2418', shirt='#ecd3a4', pat='stripe', pc='#c99d62', pants='#f1e5c8', shoes='#fbf6ec', collar=True),
    'uncle': dict(h=121, hair='curly', hc='#2a1b14', shirt='#3d2d24', pat='camo', pc='#7c5b3e', pants='#2f2b2b', shoes='#f3ece0', glasses=True, collar=True),
    'mom': dict(h=116, hair='mom', hc='#4a2d1b', shirt='#f4e2c2', pat='plain', pants='#4d474b', shoes='#f6efe2'),
    'dad': dict(h=122, hair='curly', hc='#241812', shirt='#2c2727', pat='logo', pants='#3e3a3a', shoes='#f3ece0', wide=4),
    'grandma': dict(h=106, hair='perm', hc='#3d2a20', shirt='#f5a9b7', pat='vest', pc='#a9a5ab', pants='#3c3436', shoes='#f3ece0', wide=3),
    'grandpa': dict(h=110, hair='grey', hc='#b6b0a6', shirt='#f7f3ea', pat='pocket', pc='#ddd5c8', pants='#bb9d6c', shoes='#5d4b3a', collar=True),
}

# 자세: lean(몸 왼쪽으로) · head(dx, dy) · 팔 끝(어깨 기준, 왼팔=화면 왼쪽) · 얼굴 · 걷기 · 들썩
POSES = [
    dict(),
    dict(bob=2, head=(0, 1), face='laugh2'),
    dict(armL=(-14, -30), hand='open'),
    dict(armL=(-22, -24), hand='open'),
    dict(armL=(-26, -12), armR=(26, -12), hand='open', handR='open'),
    dict(walk=1, armL=(-6, 22), armR=(8, 20), bob=1),
    dict(walk=-1, armL=(6, 22), armR=(-6, 22)),
    dict(lean=5, head=(-3, 1), armL=(-30, 2), armR=(-34, 8), front=True, face='happy'),
    dict(lean=7, head=(-7, 3), armL=(-26, 6), armR=(-28, 10), front=True, face='kiss'),
    dict(lean=7, head=(-7, 3), armL=(-24, 4), armR=(-28, 10), front=True, face='sniff'),
    dict(lean=7, head=(-9, 5), armL=(-24, 6), armR=(-28, 10), front=True, face='sniff'),
    dict(lean=3, armL=(-28, -22), hand='flat', armR=(6, 22), face='happy'),
    dict(lean=3, armL=(-28, -16), hand='flat', armR=(6, 22), face='happy'),
    dict(armL=(10, 2), armR=(-10, 2), hand='fist', front=True, face='laugh2', bob=1),
]


def hair(style, cx, hy, top, P, back, front):
    c = hx(P['hc'])
    hi = mix(c, 1.45)

    def shine(x0, y0, x1, y1):
        """머리카락 윤기 (밝은 곡선)"""
        n = 12
        for i in range(n + 1):
            t = i / n
            x = x0 + (x1 - x0) * t
            y = y0 + (y1 - y0) * t - math.sin(t * math.pi) * 3
            front.drect(int(x), int(y), 2, 2, hi)

    if style == 'aunt':
        back.ellipse(cx, hy + 2, 32, 30, c)
        back.rect(cx + 12, hy + 6, 18, 30, c)  # 어깨까지 오는 뒷머리
        back.ellipse(cx - 32, hy + 12, 8, 11, c)  # 낮게 묶은 머리 (시안: 왼쪽)
        back.ellipse(cx - 26, hy + 5, 5, 5, hx('#e8c88e'))  # 베이지 곱창 머리끈
        front.ellipse(cx + 2, top + 12, 30, 13, c)
        front.poly([(cx - 28, top + 13), (cx + 8, top + 9), (cx - 8, top + 22), (cx - 28, top + 27)], c)  # 옆으로 넘긴 앞머리
        front.rect(cx + 22, hy - 10, 8, 30, c)  # 오른쪽 옆머리
        front.rect(cx - 30, hy - 14, 5, 22, c)
        shine(cx - 14, top + 7, cx + 6, top + 5)
    elif style == 'mom':
        back.ellipse(cx, hy + 1, 31, 29, c)
        back.ellipse(cx - 26, top + 7, 11, 11, c)  # 높이 묶은 머리 (시안: 왼쪽 위)
        back.poly([(cx - 36, top + 10), (cx - 24, top + 14), (cx - 30, hy + 24), (cx - 40, hy + 15)], c)  # 꼬리
        front.ellipse(cx + 2, top + 12, 30, 13, c)
        front.poly([(cx - 26, top + 15), (cx + 12, top + 11), (cx + 2, top + 22), (cx - 27, top + 26)], c)
        front.rect(cx + 23, hy - 12, 6, 20, c)
        front.dellipse(cx - 20, top + 9, 3, 3, hx('#c96a8a'))  # 머리끈
        shine(cx - 10, top + 6, cx + 10, top + 5)
    elif style == 'curly':
        r = 7.5 if P.get('wide') else 6.5
        front.ellipse(cx, top + 14, 31, 15, c)
        for a in range(-160, -15, 16):
            t = math.radians(a)
            front.ellipse(cx + math.cos(t) * 27, top + 20 + math.sin(t) * 17, r, r, c)
        front.rect(cx - 31, hy - 12, 7, 16, c)
        front.rect(cx + 24, hy - 12, 7, 16, c)
        for k in range(5):
            front.ellipse(cx - 18 + k * 9, top + 23, 5.5, 4.5, c)  # 곱슬 앞머리
        for k in range(4):
            front.dellipse(cx - 16 + k * 10, top + 9 + (k % 2) * 3, 2.5, 1.5, hi)
    elif style == 'perm':
        for a in range(0, 360, 24):
            t = math.radians(a)
            ry = 28 if math.sin(t) < 0 else 24
            back.ellipse(cx + math.cos(t) * 32, hy + 3 + math.sin(t) * ry, 8.5, 8.5, c)
        front.ellipse(cx, top + 12, 29, 12, c)
        for a in range(-170, -10, 18):
            t = math.radians(a)
            front.ellipse(cx + math.cos(t) * 26, top + 17 + math.sin(t) * 13, 6.5, 6.5, c)
        for k in range(5):
            front.ellipse(cx - 18 + k * 9, top + 22, 5, 4, c)
        for k in range(5):
            front.dellipse(cx - 20 + k * 10, top + 8 + (k % 2) * 4, 2.5, 1.5, hi)
    elif style == 'grey':
        back.ellipse(cx, hy - 2, 31, 28, c)
        front.ellipse(cx, top + 7, 24, 8, c)
        for a in range(-165, -15, 20):
            t = math.radians(a)
            front.ellipse(cx + math.cos(t) * 24, top + 12 + math.sin(t) * 8, 5, 5, c)
        front.ellipse(cx - 28, hy - 6, 5, 9, c)
        front.ellipse(cx + 28, hy - 6, 5, 9, c)
        for k in range(4):
            front.dellipse(cx - 14 + k * 9, top + 5 + (k % 2) * 2, 2.5, 1.2, hi)


def face(head, cx, ey, P, kind):
    lx, rx = cx - 13, cx + 6  # 눈 (왼쪽 · 오른쪽) 시작 x, 폭 8
    closed = kind in ('kiss', 'sniff')
    for ex in (lx, rx):
        if closed:
            head.drect(ex, ey + 2, 8, 2, EYE)  # 감은 눈
            head.drect(ex + 1, ey + 1, 2, 1, EYE)
        else:
            # 웃는 눈 ∩ (두께 2)
            for i, dy in enumerate([3, 1, 0, 0, 0, 0, 1, 3]):
                head.drect(ex + i, ey + dy, 1, 2, EYE)
    # 볼
    head.dellipse(lx - 1, ey + 9, 4.5, 2.6, BLUSH)
    head.dellipse(rx + 9, ey + 9, 4.5, 2.6, BLUSH)
    my = ey + 12
    if kind == 'kiss':
        head.dellipse(cx - 9, my + 1, 3, 3, (214, 70, 92, 255))  # 쭉 내민 입술 (왼쪽)
        head.dot(cx - 9, my + 1, (120, 30, 44, 255))
    elif kind == 'sniff':
        head.drect(cx - 3, my + 1, 6, 2, MOUTH)  # 살짝 웃는 입
        head.dot(cx - 4, my, MOUTH)
        head.dot(cx + 3, my, MOUTH)
    elif kind == 'happy':
        head.drect(cx - 5, my, 10, 2, MOUTH)
        head.drect(cx - 4, my + 2, 8, 2, MOUTH)
        head.drect(cx - 2, my + 3, 4, 1, TONGUE)
    else:
        # 활짝 웃는 입 (D 모양) + 윗니 + 혀
        w = 14 if kind == 'laugh2' else 12
        for i, h in enumerate([3, 6, 8, 9, 9, 9, 9, 9, 9, 8, 7, 6, 4, 2][:w]):
            head.drect(cx - w // 2 + i, my, 1, h, MOUTH)
        head.drect(cx - w // 2 + 2, my, w - 4, 1, TEETH)
        head.dellipse(cx, my + 6, 3.5, 2.2, TONGUE)
    if P.get('glasses'):
        g = (30, 22, 18, 255)
        for ex in (lx, rx):
            for a in range(0, 360, 8):
                t = math.radians(a)
                for r in (6.5, 7.2):
                    head.dot(int(round(ex + 4 + math.cos(t) * r)), int(round(ey + 2 + math.sin(t) * (r - 0.5))), g)
        head.drect(cx - 3, ey, 3, 1, g)
    if P['hair'] == 'grey':
        for ex in (lx, rx):
            head.drect(ex + 1, ey - 4, 6, 2, hx('#9e978c'))


def arm(part, sx, sy, end, sleeve, hand='fist'):
    ex, ey = sx + end[0], sy + end[1]
    mx, my = sx + end[0] * 0.38, sy + end[1] * 0.38
    part.line(sx, sy, mx, my, 10, sleeve)
    part.line(mx, my, ex, ey, 8, SKIN)
    if hand == 'open':
        part.ellipse(ex, ey, 5.5, 6, SKIN)
        for k in (-4, -1, 2):
            part.rect(ex + k, ey - 9, 2, 5, SKIN)
    elif hand == 'flat':
        part.ellipse(ex - 3, ey, 8, 4.5, SKIN)
    else:
        part.ellipse(ex, ey, 5.5, 5.5, SKIN)


def frame(P, pose):
    lean = pose.get('lean', 0)
    bob = pose.get('bob', 0)
    cx = 56 - lean
    foot = FH - 3
    H = P['h']
    top = foot - H + 1 + bob
    hdx, hdy = pose.get('head', (0, 0))
    hcx = cx + hdx
    hy = top + 29 + hdy
    head_bot = hy + 27
    leg_len = int(H * 0.21)
    hip = foot - leg_len
    wide = P.get('wide', 0)
    tw = 34 + wide
    tl = cx - tw // 2
    shirt, pants = hx(P['shirt']), hx(P['pants'])

    back = Part(hx(P['hc']))
    legs = Part(pants)
    shoes = Part(hx(P['shoes']))
    body = Part(shirt)
    armB = Part(shirt)
    head = Part(SKIN)
    hairF = Part(hx(P['hc']))
    armF = Part(shirt)

    # 다리 · 신발
    w = pose.get('walk', 0)
    for side in (-1, 1):
        x = cx + (-15 if side < 0 else 2) + (w * side * 4 if w else 0)
        lift = 3 if (w and side == w) else 0
        legs.rect(x, hip, 13, leg_len - 4 - lift)
        shoes.ellipse(x + 6 + (-2 if side < 0 else 2), foot - 3 - lift, 9, 4.5)
    # 몸통 (둥근 어깨)
    body.ellipse(cx, head_bot + 6, tw / 2, 8)
    body.rect(tl, head_bot + 6, tw, hip - head_bot - 2)
    body.ellipse(cx, hip, tw / 2, 4)
    pat = P['pat']
    pc = hx(P.get('pc', P['shirt']))
    if pat == 'stripe':
        for x in range(tl + 3, tl + tw - 2, 5):
            body.drect(x, head_bot + 2, 2, hip - head_bot + 2, pc)
        body.drect(cx - 1, head_bot + 4, 1, hip - head_bot - 2, mix(shirt, 0.8))
    elif pat == 'camo':
        import random
        rnd = random.Random(7)
        for _ in range(26):
            x = tl + rnd.randint(1, tw - 5)
            y = head_bot + rnd.randint(1, hip - head_bot - 2)
            body.drect(x, y, rnd.randint(3, 5), 2, pc)
            body.drect(x + 1, y + 2, 2, 1, hx('#5a4030'))
    elif pat == 'logo':
        body.drect(cx - 6, head_bot + 12, 9, 2, hx('#f4f0e8'))
    elif pat == 'vest':
        body.drect(tl, head_bot + 2, 9, hip - head_bot + 2, pc)
        body.drect(tl + tw - 9, head_bot + 2, 9, hip - head_bot + 2, pc)
        body.dellipse(cx, head_bot + 16, 4, 3.5, hx('#ff6f8e'))
        body.dellipse(cx - 3, head_bot + 14, 2.5, 2.5, hx('#ff6f8e'))
        body.dellipse(cx + 3, head_bot + 14, 2.5, 2.5, hx('#ff6f8e'))
    elif pat == 'pocket':
        body.drect(cx + 4, head_bot + 11, 8, 7, pc)
        body.drect(cx + 5, head_bot + 12, 6, 5, shirt)
        body.drect(cx - 1, head_bot + 6, 1, hip - head_bot - 4, pc)
    if P.get('collar'):
        body.poly([(cx - 9, head_bot + 1), (cx, head_bot + 7), (cx - 3, head_bot + 10), (cx - 11, head_bot + 5)], mix(shirt, 0.9))
        body.poly([(cx + 9, head_bot + 1), (cx, head_bot + 7), (cx + 3, head_bot + 10), (cx + 11, head_bot + 5)], mix(shirt, 0.9))
    # 머리 + 귀
    head.ellipse(hcx - 29, hy + 5, 5, 6)
    head.ellipse(hcx + 29, hy + 5, 5, 6)
    head.ellipse(hcx, hy, 29, 27)
    hair(P['hair'], hcx, hy, top + hdy, P, back, hairF)
    face(head, hcx, hy + 2, P, pose.get('face', 'laugh'))
    # 팔
    sy = head_bot + 8
    sL, sR = (tl + 4, sy), (tl + tw - 4, sy)
    aL = pose.get('armL', (-6, 24))
    aR = pose.get('armR', (6, 24))
    front = pose.get('front')
    arm(armB if not front else armF, sR[0], sR[1], aR, shirt, pose.get('handR', 'fist'))
    arm(armF, sL[0], sL[1], aL, shirt, pose.get('hand', 'fist'))
    return [back, legs, shoes, body, armB, head, hairF, armF]


def main():
    os.makedirs(OUT, exist_ok=True)
    for pid, P in PEOPLE.items():
        # 몸 시트(앞팔 제외) + 앞팔 시트 — 게임에서 '몸 < 고나 < 앞팔' 순서로 그려 팔이 고나를 실제로 감싸 안게
        body = Image.new('RGBA', (FW * N, FH), (0, 0, 0, 0))
        arms = Image.new('RGBA', (FW * N, FH), (0, 0, 0, 0))
        for i, pose in enumerate(POSES):
            parts = frame(P, pose)
            for part in parts[:-1]:
                part.render(body, i * FW)
            parts[-1].render(arms, i * FW)
        body.save(os.path.join(OUT, f'family-{pid}.png'))
        arms.save(os.path.join(OUT, f'family-{pid}-arms.png'))
        print(pid, body.size)


if __name__ == '__main__':
    main()
