import type { CountrySetting, KeywordGroup, Settings, ScoringWeights, WeeklySettings } from "@/lib/types";

const c = (name: string, region: CountrySetting["region"], priority: boolean, aliases: string[] = []): CountrySetting => ({
  name,
  region,
  enabled: true,
  priority,
  aliases,
});

export const DEFAULT_COUNTRIES: CountrySetting[] = [
  c("United States", "North America", true, ["USA", "U.S.", "US", "America"]),
  c("Canada", "North America", false),
  c("Mexico", "North America", true),
  c("Poland", "Europe", true, ["Polish"]),
  c("Hungary", "Europe", true, ["Hungarian"]),
  c("Czech Republic", "Europe", false, ["Czechia"]),
  c("Slovakia", "Europe", false),
  c("Romania", "Europe", false),
  c("Germany", "Europe", false),
  c("Spain", "Europe", false),
  c("United Kingdom", "Europe", false, ["UK", "Britain"]),
  c("Vietnam", "Southeast Asia", true, ["Viet Nam"]),
  c("Indonesia", "Southeast Asia", true),
  c("Thailand", "Southeast Asia", true),
  c("Malaysia", "Southeast Asia", true),
  c("Philippines", "Southeast Asia", false),
  c("Singapore", "Southeast Asia", false),
  c("India", "South Asia", false),
  c("United Arab Emirates", "Middle East", true, ["UAE", "Dubai", "Abu Dhabi"]),
  c("Saudi Arabia", "Middle East", true, ["KSA", "Riyadh"]),
  c("Qatar", "Middle East", false),
  c("Australia", "Oceania", true),
  c("New Zealand", "Oceania", false),
];

const g = (name: string, keywords: string[]): KeywordGroup => ({ name, enabled: true, keywords });

export const DEFAULT_INDUSTRIES: KeywordGroup[] = [
  g("Logistics Automation", ["warehouse automation", "logistics automation", "smart logistics", "fulfillment center", "automated warehouse"]),
  g("Smart Factory", ["smart factory", "factory automation", "industry 4.0"]),
  g("Automotive", ["automotive plant", "car plant", "auto parts", "vehicle assembly", "automaker"]),
  g("EV & Battery", ["battery plant", "gigafactory", "battery cell", "EV plant", "cathode", "battery manufacturing"]),
  g("Tire", ["tire plant", "tyre plant", "tire factory"]),
  g("Food & Beverage", ["food processing plant", "beverage plant", "brewery", "dairy plant", "bottling plant"]),
  g("Cold Chain", ["cold storage", "cold chain", "frozen warehouse", "refrigerated warehouse", "temperature-controlled"]),
  g("Petrochemical", ["petrochemical", "chemical plant", "polymer plant", "refinery"]),
  g("Manufacturing", ["manufacturing plant", "production facility", "production line"]),
  g("E-commerce & Retail", ["e-commerce warehouse", "retail distribution center", "fulfilment centre", "omnichannel"]),
  g("Airport & Air Cargo", ["air cargo terminal", "cargo terminal", "baggage handling", "airport expansion"]),
  g("Robotics & Physical AI", ["robotics", "humanoid", "physical AI", "autonomous mobile robot"]),
];

export const DEFAULT_SIGNALS: KeywordGroup[] = [
  g("New Factory", ["new factory", "new plant", "build a plant", "to build factory"]),
  g("Factory Expansion", ["plant expansion", "factory expansion", "expand plant", "expands factory"]),
  g("New Distribution Center", ["new distribution center", "new distribution centre", "opens distribution center"]),
  g("Warehouse Construction", ["warehouse construction", "new warehouse", "breaks ground warehouse"]),
  g("Automated Warehouse Investment", ["automated warehouse", "automated storage", "AS/RS"]),
  g("Manufacturing Facility Investment", ["manufacturing facility", "invest in plant", "production facility investment"]),
  g("Production Line Expansion", ["production line", "new production line", "capacity expansion"]),
  g("Logistics Hub Development", ["logistics hub", "logistics park", "logistics center"]),
  g("Cold Storage Investment", ["cold storage facility", "cold storage warehouse"]),
  g("Automation System Procurement", ["automation contract", "material handling contract", "selects automation"]),
  g("RFP / Tender", ["tender", "request for proposal", "RFP", "procurement notice"]),
  g("Automation Modernization", ["modernization", "retrofit", "automation upgrade"]),
];

