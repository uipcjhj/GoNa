// Core domain types for Global Opportunity Radar

export type Region =
  | "North America"
  | "Europe"
  | "Southeast Asia"
  | "Middle East"
  | "Oceania"
  | "East Asia"
  | "South Asia"
  | "Latin America"
  | "Africa"
  | "Other";

export type SourceType =
  | "Official Company Press Release"
  | "Government Announcement"
  | "Media Report"
  | "Industry Publication"
  | "Tender / Procurement Notice";

export type VerificationStatus =
  | "verified" // HTTP 2xx (possibly after redirects)
  | "needs_check" // blocked for bots / rate-limited / timeout -> human should check
  | "broken" // 404 / 410 / DNS failure
  | "unchecked";

export type AccessType = "free" | "paywall" | "unknown";

export type ArticleCategory = "opportunity" | "competitor" | "industry" | "irrelevant";

export type ArticleStatus =
  | "queued" // discovered, waiting for analysis
  | "analyzed"
  | "filtered" // pre-filter judged as not relevant (not sent to AI)
  | "duplicate" // same story already stored (syndicated copy)
  | "error";

export type AnalysisMode = "ai" | "rules" | "demo";

export type Priority = "HOT" | "WATCH" | "GENERAL";

export type HistoryEventType =
  | "announcement"
  | "follow_up_investment"
  | "groundbreaking"
  | "equipment_procurement"
  | "tender"
  | "completion"
  | "update";

export interface Verification {
  status: VerificationStatus;
  httpStatus: number | null;
  finalUrl: string | null;
  redirects: number;
  checkedAt: string | null;
  access: AccessType;
  note: string | null;
}

export interface ScoreItem {
  score: number; // points awarded on the default scale (see SCORE_CRITERIA)
  reason: string;
}

export interface ScoreBreakdown {
  investment_signal: ScoreItem; // 30
  automation_potential: ScoreItem; // 25
  stage_timing: ScoreItem; // 20
  solution_fit: ScoreItem; // 15
  strategic_fit: ScoreItem; // 10
}

export interface Penalty {
  code: string;
  label: string;
  points: number;
}

export interface SolutionFit {
  solution: string;
  reason: string;
}

export interface Analysis {
  mode: AnalysisMode;
  model: string | null;
  analyzedAt: string;
  isRelevant: boolean;
  category: ArticleCategory;
  company: string; // "Unknown" when not stated
  projectName: string;
  country: string;
  city: string;
  region: Region | "Unknown";
  industry: string;
  investmentAmount: string; // "Not Disclosed" when not stated
  facilityType: string;
  signalType: string;
  projectStage: string;
  expectedTimeline: string;
  eventDate: string | null; // YYYY-MM-DD / YYYY-MM / YYYY, only if stated
  eventDateBasis: string;
  historyEventType: HistoryEventType;
  automationNeeds: string[];
  solutionFit: SolutionFit[];
  scoreBreakdown: ScoreBreakdown;
  flags: {
    completedProject: boolean;
    reReport: boolean;
    earningsOnly: boolean;
    maWithoutCapex: boolean;
    lowAutomationRelevance: boolean;
    insufficientEvidence: boolean;
  };
  penalties: Penalty[];
  score: number; // final 0-100 after weights & penalties
  priority: Priority;
  summaryKo: string[]; // ~4 short sentences
  whyItMatters: string;
  facts: string[]; // stated in the article
  inferences: string[]; // AI inference, not stated
  uncertainties: string[];
  competitorsMentioned: string[];
  competitorActivity: string;
  sourceType: SourceType;
}

// ------------------------------------------------------------------ Weekly Market Intelligence

export type WeeklyCategory = "domestic" | "global" | "competitor" | "policy" | "tech" | "opportunity";
export type ReportStatus = "unreviewed" | "selected" | "excluded" | "hold";
export type DateStatus = "verified" | "search" | "unknown"; // 원문 확인 / 검색서비스 날짜(미확정) / 미확인

export interface RelevanceBreakdown {
  business: ScoreItem; // 현대무벡스 사업 연관성 30
  impact: ScoreItem; // 업계 파급력 및 중요도 25
  recency: ScoreItem; // 최신성 20
  strategic: ScoreItem; // 전략지역·산업 관련성 15
  credibility: ScoreItem; // 근거의 신뢰성 10
}

export interface CompetitorCheck {
  name: string;
  confirmed: boolean;
  note: string;
}

