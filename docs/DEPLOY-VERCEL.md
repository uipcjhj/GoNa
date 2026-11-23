# Global Opportunity Radar — Vercel + Supabase 배포 가이드 (초보자용)

목표: Codespaces가 꺼져도 접속되는 고정 주소(`https://○○○.vercel.app`) 만들기.
배포 대상 브랜치는 **`claude/charming-maxwell-n3yywy`** 하나뿐입니다 (`vercel.json`의 `ignoreCommand`가 다른 브랜치 빌드를 자동으로 건너뜁니다). `main`·`dev`(GONA 게임)·포트폴리오는 영향받지 않습니다.

> 이 문서의 어떤 단계도 자동으로 실행되지 않습니다. 계정 생성·배포·데이터 이전은 모두 직접 진행합니다.

## 0. 먼저 알아둘 점 (무료 플랜 제약)

| 항목 | 내용 | 영향 |
|---|---|---|
| **Vercel Hobby(무료) 약관** | 개인·비상업 용도만 허용 (Vercel 약관 기준, 변동 가능 — 직접 확인) | 회사 업무(현대무벡스 MI)에 쓰면 약관 위반일 수 있음 → **회사 용도면 Vercel Pro(유료) 또는 회사 승인 필요**. 유료는 자동으로 켜지지 않습니다 |
| 함수 실행 시간 | 요청 1건 최대 약 300초 | 수집·요약은 작은 조각(요약은 5건 묶음)으로 나눠 자동 이어서 실행. 느린 사이트가 많으면 조각이 끊길 수 있어도 다음 조각이 이어받음 |
| 자동 수집(cron) | Hobby는 하루 1회까지, 정확한 분 보장 없음 | `vercel.json`: 매일 06:00 KST 근처 |
| Supabase 무료 | DB 500MB, **7일간 접속이 없으면 프로젝트 일시정지**(대시보드에서 Restore) | 이미지 자산은 DB에 저장되므로 이미지가 많아지면 용량 주의 |
| Gemini 무료 | 분당·일일 호출 한도 (앱에 `GEMINI_RPM`/`GEMINI_RPD`로 보호) | 282건 전체 요약은 며칠에 나눠 진행될 수 있음 |
| 이미지 프록시·Excel·PPT | 서버리스에서 동작하나 메모리·시간 제한 | 아주 큰 PPT는 느릴 수 있음 |

(수치는 작성 시점 기준이며 각 서비스 요금 페이지에서 확인하세요.)

## 1. Supabase (데이터베이스) — 약 5분
1. https://supabase.com 가입 → **New project** (Region: *Northeast Asia (Seoul)*, 비밀번호는 메모).
2. 왼쪽 **SQL Editor → New query** → 저장소의 `supabase/schema.sql` 내용을 전부 붙여넣고 **Run**.
3. **Project Settings → API**에서 두 값을 메모장에 복사:
   - `Project URL` (예: `https://abcd1234.supabase.co`)
   - `service_role` 키 (**비밀키 — 채팅·코드·GitHub에 붙여넣지 마세요**)

## 2. Vercel (웹사이트) — 약 10분
1. https://vercel.com → **Continue with GitHub** → **Add New → Project** → `uipcjhj/GoNa` **Import**.
2. **Framework Preset: Next.js** (자동). 아직 Deploy를 누르지 마세요.
3. **Environment Variables**에 아래를 입력 (Production 체크):

| 이름 | 값 |
|---|---|
| `SUPABASE_URL` | 1단계의 Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | 1단계의 service_role 키 |
| `APP_PASSWORD` | 관리자 비밀번호 (직접 정함, 길게) |
| `VIEWER_PASSWORD` | 조회 전용 비밀번호 (선택) |
| `CRON_SECRET` | 32자 이상 임의 문자열 |
| `GEMINI_API_KEY` | https://aistudio.google.com/apikey 에서 발급한 **무료 프로젝트** 키 |
| `GEMINI_RPM` / `GEMINI_RPD` | 선택. AI Studio의 Rate limit 페이지에서 확인한 실제 한도에 맞춤 (기본 9 / 200) |

