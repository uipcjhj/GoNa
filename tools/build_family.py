#!/usr/bin/env python3
"""
가족 엔딩 캐릭터 도트 시트 생성기 → public/assets/family/{id}.png

참고: 사용자가 준 '가족 캐릭터 픽셀 아트 시안'(엔딩 - Family Cast Concept Sheet)의 머리 모양·옷 색·키 차이.
  이모: 묶은 긴 갈색 머리 + 베이지 줄무늬 셔츠 + 크림색 바지
  삼촌: 짧은 검은 곱슬머리 + 동그란 안경 + 어두운 무늬 셔츠
  엄마: 옆으로 묶은 갈색 머리 + 밝은 크림색 상의 (아기 없이 — 엔딩의 아기는 고나)
  아빠: 짧은 검은 곱슬머리 + 검은 티셔츠(작은 흰 로고)
  할머니: 짧은 곱슬 파마 + 분홍 상의 + 회색 겉옷
  할아버지: 짧은 회색 머리 + 흰 셔츠 + 베이지 바지
고나와 같은 1:1 도트 · 큰 머리 + 작은 몸 · 갈색 외곽선 · 부위별 층(뒷머리→다리→몸→뒤팔→머리→앞머리→앞팔)마다 외곽선.

프레임 32x48 (발 = 맨 아래 줄, 가운데 x=16, 왼쪽 = 고나 쪽을 봄), 가로 14프레임:
  0 서서 웃기 · 1 웃기(눈 깜빡·살짝 들썩) · 2 손 흔들기 A · 3 손 흔들기 B · 4 두 팔 벌리기 · 5 걷기 A · 6 걷기 B
  7 안아 주기(몸을 숙이고 두 팔을 앞으로) · 8 볼 뽀뽀(입 쭉) · 9 킁카 A · 10 킁카 B · 11 쓰다듬기 A · 12 쓰다듬기 B
  13 품에 안기(두 팔을 가슴 앞에 모음)
사용법: python3 tools/build_family.py   (Pillow 필요)
"""
from PIL import Image
import os

FW, FH, N = 32, 48, 14
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'assets', 'family')
OUTLINE = (74, 43, 24, 255)
SKIN = (249, 214, 178, 255)
SKIN_SH = (234, 182, 146, 255)
BLUSH = (244, 150, 150, 255)
EYE = (58, 36, 20, 255)
MOUTH = (176, 64, 80, 255)
TONGUE = (240, 128, 140, 255)


def hexc(h):
    h = h.lstrip('#')
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), 255)


class Layer:
    def __init__(self):
        self.px = {}

    def put(self, x, y, c):
        if 0 <= x < FW and 0 <= y < FH:
            self.px[(x, y)] = c

    def rect(self, x, y, w, h, c):
        for yy in range(y, y + h):
            for xx in range(x, x + w):
                self.put(xx, yy, c)

    def ellipse(self, cx, cy, rx, ry, c):
        for yy in range(int(cy - ry) - 1, int(cy + ry) + 2):
            for xx in range(int(cx - rx) - 1, int(cx + rx) + 2):
                if ((xx + 0.5 - cx) / rx) ** 2 + ((yy + 0.5 - cy) / ry) ** 2 <= 1:
                    self.put(xx, yy, c)

    def line(self, x0, y0, x1, y1, w, c):
        n = max(abs(x1 - x0), abs(y1 - y0), 1)
        for i in range(n + 1):
            x = x0 + (x1 - x0) * i / n
            y = y0 + (y1 - y0) * i / n
            for dx in range(w):
                for dy in range(w):
                    self.put(round(x - (w - 1) / 2 + dx), round(y - (w - 1) / 2 + dy), c)

    def outlined(self):
        out = dict(self.px)
        for (x, y) in self.px:
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                q = (x + dx, y + dy)
                if q not in self.px and 0 <= q[0] < FW and 0 <= q[1] < FH:
                    out[q] = OUTLINE
        return out


def compose(layers, img, ox):
    for L in layers:
        if L is None:
            continue
        for (x, y), c in L.outlined().items():
            img.putpixel((ox + x, y), c)


