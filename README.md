# Global Opportunity Radar

**HYUNDAI MOVEX 글로벌 물류자동화 수주기회 탐지 시스템**

매일 글로벌 뉴스를 자동 검색 → 원문 링크 검증 → 중복 제거 → AI 정보 추출 → 수주기회 점수화 → 저장 → 대시보드/엑셀 보고서까지 자동으로 처리합니다.

```
News Discovery → Article Validation → Deduplication → Information Extraction
→ Opportunity Scoring → Database Storage → Dashboard Update
```

---

## 1. 화면 구성

| 메뉴 | 내용 |
|---|---|
| **Dashboard** | KPI(신규/HOT/WATCH/경쟁사/검증 출처), 세계지도(국가 클릭 → 목록), 국가·산업·점수 분포, 최근 주요 프로젝트, 7일/30일 전환 |
| **Opportunities** | 수주기회 테이블 (검색·정렬·필터: Region, Country, Industry, Signal, Stage, Score, 기간, Verified Sources Only). 기본 정렬 = Score 내림차순 |
| **Opportunity 상세** | Project Overview, Score Breakdown(평가 근거), Why it matters, 추천 솔루션, 사실 vs AI 추론, 불확실성, 근거 기사 전체(발행일/사건일/출처유형/검증상태/유료여부), Project History |
| **News Feed** | 수집된 전체 뉴스 시간순, 카테고리·국가·산업 필터, Useful / Not Useful 평가 |
| **Competitor Watch** | Daifuku, Dematic, SSI Schäfer, KNAPP, Vanderlande, Swisslog 관련 뉴스, 수주기회와 연결 시 표시 |
| **Weekly Report** | 월~일 기준 기사 선택(체크박스) → 기존 주간동향 형식 Excel (제목·URL 하이퍼링크, 수주기회/경쟁사 색상 구분) |
| **실행 기록** | 예약/수동 수집 이력, 처리 건수, 오류 원인 로그 |
| **Settings** | 관심 국가·산업·수주신호 키워드, 추가 검색어, 경쟁사, RSS, 점수 가중치, 자동 수집 주기, 분석 언어, 보고서 기간, 데모 데이터 |

상단 **Find Opportunities** 버튼은 서버에서 수집 작업을 시작합니다. 창을 닫거나 새로고침해도 작업은 계속되며 진행 상황(검색 진행, 수집 기사 수, 중복 제거 수, 분석 완료 수, 신규 수주기회 수, 오류)이 표시됩니다.

## 2. 데이터 신뢰성 원칙 (구현 내용)

- **실제 검색된 URL만 저장**: AI는 URL을 생성하지 않습니다. 모든 링크는 뉴스 API/RSS가 반환한 원문 주소입니다.
- **링크 검증**: HTTP 응답·리다이렉트를 직접 추적. 2xx = 검증됨, 404/410/DNS 오류 = 링크 오류, 403/429/타임아웃 등 = "확인 필요"(접속 불가로 단정하지 않음). robots.txt를 준수합니다.
- **링크 오류 기사는 수주기회로 등록하지 않음** → 모든 Opportunity는 최소 1개의 실제 출처를 가집니다.
- **Published Date ≠ Event Date**: 발행일은 원문 메타데이터에서, 사건일은 기사 본문에 명시된 경우에만 추출. 12개월 이상 지난 발표의 재보도는 자동 감점.
- **Unknown / Not Disclosed**: 기사에 없는 기업명·금액·일정은 만들지 않습니다.
- **사실과 추론 분리**: 상세 화면에서 "기사에 명시된 사실"과 "AI 추론"을 따로 표시. 솔루션은 "검토 가능"으로만 표현.
- **비용 절감**: 이미 저장된 URL은 다시 분석하지 않음, 동일 제목 재배포 기사 제거, 사전 관련성 필터 통과 기사만 AI 분석, 1회 분석 건수 상한, 국가·매체별 상한(편중 방지).
- **유료 기사만 있는 HOT/WATCH 프로젝트**는 무료/공식 출처를 추가 검색합니다.
- **데모 데이터**는 가상 기업 + example.com 링크로만 구성되고 `DEMO` 배지로 구분되며 Settings에서 숨기기/삭제할 수 있습니다.

## 3. 점수 체계 (0~100, 우선순위 지표이며 수주 확률이 아님)

| 평가항목 | 기본 배점 |
|---|---:|
| 실제 시설 투자 및 신규 프로젝트 신호 | 30 |
| 물류자동화 적용 가능성 | 25 |
| 프로젝트 진행 단계와 발주 시점 | 20 |
| 현대무벡스 솔루션 적합도 | 15 |
| 전략지역 및 주요 고객 관련성 | 10 |

