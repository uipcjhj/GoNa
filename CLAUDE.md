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

## 마녀전 신규 연출 그림 (사용자 시안 적용됨 — public/assets/boss, boss.ts WITCH_EXTRA_SHEETS)
- 시안 한 장(흰 배경)에서 tools/art/witch_finale_from_sheet.py 로 잘라 정리 (배경 제거 · 고나는 bigbaby 키, 마녀·모자는 witch-sheet 키에 맞춰 축소 · 마녀는 좌우 반전).
  witch-chair 4 · gona-chair-cry 4 · gona-chop 4 · giant-goo 4 · witch-goo-face 3 · witch-hat 5 프레임. 게임에서 1.2배.
- ④ 이유식 의자 탈출 (WitchBattle.showChairArt): 의자 등장 → 고나가 앉음(원래 고나 그림 숨김) → 연타마다 울기/몸부림 → 숟가락 경고 때 꾸욱 → 의자 부수고 탈출.
  2페이즈 1번 · 3페이즈 강화 1번. 개발 메뉴 41~43.
- ⑤ 후드리챱챱! (WitchBattle.showChopArt): 덩어리 소환 → 챱챱마다 주먹·덩어리 찌그러짐 → 60% 방해(으아앙 꾸욱) → 후드리챱챱!!! → 덩어리가 마녀 얼굴로
  → 이유식 뒤집어쓴 마녀(마녀 그림 대신 따라감) · 모자 날아감 → 새 패배 대사 → 기존 패배·엔딩. 개발 메뉴 47·54·55.
- 모자 없는 마녀: witch-goo-face-nohat (tools/art/witch_hatless.py — witch-goo-face 에서 셰프 모자 픽셀만 지우고 머리 윗선만 다듬음).
  모자가 날아가는 순간부터 이 그림 · 떨어진 모자는 바닥에 그대로(하나만).
- 후드리챱챱 방해 때 우는 고나: gona-chop-cry (tools/art/gona_chop_cry.py — gona-chop 준비 자세 + gona-chair-cry 1번 우는 얼굴 속만 합침,
  머리카락·슈트·가시·얼굴 테두리는 원본 그대로) · 부르르 떨림 · 양옆 큰 눈물 · 으아앙! → 이겨내면 다시 난타 → 피니시.

## 최종 보스 전투 구성 (구현됨)
- 마지막 모험(FinaleRun) 약 28초: 버섯숲 0~8 · 먼 성 8~15 · 가까운 성·번개 15~22 · 입구 정지·암전 → 바로 등장 컷신.
- 성 안 전투는 카메라를 조금 넓게 (config VIEW.castleZoom 5/6 — 1.2배 캐릭터 도트 1칸 = 5픽셀, 세로·가로 공통).
- 페이즈별 필수 이벤트(boss.ts WITCH.mustShow, 그림 없는 의자는 빠짐)를 다 보기 전엔 HP 가 문턱 아래로 안 내려감.
  문턱에 닿으면 반복 공격을 건너뛰고 남은 필수 이벤트를 바로 · 다 보면 바로 다음 페이즈 (WitchBattle.chooseAttack/endAttack).
- ① 이유식 받아치기(퉤!) · ② 으아앙! 울음 리듬 · ③ 폭탄 방패 반사 — WitchBattle parry/rhythm/reflect.
- 조작 화면은 상태별로 완전히 분리 (battleUi.setUiState · CSS .battle-pad.ui-*): 일반=방패·공격·필살 / 받아치기=퉤! / 리듬=리듬 줄+으앙! /
  의자=탈출 게이지+으아앙!(연타→꾸욱) / 후드리챱챱=게이지+챱챱!(방해 땐 으아앙! 꾸욱 · 마지막 후드리챱챱!!!). 일반 버튼은 display:none(터치 판정도 없음).
  방패 반사는 일반 방패 그대로(중복 버튼 없음).

