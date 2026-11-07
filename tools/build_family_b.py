#!/usr/bin/env python3
"""
B스타일 엔딩 가족 캐릭터 도트 시트 → public/assets/ending/fam-{id}.png (+ fam-{id}-arms.png)

참고: 실제 가족사진(외형·옷 기준) + B스타일 엔딩 스토리보드(그림체 기준). 사진 맨 왼쪽 아래 인물은 제외.
가족 관계(호칭)는 추정하지 않고, 사진 속 외형으로 구분한 이름을 씀:
  stripe   — 뒤로 묶은 어두운 머리 · 베이지 세로 줄무늬 셔츠
  glasses  — 짧은 검은 앞머리 · 검은 안경 · 어두운 무늬(카모) 티셔츠
  ponytail — 뒤로 묶은 어두운 머리(이마 드러남) · 밝은 회베이지 티셔츠
  blacktee — 짧은 검은 머리 · 검은 티셔츠(작은 흰 로고)
  curly    — 짧은 곱슬 파마 · 분홍 티셔츠(회색 소매)
  grey     — 짧은 회색 머리 · 흰 헨리넥 셔츠
그림체: 소박한 레트로 픽셀게임 (작은 점 눈 2개 · 단순한 입 · 옅은 볼) · 머리 약 1/3 비율 · 1px 외곽선 · 3단 명암
프레임 40x66, 가로 14프레임 — 발 = 아래에서 2줄 위, 몸 가운데 x=20, 정면(살짝 왼쪽) · 기울이는 동작은 왼쪽으로(게임이 좌우 반전):
  0 서 있기 · 1 서 있기(눈 깜빡·들썩) · 2 웃기 · 3·4 손 흔들기 · 5 두 팔 벌리기 · 6·7 걷기 · 8 포옹 · 9 볼뽀뽀 · 10·11 킁카 · 12·13 머리 쓰다듬기
fam-{id}-arms.png = 앞쪽 팔만 (게임에서 '몸 < 고나 < 앞팔' 순서로 겹쳐 포옹이 실제로 감싸 안게)
사용법: python3 tools/build_family_b.py
"""
from PIL import Image
import os
import random

FW, FH, N = 40, 66, 14
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'assets', 'ending')
OL = (44, 28, 32, 255)
SKIN = (246, 206, 168, 255)
SKIN_D = (226, 172, 136, 255)
EYE = (44, 28, 32, 255)
MOUTH = (150, 62, 66, 255)
BLUSH = (240, 158, 150, 255)


def hx(h):
    h = h.lstrip('#')
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), 255)


def mix(c, k):
    if k < 1:
        return tuple(int(v * k) for v in c[:3]) + (255,)
    return tuple(int(v + (255 - v) * (k - 1)) for v in c[:3]) + (255,)


class Part:
    def __init__(self, base, shade=True):
        self.px = {}
        self.base = base
        self.shade = shade
        self.detail = {}

    def put(self, x, y, c=None):
        x, y = int(round(x)), int(round(y))
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

    def line(self, x0, y0, x1, y1, w, c=None):
        n = int(max(abs(x1 - x0), abs(y1 - y0), 1) * 3)
        for i in range(n + 1):
            x = x0 + (x1 - x0) * i / n
            y = y0 + (y1 - y0) * i / n
            self.ellipse(x, y, w / 2, w / 2, c)

    def dot(self, x, y, c):
        x, y = int(round(x)), int(round(y))
        if 0 <= x < FW and 0 <= y < FH:
            self.detail[(x, y)] = c

    def drect(self, x, y, w, h, c):
        for yy in range(int(y), int(y + h)):
            for xx in range(int(x), int(x + w)):
                self.dot(xx, yy, c)

    def render(self, img, ox):
        P = self.px
        out = {}
        for (x, y), c in P.items():
            col = c
            if self.shade and c == self.base:
                if (x + 2, y) not in P or (x + 1, y + 2) not in P:
                    col = mix(c, 0.82)
                elif (x - 1, y - 1) not in P:
                    col = mix(c, 1.16)
            out[(x, y)] = col
        out.update({k: v for k, v in self.detail.items() if k in P})
        for (x, y) in P:
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                q = (x + dx, y + dy)
                if q not in P and 0 <= q[0] < FW and 0 <= q[1] < FH:
                    img.putpixel((ox + q[0], q[1]), OL)
        for (x, y), c in out.items():
            img.putpixel((ox + x, y), c)


