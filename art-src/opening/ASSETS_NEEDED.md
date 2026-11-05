# 오프닝을 '진짜 애니메이션'으로 완성하는 데 필요한 그림

지금 대표 타이틀의 큰 고나는 원본 그림 1장(한 자세)뿐이라, 걷기·고개 돌리기·점프를
프레임 애니메이션으로 만들 수 없습니다. 아래 PNG 를 주시면 코드 수정 없이 자동으로 적용됩니다.

## 1. 대표 타이틀 고나 스프라이트 시트 (가장 중요)
- 파일: `public/assets/title/gona-title-sheet.png`
- 형식: 배경 투명 PNG, **같은 크기 프레임 18장을 가로 한 줄로**
- 프레임 크기: **380 × 470 px** (원본 타이틀 그림 1448×1086 안의 고나와 같은 크기, 발끝이 프레임 바닥)
- 그림체·색: 지금 타이틀 고나와 동일 (물방울 머리카락, 가방, 볼터치)

| 번호 | 동작 |
| --- | --- |
| 0–3 | 대기: 숨쉬기 (몸이 아주 조금 부풀었다 줄어듦) |
| 4 | 눈 감기 |
| 5 | 왼쪽 보기 (고개만) |
| 6 | 오른쪽 보기 |
| 7–12 | 걷기 한 주기 (왼발·오른발 6장) |
| 13–17 | 통통 뛰기 (웅크림 → 공중 → 착지) |

프레임 수가 다르면 `src/ui/cover.ts` 의 `GONA_SHEET` 번호만 바꾸면 됩니다.

## 2. 흔들릴 배경 요소 (선택, 있으면 훨씬 자연스러움)
원본 그림의 큰 버섯·덩굴은 외곽선이 끊겨 있어 자동으로 깔끔히 오려낼 수 없습니다.
아래를 **원본과 같은 크기·같은 위치 기준(1448×1086 캔버스)의 투명 PNG** 로 주시면 실제로 바람에 흔들리게 만들 수 있습니다.
- `public/assets/title/parts/mushroom-top-left.png` (왼쪽 위 큰 버섯)
- `public/assets/title/parts/mushroom-top-right.png`
- `public/assets/title/parts/mushroom-mid-left.png`, `mushroom-right.png`
- `public/assets/title/parts/vines-top.png`, `vines-right.png` (늘어진 덩굴·잎)
- `public/assets/title/parts/background-no-gona.png` (고나·로고·버섯을 뺀 바탕)

## 3. 알 부화 장면 (선택)
지금은 게임 도트(둥지·알·갓난아기 3프레임)로 만들었습니다. 더 풍부하게 하려면:
- `public/assets/opening/newborn-hatch.png` — 갓난아기 고나 프레임 (32×32 내외, 가로 한 줄):
  앉기 / 눈 감기 / 왼쪽 보기 / 오른쪽 보기 / 기지개 / 하품 등 6~8장
