// Test fixtures. Titles of the reported cases are reconstructed from the user's report (Kia, KNAPP, Pfizer and
// Toyota titles are real stored headlines; Haviland, Zed Black and Zipline are representative reconstructions).
import type { Article, ReportAnalysis } from "@/lib/types";
import type { WeeklyRow } from "@/lib/weekly/view";
import { DEFAULT_SETTINGS } from "@/lib/config/defaults";

export const settings = structuredClone(DEFAULT_SETTINGS);

export function article(p: Partial<Article> & { title: string }): Article {
  return {
    id: p.id ?? Math.random().toString(36).slice(2, 10),
    url: p.url ?? "https://news.example.com/a",
    urlNormalized: p.url ?? "https://news.example.com/a",
    titleKo: null,
    sourceName: "Example News",
    sourceDomain: "news.example.com",
    sourceType: "Media Report",
    language: "English",
    sourceCountry: null,
    publishedAt: "2026-11-04T09:00:00Z",
    publishedAtBasis: "원문 메타데이터 (article:published_time)",
    discoveredAt: "2026-11-04T10:00:00Z",
    provider: "rss",
    query: null,
    jobId: null,
    isDemo: false,
    status: "analyzed",
    statusNote: null,
    preScore: 3,
    excerpt: null,
    verification: { status: "verified", httpStatus: 200, finalUrl: p.url ?? "https://news.example.com/a", redirects: 0, checkedAt: "2026-11-04T10:00:00Z", access: "free", note: null },
    analysis: null,
    opportunityId: null,
    duplicateOf: null,
    competitors: [],
    feedback: null,
    feedbackAt: null,
    ...p,
  } as Article;
}

export function aiResult(p: Partial<ReportAnalysis> = {}): ReportAnalysis {
  return {
    version: "r3.1", status: "done", analyzedAt: "2026-11-05T00:00:00Z", model: "gemini-test", sourceLevel: "body", sourceChars: 2400, sourceUrl: null, error: null, reviewReasons: [],
    reportType: "opportunity", excludeReason: "", titleKo: "기사", company: { value: "OO", evidence: "" }, location: { country: "United States", countryKo: "미국", city: "", evidence: "" },
    facility: { kind: "production_plant", type: "공장", evidence: "" }, stage: { value: "planned", evidence: "" }, investment: { amount: "", purpose: "none", evidence: "" },
    schedule: { value: "", evidence: "" }, automation: { mentioned: false, items: [], evidence: "" }, supplier: { status: "unknown", name: "", evidence: "" }, constructionCompany: "",
    orderPotential: "high", category: { group: "global", sub: "제조물류 투자", countryKo: "미국" }, summary: ["a", "b", "c", "d"], lineEvidence: ["", "", "", ""], confidence: "high",
    ...p,
  };
}

/** Minimal weekly row for curation tests. */
export function row(p: Partial<WeeklyRow> & { id: string; title: string }): WeeklyRow {
  const ai = p.ai === undefined ? aiResult() : p.ai;
  return {
    url: `https://news.example.com/${p.id}`, titleKo: null, sourceName: "Example", sourceType: "Media Report", publishedAt: "2026-11-04T09:00:00Z", dateStatus: "verified", dateBasis: "원문 메타데이터", kstDate: "2026-11-04",
    inPeriod: true, eventDate: null, reReport: false, country: "United States", industry: "Manufacturing", categories: ["global"], autoCategory: "global", category: "global", relevance: 70, relevanceBreakdown: null,
    oppScore: 60, oppPriority: null, opportunityId: null, oppWhy: null, oppSolutions: [], summaryLines: [], summaryIsExcerpt: false, analysis: "ai", verification: "verified", access: "free", viaGoogleNews: false, altState: null,
    competitors: [], competitorNotes: [], competitorActivity: "", reportStatus: "unreviewed", recommended: false, isDemo: false, dupGroup: null, excerpt: null, policyNote: null,
    detail: { group: "global", country: "미국", sub: "제조물류 투자", label: "글로벌시장(미국) / 제조물류 투자" },
    judgment: { winPotential: "high", isNewProject: true, completed: false, supplierStatus: "order_unconfirmed", supplierNote: "", orderRoom: "yes", directRelevance: "high", competitorValue: "none", lowValueType: null, basis: "body", automationMentioned: false },
    summary4: ["OO, 미국 공장 신설 추진", "5억 달러 투자 계획", "생산라인 확충", "공정물류 수요 주목"], summary4Basis: "ai", order: null, edits: null, image: null, sourceDomain: "news.example.com", publishedAtBasis: "원문 메타데이터", competitorChecks: [],
    detailBasis: "ai", aiStatus: ai ? ai.status : "none",
    gate: { aiDone: ai?.status === "done", dateVerified: (p.dateStatus ?? "verified") === "verified", sourceLevel: ai?.sourceLevel ?? null, linkDirect: true, approved: false, problems: [] },
    approvedAt: null, sourceTrace: null,
    ...p,
    ai,
  } as WeeklyRow;
}