PEOPLE = {
    'stripe': dict(h=58, hair='tied_low', hc='#3a2a24', top='#e7d1a6', top2='#c6a067', pat='stripe', pants='#e8dcc2', shoes='#f6f2ea', collar=True),
    'glasses': dict(h=61, hair='fringe', hc='#211a1b', top='#3c3631', pat='camo', pants='#2e2f3c', shoes='#ece6da', glasses=True),
    'ponytail': dict(h=57, hair='tied_high', hc='#30231e', top='#e2dbcf', pat='plain', pants='#3c4058', shoes='#f6f2ea'),
    'blacktee': dict(h=62, hair='short', hc='#1e1819', top='#272325', pat='logo', pants='#3a3a46', shoes='#ece6da', wide=2),
    'curly': dict(h=53, hair='perm', hc='#3a2a23', top='#f2a7b6', top2='#b7b2b6', pat='raglan', pants='#3e3539', shoes='#ece6da', wide=1),
    'grey': dict(h=56, hair='grey', hc='#a9a49d', top='#f4f1ea', top2='#d6d0c4', pat='henley', pants='#7a6a56', shoes='#4b3c31', wide=1),
}

POSES = [
    dict(),
    dict(bob=1, face='blink'),
    dict(armL=(-5, 9), armR=(5, 9), face='laugh'),
    dict(armL=(-4, -12), hand='open', face='laugh'),
    dict(armL=(-9, -9), hand='open', face='laugh'),
    dict(armL=(-10, -4), armR=(10, -4), hand='open', handR='open', face='laugh'),
    dict(walk=1, armL=(-3, 9), armR=(3, 8), bob=1),
    dict(walk=-1, armL=(2, 9), armR=(-2, 9)),
    # 8~11: 고나 키에 맞춰 무릎을 굽혀 자세를 낮추고(crouch) 앞으로 숙임
    dict(crouch=13, lean=2, head=(-1, 1), armL=(-8, 12), armR=(-9, 14), front=True, face='laugh'),
    dict(crouch=13, lean=3, head=(-4, 4), armL=(-7, 12), armR=(-8, 14), front=True, face='kiss'),
    dict(crouch=13, lean=3, head=(-4, 3), armL=(-7, 12), armR=(-8, 14), front=True, face='sniff'),
    dict(crouch=13, lean=3, head=(-5, 5), armL=(-7, 12), armR=(-8, 14), front=True, face='sniff'),
    # 12·13: 서서 고나 머리를 내려다보며 쓰다듬기
    dict(lean=2, head=(-1, 1), armL=(-12, 6), hand='flat', face='laugh'),
    dict(lean=2, head=(-1, 1), armL=(-12, 9), hand='flat', face='laugh'),
]


def hair(style, cx, hy, P, back, front):
    c = hx(P['hc'])
    hi = mix(c, 1.5) if style != 'grey' else mix(c, 1.25)
    top = hy - 9
    if style == 'tied_low':
        back.ellipse(cx + 0.5, hy - 1, 9.5, 9.5, c)
        back.ellipse(cx + 8, hy + 4, 3, 4, c)  # 뒤로 낮게 묶은 머리
        back.rect(cx + 6, hy + 1, 2, 2, hx('#d9bf8a'))
        front.ellipse(cx + 0.5, top + 4.5, 9.5, 5.5, c)
        front.ellipse(cx - 6, hy - 2, 3.2, 4.5, c)  # 왼쪽 옆으로 넘긴 앞머리
        front.rect(cx + 6, hy - 4, 3, 6, c)
        for x, y in ((cx - 4, top + 2), (cx - 3, top + 2), (cx + 2, top + 3)):
            front.dot(x, y, hi)
    elif style == 'tied_high':
        back.ellipse(cx + 0.5, hy - 1, 9.5, 9.5, c)
        back.ellipse(cx + 7, top + 1, 3.5, 3.5, c)  # 높이 묶은 머리
        back.line(cx + 9, top + 3, cx + 10, hy + 4, 3, c)  # 꼬리
        front.ellipse(cx + 0.5, top + 4, 9.5, 5, c)
        front.rect(cx - 9, hy - 5, 2, 5, c)
        front.rect(cx + 7, hy - 5, 2, 5, c)
        front.rect(cx + 4, top + 1, 2, 2, hx('#3f6aa0'))  # 머리끈
        for x, y in ((cx - 3, top + 2), (cx - 2, top + 2), (cx + 1, top + 2)):
            front.dot(x, y, hi)
    elif style == 'fringe':
        front.ellipse(cx, top + 4.5, 9.8, 6, c)
        for k, x in enumerate(range(int(cx - 8), int(cx + 8), 2)):
            front.rect(x, top + 8, 2, 2 + (k % 2), c)  # 들쭉날쭉 앞머리
        front.rect(cx - 9, hy - 3, 2, 4, c)
        front.rect(cx + 7, hy - 3, 2, 4, c)
        for x in (cx - 5, cx - 1, cx + 3):
            front.dot(x, top + 2, hi)
    elif style == 'short':
        front.ellipse(cx + 0.5, top + 4, 10, 6, c)
        front.ellipse(cx - 4, top + 7, 5, 3, c)  # 옆으로 넘긴 앞머리
        front.rect(cx - 9, hy - 4, 2, 4, c)
        front.rect(cx + 7, hy - 4, 2, 4, c)
        for x, y in ((cx - 6, top + 3), (cx - 5, top + 2), (cx + 2, top + 2), (cx + 3, top + 2)):
            front.dot(x, y, hi)
    elif style == 'perm':
        for dx, dy in ((-9, 0), (-9, 4), (-8, -4), (-5, -7), (-1, -8), (3, -8), (7, -5), (9, -1), (9, 3), (8, 6), (-8, 7)):
            back.ellipse(cx + dx, hy + dy, 2.8, 2.8, c)
        front.ellipse(cx, top + 4, 9, 4.5, c)
        for k, x in enumerate(range(int(cx - 7), int(cx + 8), 3)):
            front.ellipse(x, top + 6 + (k % 2), 2, 2, c)  # 곱슬 앞머리
        for x, y in ((cx - 6, hy - 6), (cx - 2, top + 2), (cx + 3, top + 2), (cx + 7, hy - 4)):
            front.dot(x, y, hi)
    elif style == 'grey':
        back.ellipse(cx + 1, hy - 1, 9.6, 9.4, c)
        front.ellipse(cx + 1, top + 3, 9, 4, c)
        front.rect(cx - 9, hy - 4, 2, 5, c)
        front.rect(cx + 7, hy - 4, 3, 6, c)
        for x, y in ((cx - 4, top + 1), (cx, top + 1), (cx + 4, top + 2)):
            front.dot(x, y, hi)