export const DEFAULT_COMPETITORS = [
  { name: "Daifuku", enabled: true, aliases: ["Daifuku", "Elettric80"] },
  { name: "Dematic", enabled: true, aliases: ["Dematic"] },
  { name: "SSI Schäfer", enabled: true, aliases: ["SSI Schaefer", "SSI Schäfer", "SSI SCHAEFER"] },
  { name: "KNAPP", enabled: true, aliases: ["KNAPP"] },
  { name: "Vanderlande", enabled: true, aliases: ["Vanderlande"] },
  { name: "Swisslog", enabled: true, aliases: ["Swisslog"] },
];

export const DEFAULT_RSS: Settings["rssFeeds"] = [
  { name: "Supply Chain Dive", url: "https://www.supplychaindive.com/feeds/news/", enabled: true, scope: "global", lang: "en" },
  { name: "Manufacturing Dive", url: "https://www.manufacturingdive.com/feeds/news/", enabled: true, scope: "global", lang: "en" },
  { name: "Logistics Management", url: "https://www.logisticsmgmt.com/rss", enabled: false, scope: "global", lang: "en" },
];

/** Feeds added with the Weekly Market Intelligence feature (also merged into existing saved settings). */
export const WEEKLY_RSS: Settings["rssFeeds"] = [
  { name: "물류신문", url: "https://www.klnews.co.kr/rss/allArticle.xml", enabled: true, scope: "domestic", lang: "ko" },
  { name: "카고뉴스", url: "https://www.cargonews.co.kr/rss/allArticle.xml", enabled: true, scope: "domestic", lang: "ko" },
  { name: "로봇신문", url: "https://www.irobotnews.com/rss/allArticle.xml", enabled: true, scope: "domestic", lang: "ko" },
  { name: "전자신문 (오늘의뉴스)", url: "https://rss.etnews.com/Section901.xml", enabled: true, scope: "domestic", lang: "ko" },
  { name: "The Robot Report", url: "https://www.therobotreport.com/feed/", enabled: true, scope: "global", lang: "en" },
  { name: "Robotics & Automation News", url: "https://roboticsandautomationnews.com/feed/", enabled: true, scope: "global", lang: "en" },
];

export const DEFAULT_WEEKLY: WeeklySettings = {
  domesticQueries: [
    "물류센터 신설", "물류센터 증설 OR 물류센터 착공", "자동창고 OR 스마트물류", "물류로봇 OR AMR OR AGV",
    "스마트팩토리 투자 OR 제조자동화", "풀필먼트센터 OR 이커머스 물류센터", "콜드체인 OR 냉동냉장 물류센터",
    "배터리 공장 투자 OR 증설", "자동차 공장 투자 OR 타이어 공장 증설", "공정물류 자동화", "공항 물류 OR 수하물 처리시스템",
    "승강장 안전문 OR 철도 시스템", "현대무벡스",
  ],
  globalQueries: [
    "new factory Poland OR Hungary", "warehouse automation Europe investment", "distribution center construction automation",
    "factory investment Vietnam OR Thailand OR Indonesia OR Malaysia", "logistics hub UAE OR Saudi Arabia warehouse",
    "distribution centre Australia automation", "gigafactory OR battery plant investment", "cold storage facility investment",
    "tire plant expansion", "air cargo terminal automation", "food beverage plant expansion automation", "petrochemical plant investment Middle East",
  ],
  policyQueriesKo: [
    "스마트물류 지원 정책", "스마트공장 지원사업", "물류시설 투자 지원 국토교통부", "로봇산업 육성 정책",
    "물류 예산 정부", "산업단지 인프라 투자", "관세 공급망 제조업 대응", "물류 탄소 규제 OR 친환경 물류 정책",
  ],
  policyQueriesEn: [
    "manufacturing investment incentive government", "tariff supply chain manufacturing reshoring", "robot safety standard regulation", "logistics infrastructure funding government",
  ],
  techQueriesKo: ["디지털트윈 물류", "피지컬 AI 로봇", "WMS OR WCS 물류 시스템", "물류 자동화 시장 전망"],
  techQueriesEn: ["warehouse robotics market", "AS/RS automated storage retrieval", "autonomous mobile robots warehouse", "physical AI robotics logistics", "digital twin warehouse"],
  competitorQueriesKo: ["다이후쿠 OR 데마틱 OR 스위스로그", "크납 OR 반더란데 OR SSI쉐퍼"],
  googleNews: true,
  gdelt: true,
  recommendCount: 18,
  maxAnalyzePerRun: 150,
};

