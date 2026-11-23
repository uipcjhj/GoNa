# Global Opportunity Radar — Render(무료) + Supabase(무료) 배포 가이드

목표: Codespaces 없이 접속되는 고정 주소 `https://global-opportunity-radar.onrender.com` (이름이 사용 중이면 Render가 뒤에 숫자를 붙입니다).
배포 브랜치: **`claude/charming-maxwell-n3yywy`** 하나 (`render.yaml`에 지정). `main`·`dev`(GONA 게임)·포트폴리오와 무관합니다.

## ⚠️ 먼저 읽을 것 — 업무용 사용 가능 여부 (공식 문서 확인 결과)
- Render 공식 문서는 **무료 인스턴스를 "테스트·취미 프로젝트용"이라 설명하고 프로덕션(운영) 용도에는 쓰지 말라고** 안내합니다.
- Render 이용약관의 라이선스는 **"own use(본인 사용) 한정"**, 허용 이용 정책(AUP)은 **"허가받지 않은 상업적 목적(unauthorized commercial purposes)"과 제3자 제공을 금지**합니다. 무엇이 허가된 상업적 사용인지는 문서에 명시되지 않았습니다.
- 따라서 **현대무벡스 업무에 실사용(팀원 공유 등)하는 용도라면 무료 플랜이 약관에 맞는지 Render에 확인하거나 유료 플랜(Starter, 월 약 $7~)을 쓰는 것이 안전합니다.** 개인 학습·시연 용도로만 쓰는 경우에는 무료로 충분합니다. *유료 전환은 자동으로 일어나지 않으며 직접 선택해야 합니다.*
- Supabase 무료 플랜은 검색한 공식 자료에서 상업적 사용 제한 문구를 찾지 못했지만, "서비스에 의존하는 사용자가 있으면 유료 플랜을 쓰라"고 안내합니다. 약관(supabase.com/terms)을 직접 확인하세요.
- 위 내용은 공식 사이트 검색 결과 기준이며 약관은 바뀔 수 있습니다. 최종 판단 전 원문을 확인하세요.

## 무료 플랜의 실제 제한
| 항목 | Render 무료 웹서비스 | 영향·대응 |
|---|---|---|
| 슬립 | 15분 동안 외부 요청이 없으면 잠듦, 다시 열 때 약 1분 대기 | 첫 접속이 느림. **요약 작업이 도는 동안에는 서버가 자기 주소로 4분마다 요청을 보내 깨어 있음** |
| 재시작 | Render가 언제든 재시작할 수 있음, 로컬 파일 소실 | 모든 데이터는 Supabase에 저장(테스트로 검증). 중단된 요약은 접속 시 **자동으로 이어서 실행** |
| 시간 | 월 750시간(한 서비스 상시 가동 분량), 소진 시 월말까지 정지 | 슬립 덕에 보통 충분 |
| 메모리 | 512MB | 요약 묶음 5건, 원문 캐시 120건으로 축소, Node 힙 384MB |
| 자동 수집 cron | 없음 | "기사 수집" 버튼을 직접 누르거나, 외부 스케줄러가 `/api/cron/collect` 호출 |
| PPT 미리보기 이미지 | LibreOffice 없음 | PPT **다운로드는 정상**, 슬라이드 미리보기 이미지만 불가 |
| Supabase 무료 | DB 500MB, 한 주간 활동이 거의 없으면 일시정지(대시보드에서 Restore) | 이미지 자산은 DB에 저장되므로 용량 주의 |

## 배포 순서 (계정 로그인은 본인만 가능)
### 1. Supabase
1. https://supabase.com 로그인 → **New project** (Region: Northeast Asia (Seoul), 무료 플랜).
2. **SQL Editor**에 `supabase/schema.sql` 전체를 붙여넣고 **Run**.
3. **Project Settings → API**에서 `Project URL`, `service_role` 키를 복사 (키는 채팅·코드에 붙여넣지 마세요).

### 2. Render
1. https://render.com 로그인(GitHub 계정) → **New → Blueprint** → 저장소 `uipcjhj/GoNa`, 브랜치 `claude/charming-maxwell-n3yywy` 선택 (`render.yaml` 자동 인식).
2. 입력 칸이 뜨는 환경변수: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `APP_PASSWORD`, (선택) `VIEWER_PASSWORD`, `GEMINI_API_KEY`. `CRON_SECRET`은 자동 생성.
3. **Apply** → 빌드(약 5~10분) 후 주소가 생깁니다. 서버는 Render가 지정한 `PORT`에 자동 바인딩합니다(`next start -H 0.0.0.0 -p $PORT`).
4. 주소 뒤 `/login` 접속 → 로그인 → `/api/health`에서 `"database":{"kind":"supabase","ok":true}` 확인.

### 3. 기존 데이터 이전 (실제 데이터가 있는 Codespaces에서)
> **테스트 DB를 옮기지 않도록**: 반드시 사용자의 Codespaces(`/workspaces/GoNa/.data`)에서 실행하고, 점검 화면의 기사 수가 실제 사용 중인 수와 맞는지 확인하세요. 실제 이전은 `--expect-articles`에 그 기사 수를 직접 입력해야만 실행됩니다.
```bash
git pull
export SUPABASE_URL=https://내프로젝트.supabase.co
read -rsp "service_role 키: " SUPABASE_SERVICE_ROLE_KEY; export SUPABASE_SERVICE_ROLE_KEY
npm run db:migrate
npm run db:migrate -- --apply --confirm 내프로젝트.supabase.co --expect-articles 점검에서본기사수
```
원본은 백업만 만들고 수정하지 않으며, 기존 행은 덮어쓰지 않고, 끝에 누락 0건 검증 표가 나옵니다.

### 4. Gemini 요약
"5건 시험 요약" → "다음 20건" 또는 "전체 기사 AI 요약". 한도(429)·서버 재시작·슬립으로 멈추면 다음 접속 때 자동으로(또는 같은 버튼으로) 이어집니다.