// ------------------------------------------------------------------ 주간 업계동향 실무 분류체계

export type DetailGroup = "global" | "domestic" | "competitor" | "review"; // review = 확인 필요

/** Hierarchical report category, e.g. { group: global, country: "폴란드", sub: "제조물류 투자" } → "글로벌시장(폴란드) / 제조물류 투자" */
export interface DetailCategory {
  group: DetailGroup;
  country: string | null; // Korean country name, global only
  sub: string; // 투자·확장 / 제조물류 투자 / … / Industry
  label: string; // UI + Excel name
}

export type Level3 = "high" | "medium" | "low";
export type SupplierStatus = "undecided" | "decided" | "unknown" | "order_unconfirmed"; // 미확정 / 확정 / 확인 불가 / 자동화 발주 여부 미확인

/** Internal judgment items for weekly curation (facts vs inference kept apart via `basis`). */
export interface WeeklyJudgment {
  winPotential: Level3; // 현대무벡스 수주 가능성
  isNewProject: boolean | null;
  completed: boolean; // 이미 준공·오픈·가동
  supplierStatus: SupplierStatus;
  supplierNote: string; // e.g. "Dematic 공급 계약 (원문)" / "건설사 선정 ≠ 자동화 공급사"
  orderRoom: "yes" | "no" | "unknown"; // 발주 여지
  directRelevance: Level3; // 현대무벡스 사업영역 직접 연관성
  competitorValue: Level3 | "none";
  lowValueType: string | null; // 부동산 매입·임대 / 전시회 / R&D센터 / 실투자 없는 MOU / 제품 출시 / 시장 전망
  basis: "body" | "title_only"; // what the judgment could rely on
  automationMentioned: boolean;
}

export interface WeeklyAnalysis {
  mode: AnalysisMode; // ai | rules | demo
  analyzedAt: string;
  categories: WeeklyCategory[];
  primaryCategory: WeeklyCategory | null; // null = 업계동향 대상 아님
  scope: "domestic" | "global";
  country: string;
  industry: string;
  titleKo: string | null; // null = 번역 전 (AI 미연결)
  summaryLines: string[]; // 보고서 문체 4줄 (§ ... / ⇒ ...)
  summaryIsExcerpt: boolean; // true = 규칙 기반 원문 발췌 (AI 요약 아님)
  relevance: number; // Industry Relevance Score 0-100
  relevanceBreakdown: RelevanceBreakdown;
  competitorChecks: CompetitorCheck[];
  policy: { kind: "law" | "government_announcement" | "enforcement" | "other" | "none"; effectiveDate: string | null; note: string } | null;
  eventDate: string | null;
  // v2 (실무 분류체계) — optional so older stored records stay valid; filled by rules on read when missing
  detail?: DetailCategory;
  judgment?: WeeklyJudgment;
  summary4?: string[]; // 보고서용 정확히 4줄 (기호 없음)
  summary4Basis?: "ai" | "rules_title" | "rules_excerpt"; // rules_* = 규칙 기반 (제목·발췌만 근거)
}

export interface ReportItem {
  status: ReportStatus;
  category: WeeklyCategory | null; // 사용자가 지정한 보고서 기본 카테고리 (화면 필터)
  recommended: boolean;
  updatedAt: string;
  order?: number; // 보고서 순서 (보고서 편집에서 드래그)
  edits?: { titleKo?: string; detailLabel?: string; summary4?: string[]; caption?: string }; // 사용자 수정본 (원본 기사 데이터와 별도 저장)
  image?: ReportImage | null; // PPT 기사 이미지 (출처·사용 조건 기록)
  approvedAt?: string | null; // 사용자 최종 승인 (보고서에 그대로 사용해도 됨)
}

// ---------------------------------------------------------------- 원문 복원·본문 추출 기록
/** ok = 본문 확보 · network_error = 접속 실패·차단 · robots_blocked = robots.txt 정책 · http_error = 4xx/5xx
 *  no_text = 페이지는 열렸지만 기사 본문 추출 실패 · google_blocked / google_unresolved = Google News 링크 복원 실패 · manual = 사용자 입력 본문 */
