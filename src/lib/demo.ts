// DEMO DATA — fictional companies and example.com links, clearly flagged (isDemo=true) and shown with a
// DEMO badge. Used only so the UI can be explored before real collection runs. Never mixed with real data.
import "server-only";
import { computeScore } from "@/lib/pipeline/scoring";
import { findMatch, mergeInto, newOpportunityFrom } from "@/lib/pipeline/cluster";
import { regionOf } from "@/lib/config/countries";
import { getStore } from "@/lib/db/store";
import { getSettings, listArticles, listOpportunities, saveArticles, saveOpportunities } from "@/lib/db/repo";
import type { Analysis, Article, ArticleCategory, HistoryEventType, Settings, SourceType } from "@/lib/types";

interface DemoSpec {
  title: string;
  daysAgo: number;
  category: ArticleCategory;
  company: string;
  project: string;
  country: string;
  city: string;
  industry: string;
  amount: string;
  facility: string;
  signal: string;
  stage: string;
  timeline: string;
  event: HistoryEventType;
  scores: [number, number, number, number, number];
  solutions: string[];
  sourceType: SourceType;
  competitors?: string[];
  completed?: boolean;
  eventDate?: string;
}

const SPECS: DemoSpec[] = [
  { title: "[DEMO] Demo Battery Co. plans 30 GWh cell plant in Debrecen", daysAgo: 1, category: "opportunity", company: "Demo Battery Co.", project: "Debrecen Cell Plant", country: "Hungary", city: "Debrecen", industry: "EV & Battery", amount: "EUR 2.1 billion", facility: "Battery Plant", signal: "New Factory", stage: "Announced / Planned", timeline: "착공 2027년 예정 (데모)", event: "announcement", scores: [28, 22, 18, 14, 10], solutions: ["Production Logistics", "AGV", "AMR", "AS/RS"], sourceType: "Official Company Press Release" },
  { title: "[DEMO] Demo Battery Co. Hungary plant receives environmental permit", daysAgo: 0, category: "opportunity", company: "Demo Battery Co.", project: "Debrecen Cell Plant", country: "Hungary", city: "Debrecen", industry: "EV & Battery", amount: "EUR 2.1 billion", facility: "Battery Plant", signal: "Manufacturing Facility Investment", stage: "Approved / Permitted", timeline: "착공 2027년 예정 (데모)", event: "update", scores: [27, 22, 19, 14, 10], solutions: ["Production Logistics", "AGV"], sourceType: "Government Announcement" },
  { title: "[DEMO] Sample Fresh Logistics to build automated cold store near Melbourne", daysAgo: 2, category: "opportunity", company: "Sample Fresh Logistics", project: "Melbourne Automated Cold Store", country: "Australia", city: "Melbourne", industry: "Cold Chain", amount: "AUD 180 million", facility: "Cold Storage", signal: "Cold Storage Investment", stage: "Announced / Planned", timeline: "2028년 가동 목표 (데모)", event: "announcement", scores: [26, 24, 17, 15, 9], solutions: ["Cold Chain Automation", "AS/RS", "4-Way Shuttle", "WMS"], sourceType: "Industry Publication" },
  { title: "[DEMO] Example Retail Group selects site for 120,000 sqm DC in Texas", daysAgo: 3, category: "opportunity", company: "Example Retail Group", project: "Texas Regional DC", country: "United States", city: "Dallas", industry: "E-commerce & Retail", amount: "Not Disclosed", facility: "Distribution Center", signal: "New Distribution Center", stage: "Announced / Planned", timeline: "Unknown", event: "announcement", scores: [24, 23, 15, 14, 8], solutions: ["Shuttle System", "Sorter", "Conveyor System", "WMS", "WCS"], sourceType: "Media Report" },
  { title: "[DEMO] Placeholder Tyres expands Rayong plant with new warehouse", daysAgo: 4, category: "opportunity", company: "Placeholder Tyres", project: "Rayong Plant Expansion", country: "Thailand", city: "Rayong", industry: "Tire", amount: "USD 250 million", facility: "Tire Plant", signal: "Factory Expansion", stage: "Under Construction", timeline: "2027년 완공 (데모)", event: "groundbreaking", scores: [24, 20, 12, 13, 9], solutions: ["Production Logistics", "AS/RS", "Conveyor System"], sourceType: "Media Report" },
  { title: "[DEMO] Fictional Air Cargo issues tender for automated cargo terminal in Abu Dhabi", daysAgo: 2, category: "opportunity", company: "Fictional Air Cargo", project: "Abu Dhabi Cargo Terminal", country: "United Arab Emirates", city: "Abu Dhabi", industry: "Airport & Air Cargo", amount: "Not Disclosed", facility: "Air Cargo Terminal", signal: "RFP / Tender", stage: "Equipment Procurement / Tender", timeline: "입찰 마감 2026년 12월 (데모)", event: "tender", scores: [25, 23, 20, 15, 10], solutions: ["Airport Cargo Handling System", "AS/RS", "Conveyor System"], sourceType: "Tender / Procurement Notice" },
  { title: "[DEMO] Mock Foods to open beverage plant in Binh Duong", daysAgo: 5, category: "opportunity", company: "Mock Foods", project: "Binh Duong Beverage Plant", country: "Vietnam", city: "Binh Duong", industry: "Food & Beverage", amount: "USD 90 million", facility: "Food & Beverage Plant", signal: "New Factory", stage: "Announced / Planned", timeline: "Unknown", event: "announcement", scores: [20, 16, 14, 11, 8], solutions: ["AS/RS", "Conveyor System", "WMS"], sourceType: "Media Report" },
  { title: "[DEMO] Sample Motors' Polish parts plant begins operations", daysAgo: 6, category: "opportunity", company: "Sample Motors", project: "Gliwice Parts Plant", country: "Poland", city: "Gliwice", industry: "Automotive", amount: "PLN 400 million", facility: "Automotive Plant", signal: "Manufacturing Facility Investment", stage: "Operational / Completed", timeline: "가동 시작 (데모)", event: "completion", scores: [15, 14, 2, 9, 8], solutions: ["Production Logistics", "AGV"], sourceType: "Media Report", completed: true, eventDate: "2024-03" },
  { title: "[DEMO] 표시 예시: 경쟁사 수주 기사 (실제 Dematic 기사 아님)", daysAgo: 1, category: "competitor", company: "Example Grocers", project: "Sample Grocery DC", country: "United Kingdom", city: "Unknown", industry: "Logistics Automation", amount: "Not Disclosed", facility: "Distribution Center", signal: "Automation System Procurement", stage: "Equipment Procurement / Tender", timeline: "Unknown", event: "equipment_procurement", scores: [12, 18, 4, 10, 3], solutions: ["Shuttle System"], sourceType: "Industry Publication", competitors: ["Dematic"] },
  { title: "[DEMO] 표시 예시: 경쟁사 기술 발표 기사 (실제 KNAPP 기사 아님)", daysAgo: 3, category: "competitor", company: "KNAPP", project: "Unknown", country: "Unknown", city: "Unknown", industry: "Robotics & Physical AI", amount: "Not Disclosed", facility: "Unknown", signal: "Unknown", stage: "Unknown", timeline: "Unknown", event: "update", scores: [2, 10, 0, 6, 2], solutions: [], sourceType: "Industry Publication", competitors: ["KNAPP"] },
  { title: "[DEMO] Global warehouse automation market outlook (sample story)", daysAgo: 2, category: "industry", company: "Unknown", project: "Unknown", country: "Unknown", city: "Unknown", industry: "Logistics Automation", amount: "Not Disclosed", facility: "Unknown", signal: "Unknown", stage: "Unknown", timeline: "Unknown", event: "update", scores: [0, 8, 0, 5, 0], solutions: [], sourceType: "Industry Publication" },
  { title: "[DEMO] Sample Fresh Logistics confirms Melbourne cold store timeline", daysAgo: 0, category: "opportunity", company: "Sample Fresh Logistics", project: "Melbourne Automated Cold Store", country: "Australia", city: "Melbourne", industry: "Cold Chain", amount: "AUD 180 million", facility: "Cold Storage", signal: "Cold Storage Investment", stage: "Approved / Permitted", timeline: "2028년 가동 목표 (데모)", event: "follow_up_investment", scores: [27, 24, 18, 15, 9], solutions: ["Cold Chain Automation", "AS/RS"], sourceType: "Official Company Press Release" },
];

