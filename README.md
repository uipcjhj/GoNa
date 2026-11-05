# 🦖 우리애기 공룡의 간식 대모험

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

## 캐릭터 이미지 교체

1. 도트 이미지를 `public/assets/character/dino.png` 로 저장
   - 프레임을 가로로 이어 붙인 PNG: `[달리기1][달리기2][점프]`
   - 한 장짜리 이미지도 가능 (달릴 때 통통 튀는 효과로 대체)
2. 필요하면 `src/config.ts` 의 `CHARACTER_ASSET` 수정
   - `frameCount` 시트 안의 프레임 수
   - `runFrames`, `jumpFrame` 프레임 번호
   - `displayHeight` 화면에서의 캐릭터 높이(px)

파일이 없으면 코드로 그린 기본 캐릭터(물방울 모양 갈색 머리, 동그란 얼굴, 연두색 공룡 옷)가 나옵니다.
기본 캐릭터 도트는 `src/art/sprites.ts` 의 `DINO_FRAMES` 에서 글자 단위로 직접 고칠 수도 있어요.

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
  ui/overlay.ts       타이틀 / 일시정지 / 게임 오버 화면 (HTML)
public/assets/character/   ← 캐릭터 이미지 넣는 곳
```

## 모바일 최적화 포인트
- 화면 비율에 맞춰 논리 해상도를 자동 계산 → 가로/세로 모두 빈틈없이 꽉 차게, 회전 시 즉시 재배치
- `pointerdown` 즉시 반응 + 착지 직전 입력 버퍼로 놓치는 점프 최소화
- 더블탭 확대·스크롤·길게 누르기 메뉴 차단, 노치(safe-area) 대응
- 앱 전환 시 자동 일시정지
- 한글 픽셀 폰트: [갈무리](https://github.com/quiple/galmuri) (SIL OFL 1.1)