export type BodyStatus = "ok" | "network_error" | "robots_blocked" | "http_error" | "no_text" | "google_blocked" | "google_unresolved" | "manual";
export interface SupportSource { url: string; title: string; kind: "official_press" | "other_media"; status: BodyStatus; chars: number; addedBy: "user" | "search"; checkedAt: string }
export interface SourceTrace {
  originalUrl: string; // 수집 당시 URL (Google News 경유 포함)
  resolvedUrl: string | null; // 실제 언론사 기사 URL (보고서 표기용)
  method: "direct" | "google_offline" | "google_decoder" | "manual";
  bodyStatus: BodyStatus;
  httpStatus: number | null;
  chars: number;
  note: string;
  checkedAt: string;
  support: SupportSource[]; // 보조 근거 (공식 보도자료·다른 매체) — 보고서의 언론사·발행일·URL과 별도
}

// ---------------------------------------------------------------- 보고서용 원문 검증 분석 (Gemini, v3)
/** done = Gemini 분석 완료 · insufficient_source = 원문 부족 · failed = AI 분석 실패 · needs_review = 사용자 검토 필요 */
export type ReportAIStatus = "done" | "insufficient_source" | "failed" | "needs_review";
export type ReportType = "opportunity" | "competitor" | "trend" | "exclude";
export type SourceLevel = "body" | "excerpt" | "title";
export interface ReportFact { value: string; evidence: string } // evidence = verbatim quote from the source text ("" = not stated)
export interface ReportAnalysis {
  version: string; // prompt/validation version — older versions are re-analysed, current ones reused (quota)
  status: ReportAIStatus;
  analyzedAt: string;
  model: string | null;
  sourceLevel: SourceLevel; // what the analysis could read
  sourceChars: number;
  sourceUrl: string | null; // page actually read
  error: { kind: string; message: string; status: number | null } | null;
  reviewReasons: string[]; // why the result needs a human check (validation guards + model's own doubts)
  reportType: ReportType | null;
  excludeReason: string;
  titleKo: string;
  company: ReportFact;
  location: { country: string; countryKo: string; city: string; evidence: string }; // project site, not company nationality
  facility: { kind: string; type: string; evidence: string }; // kind: production_plant | warehouse_dc | rnd_center | office_org | product | policy | other | none
  stage: { value: string; evidence: string }; // planned | approved | under_construction | completed_operating | organisation | announcement | other
  investment: { amount: string; purpose: string; evidence: string }; // purpose: facility_capex | funding_round | acquisition | total_program | other | none
  schedule: ReportFact;
  automation: { mentioned: boolean; items: string[]; evidence: string };
  supplier: { status: "decided" | "undecided" | "unknown"; name: string; evidence: string };
  constructionCompany: string;
  orderPotential: "high" | "medium" | "low";
  category: { group: "global" | "domestic" | "competitor" | "review"; sub: string; countryKo: string };
  summary: string[]; // 4 lines (empty when the source cannot support a reliable summary)
  lineEvidence: string[]; // verbatim quote supporting each summary line ("" for the implication line)
  confidence: "high" | "medium" | "low";
  promptRev?: string; // prompt revision used (older results are kept, re-run only on request)
  autoFixes?: string[]; // deterministic corrections applied (e.g. 금액 단위 환산)
}

/** PPT article image. Never auto-inserted unless its source and usage basis are recorded; unclear rights → needs user approval. */
export type ImageSourceKind = "article" | "press_release" | "official" | "upload";
export interface ReportImage {
  status: "candidate" | "approved" | "rejected";
  source: ImageSourceKind;
  imageUrl: string | null; // where the image file came from (null for uploads)
  pageUrl: string | null; // page that published it (article / newsroom)
  rights: string; // usage basis / caveat shown to the user and recorded in the PPT notes
  caption: string; // 사진 설명 — from the publisher's own alt text / figure caption, or the user
  captionBasis: "alt" | "figcaption" | "title" | "user" | "none";
  assetId: string; // stored JPEG (cropped to the PPT image box)
  width: number;
  height: number;
  fit: "cover" | "contain";
  fetchedAt: string;
}

export interface CurationEntry {
  articleId: string;
  rank: number;
  reasons: string[]; // why it was recommended (shown to the user)
  priority: number; // curation score
}

export interface Curation {
  generatedAt: string;
  target: number;
  includeUnverified: boolean;
  picks: CurationEntry[];
  rejects: { articleId: string; reason: string; detail: string; monitoring: boolean }[];
  needsCheck: { articleId: string; reason: string }[];
  excludedPrevious: number; // stories already reported in previous weeks
  balance: { global: number; domestic: number; competitor: number };
  version?: string; // curation rules version — older saved curations are recomputed (no stale picks)
  shortfall?: number; // target − picks (never padded)
  pendingAI?: number; // candidates waiting for Gemini 원문 검증 / review
  types?: { opportunity: number; competitor: number; trend: number }; // 잠재 수주기회 · 경쟁사 모니터링 · 기술·시장동향
}