# ───────── 인물 설정 (시안의 색·모양) ─────────
PEOPLE = {
    'aunt': dict(h=41, legs=9, hair='aunt', hairc='#3a2418', hairhi='#5e3c26', shirt='#e8d2a6', shirt2='#c9a36a', pattern='stripe',
                 pants='#efe3c4', pants2='#d8c8a0', shoes='#f6f0e4', collar=True),
    'uncle': dict(h=43, legs=10, hair='uncle', hairc='#2b1d16', hairhi='#4a3426', shirt='#3b2c24', shirt2='#7d5c40', pattern='camo',
                  pants='#2f2b2b', pants2='#24201f', shoes='#ece4d6', glasses=True, collar=True),
    'mom': dict(h=41, legs=9, hair='mom', hairc='#4a2e1c', hairhi='#6e4630', shirt='#f2dfbe', shirt2='#dcc39c', pattern='plain',
                pants='#4c464a', pants2='#3a3438', shoes='#f2eadc'),
    'dad': dict(h=43, legs=10, hair='dad', hairc='#2a1c14', hairhi='#46301f', shirt='#2b2727', shirt2='#1e1b1b', pattern='logo',
                pants='#3d3939', pants2='#2c2828', shoes='#ece4d6', wide=1),
    'grandma': dict(h=37, legs=7, hair='grandma', hairc='#3c2a20', hairhi='#5c4234', shirt='#f4a8b6', shirt2='#e0899a', pattern='cardigan',
                    pants='#3b3436', pants2='#2c2628', shoes='#ece4d6', cardigan='#a9a5ab'),
    'grandpa': dict(h=39, legs=8, hair='grandpa', hairc='#b3ada3', hairhi='#d6d0c6', shirt='#f5f1e8', shirt2='#d9d1c4', pattern='pocket',
                    pants='#b99c6c', pants2='#9c8152', shoes='#5a4a3a', collar=True),
}

# 프레임별 자세: 몸 기울임(lean, 왼쪽 +) · 머리 추가 이동 · 팔 끝(어깨 기준) · 다리 · 얼굴
POSES = [
    dict(name='idle'),
    dict(name='idle2', bob=1, blink=True),
    dict(name='waveA', armL=(-7, -10), hand='open'),
    dict(name='waveB', armL=(-8, -7), hand='open'),
    dict(name='open', armL=(-9, -3), armR=(9, -3)),
    dict(name='walkA', walk=1, armL=(-3, 8), armR=(3, 7)),
    dict(name='walkB', walk=-1, armL=(1, 8), armR=(-1, 8), bob=1),
    dict(name='hug', lean=2, headx=1, armL=(-12, 3), armR=(-13, 5), armRfront=True),
    dict(name='kiss', lean=3, headx=2, heady=1, armL=(-8, 4), armR=(-9, 6), armRfront=True, face='kiss'),
    dict(name='sniffA', lean=3, headx=2, heady=1, armL=(-8, 3), armR=(-9, 6), armRfront=True, face='sniff'),
    dict(name='sniffB', lean=3, headx=3, heady=2, armL=(-8, 4), armR=(-9, 6), armRfront=True, face='sniff'),
    dict(name='patA', lean=1, armL=(-10, -8), hand='flat', armR=(1, 8)),
    dict(name='patB', lean=1, armL=(-10, -5), hand='flat', armR=(1, 8)),
    dict(name='hold', lean=1, armL=(-2, 7), armR=(-4, 6), armRfront=True, hold=True),
]


