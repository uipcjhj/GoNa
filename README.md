# 🦖 GONA’s Food Adventure

모바일 브라우저에서 바로 즐기는 따뜻한 레트로 도트 감성의 횡스크롤 러너 게임입니다.
**Vite + TypeScript + Phaser 4** 로 만들었고, 그림·효과음·배경음악은 모두 코드로 생성되어 별도 리소스 없이 실행됩니다.

## 게임 방법

| 조작 | 동작 |
| --- | --- |
| 화면 아무 곳이나 터치 | 점프 |
| 공중에서 한 번 더 터치 | 더블 점프 (빙글 회전!) |
| ⏸ 버튼 / 앱 전환 | 일시정지 (터치하면 계속) |
| 🔊 버튼 | 소리 켜기/끄기 |
| (PC) Space / ↑ / P | 점프 / 일시정지 |

- 🍓 딸기 10점 · 🍌 바나나 20점 · 🍪 쿠키 30점
- 바위에 부딪히면 ❤️ 1개 감소 (잠깐 무적), 3개를 모두 잃으면 게임 오버
- 시간이 지날수록 빨라지고 장애물 패턴이 다양해집니다
- 높은 곳의 간식은 더블 점프로만 먹을 수 있어요
- 최고 점수는 브라우저(localStorage)에 저장됩니다

## 실행

```bash
npm install
npm run dev        # 개발 서버 (같은 Wi-Fi의 폰에서 표시된 Network 주소로 접속)
npm run build      # dist/ 에 배포용 정적 파일 생성
npm run preview    # 빌드 결과 미리보기
npm run build:single  # dist-single/index.html 한 파일짜리 빌드 (어디든 올려서 실행)
```

### GitHub Pages 배포
`.github/workflows/deploy.yml` 이 포함되어 있습니다.
저장소 **Settings → Pages → Source** 를 **GitHub Actions** 로 바꾸면 `main` 에 push 할 때마다 자동 배포됩니다.

## 오프닝(타이틀) 화면

버섯숲 + 귀여운 석기시대 분위기의 오프닝. 각 요소가 **독립 레이어**로 되어 있어 이미지로 하나씩 교체할 수 있습니다.

| 레이어 (아래→위) | 교체 이미지 | 없을 때 |
| --- | --- | --- |
| ① 배경 | `public/assets/title/title-bg.png` | 코드로 그린 버섯숲·고인돌·돌집·모닥불 |
| ② 캐릭터 | `public/assets/character/dino.png` | 기본 공룡 (통통 뛰기 + 눈 깜빡임) |
| ③ 앞 장식 | `public/assets/title/title-fg.png` (선택, 투명 PNG, 배경과 같은 크기) | 흔들리는 잎·버섯 |
| ④ 제목 로고 | `public/assets/title/logo.png` (선택) | 돌판 글자 로고 |
| ⑤ 시작 버튼 | HTML `<button>` (반짝임 효과) | — |

- 배경은 화면 비율과 관계없이 **잘리지 않고 전체가 보이며**, 남는 여백은 그림 가장자리 색으로 채워집니다.
- 세로 화면에서는 로고가 위쪽 여백, 시작 버튼이 아래쪽 여백에 자리 잡고, 가로 화면에서는 그림 위에 겹쳐집니다.
- 캐릭터가 배경의 땅 위에 서도록 `src/config.ts` 의 `TITLE_LAYOUT` (발 위치·크기)을 조절하세요.
- '게임 시작' 버튼(또는 PC의 Space)으로만 시작하며, 누르면 공룡이 뛰어나가고 화면이 전환됩니다.

## 캐릭터 이미지 교체

1. 도트 이미지를 `public/assets/character/dino.png` 로 저장
   - 프레임을 가로로 이어 붙인 PNG: `[달리기1][달리기2][점프]`
   - 한 장짜리 이미지도 가능 (달릴 때 통통 튀는 효과로 대체)
2. 필요하면 `src/config.ts` 의 `CHARACTER_ASSET` 수정
   - `frameCount` 시트 안의 프레임 수
   - `runFrames`, `jumpFrame` 프레임 번호
   - `displayHeight` 화면에서의 캐릭터 높이(px)
   - `titleFrame` 타이틀에서 보여줄 프레임, `blinkFrame` 눈 감은 프레임 (-1 이면 깜빡임 없음)

현재는 직접 제작한 아기 공룡 도트(`art-src/baby-dino/`)를 `tools/build_dino_sheet.py` 로
1:1 도트 시트로 변환해 `public/assets/character/dino.png` 에 넣어 두었습니다
(대기·달리기 4프레임·점프·눈 감기·기쁨·놀람). 원본을 고쳤다면 `python3 tools/build_dino_sheet.py` 로 다시 만드세요.

파일이 없으면 코드로 그린 기본 캐릭터(물방울 모양 갈색 머리, 동그란 얼굴, 연두색 공룡 옷)가 나옵니다.
기본 캐릭터 도트는 `src/art/sprites.ts` 의 `DINO_FRAMES` 에서 글자 단위로 직접 고칠 수도 있어요.

## 간식 이미지 & 표정

- 간식: `public/assets/snacks/{strawberry,banana,cookie}.png` (17×17 도트, 원본에서 `python3 tools/build_snack_sprites.py` 로 생성).
  파일이 없으면 코드로 그린 기본 간식. 점수·등장 빈도·충돌 크기는 그대로.
- 표정: 간식을 먹으면 기쁨(7번 프레임) 0.4초, 바위에 부딪히면 놀람(8번 프레임) 0.5초 → 다시 달리기/점프.
  그림만 바뀌고 위치·점프·충돌 판정은 그대로. 시간은 `src/config.ts` 의 `happyMs`, `surprisedMs`.

