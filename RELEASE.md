# 정식 배포 / 개발 테스트 운영 방법

## 주소

| | 주소 | 만드는 브랜치 | 언제 바뀌나 |
|---|---|---|---|
| **정식 (Production)** | https://uipcjhj.github.io/GoNa/ | `main` | 주인이 "정식 배포해"라고 승인했을 때만 (`main` 갱신) |
| **개발 (Development)** | https://uipcjhj.github.io/GoNa/dev/ | `dev` | `dev` 에 푸시할 때마다 자동 |

- 두 사이트는 GitHub Pages 하나에 함께 올라감. 배포할 때마다 `main` 과 `dev` 를 둘 다 새로 빌드해 `site/`(정식) + `site/dev/`(개발)로 합침
  (`.github/workflows/pages.yml`). 개발 푸시는 정식 파일을 바꾸지 않음 — 정식은 언제나 `main` 그대로.
- 배포 전 검사(`tools/verify-site.cjs`): 두 사이트에 영상·BGM·그림·아이콘·manifest 가 모두 있는지, 정식 빌드에 개발용 기능이 섞이지 않았는지.
  **검사나 빌드가 하나라도 실패하면 배포하지 않음 → 지금 사이트가 그대로 유지.**
- 진행 상황: GitHub → Actions → "Pages (Production + Development)". 배포된 커밋: `/GoNa/version.json`, `/GoNa/dev/version.json`

## 정식 / 개발 빌드 차이 (빌드 단계에서 분리 — `src/env.ts`, `vite.config.ts` 의 `__DEV_TOOLS__`)

| | 정식 (`npm run build`) | 개발 (`npm run build:dev`) |
|---|---|---|
| 테스트 메뉴 · `?test=…` 바로가기 (스테이지·보스전·엔딩·성장·HP·영상·BGM) | 코드째 없음 (주소에 붙여도 실행 안 됨) | 있음 |
| 타이틀의 🧪 개발 메뉴 · 소리 테스트 · 성능 표시 · `?debugAudio` · `?boss=` · `?perf` | 없음 | 있음 |
| 화면의 테스트 빌드 표시 | 없음 | "🧪 개발 테스트 · 커밋 · 시간" |
| 저장 데이터 (최고 점수·이어하기·설정) | 기존 그대로 | `gona-dev:` 를 붙여 따로 저장 (정식 기록에 영향 없음) |
| 홈 화면 이름 | GONA | GONA dev |

## 개발 → 정식 흐름

1. 새 기능은 작업 브랜치에서 만들고 `dev` 에 푸시 → 개발 사이트 자동 배포
2. 아이폰으로 https://uipcjhj.github.io/GoNa/dev/ 테스트 → 수정 → 다시 `dev` 푸시
3. 주인이 **"정식 배포해"** 라고 승인
4. 승인된 `dev` 커밋을 `main` 으로 (fast-forward): `git push origin <커밋>:main`
5. Actions 가 빌드·검사 → 정식 배포 → `prod-날짜-커밋` 태그 자동 생성 (롤백 지점)
6. 정식 주소에서 게임·엔딩 영상·BGM·아이콘 확인

**승인 없이는 `main` 에 푸시하지 않음.** (`main` 외의 푸시로는 정식 내용이 바뀌지 않음)

## 롤백 (이전 정식 버전으로)

- 롤백 지점: `prod-…` 태그 (정식 배포마다 자동), 백업 브랜치 `backup/stable-20261112-before-split` (분리 직전 게임)
- 방법: 되돌릴 버전의 파일로 `main` 에 새 커밋을 만들어 푸시 (기록은 지우지 않음)

```bash
git fetch origin --tags
git checkout main && git pull origin main
git checkout <prod-태그 또는 커밋> -- .        # 그 버전의 파일로 바꿈
git commit -m "Rollback production to <prod-태그>"
git push origin main                            # → 정식만 그 버전으로 다시 배포
```

- 개발 사이트는 `dev` 그대로라 롤백의 영향을 받지 않음

## 주의

- `main` 과 `dev` 의 `.github/workflows/pages.yml` 은 같은 내용으로 유지 (어느 쪽 푸시든 같은 방식으로 둘 다 빌드)
- `public/dev/` 폴더는 만들지 않음 (개발 사이트 자리와 겹침 — 검사가 막음)