def draw_hair(style, cx, hy, top, P, back, front):
    hc, hh = hexc(P['hairc']), hexc(P['hairhi'])
    # 공통: 머리 윗부분을 덮는 머리카락 (이마는 보이게)
    def cap(extra=0.0):
        front.ellipse(cx, top + 5, 10.6 + extra, 5.0 + extra * 0.4, hc)
    if style == 'aunt':
        back.ellipse(cx + 1, hy + 1, 11.5, 11, hc)
        back.rect(cx + 5, hy + 1, 7, 12, hc)  # 어깨까지 오는 뒷머리
        back.ellipse(cx + 12, hy + 9, 3.2, 3.6, hc)  # 낮게 묶은 머리
        back.rect(cx + 10, hy + 6, 3, 2, hexc('#e6c890'))  # 베이지 머리끈
        cap()
        front.rect(cx - 11, hy - 4, 3, 11, hc)  # 왼쪽 옆머리 (턱까지)
        front.rect(cx - 8, top + 9, 7, 2, hc)  # 옆으로 넘긴 앞머리
        front.rect(cx - 2, top + 9, 3, 1, hc)
        for dx in (-5, -4, 3):
            front.put(cx + dx, top + 2, hh)
    elif style == 'mom':
        back.ellipse(cx + 1, hy, 11.3, 10.6, hc)
        back.ellipse(cx + 10, top + 3, 4.2, 4, hc)  # 옆으로 높이 묶은 머리 (동그랗게)
        back.line(cx + 12, top + 6, cx + 13, hy + 7, 3, hc)  # 꼬리
        back.rect(cx + 8, top + 5, 2, 2, hexc('#c46a8a'))  # 머리끈
        cap(-0.3)
        front.rect(cx - 11, hy - 4, 2, 7, hc)
        front.rect(cx - 9, top + 9, 8, 2, hc)
        for dx in (-3, -2, 4):
            front.put(cx + dx, top + 2, hh)
    elif style in ('uncle', 'dad'):
        cap(0.4)
        # 곱슬곱슬 윗머리 (작은 동그라미가 울퉁불퉁 · 아빠가 더 풍성)
        r = 2.6 if style == 'dad' else 2.2
        for i, dx in enumerate(range(-10, 12, 3)):
            front.ellipse(cx + dx, top + 2 + (i % 2), r, r, hc)
        front.rect(cx - 11, hy - 4, 2, 5, hc)
        front.rect(cx + 9, hy - 4, 3, 5, hc)
        front.rect(cx - 9, top + 9, 5, 2, hc)
        front.rect(cx - 3, top + 9, 2, 1, hc)
        for dx in (-6, -1, 4, 8):
            front.put(cx + dx, top + 2, hh)
    elif style == 'grandma':
        # 짧은 곱슬 파마 (머리 둘레를 동그라미로 부풀림)
        for dx, dy in ((-11, 3), (-11, 7), (-9, -1), (-5, -3), (0, -4), (5, -3), (9, -1), (11, 3), (11, 7), (10, 11), (-10, 11)):
            back.ellipse(cx + dx, top + 6 + dy, 3.2, 3.2, hc)
        cap(-0.2)
        for i, dx in enumerate(range(-9, 11, 3)):
            front.ellipse(cx + dx, top + 3 + (i % 2), 2.3, 2.3, hc)
        front.rect(cx - 8, top + 9, 6, 1, hc)
        for dx in (-6, -2, 3, 7):
            front.put(cx + dx, top + 3, hh)
    elif style == 'grandpa':
        # 짧은 회색 머리 (옆·뒤는 남고 이마가 넓음)
        back.ellipse(cx + 1, hy - 1, 11.4, 10.4, hc)
        front.ellipse(cx + 1, top + 3, 10.2, 4, hc)
        front.rect(cx - 11, hy - 5, 2, 6, hc)
        front.rect(cx + 9, hy - 5, 3, 7, hc)
        for dx in (-5, -1, 3, 7):
            front.put(cx + dx, top + 2, hh)