## 시작 흐름

1. **대표 타이틀** (`public/assets/title/cover.webp`, 원본 `art-src/title/`) — 그림 위 '게임 시작' 버튼, 누를 때까지 대기
2. 버튼 → **알 부화 컷신** → 3. 자동으로 **1단계 둥지 이동** 시작 (컷신 중 터치 = 건너뛰기)

## 사운드

- 모든 효과음·BGM 은 Web Audio 로 즉석 합성 (`src/audio.ts`). iPhone: 첫 터치/클릭 때 오디오 시작 + 무음 버퍼로 깨우기 + `audioSession = playback`
- BGM 'Dream Nest' (오리지널): 대표 타이틀·컷신은 느리고 몽환적(패드·글로켄·메아리), 게임은 같은 테마에 가벼운 킥·셰이커·베이스 추가
- 미리듣기: `art-src/audio/bgm-dream-nest-preview.wav` (타이틀 → 게임 → 시작·부화·간식 효과음)

## 오프닝 컷신

둥지 위 알이 흔들림 → 금이 감 → 꼭대기 구멍으로 고나의 물방울 머리카락이 먼저 삐죽 → 팍! 깨지며 갓난아기 고나 탄생
→ GONA’s Food Adventure 타이틀과 시작 버튼 등장. 컷신 중 터치하면 건너뛰기, 이후 시작 버튼이나 화면 터치로 게임 시작.
(둥지·알·껍데기 그림: `src/art/nest.ts`, 컷신: `src/ui/title.ts`)

## 성장 시스템 (고나의 성장 여정)

간식을 먹으면 **점수**와 **성장 게이지**가 각각 오릅니다 (서로 독립). 게이지가 가득 차면 진화!

| 단계 | 이름 | 다음 단계까지 | 임시 애니메이션 (dino.png 프레임) |
| --- | --- | --- | --- |
| 1 | 갓난아기 고나 | 12 | 둥지(요람)에 누워 이동: 움직이고 점프하는 건 둥지, 고나는 안에서 꼬물·출렁 |
| 2 | 기어 다니는 고나 | 20 | `stages/crawler.png` 네 발 기어가기 |
| 3 | 직립보행 고나 | 30 | 기존 `dino.png` 달리기(1~4), 점프(5), 기쁨(7)·놀람(8) |
| 4 | 빅베이비 곤룡 | 최종 | `stages/bigbaby.png` 통통한 체형, 묵직한 걸음 |

단계별 그림은 컨셉 시트에서 `python3 tools/build_growth_sprites.py` 로 만듭니다. 파일이 없으면 `dino.png` 포즈를 조합한 임시 애니메이션으로 동작합니다.

- 게이지 증가량: 딸기 1 · 바나나 2 · 쿠키 3 (`src/game/growth.ts` → `SNACK_GROWTH`)
- 진화 연출: 게임 정지 → 반짝이 + 이전/새 모습이 번갈아 바뀌며 크기·자세 변화 → 새 단계 이름 표시 → 1초 무적과 함께 재개
- 충돌 판정(`hitbox`)과 조작(`controls`: 점프 배율·최대 점프 수)은 단계별로 따로 설정 가능 — 지금은 모든 단계가 기존과 동일
- **게임 오버 규칙**: 한 판 = 한 번의 성장 여정. 다시하기는 항상 갓난아기부터(점수와 같은 규칙), 최고 성장 단계는 기기에 기록되어 게임 오버 화면에 표시
- 단계별 전용 그림: `public/assets/character/stages/` (없으면 임시 애니메이션)
- 향후 확장 구조(아직 게임에 연결 안 됨): `src/game/stages.ts`(스테이지), `src/game/boss.ts`(뽀뽀괴물·냄새괴물), `src/game/weapons.ts`(머리카락 부메랑)

## 자동 테스트

```bash
npm run build && npx vite preview --port 4173   # 다른 터미널에서
node tools/e2e-test.cjs                         # 모바일 가로·세로·이미지 없음 + 성장 단계별 + 성장 시스템 검사
```

## 구조

```
src/
  main.ts             게임 생성, 화면 크기 계산, 터치 입력
  config.ts           난이도·물리·점수·캐릭터 이미지 설정
  audio.ts            Web Audio 8비트 효과음 / 배경음악
  art/
    PixelCanvas.ts    도트 그리기 도구
    sprites.ts        캐릭터·간식·바위·하트 도트맵
    textures.ts       배경(하늘/언덕/나무/땅) 및 텍스처 생성
  scenes/
    BootScene.ts      텍스처 준비, 커스텀 캐릭터 로드
    GameScene.ts      게임 플레이
  ui/title.ts         오프닝(타이틀) 화면 레이어 / 전환 효과
  ui/overlay.ts       일시정지 / 게임 오버 화면 (HTML)
  art/titleArt.ts     기본 오프닝 배경 (버섯숲·석기시대)
public/assets/character/   ← 캐릭터 이미지 넣는 곳
public/assets/title/       ← 타이틀 배경·앞장식·로고 이미지 넣는 곳
```

## 모바일 최적화 포인트
- 화면 비율에 맞춰 논리 해상도를 자동 계산 → 가로/세로 모두 빈틈없이 꽉 차게, 회전 시 즉시 재배치
- `pointerdown` 즉시 반응 + 착지 직전 입력 버퍼로 놓치는 점프 최소화
- 더블탭 확대·스크롤·길게 누르기 메뉴 차단, 노치(safe-area) 대응
- 앱 전환 시 자동 일시정지
- 한글 픽셀 폰트: [갈무리](https://github.com/quiple/galmuri) (SIL OFL 1.1)
