"""고나 얼굴 PNG → 앱 아이콘들 (apple-touch-icon 180, favicon 32, PWA 192/512).
원본 그림은 바꾸지 않음: 반투명 체크무늬/그림자 배경만 투명으로 지우고(알파 이진화),
얼굴이 아이콘을 꽉 채우도록 여백만 맞춘 뒤 면적 평균으로 축소. 글자·장식·둥근 모서리 없음."""
from PIL import Image
SRC = 'art-src/icon/gona-face-original.png'
OUT = 'public/'
BG = (255, 244, 224, 255)  # iOS 홈 화면용 배경(투명은 iOS에서 검게 나옴) — 연한 크림색

im = Image.open(SRC).convert('RGBA')
a = im.getchannel('A').point(lambda v: 255 if v >= 128 else 0)
im.putalpha(a)
px = im.load()
for y in range(im.height):
    for x in range(im.width):
        if px[x, y][3] == 0: px[x, y] = (0, 0, 0, 0)
im = im.crop(a.getbbox())
im.save('art-src/icon/gona-face-clean.png')

def square(margin):
    s = max(im.size); c = round(s * (1 + 2 * margin))
    out = Image.new('RGBA', (c, c), (0, 0, 0, 0))
    out.alpha_composite(im, ((c - im.width) // 2, (c - im.height) // 2))
    return out

def make(size, margin, bg=None):
    sq = square(margin).resize((size, size), Image.Resampling.BOX)
    if bg:
        base = Image.new('RGBA', (size, size), bg); base.alpha_composite(sq); sq = base.convert('RGB')
    return sq

make(180, 0.06, BG).save(OUT + 'apple-touch-icon.png')
make(32, 0.0).save(OUT + 'favicon.png')
make(192, 0.04).save(OUT + 'icon-192.png')
make(512, 0.04).save(OUT + 'icon-512.png')
make(512, 0.14, BG).save(OUT + 'icon-maskable-512.png')
print('ok', im.size)
