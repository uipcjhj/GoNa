# 캐릭터 이미지 넣는 곳

이 폴더에 `dino.png` 를 넣으면 기본 도트 캐릭터 대신 자동으로 사용됩니다.

- 프레임을 **가로로 나란히** 이어 붙인 PNG (배경 투명)
  - `[달리기1][달리기2][점프]` → `src/config.ts` 의 `frameCount: 3`
  - 한 장짜리 이미지 → `frameCount: 1`
- 오른쪽을 바라보는 그림
- 각 프레임 크기는 같아야 합니다. 이미지 크기는 자유 (화면에서는 `displayHeight` 높이로 맞춰짐)
- 도트가 선명하려면 프레임 높이가 `displayHeight`(기본 24px)의 정수배이면 가장 좋아요. (24, 48, 72 …)

## 현재 들어 있는 dino.png

`art-src/baby-dino/original_character_sheet.png`(직접 제작한 원본)를
`tools/build_dino_sheet.py` 로 변환한 27×34px × 9프레임 시트입니다.

| 번호 | 포즈 | 사용처 |
| --- | --- | --- |
| 0 | 대기 | 타이틀, 일시정지 |
| 1~4 | 달리기 | 게임 중 달리기 |
| 5 | 점프 | 점프 / 더블 점프 |
| 6 | 눈 감기 | 타이틀 눈 깜빡임 (자동 생성) |
| 7 | 기쁨 | (예비) |
| 8 | 놀람 | (예비) |

원본을 수정했다면 `pip install pillow numpy` 후 `python3 tools/build_dino_sheet.py` 를 다시 실행하세요.
