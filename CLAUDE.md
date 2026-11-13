# GONA's Food Adventure — 작업 원칙

## 비주얼 에셋 원칙 (필수)
- 캐릭터·몬스터·보스·건축물·주요 배경은 **승인된 이미지 에셋만** 사용한다.
  CSS·SVG·Canvas 도형이나 픽셀 배열 코드로 임의로 그려 대체하지 않는다.
- 확정 레퍼런스 이미지가 있으면 그것을 최우선 기준으로 하고, 다른 디자인을 새로 만들지 않는다.
- 필요한 에셋이 없으면 임시 도형으로 채워 완성된 것처럼 보고하지 말고, 구현 전에 필요한 이미지(규격·적용 위치)를 먼저 요청한다.
- 받은 에셋은 게임용으로 분리·최적화해서 쓴다 (예: tools/art/witch_from_reference.py).
- 코드로 그려도 되는 것: 작은 파티클, 공격 예고선·과녁, HP 바 등 단순 UI·효과.
- 현재 개발판에 남아 있는 임시 코드 그림(승인 에셋으로 교체 예정, 그때까지 숨기거나 지우지 않음):
  src/art/castleArt.ts 의 흔적 소품(clueSpoon·clueBush·cluePrint), src/art/witchArt.ts 의 witchPot(3페이즈 냄비) · witchSheet(PNG 를 못 읽을 때만 쓰는 비상용).

## 배포
- 정식(main → https://uipcjhj.github.io/GoNa/)은 사용자가 명시적으로 승인할 때만. 개발은 claude/dino-snack-game → /GoNa/dev/.
- 자세한 절차: RELEASE.md

## 성 배경 (승인 에셋 적용됨 — public/assets/castle, config.ts CASTLE_ART)
- 원경 finale-bg-far → 근경 finale-bg-near → 입구 finale-bg-gate → (암전) → 성 안 castle-interior. 그림은 원본 그대로(바이트 동일).
- 숲 배경과 같은 좌표계·배율(772×460, 지면선 400줄, 기존 카메라·크롭). 성 안 그림은 바닥선이 336줄이라 그 줄을 땅 윗면에 맞춤.
- 원경·근경·입구는 좌우 끝이 이어지지 않는 그림 → 반복하지 않고 그림 안에서만 천천히 다가감 (GameScene.updateBackdrops).
  가로 화면에서 그림 폭이 화면보다 좁으면 화면 폭만큼만 키움. 성 안 그림은 좌우가 이어져 반복 스크롤.
- 입구: 고나가 감속해 멈추는 순간 문이 제자리 (HALT_DECEL 기준).