4. Deploy 전에 **Settings → Git → Production Branch** 를 `claude/charming-maxwell-n3yywy` 로 설정 (처음 화면에서 못 바꾸면 Deploy 후 Settings에서 변경하고 **Redeploy**).
5. **Deploy**. 끝나면 `https://○○○.vercel.app` 주소가 생깁니다 → 로그인 화면이 열리면 성공.

## 3. 배포 확인
1. 위 주소에서 `APP_PASSWORD`로 로그인.
2. 주소 뒤에 `/api/health` 를 붙여 엽니다 → `"database":{"kind":"supabase","ok":true}` 이면 DB 연결 정상. `warnings`에 항목이 있으면 안내대로 환경변수를 보완하고 Redeploy.
3. 처음에는 DB가 비어 있어 기사가 없습니다 → 4단계로 기존 데이터를 옮깁니다.

## 4. 기존 데이터 이전 (Codespaces `.data` → Supabase)
Codespaces 터미널에서 진행합니다. **원본(.data)은 읽기만 하고 삭제·수정하지 않으며, 실행 전 백업 파일을 자동으로 만듭니다.**
1. 최신 코드 받기: `git pull`
2. 접속 정보를 현재 터미널에만 입력 (키는 화면에 보이지 않고 기록에 남지 않게):
   ```bash
   export SUPABASE_URL=https://내프로젝트.supabase.co
   read -rsp "service_role 키 붙여넣고 Enter: " SUPABASE_SERVICE_ROLE_KEY; export SUPABASE_SERVICE_ROLE_KEY
   ```
3. **점검만** (아무것도 쓰지 않음): `npm run db:migrate`
   → 원본의 기사·요약·선정·수정·승인 수와 "추가 예정 / 이미 동일 / 내용 다름" 표가 나옵니다.
4. 이상 없으면 **실제 이전**: `npm run db:migrate -- --apply --confirm 내프로젝트.supabase.co --expect-articles 점검에서본기사수`
   (`--confirm`에 프로젝트 호스트를 정확히 써야 실행됩니다 — 잘못된 프로젝트 방지)
5. 끝에 `[검증]` 표가 나옵니다: 모든 테이블 **누락 0** 이면 ✔. 같은 id는 한 행이라 **중복이 생기지 않으며**, 다시 실행해도 안전합니다.
6. Supabase에 이미 같은 id의 다른 내용이 있으면 기본은 **건드리지 않습니다**. 원본으로 덮어쓰려면 `--overwrite`를 직접 붙여야 합니다.
7. Vercel 주소에서 새로고침 → 기사 수·요약·보고서 선정이 Codespaces와 같은지 확인.

## 5. Gemini 전체 요약 (서버리스에서)
1. 로그인 → 주간 업계동향 → "전체 기사 AI 요약" 패널 → **5건 시험 요약**으로 연결 확인.
2. 이후 **다음 20건** 또는 **전체 기사 AI 요약**. 작업은 약 4분 단위 조각으로 자동 이어지며, 한도(429)에 걸리면 저장 후 멈춥니다 → 같은 버튼으로 이어서 진행.
3. 브라우저를 닫아도 서버가 다음 조각을 이어받습니다. 진행률은 새로고침하면 복구됩니다.

## 6. 개발 DB와 운영 DB 분리
- Codespaces(`npm run dev`)는 **`.env.local`에 Supabase 키가 있어도 로컬 `.data`를 사용**합니다 (운영 DB 보호). 일부러 쓰려면 `ALLOW_DEV_SUPABASE=1` (비권장).
- Vercel(운영)만 Supabase를 사용합니다. 개발 중 실수로 운영 데이터를 바꿀 일이 없습니다.
- 운영 데이터는 개발 환경으로 자동 동기화되지 않습니다.

## 7. 문제 해결
| 증상 | 조치 |
|---|---|
| 빌드가 "Ignored" | 정상: 다른 브랜치 푸시. 레이더 브랜치 푸시만 빌드됨 |
| `/api/health`의 kind가 `local-ephemeral` | `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` 누락 → 입력 후 Redeploy |
| 며칠 후 접속 안 됨 | Supabase 프로젝트 일시정지 → 대시보드에서 Restore |
| 요약이 도중에 멈춤 | 정상(한도·시간 제한) → "이어서 요약" |
| 로그인이 안 됨 | `APP_PASSWORD` 확인 후 Redeploy (비밀번호는 환경변수로만 관리) |
