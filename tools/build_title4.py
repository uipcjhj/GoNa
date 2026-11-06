#!/usr/bin/env python3
"""
새 타이틀(오프닝 4종 에셋) 레이어 생성 — art-src/title4/ → public/assets/title4/

  01_background.png      941x1672 세로 배경 (불투명)          → bg.png        (1/4 축소 = 235x418 '도트')
  02_logo.png            2172x724 로고 (투명)                 → logo.png
  03_gona_pose_sheet.png 1536x1024 포즈 6개 (규격 없는 컨셉 시트) → gona-*.png (몸통만 분리·정렬)
  배치 정보(크기·발끝 기준점·가장자리 색) → src/ui/title4-layout.json
  04_props_sheet.png     1536x1024 소품                        → vines/mushrooms/fruit/butterfly/stone/petal-*.png

원칙
  - 원본 알파가 0/250~254 + 1~2 잡티로 되어 있어 128 기준으로 0/255 로 정리 (도트 가장자리 선명)
  - 시트의 각 그림은 연결 요소(connected components)로 분리: 포즈 칸에 붙은 '!'·나비·먼지·속도선은 따로 떼어 냄
  - 모든 그림을 같은 '도트 격자'로 축소 (게임에서 정수 배율 + nearest 로만 확대 → 떨림·번짐 없음)
  - 포즈 정렬 기준: 발끝(아래쪽) + 몸통 무게중심 x → layout.json 의 ax, ay
  - 나비 날갯짓 2번 프레임(날개 접힘)은 여기서 미리 만들어 둠 (실행 중 이미지 처리 없음)
실행: python3 tools/build_title4.py
"""
import json
import os

import numpy as np
from PIL import Image
from scipy import ndimage

SRC = 'art-src/title4'
OUT = 'public/assets/title4'
os.makedirs(OUT, exist_ok=True)


def load(name):
    im = Image.open(os.path.join(SRC, name)).convert('RGBA')
    a = np.array(im)
    a[:, :, 3] = np.where(a[:, :, 3] >= 128, 255, 0)
    return a


def components(a, min_area=150):
    m = a[:, :, 3] > 0
    lab, n = ndimage.label(m, structure=np.ones((3, 3)))
    out = []
    for i, sl in enumerate(ndimage.find_objects(lab)):
        area = int((lab[sl] == i + 1).sum())
        if area >= min_area:
            out.append({'id': i + 1, 'area': area, 'x0': sl[1].start, 'x1': sl[1].stop, 'y0': sl[0].start, 'y1': sl[0].stop})
    return lab, out


def isolate(a, lab, ids, box):
    """ids 에 속한 픽셀만 남긴 box 영역 (x0,y0,x1,y1)"""
    x0, y0, x1, y1 = box
    sub = a[y0:y1, x0:x1].copy()
    keep = np.isin(lab[y0:y1, x0:x1], ids)
    sub[~keep] = 0
    return sub