def draw_face(L, cx, ey, P, pose):
    face = pose.get('face')
    ex0, ex1 = cx - 7, cx + 1  # 왼쪽(고나 쪽)을 보도록 1칸 치우침
    closed = face in ('kiss', 'sniff') or pose.get('blink')
    for ex in (ex0, ex1):
        if closed:
            L.rect(ex, ey + 1, 4, 1, EYE)  # 눈 감음 (ㅡ)
            L.put(ex, ey, EYE)
        else:
            L.put(ex, ey + 1, EYE)  # 웃는 눈 (^ 4칸)
            L.rect(ex + 1, ey, 2, 1, EYE)
            L.put(ex + 3, ey + 1, EYE)
    L.rect(ex0 - 2, ey + 3, 3, 2, BLUSH)
    L.rect(ex1 + 4, ey + 3, 3, 2, BLUSH)
    if face == 'kiss':
        L.rect(cx - 7, ey + 5, 2, 2, MOUTH)  # 입술 쭉 (왼쪽)
        L.put(cx - 8, ey + 6, MOUTH)
    elif face == 'sniff':
        L.put(cx - 3, ey + 6, MOUTH)  # 살짝 웃는 입
        L.put(cx - 2, ey + 6, MOUTH)
        L.rect(cx - 11, ey + 3, 2, 2, SKIN)  # 코를 쭉 내밂 (킁킁)
        L.put(cx - 11, ey + 4, SKIN_SH)
    else:
        L.rect(cx - 4, ey + 5, 4, 2, MOUTH)  # 활짝 웃는 입
        L.rect(cx - 3, ey + 6, 2, 1, TONGUE)
    if P.get('glasses'):
        g = hexc('#1e1612')
        for ex in (ex0, ex1):
            for x, y in ((0, -2), (1, -2), (2, -2), (3, -2), (-1, -1), (4, -1), (-1, 0), (4, 0), (-1, 1), (4, 1), (-1, 2), (4, 2), (0, 3), (1, 3), (2, 3), (3, 3)):
                L.put(ex + x, ey + y, g)
        L.put(cx - 2, ey - 1, g)
        L.put(cx - 1, ey - 1, g)
        L.put(cx + 6, ey - 1, g)
        L.put(cx + 7, ey - 1, g)
    if P['hair'] == 'grandpa':
        L.rect(ex0, ey - 2, 4, 1, hexc('#9a948a'))
        L.rect(ex1, ey - 2, 4, 1, hexc('#9a948a'))


def draw_arm(L, sx, sy, end, P, sleeve, hand='fist'):
    ex, ey = sx + end[0], sy + end[1]
    mx, my = sx + end[0] * 0.35, sy + end[1] * 0.35
    L.line(sx, sy, round(mx), round(my), 3, sleeve)
    L.line(round(mx), round(my), ex, ey, 3, SKIN)
    if hand == 'open':
        L.rect(ex - 1, ey - 2, 3, 4, SKIN)
        L.put(ex - 1, ey - 3, SKIN)
        L.put(ex + 1, ey - 3, SKIN)
    elif hand == 'flat':
        L.rect(ex - 3, ey - 1, 5, 2, SKIN)
    else:
        L.ellipse(ex + 0.5, ey + 0.5, 1.8, 1.8, SKIN)


