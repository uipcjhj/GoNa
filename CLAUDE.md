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

## 승인 에셋 대기 중인 기능 (그림을 받기 전엔 임시 그림으로 만들지 않음)
- 조작·판정·순서는 구현돼 있고, 그림이 없으면 실제 전투에서 건너뜀 (boss.ts WITCH_EXTRA_ART 의 텍스처가 다 있어야 켜짐 · WitchBattle.artReady).
  그림 붙일 자리: WitchBattle.showChairArt / showChopArt (지금은 아무것도 안 그림). 개발 메뉴는 debugForceArt 로 '흐름만' 실행.
- ④ 이유식 의자 탈출 (chair): witch-chair(의자 등장·붙잡음·흔들림·부서짐) · gona-chair-cry(의자에 앉아 울기·몸부림).
  2페이즈 1번 · 3페이즈 강화 1번. '으아앙!' 연타 → 숟가락 경고 때 꾸욱 → 성공: 피해+기절 / 실패: 작은 피해+자동 탈출. 개발 메뉴 41~43.
- ⑤ 후드리챱챱! (chop, 마지막): gona-chop(양손 난타) · giant-goo(거대 이유식 덩어리 · 맞아서 찌그러짐) · witch-goo-face(이유식 뒤집어쓴 마녀) · witch-hat(날아가는 모자).
  '챱챱!' 연타 → 60% 마녀 방해('으아앙!' 꾸욱, 실패해도 재도전) → 100% '후드리챱챱!!!' 1번 → 새 패배 대사 → 기존 패배·엔딩. 개발 메뉴 47·54·55.
  그림이 없으면 마지막은 기존 '마지막 발악'(last). (예전 '콰직!' 좌우 번갈아 기획은 폐기)

## 최종 보스 전투 구성 (구현됨)
- 마지막 모험(FinaleRun) 약 28초: 버섯숲 0~8 · 먼 성 8~15 · 가까운 성·번개 15~22 · 입구 정지·암전 → 바로 등장 컷신.
- 성 안 전투는 카메라를 조금 넓게 (config VIEW.castleZoom 5/6 — 1.2배 캐릭터 도트 1칸 = 5픽셀, 세로·가로 공통).
- 페이즈별 필수 이벤트(boss.ts WITCH.mustShow, 그림 없는 의자는 빠짐)를 다 보기 전엔 HP 가 문턱 아래로 안 내려감.
  문턱에 닿으면 반복 공격을 건너뛰고 남은 필수 이벤트를 바로 · 다 보면 바로 다음 페이즈 (WitchBattle.chooseAttack/endAttack).
- ① 이유식 받아치기(퉤!) · ② 으아앙! 울음 리듬 · ③ 폭탄 방패 반사 — WitchBattle parry/rhythm/reflect.
- 조작 화면은 상태별로 완전히 분리 (battleUi.setUiState · CSS .battle-pad.ui-*): 일반=방패·공격·필살 / 받아치기=퉤! / 리듬=리듬 줄+으앙! /
  의자=탈출 게이지+으아앙!(연타→꾸욱) / 후드리챱챱=게이지+챱챱!(방해 땐 으아앙! 꾸욱 · 마지막 후드리챱챱!!!). 일반 버튼은 display:none(터치 판정도 없음).
  방패 반사는 일반 방패 그대로(중복 버튼 없음).

## 최종 보스 확인 도구
- tools/witch-qte-test.cjs : 받아치기·반사·리듬 판정, 입력 잠금, 일시정지 멈춤 (portrait|landscape)
- tools/witch-dodge-test.cjs : 공격별로 예고만 보고 피하면 피해 0 · 가만히 있으면 피해 (예고 = 판정)
- tools/witch-soak-test.cjs : 1페이즈~처치까지 봇 전투, 오브젝트·트윈·메모리 증가 확인 (5번째 인자 art = 의자·후드리챱챱까지 흐름 확인) · TIMELINE 출력

## 배포
- 정식(main → https://uipcjhj.github.io/GoNa/)은 사용자가 명시적으로 승인할 때만. 개발은 claude/dino-snack-game → /GoNa/dev/.
- 자세한 절차: RELEASE.md

## 성 배경 (승인 에셋 적용됨 — public/assets/castle, config.ts CASTLE_ART)
- 원경 finale-bg-far → 근경 finale-bg-near → 입구 finale-bg-gate → (암전) → 성 안 castle-interior. 그림은 원본 그대로(바이트 동일).
- 숲 배경과 같은 좌표계·배율(772×460, 지면선 400줄, 기존 카메라·크롭). 성 안 그림은 바닥선이 336줄이라 그 줄을 땅 윗면에 맞춤.
- 원경·근경·입구는 좌우 끝이 이어지지 않는 그림 → 반복하지 않고 그림 안에서만 천천히 다가감 (GameScene.updateBackdrops).
  가로 화면에서 그림 폭이 화면보다 좁으면 화면 폭만큼만 키움. 성 안 그림은 좌우가 이어져 반복 스크롤.
- 입구: 고나가 감속해 멈추는 순간 문이 제자리 (HALT_DECEL 기준).