function demoAnalysis(s: DemoSpec, settings: Settings, publishedAt: string): Analysis {
  const [a, b, c, d, e] = s.scores;
  const breakdown = {
    investment_signal: { score: a, reason: "데모: 시설 투자 발표 내용 기반" },
    automation_potential: { score: b, reason: "데모: 시설 유형상 자동화 수요 예상" },
    stage_timing: { score: c, reason: `데모: 현재 단계 '${s.stage}'` },
    solution_fit: { score: d, reason: `데모: ${s.solutions.slice(0, 3).join(", ") || "해당 없음"}` },
    strategic_fit: { score: e, reason: `데모: ${s.country}` },
  };
  const flags = { completedProject: Boolean(s.completed), reReport: false, earningsOnly: false, maWithoutCapex: false, lowAutomationRelevance: s.category === "industry", insufficientEvidence: false };
  const sc = computeScore(breakdown, flags, settings, { publishedAt, eventDate: s.eventDate ?? null });
  return {
    mode: "demo", model: null, analyzedAt: publishedAt, isRelevant: true, category: s.category,
    company: s.company, projectName: s.project, country: s.country, city: s.city, region: regionOf(s.country),
    industry: s.industry, investmentAmount: s.amount, facilityType: s.facility, signalType: s.signal, projectStage: s.stage,
    expectedTimeline: s.timeline, eventDate: s.eventDate ?? publishedAt.slice(0, 10), eventDateBasis: "데모 데이터",
    historyEventType: s.event, automationNeeds: s.solutions.length ? ["(데모) 입출고 및 보관 자동화", "(데모) 공정 간 물류 자동화"] : [],
    solutionFit: s.solutions.map((x) => ({ solution: x, reason: "데모 데이터 — 검토 가능 솔루션 예시" })),
    scoreBreakdown: breakdown, flags: sc.flags, penalties: sc.penalties, score: sc.score, priority: sc.priority,
    summaryKo: ["[데모] 실제 기사가 아닌 예시 데이터입니다.", `${s.company}의 ${s.project} 관련 가상 시나리오입니다.`, `투자 규모: ${s.amount}.`, "실제 수집을 실행하면 이 항목은 숨기거나 삭제할 수 있습니다."],
    whyItMatters: "[데모] 화면 구성 확인용 예시입니다. 실제 영업 판단에 사용하지 마세요.",
    facts: ["(데모) 가상의 발표 내용"], inferences: ["(데모) 자동화 설비 수요 가능성은 추론입니다."], uncertainties: ["데모 데이터 — 실제 출처 없음"],
    competitorsMentioned: s.competitors ?? [], competitorActivity: s.competitors?.length ? "수주/기술 발표 (데모)" : "", sourceType: s.sourceType,
  };
}

