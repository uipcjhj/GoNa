import type { CountrySetting, KeywordGroup, Settings, ScoringWeights } from "@/lib/types";

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

export const DEFAULT_RSS = [
  { name: "Supply Chain Dive", url: "https://www.supplychaindive.com/feeds/news/", enabled: true },
  { name: "Manufacturing Dive", url: "https://www.manufacturingdive.com/feeds/news/", enabled: true },
  { name: "Logistics Management", url: "https://www.logisticsmgmt.com/rss", enabled: false },
];

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
  rssFeeds: DEFAULT_RSS,
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
  return { ...DEFAULT_SETTINGS, ...(stored ?? {}), weights: { ...DEFAULT_WEIGHTS, ...(stored?.weights ?? {}) } };
}