def face(head, cx, hy, P, kind):
    ey = hy + 1
    lx, rx = cx - 4, cx + 2
    if kind in ('kiss', 'sniff', 'blink'):
        for ex in (lx, rx):
            head.drect(ex - (1 if ex == lx else 0), ey + 1, 2, 1, EYE)
    elif kind == 'laugh':
        for ex in (lx, rx):  # ^ 웃는 눈
            head.dot(ex - 1, ey + 1, EYE)
            head.dot(ex, ey, EYE)
            head.dot(ex + 1, ey + 1, EYE)
    else:
        for ex in (lx, rx):
            head.drect(ex, ey, 1, 2, EYE)
    head.drect(lx - 3, ey + 3, 2, 1, BLUSH)
    head.drect(rx + 2, ey + 3, 2, 1, BLUSH)
    my = ey + 5
    if kind == 'kiss':
        head.drect(cx - 5, my - 1, 2, 2, (206, 84, 98, 255))
    elif kind == 'laugh':
        head.drect(cx - 2, my - 1, 3, 1, MOUTH)
        head.drect(cx - 1, my, 1, 1, (230, 120, 128, 255))
    elif kind == 'sniff':
        head.dot(cx - 1, my - 1, MOUTH)
        head.dot(cx, my - 1, MOUTH)
        head.dot(cx - 8, ey + 3, SKIN_D)
    else:
        head.dot(cx - 2, my - 1, MOUTH)
        head.dot(cx - 1, my, MOUTH)
        head.dot(cx, my - 1, MOUTH)
    if P.get('glasses'):
        g = (26, 20, 22, 255)
        for ex in (lx, rx):
            for x, y in ((-2, -1), (-1, -1), (0, -1), (1, -1), (2, -1), (-2, 0), (2, 0), (-2, 1), (2, 1), (-2, 2), (-1, 2), (0, 2), (1, 2), (2, 2)):
                head.dot(ex + x, ey + y, g)
        head.dot(cx - 1, ey, g)
        head.dot(cx - 8, ey, g)
        head.dot(cx + 6, ey, g)


def arm(part, sx, sy, end, sleeve, hand='fist', sleeve_len=0.4):
    ex, ey = sx + end[0], sy + end[1]
    mx, my = sx + end[0] * sleeve_len, sy + end[1] * sleeve_len
    part.line(sx, sy, mx, my, 4, sleeve)
    part.line(mx, my, ex, ey, 3, SKIN)
    if hand == 'open':
        part.ellipse(ex, ey - 0.5, 2, 2.5, SKIN)
    elif hand == 'flat':
        part.ellipse(ex - 1, ey, 3, 1.6, SKIN)
    else:
        part.ellipse(ex, ey, 1.8, 1.8, SKIN)