def draw_frame(P, pose):
    lean = pose.get('lean', 0)
    bob = pose.get('bob', 0)
    cx = 16 - lean
    foot = FH - 1
    H = P['h']
    legs = P['legs']
    top = foot - H + 1 + bob
    hx = cx - pose.get('headx', 0)
    hy = top + 10 + pose.get('heady', 0)
    head_bottom = hy + 9
    hip = foot - legs
    wide = P.get('wide', 0)
    tw = 12 + wide * 2
    tl = cx - tw // 2
    shirt, shirt2 = hexc(P['shirt']), hexc(P['shirt2'])
    pants, pants2 = hexc(P['pants']), hexc(P['pants2'])

    back, legsL, body, armB, head, frontHair, armF = (Layer() for _ in range(7))
    # 다리 (걷기: 한쪽 앞으로)
    w = pose.get('walk', 0)
    for i, side in enumerate((-1, 1)):
        x = cx + (-4 if side < 0 else 1) + (w * side if w else 0)
        lift = 1 if (w and side == w) else 0
        legsL.rect(x, hip, 4, legs - 1 - lift, pants)
        legsL.rect(x + (0 if side < 0 else 2), hip, 1, legs - 1 - lift, pants2)
        legsL.rect(x - (1 if side < 0 else 0), foot - lift, 5, 1, hexc(P['shoes']))
    # 몸통 (위가 조금 좁은 둥근 상자)
    body.rect(tl + 1, head_bottom - 1, tw - 2, 1, shirt)
    body.rect(tl, head_bottom, tw, hip - head_bottom + 1, shirt)
    pat = P['pattern']
    if pat == 'stripe':
        for x in range(tl + 1, tl + tw, 3):
            body.rect(x, head_bottom + 1, 1, hip - head_bottom, shirt2)
    elif pat == 'camo':
        spots = [(1, 2), (5, 1), (9, 3), (3, 6), (8, 7), (11, 5), (2, 10), (6, 11), (10, 10), (4, 13), (9, 14)]
        for (dx, dy) in spots:
            if head_bottom + dy <= hip:
                body.rect(tl + dx, head_bottom + dy, 2, 1, shirt2)
                body.put(tl + dx + 1, head_bottom + dy + 1, hexc('#5a4030'))
    elif pat == 'logo':
        body.rect(cx - 3, head_bottom + 3, 4, 1, hexc('#f4f0e8'))
        body.rect(tl + tw - 2, head_bottom, 2, hip - head_bottom + 1, shirt2)
    elif pat == 'cardigan':
        cg = hexc(P['cardigan'])
        body.rect(tl, head_bottom, 3, hip - head_bottom + 1, cg)
        body.rect(tl + tw - 3, head_bottom, 3, hip - head_bottom + 1, cg)
        body.put(cx - 1, head_bottom + 4, hexc('#ff6f8e'))  # 작은 하트 무늬
        body.put(cx + 1, head_bottom + 4, hexc('#ff6f8e'))
        body.rect(cx - 1, head_bottom + 5, 3, 1, hexc('#ff6f8e'))
        body.put(cx, head_bottom + 6, hexc('#ff6f8e'))
    elif pat == 'pocket':
        body.rect(cx + 1, head_bottom + 3, 3, 3, shirt2)
        body.rect(cx + 2, head_bottom + 4, 1, 1, shirt)
        body.rect(cx - 1, head_bottom + 1, 1, hip - head_bottom, shirt2)
    else:
        body.rect(tl + tw - 2, head_bottom, 2, hip - head_bottom + 1, shirt2)
    if P.get('collar'):
        body.put(cx - 2, head_bottom, shirt2)
        body.put(cx + 1, head_bottom, shirt2)
    # 허리선
    body.rect(tl, hip, tw, 1, pants)
    # 머리 (큰 머리 · 얼굴은 왼쪽을 봄)
    head.ellipse(hx, hy, 10.5, 10, SKIN)
    head.rect(hx + 6, hy + 3, 2, 4, SKIN_SH)
    draw_hair(P['hair'], hx, hy, top, P, back, frontHair)
    draw_face(head, hx, hy + 2, P, pose)  # 얼굴은 머리 층 안에 (외곽선은 머리 둘레에만)
    # 팔
    sy = head_bottom + 2
    sL, sR = (tl + 1, sy), (tl + tw - 2, sy)
    armL = pose.get('armL', (-1, 9))
    armR = pose.get('armR', (1, 9))
    hand = pose.get('hand', 'fist')
    if pose.get('hold'):
        # 품에 안기: 두 팔을 가슴 앞에서 둥글게 모음
        draw_arm(armF, sL[0], sL[1], (2, 6), P, shirt)
        draw_arm(armF, sR[0], sR[1], (-9, 6), P, shirt)
    else:
        draw_arm(armB if not pose.get('armRfront') else armF, sR[0], sR[1], armR, P, shirt)
        draw_arm(armF, sL[0], sL[1], armL, P, shirt, hand)
    return [back, legsL, body, armB, head, frontHair, armF]


def build(pid, P):
    img = Image.new('RGBA', (FW * N, FH), (0, 0, 0, 0))
    for i, pose in enumerate(POSES):
        layers = draw_frame(P, pose)
        compose(layers, img, i * FW)
    return img


def main():
    os.makedirs(OUT, exist_ok=True)
    for pid, P in PEOPLE.items():
        img = build(pid, P)
        img.save(os.path.join(OUT, f'{pid}.png'))
        print(pid, img.size)


if __name__ == '__main__':
    main()