HOT ≥ 80, WATCH 60~79, GENERAL < 60. 감점: 완공 프로젝트(−30), 과거 발표 재보도(−25), 단순 실적(−30), 설비투자 무관 M&A(−25), 자동화 관련성 낮음(−15), 근거 불충분(−15). 가중치·기준점은 Settings에서 변경할 수 있습니다. 최종 점수는 AI가 아닌 서버에서 계산합니다.

## 4. 외부 서비스 연결 상태

| 서비스 | 필요 여부 | 미연결 시 동작 |
|---|---|---|
| GDELT 뉴스 검색 | 키 불필요 (무료) | 항상 사용 |
| 산업 전문지 RSS | 키 불필요 | 항상 사용 |
| Anthropic Claude (AI 분석) | `ANTHROPIC_API_KEY` | **규칙 기반 분석**으로 동작 (화면에 "규칙 기반" 배지, 한국어 요약 없음) |
| Supabase (DB) | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | 로컬 파일 저장 (Vercel에서는 임시 저장 → 데이터 유실) |
| 자동 수집 | `CRON_SECRET` | 수동 실행만 가능 |
| 접속 비밀번호 | `APP_PASSWORD` | 누구나 접속 가능 |
| GNews (선택) | `GNEWS_API_KEY` | 사용 안 함 |

사이드바 하단과 Settings 상단에 현재 연결 상태가 표시됩니다. 비밀키는 서버 환경변수로만 사용되며 브라우저로 전송되지 않습니다.

## 5. 배포 방법 (무료 플랜 기준, 약 20분)

### ① Supabase (데이터베이스)
1. https://supabase.com 가입 → **New project** 생성 (Region: Northeast Asia (Seoul) 권장)
2. 좌측 **SQL Editor** → `supabase/schema.sql` 파일 내용을 붙여넣고 **Run**
3. **Project Settings → API**에서 `Project URL` 과 `service_role` 키를 복사

### ② Anthropic (AI 분석)
1. https://console.anthropic.com 가입 → 결제수단 등록 → **API Keys**에서 키 발급
2. 비용 참고: 기본 모델 `claude-opus-5-5`는 기사 1건당 대략 수 센트 수준입니다. 비용을 크게 줄이려면 `ANTHROPIC_MODEL=claude-haiku-5-5`로 설정할 수 있습니다(분석 품질은 다소 낮아질 수 있음). Settings의 "1회 최대 AI 분석 기사 수"로 일일 사용량을 제한할 수 있습니다.

### ③ Vercel (웹사이트)
1. https://vercel.com 에 GitHub 계정으로 로그인 → **Add New → Project** → 이 저장소(`GoNa`) 선택
2. **Environment Variables**에 `.env.example`의 항목 입력 (`CRON_SECRET`, `APP_PASSWORD`는 직접 정한 임의 문자열)
3. **Deploy**. 배포 후 `vercel.json`의 cron이 매일 06:00 KST(21:00 UTC)에 `/api/cron/collect`를 호출합니다.

> 실행 시각을 바꾸려면 `vercel.json`의 `schedule`을 수정하세요. Settings의 "자동 수집 주기"(매일/2일/3일/매주)는 주기에 맞지 않는 실행을 자동으로 건너뜁니다.

## 6. 로컬 실행 (개발자용)

```bash
npm install
cp .env.example .env.local   # 필요한 값만 입력 (비워도 실행 가능)
npm run dev                   # http://localhost:3000
```

키 없이 실행하면 데모 데이터가 표시되고, Find Opportunities로 실제 뉴스 수집 + 규칙 기반 분석까지 동작합니다.

## 7. 기술 구조

- Next.js 16 (App Router) + TypeScript + Tailwind CSS (shadcn/ui 스타일 컴포넌트)
- DB: Supabase PostgreSQL (`supabase/schema.sql`, RLS 활성화 · 서버 전용 접근) / 로컬 JSON 대체 저장소
- 뉴스: GDELT DOC 2.0 API, RSS, (선택) GNews
- AI: Anthropic Claude 구조화 출력 (`src/lib/pipeline/analyze.ts`)
- 작업: DB에 상태를 저장하는 서버 작업, 시간 분할 실행 + 자동 이어서 실행, 중복 실행 방지, 응답 없는 작업 자동 재개, 재시도/백오프, 제공자별 연속 실패 차단
- Excel: ExcelJS (하이퍼링크, 색상 구분, 범례 시트)

주요 코드 위치: `src/lib/pipeline/` (수집·검증·분석·점수·통합), `src/lib/news/` (검색어 생성·뉴스 소스), `src/app/` (화면·API)
