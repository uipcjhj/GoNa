"""GONA LOVE 의 L·V·E 쿠키 (32×32 · 20×20) — 기존 G·O·N·A 쿠키 그림에서 만듦.

1) 빈 쿠키: O 쿠키의 테두리·반죽을 그대로 두고, 글자 자리만 다른 쿠키(G·N·A)의 같은 자리 반죽 픽셀로 채움
2) 글자: 기존 글자와 같은 굵기(32px 4~5칸 · 20px 3칸)의 L·V·E 모양에
   기존 글자 색 단계(밝은 점 · 본색 · 어두운 테두리)를 그대로 입힘 — 새 색 없음
   L = G 의 분홍 · V = N 의 초록 · E = A 의 파랑 (O 는 기존 O 그대로 재사용)
사용: python3 tools/art/love_cookies.py public/assets/bangeul
"""
import colorsys
import sys

import numpy as np
from PIL import Image, ImageDraw

D = sys.argv[1] if len(sys.argv) > 1 else 'public/assets/bangeul'
HUE = {'g': (0.88, 1.01), 'o': (0.07, 0.15), 'n': (0.2, 0.45), 'a': (0.52, 0.7)}


def load(l, small):
    return np.array(Image.open(f"{D}/gona-cookie-{l}{'-s' if small else ''}.png").convert('RGBA')).astype(np.int32)


def letter_mask(a, l):
    h, w = a.shape[:2]
    m = np.zeros((h, w), bool)
    lo, hi = HUE[l]
    for y in range(h):
        for x in range(w):
            r, g, b, al = a[y, x]
            if al < 128:
                continue
            hh, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            if l == 'g' and hh < 0.05:
                hh += 1
            if lo <= hh <= hi and s > (0.62 if l == 'o' else 0.35) and v > 0.35:
                m[y, x] = True
    return m


def blank(small):
    """칸마다 네 쿠키(G·O·N·A) 중 반죽 색에 가장 가까운 픽셀 — 글자는 쿠키마다 자리가 달라 반죽만 남음 (테두리는 O 그대로)"""
    cs = [load(l, small) for l in 'ogna']
    base = cs[0].copy()
    h, w = base.shape[:2]
    solid = np.all([c[:, :, 3] > 200 for c in cs], axis=0)
    # 테두리에서 3칸 안쪽만 바꿈
    inner = solid.copy()
    for _ in range(3):
        inner = inner & np.roll(inner, 1, 0) & np.roll(inner, -1, 0) & np.roll(inner, 1, 1) & np.roll(inner, -1, 1)
    dough = np.median(np.concatenate([c[inner][:, :3] for c in cs]), axis=0)
    stack = np.stack([c[:, :, :3] for c in cs])
    dist = np.abs(stack - dough).sum(-1)
    best = dist.argmin(0)
    for y, x in zip(*np.nonzero(inner)):
        base[y, x] = cs[best[y, x]][y, x]
    # 네 쿠키 모두 글자인 칸(색이 반죽과 먼 칸) → 가장 가까운 반죽 칸을 복사 (반죽 질감 유지)
    import colorsys as _c

    def doughy(px):
        hh, ss, vv = _c.rgb_to_hsv(*(px[:3] / 255))
        return 0.05 <= hh <= 0.12 and 0.2 < ss < 0.55 and np.abs(px[:3] - dough).sum() < 70

    good = np.zeros((h, w), bool)
    for y, x in zip(*np.nonzero(inner)):
        good[y, x] = doughy(base[y, x])
    bad = inner & ~good
    gy, gx = np.nonzero(good)
    for y, x in zip(*np.nonzero(bad)):
        d = (gy - y) ** 2 + (gx - x) ** 2 * 1.0 + (gy < y) * 0.5  # 같은 거리면 위쪽(밝은 반죽) 우선
        k = d.argmin()
        base[y, x] = base[gy[k], gx[k]]
    return base


def ramp(l, small):
    a = load(l, small)
    m = letter_mask(a, l)
    px = a[m][:, :3]
    lum = px @ np.array([0.3, 0.59, 0.11])
    order = px[np.argsort(lum)]
    q = lambda f: tuple(int(c) for c in order[min(len(order) - 1, int(f * len(order)))])
    return {'dark': q(0.06), 'shade': q(0.3), 'mid': q(0.62), 'light': q(0.97)}


