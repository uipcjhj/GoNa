# GONA's Food Adventure — 작업 원칙

## 비주얼 에셋 원칙 (필수)
- 캐릭터·몬스터·보스·건축물·주요 배경은 **승인된 이미지 에셋만** 사용한다.
  CSS·SVG·Canvas 도형이나 픽셀 배열 코드로 임의로 그려 대체하지 않는다.
- 확정 레퍼런스 이미지가 있으면 그것을 최우선 기준으로 하고, 다른 디자인을 새로 만들지 않는다.
- 필요한 에셋이 없으면 임시 도형으로 채워 완성된 것처럼 보고하지 말고, 구현 전에 필요한 이미지(규격·적용 위치)를 먼저 요청한다.
- 받은 에셋은 게임용으로 분리·최적화해서 쓴다 (예: tools/art/witch_from_reference.py).
- 코드로 그려도 되는 것: 작은 파티클, 공격 예고선·과녁, HP 바 등 단순 UI·효과.
- 현재 개발판에 남아 있는 임시 코드 그림(승인 에셋으로 교체 예정, 그때까지 숨기거나 지우지 않음):
  src/art/castleArt.ts (성 실루엣·성 내부·성 바닥·달·흔적 소품), src/art/witchArt.ts 의 witchPot · witchSheet(비상용).

## 배포
- 정식(main → https://uipcjhj.github.io/GoNa/)은 사용자가 명시적으로 승인할 때만. 개발은 claude/dino-snack-game → /GoNa/dev/.
- 자세한 절차: RELEASE.md

## 성 배경 에셋 (받으면 적용)
기준: public/assets/game/game-bg-loop.png 와 같은 772×460 좌표계, 지면선 400번째 줄, 위 100줄은 숲 지붕(가로 화면에서 숨음).
기존 카메라·크롭(GAME_BG.portraitScale 등)을 그대로 써서 세로·가로에서 늘어나거나 잘리지 않게. 성이 고나의 이동 경로(지면선 위 앞쪽)를 가리지 않게.
1. finale-bg-far.png — 숲 + 멀리 보이는 성 (좌우 반복)
2. finale-bg-near.png — 성에 가까워진 장면 (좌우 반복)
3. finale-bg-gate.png — 성 입구 (반복 없음, 고나가 멈추는 곳)
4. castle-interior.png — 보스전 성 내부 (좌우 반복)
적용 위치: src/scenes/FinaleRun.ts (showCastle → 배경 크로스페이드로 교체), GameScene.setCastleLook (castle-bg → castle-interior.png).
