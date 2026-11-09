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
}

export interface ReportItem {
  status: ReportStatus;
  category: WeeklyCategory | null; // 사용자가 지정한 보고서 기본 카테고리
  recommended: boolean;
  updatedAt: string;
}

export interface WeeklyReport {
  id: string; // `${startDate}_${endDate}`
  startDate: string;
  endDate: string;
  start: string; // ISO
  end: string; // ISO (exclusive)
  items: Record<string, ReportItem>;
  recommendedAt: string | null;
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
  recommendCount: number; // 15~20
  maxAnalyzePerRun: number;
}

export interface Settings {
  countries: CountrySetting[];
  industries: KeywordGroup[];
  signals: KeywordGroup[];
  customQueries: string[];
  competitors: { name: string; enabled: boolean; aliases: string[] }[];
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