def shrink(rgba, factor, colors=None):
    """알파 premultiply → 면적 평균(BOX) 축소 → 알파 0/255 → (선택) 색 정리"""
    h, w = rgba.shape[:2]
    nw, nh = max(1, round(w / factor)), max(1, round(h / factor))
    f = rgba.astype(np.float32) / 255.0
    pre = np.dstack([f[:, :, :3] * f[:, :, 3:4], f[:, :, 3:4]])
    im = Image.fromarray((pre * 255).astype(np.uint8), 'RGBA').resize((nw, nh), Image.BOX)
    p = np.array(im).astype(np.float32) / 255.0
    al = p[:, :, 3:4]
    rgb = np.where(al > 0.001, p[:, :, :3] / np.maximum(al, 0.001), 0)
    alpha = (al[:, :, 0] >= 0.5).astype(np.float32)
    out = np.dstack([np.clip(rgb, 0, 1), alpha])
    res = Image.fromarray((out * 255).round().astype(np.uint8), 'RGBA')
    if colors:
        rgbim = res.convert('RGB').quantize(colors=colors, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert('RGB')
        res = Image.merge('RGBA', (*rgbim.split(), res.getchannel('A')))
    return res


def trim(im):
    bb = im.getchannel('A').getbbox()
    return im.crop(bb), bb


layout = {'version': 1, 'note': '좌표는 도트(배경 1/4 축소) 단위. ax/ay = 발끝 기준점(그림 왼쪽 위에서)', 'sprites': {}}


def save(name, im, **extra):
    im.save(os.path.join(OUT, name + '.png'), optimize=True)
    layout['sprites'][name] = {'w': im.width, 'h': im.height, **extra}


# ── 1. 배경 ─────────────────────────────────────────────
bg = Image.open(os.path.join(SRC, '01_background.png')).convert('RGB')
BG_F = 4
bgs = bg.resize((round(bg.width / BG_F), round(bg.height / BG_F)), Image.BOX)
bgs = bgs.quantize(colors=96, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert('RGB')
bgs.save(os.path.join(OUT, 'bg.png'), optimize=True)
layout['bg'] = {'w': bgs.width, 'h': bgs.height}
# 가로 화면 양옆 띠용: 배경을 아주 작게 줄여 흐리고 조금 어둡게 (미리 만들어 둠 — 실행 중 이미지 처리 없음)
from PIL import ImageFilter, ImageEnhance
side = bg.resize((24, 42), Image.BOX).filter(ImageFilter.GaussianBlur(1.6))
side = ImageEnhance.Brightness(side).enhance(0.78)
side = ImageEnhance.Color(side).enhance(0.85)
side.save(os.path.join(OUT, 'bg-side.png'), optimize=True)
# (참고) 배경 맨 왼쪽/오른쪽 열의 평균색(위→아래)
arr = np.array(bgs).astype(np.float32)
layout['bgEdge'] = {
    side: ['#%02x%02x%02x' % tuple(int(v) for v in arr[y0:y0 + 21, cols].reshape(-1, 3).mean(0)) for y0 in range(0, bgs.height, 21)]
    for side, cols in (('left', slice(0, 4)), ('right', slice(bgs.width - 4, bgs.width)))
}

# ── 2. 로고 ─────────────────────────────────────────────
logo_a = load('02_logo.png')
logo, _ = trim(shrink(logo_a, 8.5))
save('logo', logo)

# ── 3. 고나 포즈 (몸통 연결 요소만) ──────────────────────
pa = load('03_gona_pose_sheet.png')
lab, comps = components(pa)
big = sorted([c for c in comps if c['area'] > 50000], key=lambda c: (c['y0'] > 500, c['x0']))
# 시트 배치: 위 줄 = 놀람(왼쪽 봄) · 걷기1 · 걷기2 / 아래 줄 = 잠자리채 · 과일 먹기 · 총총 뛰기 (오른쪽 봄)
names = ['gona-surprise', 'gona-walk1', 'gona-walk2', 'gona-net', 'gona-eat', 'gona-trot']
faces = ['left', 'right', 'right', 'left', 'right', 'right']
GONA_F = 4.0
for c, name, face in zip(big, names, faces):
    box = (c['x0'], c['y0'], c['x1'], c['y1'])
    ids = [c['id']]
    # 놀람·먹기 포즈의 '!' 표시는 포즈에 붙여 둠 (표정의 일부), 나비·먼지·속도선은 뗌
    pad = 70
    if name in ('gona-surprise', 'gona-eat'):
        for o in comps:
            if o['area'] < 2000 and o['x0'] >= c['x0'] - pad and o['x1'] <= c['x1'] + pad and o['y0'] >= c['y0'] - pad and o['y1'] <= c['y1']:
                ids.append(o['id'])
                box = (min(box[0], o['x0']), min(box[1], o['y0']), max(box[2], o['x1']), max(box[3], o['y1']))
    sub = isolate(pa, lab, ids, box)
    body = (lab[box[1]:box[3], box[0]:box[2]] == c['id'])
    ys, xs = np.nonzero(body)
    cx = xs.mean()  # 몸통 무게중심
    im = shrink(sub, GONA_F, colors=40)
    save(name, im, face=face, ax=round(cx / GONA_F), ay=round((c['y1'] - box[1]) / GONA_F))

# ── 4. 소품 ─────────────────────────────────────────────
qa = load('04_props_sheet.png')
lab, comps = components(qa)


def comp_at(x, y):
    i = lab[y, x]
    return next(c for c in comps if c['id'] == i)


def prop(name, c, factor, extra_ids=(), colors=32, **kw):
    box = [c['x0'], c['y0'], c['x1'], c['y1']]
    for e in extra_ids:
        box = [min(box[0], e['x0']), min(box[1], e['y0']), max(box[2], e['x1']), max(box[3], e['y1'])]
    sub = isolate(qa, lab, [c['id'], *[e['id'] for e in extra_ids]], box)
    im, _ = trim(shrink(sub, factor, colors=colors))
    save(name, im, **kw)
    return sub


by_area = sorted(comps, key=lambda c: -c['area'])
vines = next(c for c in by_area if c['x0'] < 100 and c['y0'] < 200)
mush = next(c for c in by_area if 500 < c['x0'] < 600 and c['y0'] < 200)
fruit = next(c for c in by_area if c['x0'] > 1000 and c['y0'] < 200)
stone = next(c for c in by_area if 500 < c['x0'] < 600 and c['y0'] > 500)
bfly = next(c for c in by_area if c['x0'] < 200 and c['y0'] > 600 and c['area'] > 20000)
prop('vines', vines, 4.0)
prop('mushrooms', mush, 5.5)
prop('fruit', fruit, 9.0)
prop('stone', stone, 4.5)
# 나비: 펼침 + 날개 접힘(가로 55%로 미리 축소)
bsub = isolate(qa, lab, [bfly['id']], (bfly['x0'], bfly['y0'], bfly['x1'], bfly['y1']))
b0, _ = trim(shrink(bsub, 9.0, colors=24))
save('butterfly-0', b0)
h, w = bsub.shape[:2]
folded = Image.fromarray(bsub).resize((round(w * 0.5), h), Image.BOX)
canvas = Image.new('RGBA', (w, h))
canvas.paste(folded, (round(w * 0.27), 0))
b1, _ = trim(shrink(np.array(canvas), 9.0, colors=24))
save('butterfly-1', b1)
# 꽃잎 (큰 조각 몇 개)
petals = [c for c in comps if c['x0'] > 1100 and c['y0'] > 580 and c['area'] > 1000]
for i, c in enumerate(sorted(petals, key=lambda c: -c['area'])[:4]):
    prop(f'petal-{i}', c, 9.0, colors=12)
layout['petals'] = min(4, len(petals))

with open('src/ui/title4-layout.json', 'w') as f:
    json.dump(layout, f, ensure_ascii=False, indent=1)
print(json.dumps({k: (v['w'], v['h']) for k, v in layout['sprites'].items()}, ensure_ascii=False))
print('bg', layout['bg'])