export interface WeeklyReport {
  id: string; // `${startDate}_${endDate}`
  startDate: string;
  endDate: string;
  start: string; // ISO
  end: string; // ISO (exclusive)
  items: Record<string, ReportItem>;
  recommendedAt: string | null;
  curation?: Curation | null;
  v2?: boolean; // v2 curation applied (old v1 auto-recommendations released once)
  pptMeta?: {
    vol?: number; coverDate?: string; weekTitle?: string; // PPT 표지 Vol.·월/연도, 주차 제목 (사용자 수정값)
    coverAssetId?: string | null; // 표지 배경 이미지 (선택된 후보) — 로고·제목·Vol.·날짜는 템플릿 그대로
    coverCandidates?: { assetId: string; name: string; addedAt: string }[]; // 업로드한 표지 후보 (기사 사진과 별도)
  };
  updatedAt: string;
}

export interface Article {
  id: string; // hash of normalized URL
  url: string;
  urlNormalized: string;
  title: string;
  titleKo?: string | null;
  sourceName: string;
  sourceDomain: string;
  sourceType: SourceType;
  language: string | null;
  sourceCountry: string | null;
  publishedAt: string | null; // ISO
  publishedAtBasis: string; // where we got the date from
  discoveredAt: string;
  provider: string; // gdelt | rss | gnews | demo
  query: string | null;
  jobId: string | null;
  isDemo: boolean;
  status: ArticleStatus;
  statusNote: string | null;
  preScore: number;
  excerpt: string | null; // short text excerpt / description
  verification: Verification;
  analysis: Analysis | null;
  opportunityId: string | null;
  duplicateOf: string | null;
  competitors: string[];
  feedback: "useful" | "not_useful" | null;
  feedbackAt: string | null;
  weekly?: WeeklyAnalysis | null;
  manualBody?: string | null; // 사용자가 직접 입력한 원문 본문 (원문 접근 실패 시)
  sourceTrace?: SourceTrace | null; // 원문 복원·본문 추출 기록 (원본 URL, 해결된 URL, 상태·실패 이유, 보조 근거)
  report?: ReportAnalysis | null; // 보고서용 Gemini 원문 검증 분석 (v3) — 규칙 기반 요약과 분리
  viaGoogleNews?: boolean; // link is a Google News redirect; original URL not machine-resolvable
  altSearchedAt?: string | null; // paywalled article: free/official alternative search performed
  altSourceIds?: string[]; // free/official articles covering the same story
}

export interface HistoryEntry {
  date: string | null;
  type: HistoryEventType;
  title: string;
  articleId: string;
  note: string;
}

export interface Opportunity {
  id: string;
  matchKey: string;
  company: string;
  projectName: string;
  country: string;
  city: string;
  region: Region | "Unknown";
  industry: string;
  investmentAmount: string;
  facilityType: string;
  signalType: string;
  projectStage: string;
  expectedTimeline: string;
  eventDate: string | null;
  automationNeeds: string[];
  solutions: SolutionFit[];
  score: number;
  priority: Priority;
  scoreBreakdown: ScoreBreakdown;
  penalties: Penalty[];
  whyItMatters: string;
  summaryKo: string[];
  facts: string[];
  inferences: string[];
  uncertainties: string[];
  articleIds: string[];
  primaryArticleId: string;
  latestPublishedAt: string | null;
  firstSeenAt: string;
  lastUpdatedAt: string;
  history: HistoryEntry[];
  verifiedSourceCount: number;
  hasFreeSource: boolean;
  competitorsInvolved: string[];
  analysisMode: AnalysisMode;
  isDemo: boolean;
}

export interface JobStats {
  queriesTotal: number;
  queriesDone: number;
  found: number; // raw results from providers
  newArticles: number;
  duplicates: number;
  filtered: number;
  queued: number;
  analyzed: number;
  newOpportunities: number;
  updatedOpportunities: number;
  errors: number;
}

export interface JobLog {
  t: string;
  level: "info" | "warn" | "error";
  msg: string;
}

