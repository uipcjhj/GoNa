# 게임 플레이 배경 이미지

- `game-bg-loop.png` (1280×360): 원본 배경(`art-src/game-bg/gona-background-original.png`, 640×360)에
  좌우 반전본을 이어 붙여 경계선 없이 반복되게 만든 이미지. `python3 tools/build_game_bg.py` 로 다시 만들 수 있습니다.
- 파일이 없으면 코드로 그린 버섯숲 배경(`src/art/gameBg.ts`)이 나옵니다.
- 설정: `src/config.ts` → `GAME_BG`
  - `groundRow` 원본에서 게임 땅과 맞닿는 줄 (기본 300)
  - `scroll` 배경 이동 속도 (땅 = 1, 기본 0.3)
  - `haze` 공룡·간식이 잘 보이도록 얹는 옅은 안개 (기본 0.3)
- 땅 풀 색은 배경 이미지의 풀밭 색에서 자동으로 뽑아 맞춥니다.