def glyph(ch, n):
    """n = 32 · 20 — 8배로 그린 뒤 줄여 딱 떨어지는 칸으로"""
    k = 8
    im = Image.new('L', (n * k, n * k), 0)
    d = ImageDraw.Draw(im)
    if n == 32:
        x0, x1, y0, y1, t = 8.5, 23.5, 6, 24, 4.6
    else:
        x0, x1, y0, y1, t = 5, 15, 4, 15.5, 3
    S = lambda *v: [c * k for c in v]
    if ch == 'l':
        d.rectangle(S(x0 + 1, y0, x0 + 1 + t, y1), fill=255)
        d.rectangle(S(x0 + 1, y1 - t, x1 - 0.5, y1), fill=255)
    elif ch == 'e':
        tb = t * (0.82 if n == 32 else 0.75)
        d.rectangle(S(x0 + 0.5, y0, x0 + 0.5 + t, y1), fill=255)
        d.rectangle(S(x0 + 0.5, y0, x1, y0 + tb), fill=255)
        mid = (y0 + y1) / 2
        d.rectangle(S(x0 + 0.5, mid - tb / 2, x1 - (2 if n == 32 else 1.2), mid + tb / 2), fill=255)
        d.rectangle(S(x0 + 0.5, y1 - tb, x1, y1), fill=255)
    elif ch == 'v':
        cx = (x0 + x1) / 2
        d.polygon(S(x0 - 0.5, y0, x0 - 0.5 + t * 1.05, y0, cx, y1 - t * 1.25, x1 + 0.5 - t * 1.05, y0, x1 + 0.5, y0, cx + t * 0.62, y1, cx - t * 0.62, y1), fill=255)
    m = np.array(im.resize((n, n), Image.BOX)) > 120
    # 모서리 한 칸 둥글게 (기존 글자처럼)
    out = m.copy()
    for y, x in zip(*np.nonzero(m)):
        up = y > 0 and m[y - 1, x]
        dn = y < n - 1 and m[y + 1, x]
        lf = x > 0 and m[y, x - 1]
        rt = x < n - 1 and m[y, x + 1]
        if (not up and not lf) or (not up and not rt) or (not dn and not lf) or (not dn and not rt):
            if ch != 'v' and (up + dn + lf + rt) <= 2:
                out[y, x] = False
    return out


def paint(base, m, rp):
    a = base.copy()
    n = m.shape[0]
    has = lambda y, x: 0 <= y < n and 0 <= x < n and m[y, x]
    # 글자 아래·오른쪽으로 어두운 그림자 한 칸 (기존 글자처럼 반죽 위에 떠 보이게)
    for y, x in zip(*np.nonzero(m)):
        for dy, dx in ((1, 0), (1, 1)):
            yy, xx = y + dy, x + dx
            if 0 <= yy < n and 0 <= xx < n and not m[yy, xx] and a[yy, xx, 3] > 200:
                a[yy, xx, :3] = (np.array(rp['dark']) * 0.75 + a[yy, xx, :3] * 0.25).astype(int)
    for y, x in zip(*np.nonzero(m)):
        bottom = not has(y + 1, x)
        right = not has(y, x + 1)
        top = not has(y - 1, x)
        left = not has(y, x - 1)
        if bottom or (right and not top):
            c = rp['dark'] if bottom else rp['shade']
        elif top and left:
            c = rp['light']
        elif top or left:
            c = rp['mid']
        else:
            c = rp['mid'] if (x + y) % 5 else rp['shade']
        a[y, x, :3] = c
        a[y, x, 3] = 255
    # 반짝 점 (기존 글자처럼 위쪽에 1~2개)
    ys, xs = np.nonzero(m)
    if len(ys):
        y = ys.min() + 1
        row = [x for x in xs[ys == y] if has(y - 1, x) and has(y + 1, x)]
        if row:
            a[y, row[0], :3] = rp['light']
    return a


if __name__ == '__main__':
    src = {'l': 'g', 'v': 'n', 'e': 'a'}
    for small in (False, True):
        n = 20 if small else 32
        b = blank(small)
        Image.fromarray(b.astype(np.uint8)).save(f"{D}/../../../tools/art/.cookie-blank{'-s' if small else ''}.png") if False else None
        for ch, s in src.items():
            out = paint(b, glyph(ch, n), ramp(s, small))
            Image.fromarray(out.astype(np.uint8), 'RGBA').save(f"{D}/gona-cookie-{ch}{'-s' if small else ''}.png")
            print('wrote', ch, n)