export async function seedDemo(): Promise<number> {
  const settings = await getSettings();
  const existing = (await listArticles()).filter((a) => a.isDemo);
  if (existing.length) return 0;
  const arts: Article[] = [];
  const opps = (await listOpportunities()).filter((o) => o.isDemo);
  SPECS.forEach((s, i) => {
    const publishedAt = new Date(Date.now() - s.daysAgo * 86400_000 - i * 3600_000).toISOString();
    const url = `https://example.com/demo/article-${i + 1}`;
    const art: Article = {
      id: `demo-art-${i + 1}`, url, urlNormalized: url, title: s.title, sourceName: "DEMO (example.com)", sourceDomain: "example.com",
      sourceType: s.sourceType, language: "English", sourceCountry: null, publishedAt, publishedAtBasis: "데모 데이터",
      discoveredAt: publishedAt, provider: "demo", query: null, jobId: null, isDemo: true, status: "analyzed", statusNote: "데모 데이터 — 실제 기사 아님",
      preScore: 0, excerpt: "데모 데이터입니다. 실제 기사가 아닙니다.",
      verification: { status: "unchecked", httpStatus: null, finalUrl: null, redirects: 0, checkedAt: null, access: "unknown", note: "데모 데이터 — 원문 없음" },
      analysis: demoAnalysis(s, settings, publishedAt), opportunityId: null, duplicateOf: null, competitors: s.competitors ?? [], feedback: null, feedbackAt: null,
    };
    if (s.category === "opportunity" || (s.category === "competitor" && s.scores[0] >= 10)) {
      const match = findMatch(art, opps, arts);
      arts.push(art);
      if (match) { mergeInto(match, art, arts, settings); art.opportunityId = match.id; }
      else if (s.category === "opportunity") { const o = newOpportunityFrom(art, settings); o.id = `demo-${o.id}`; opps.push(o); art.opportunityId = o.id; }
    } else arts.push(art);
  });
  await saveArticles(arts);
  await saveOpportunities(opps);
  return arts.length;
}

export async function removeDemo(): Promise<void> {
  const store = getStore();
  const arts = (await listArticles()).filter((a) => a.isDemo).map((a) => a.id);
  const opps = (await listOpportunities()).filter((o) => o.isDemo).map((o) => o.id);
  await store.remove("articles", arts);
  await store.remove("opportunities", opps);
}