## 방글할매 스페셜 (public/assets/bangeul · src/scenes/Bangeul.ts)
- 최종 디자인 = 신규 기능 레퍼런스 시트의 작은 방글할매 5동작 (둥근 안경 · 갈색 곱슬머리 · 웃는 얼굴 · 남색 겉옷+파란 안옷 · 황금 프레첼).
  tools/art/bangeul_from_concept.py 로 잘라 기존 시트 이름(idle·laugh·song·appear·exit, 칸 64×58)으로 덮어씀 · 소환 버튼 얼굴도 교체 ·
  레퍼런스 이펙트 줄에서 황금 고리(bangeul-fx-ring)·황금 빛살(bangeul-fx-burst). 음표는 줄이면 뭉개져 코드 음표 효과.
  실제 사진·큰 그림은 쓰지 않음 · 레퍼런스 이미지를 외부로 올리지 않음.
- 웃음·노래 음원: public/assets/audio/bangeul-laugh.mp3 · bangeul-song.mp3 (새로 만든 효과음, sound.voice — 효과음 길 · BGM 그대로).
- L·V·E 쿠키: tools/art/love_cookies.py (O 쿠키 바탕 + 기존 글자 색 단계 · L=G 분홍 · V=N 초록 · E=A 파랑 · O 재사용) → GONA LOVE 8칸 실제 사용.
- 시트에서 tools/art/bangeul_from_sheet.py 로 잘라 정리: 기본·웃음·노래·등장·퇴장 각 4 (칸 64×58 · 몸 48×45) · 음파 4 · 무적 보호막 4
  (시트의 보호막 그림은 방울 안에 방글할매가 있어 → 바깥 빛 테두리·반짝임만 남김) · GONA 쿠키 4종(32·20px) · 수집 HUD · 소환 버튼.
- 일반 달리기 중 G·O·N·A 글자 쿠키(아직 없는 글자 80%) → 네 글자 → '방글할매 소환!' 버튼(누를 때만) → 등장·웃음·노래(음파 3번:
  화면 몬스터 처치 · 보스 큰 피해+휘청, 마녀는 hpFloor 그대로) → 고나 5초 무적 → 퇴장 · 글자 초기화. 미니게임·대사 중엔 버튼 숨김.
- (옛 시트에서 자른 기본·음파·보호막·쿠키·HUD 는 그대로) 개발 메뉴 56~68.
- 재미 개선(개발판): 간식 줄(3~7)·점프 곡선·물결·높은 간식 패턴 · 1.1초 안 연속 수집 콤보(+N 표시 · 5개마다 보너스) · 바위·몬스터 46px 안엔 간식·글자 안 놓음.
  몬스터는 0.8초 전 오른쪽 끝 경고(boss-warn 깜빡임 + 경고음) 뒤 등장 · 무적 중 닿으면 튕겨 나감(피해 없음).
- GONA → GONA LOVE: 글자는 순서대로만 나옴(G→O→N→A). 뽀뽀괴물 전엔 한 번만 소환, 쓰면 잠김(뽀뽀괴물 처치 전까지 안 모임).
  뽀뽀괴물 뒤엔 G·O·N·A·L·O·V·E 8칸(반복 가능). 완성한 소환 기회는 버튼을 누를 때까지 보관.
  소환: 황금 번쩍 → 등장 → 웃음 음파 1 → 노래(음표) 음파 2·3 → 퇴장하면서 GONA 보호막 5초(마지막 1초 깜빡). BGM 은 다시 틀지 않음. 모든 보스전 사용 가능.
- 마녀 대사: 상황별 고정 대사(WITCH_INTRO/PHASE2/PHASE3/DEFEAT_LINES · WITCH_QUIPS · WITCH_CHAIR_QUIPS · WITCH_CHOP_QUIPS) · 대사창은 '다음 ▶' 하나뿐(건너뛰기 없음).
- 의자 UX: '으앙!' + 양쪽 눈물 · '으아앙!! 연타해서 탈출!' → 숟가락 오면 '꾸욱 눌러!' · 게이지 색(낮음/중간/높음)·금(30/60/90%) · 첫 실패는 한 번 더 기회 · 성공 시 파편·눈물. 개발 메뉴 69~74.
- tools/bangeul-test.cjs : 쿠키·HUD·버튼(실제 터치)·연출·몬스터·무적·일시정지·보스 3종·마녀 보호 (세로·가로)

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