export const DEFAULT_WEIGHTS: ScoringWeights = {
  investment_signal: 30,
  automation_potential: 25,
  stage_timing: 20,
  solution_fit: 15,
  strategic_fit: 10,
};

export const SCORE_CRITERIA: { key: keyof ScoringWeights; label: string; labelKo: string; max: number }[] = [
  { key: "investment_signal", label: "Facility investment / new project signal", labelKo: "실제 시설 투자 및 신규 프로젝트 신호", max: 30 },
  { key: "automation_potential", label: "Logistics automation applicability", labelKo: "물류자동화 적용 가능성", max: 25 },
  { key: "stage_timing", label: "Project stage & procurement timing", labelKo: "프로젝트 진행 단계와 발주 시점", max: 20 },
  { key: "solution_fit", label: "Hyundai Movex solution fit", labelKo: "현대무벡스 솔루션 적합도", max: 15 },
  { key: "strategic_fit", label: "Strategic region & key customer", labelKo: "전략지역 및 주요 고객 관련성", max: 10 },
];

export const MOVEX_SOLUTIONS = [
  "AS/RS",
  "4-Way Shuttle",
  "Shuttle System",
  "AGV",
  "AMR",
  "Conveyor System",
  "Sorter",
  "WMS",
  "WCS",
  "Automated Warehouse",
  "Production Logistics",
  "Cold Chain Automation",
  "Airport Baggage Handling System",
  "Airport Cargo Handling System",
];

export const PROJECT_STAGES = [
  "Announced / Planned",
  "Approved / Permitted",
  "Under Construction",
  "Equipment Procurement / Tender",
  "Operational / Completed",
  "Unknown",
];

export const DEFAULT_SETTINGS: Settings = {
  countries: DEFAULT_COUNTRIES,
  industries: DEFAULT_INDUSTRIES,
  signals: DEFAULT_SIGNALS,
  customQueries: [],
  competitors: DEFAULT_COMPETITORS,
  rssFeeds: [...DEFAULT_RSS, ...WEEKLY_RSS],
  weekly: DEFAULT_WEEKLY,
  weights: DEFAULT_WEIGHTS,
  hotThreshold: 80,
  watchThreshold: 60,
  autoCollect: true,
  collectionIntervalHours: 24,
  maxQueriesPerRun: 18,
  maxAnalyzePerRun: 40,
  maxPerCountryPerRun: 6,
  lookbackDays: 3,
  englishOnly: true,
  analysisLanguage: "ko",
  reportWeekStart: "monday",
  reportTimezone: "Asia/Seoul",
  reportPeriodDays: 7,
  showDemoData: true,
  rotation: 0,
  lastScheduledRunAt: null,
};

export function mergeSettings(stored: Partial<Settings> | null | undefined): Settings {
  const merged: Settings = {
    ...DEFAULT_SETTINGS,
    ...(stored ?? {}),
    weights: { ...DEFAULT_WEIGHTS, ...(stored?.weights ?? {}) },
    weekly: { ...DEFAULT_WEEKLY, ...(stored?.weekly ?? {}) },
  };
  // migration: settings saved before the weekly feature get the new domestic/global feeds once
  if (stored && !stored.weekly && stored.rssFeeds) {
    const have = new Set(stored.rssFeeds.map((f) => f.url));
    merged.rssFeeds = [...stored.rssFeeds, ...WEEKLY_RSS.filter((f) => !have.has(f.url))];
  }
  return merged;
}