def frame(P, pose):
    lean = pose.get('lean', 0)
    bob = pose.get('bob', 0)
    crouch = pose.get('crouch', 0)
    cx = 20 - lean
    foot = FH - 3
    H = P['h']
    top = foot - H + 1 + bob + crouch
    hdx, hdy = pose.get('head', (0, 0))
    hcx = cx + hdx
    hy = top + 9 + hdy
    neck = hy + 9
    leg = int(H * 0.37)
    hip = foot - leg + crouch
    wide = P.get('wide', 0)
    tw = 13 + wide
    tl = cx - tw // 2
    shirt = hx(P['top'])
    sleeve = hx(P.get('top2', P['top'])) if P['pat'] == 'raglan' else shirt

    back = Part(hx(P['hc']))
    legs = Part(hx(P['pants']))
    shoes = Part(hx(P['shoes']))
    body = Part(shirt)
    armB = Part(shirt)
    head = Part(SKIN)
    hairF = Part(hx(P['hc']))
    armF = Part(shirt)

    w = pose.get('walk', 0)
    if crouch:
        # 무릎 굽힘: 허벅지는 앞(왼쪽)으로, 정강이는 아래로
        for side in (-1, 1):
            x = cx + (-5 if side < 0 else 1)
            legs.rect(x - 4, hip, 8, 4)
            legs.rect(x - 4, hip + 2, 4, foot - hip - 3)
            shoes.rect(x - 5, foot - 2, 5, 2)
    for side in (-1, 1) if not crouch else ():
        x = cx + (-5 if side < 0 else 1) + (w * side * 2 if w else 0)
        lift = 1 if (w and side == w) else 0
        legs.rect(x, hip, 4, leg - 2 - lift)
        shoes.rect(x - (1 if side < 0 else 0), foot - 2 - lift, 5, 2)
    body.rect(tl + 1, neck, tw - 2, 1)
    body.rect(tl, neck + 1, tw, hip - neck + 1)
    pat = P['pat']
    if pat == 'stripe':
        for x in range(tl + 1, tl + tw, 2):
            body.drect(x, neck + 1, 1, hip - neck, hx(P['top2']))
        body.drect(cx - 1, neck + 2, 1, hip - neck - 2, mix(shirt, 0.75))
    elif pat == 'camo':
        rnd = random.Random(3)
        for _ in range(16):
            x = tl + rnd.randint(0, tw - 3)
            y = neck + 1 + rnd.randint(0, hip - neck - 2)
            body.drect(x, y, rnd.randint(2, 3), 1, rnd.choice([hx('#6b5a3e'), hx('#56603a'), hx('#1f1c1a')]))
    elif pat == 'logo':
        body.drect(cx - 2, neck + 4, 3, 1, hx('#f2eee6'))
    elif pat == 'raglan':
        body.drect(tl, neck + 1, 3, 4, sleeve)
        body.drect(tl + tw - 3, neck + 1, 3, 4, sleeve)
    elif pat == 'henley':
        body.drect(cx - 1, neck + 1, 1, 5, hx(P['top2']))
        body.dot(cx, neck + 2, hx('#b8b0a2'))
        body.dot(cx, neck + 4, hx('#b8b0a2'))
    if P.get('collar'):
        body.drect(cx - 3, neck + 1, 2, 1, mix(shirt, 0.85))
        body.drect(cx + 1, neck + 1, 2, 1, mix(shirt, 0.85))
    body.drect(tl, hip, tw, 1, mix(hx(P['pants']), 0.9))
    # 머리
    head.ellipse(hcx, hy, 8.5, 9)
    head.rect(hcx - 1, neck - 1, 3, 2)
    hair(P['hair'], hcx, hy, P, back, hairF)
    # 앞머리는 눈썹 위까지만 (눈·얼굴이 가려지지 않게) — 옆머리(얼굴 가장자리)는 남김
    for (x, y) in list(hairF.px):
        if y >= hy - 2 and abs(x + 0.5 - hcx) < 6.5:
            del hairF.px[(x, y)]
    face(head, hcx, hy, P, pose.get('face', 'smile'))
    sy = neck + 2
    sL, sR = (tl + 1, sy), (tl + tw - 2, sy)
    aL = pose.get('armL', (-2, 10))
    aR = pose.get('armR', (2, 10))
    front = pose.get('front')
    arm(armB if not front else armF, sR[0], sR[1], aR, sleeve, pose.get('handR', 'fist'))
    arm(armF, sL[0], sL[1], aL, sleeve, pose.get('hand', 'fist'))
    return [back, legs, shoes, body, armB, head, hairF], armF


def main():
    os.makedirs(OUT, exist_ok=True)
    for pid, P in PEOPLE.items():
        bodyImg = Image.new('RGBA', (FW * N, FH), (0, 0, 0, 0))
        armsImg = Image.new('RGBA', (FW * N, FH), (0, 0, 0, 0))
        for i, pose in enumerate(POSES):
            parts, armF = frame(P, pose)
            for part in parts:
                part.render(bodyImg, i * FW)
            armF.render(armsImg, i * FW)
        bodyImg.save(os.path.join(OUT, f'fam-{pid}.png'))
        armsImg.save(os.path.join(OUT, f'fam-{pid}-arms.png'))
        print(pid, bodyImg.size)


if __name__ == '__main__':
    main()