export type JobStatus = "running" | "completed" | "completed_with_errors" | "failed" | "cancelled";
export type JobPhase = "discover" | "analyze" | "supplement" | "done";

export interface PlannedQuery {
  provider: string;
  query: string;
  label: string;
}

export interface QuickCandidate {
  url: string; title: string; sourceName: string; domain: string; publishedAt: string | null; publishedAtBasis: string;
  language: string | null; sourceCountry: string | null; description: string | null; provider: string; query: string;
  score: number; domestic: boolean;
}

export interface Job {
  id: string;
  trigger: "manual" | "scheduled";
  mode: "collect" | "quick" | "reanalyze" | "weekly" | "weekly-analyze";
  range?: { start: string; end: string; startDate: string; endDate: string; days?: string[] } | null;
  status: JobStatus;
  phase: JobPhase;
  startedAt: string;
  finishedAt: string | null;
  heartbeatAt: string;
  stats: JobStats;
  queries: PlannedQuery[];
  cursor: number;
  analyzeQueue: string[];
  analyzeIndex: number;
  newOpportunityIds: string[];
  supplementDone: string[];
  lease: { owner: string; until: string } | null;
  providerFailures?: Record<string, number>;
  deadlineAt?: string | null; // overall time limit: on reaching it the job stops and keeps what it collected
  timeLimited?: boolean;
  step?: string; // human-readable current step (shown live in the UI)
  failedSources?: string[];
  quickPool?: QuickCandidate[]; // quick mode: candidates held until selection (only selected ones are stored)
  log: JobLog[];
  error: string | null;
  slices: number;
  options?: { retryFailed?: boolean; ids?: string[]; scope?: "selected" }; // weekly-analyze: explicit articles / 보고서 선정 전체 // weekly-analyze: also re-run failed / 원문 부족 articles
  haltReason?: string | null; // stopped early (e.g. Gemini key / quota error) — remaining articles untouched
}

export interface CountrySetting {
  name: string;
  region: Region;
  enabled: boolean;
  priority: boolean; // strategic region
  aliases: string[];
}

export interface KeywordGroup {
  name: string;
  enabled: boolean;
  keywords: string[];
}

export interface ScoringWeights {
  investment_signal: number;
  automation_potential: number;
  stage_timing: number;
  solution_fit: number;
  strategic_fit: number;
}

export interface WeeklySettings {
  domesticQueries: string[]; // 한국어 (Google News, ko-KR)
  globalQueries: string[]; // 영어 (Google News, en)
  policyQueriesKo: string[];
  policyQueriesEn: string[];
  techQueriesKo: string[];
  techQueriesEn: string[];
  competitorQueriesKo: string[];
  googleNews: boolean;
  gdelt: boolean;
  recommendCount: number; // 최종 추천 기사 수 (기본 12)
  rejectCount?: number; // 후보 탈락 표시 수 (5~10)
  aiPerRun?: number; // AI 분석 1회 최대 건수 (API 사용량 보호)
  queriesVersion?: number;
  maxAnalyzePerRun: number;
}

export interface Settings {
  countries: CountrySetting[];
  industries: KeywordGroup[];
  signals: KeywordGroup[];
  customQueries: string[];
  competitors: { name: string; enabled: boolean; aliases: string[]; requiresContext?: boolean; note?: string }[];
  competitorsVersion?: number; // 2 = expanded list (AutoStore, TGW, Geek+, … + 국내 SI)
  developers?: string[]; // 물류부동산 개발사 (경쟁사 아님 — 투자·개발 주체)
  rssFeeds: { name: string; url: string; enabled: boolean; scope?: "domestic" | "global"; lang?: "ko" | "en" }[];
  weekly: WeeklySettings;
  weights: ScoringWeights;
  hotThreshold: number;
  watchThreshold: number;
  autoCollect: boolean;
  collectionIntervalHours: number; // minimum hours between scheduled runs
  maxQueriesPerRun: number;
  maxAnalyzePerRun: number;
  maxPerCountryPerRun: number;
  maxJobMinutes: number; // overall time limit for a full collection run
  lookbackDays: number;
  englishOnly: boolean;
  analysisLanguage: "ko" | "en";
  reportWeekStart: "monday";
  reportTimezone: string;
  reportPeriodDays: number;
  showDemoData: boolean;
  demoPrefVersion?: number; // 2 = demo hidden by default (one-time migration of older settings)
  rotation: number;
  lastScheduledRunAt: string | null;
}
