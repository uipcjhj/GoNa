// One data set for both company templates (Excel 업계동향리스트 + PPT 업계동향):
// same articles, order, 구분, title, media, date, 4-line summary and URL — user edits included.
import "server-only";
import { buildExport, type ExportRow } from "@/lib/weekly/export";
import type { WeeklyView, WeeklyRow } from "@/lib/weekly/view";
import type { Period } from "@/lib/weekly/period";
import type { ReportImage, WeeklyReport } from "@/lib/types";
import { getStore } from "@/lib/db/store";

export interface ReportArticle {
  id: string;
  order: number;
  label: string; // 세부 카테고리 e.g. "글로벌시장(미국) / 투자·확장"
  title: string;
  media: string;
  date: string | null; // YYYY-MM-DD (KST), null when the publication date is not verified
  url: string;
  linkVerified: boolean; // false → only a Google News redirect link is known
  summary: string[]; // exactly 4 lines
  caption: string;
  image: ReportImage | null; // only "approved" images are placed in the PPT
  reason?: string; // 후보 탈락 사유
  quality: ExportRow["quality"]; // AI 분석 완료 · 발행일 확인 · 원문 검증 수준 · 사용자 승인
}

export interface ReportDoc {
  startDate: string;
  endDate: string;
  weekTitle: string; // "11월 1주차"
  coverDate: string; // "Nov, 2026"
  vol: number;
  volAuto: boolean;
  coverAssetId: string | null; // 표지 배경 교체 이미지 (없으면 템플릿 원본 표지 그림)
  coverPrompt: string; // 표지 이미지 생성용 프롬프트 (외부 생성 도구에 붙여넣기)
  coverCandidates: { assetId: string; name: string; addedAt: string }[];
  items: ReportArticle[];
  rejects: ReportArticle[];
  warnings: string[];
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** Template anchor: the original deck "11월 1주차" (week of 2026-11-02) is Vol. 94. */
export const VOL_ANCHOR = { vol: 94, startDate: "2026-11-02" };

const ymd = (s: string) => { const [y, m, d] = s.split("-").map(Number); return { y, m, d }; };
const utc = (s: string) => { const { y, m, d } = ymd(s); return Date.UTC(y, m - 1, d); };


/** Korean week-of-month: the week belongs to the month of its Thursday (2026-11-02~08 → "11월 1주차"). */
export function weekTitleOf(startDate: string): string {
  const thu = utc(startDate) + 3 * 86400_000;
  const t = new Date(thu);
  const firstThu = (() => {
    const first = Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1);
    const dow = new Date(first).getUTCDay(); // 0 Sun … 4 Thu
    return first + ((4 - dow + 7) % 7) * 86400_000;
  })();
  return `${t.getUTCMonth() + 1}월 ${Math.floor((thu - firstThu) / (7 * 86400_000)) + 1}주차`;
}
/** Cover "Nov, 2026" — month of the reporting week's Thursday. */
export function coverDateOf(startDate: string): string {
  const t = new Date(utc(startDate) + 3 * 86400_000);
  return `${MONTHS[t.getUTCMonth()]}, ${t.getUTCFullYear()}`;
}

/** Vol.: saved value for this week → previous saved Vol. + weeks elapsed → template anchor + weeks elapsed. */
export async function resolveVol(report: WeeklyReport): Promise<{ vol: number; auto: boolean }> {
  if (report.pptMeta?.vol) return { vol: report.pptMeta.vol, auto: false };
  const all = await getStore().list<WeeklyReport>("reports");
  const prev = all
    .filter((r) => r.startDate < report.startDate && r.pptMeta?.vol)
    .sort((a, b) => b.startDate.localeCompare(a.startDate))[0];
  const weeks = (from: string) => Math.round((utc(report.startDate) - utc(from)) / (7 * 86400_000));
  if (prev) return { vol: prev.pptMeta!.vol! + Math.max(1, weeks(prev.startDate)), auto: true };
  return { vol: Math.max(1, VOL_ANCHOR.vol + weeks(VOL_ANCHOR.startDate)), auto: true };
}

function toArticle(e: ExportRow, row: WeeklyRow | undefined): ReportArticle {
  const directKnown = !(row?.viaGoogleNews && /news\.google\.com/.test(e.url));
  const img = row?.image ?? null;
  return {
    id: e.id,
    order: e.order,
    label: e.label,
    title: e.title,
    media: e.media,
    date: e.dateWarning ? null : e.date,
    url: e.url,
    linkVerified: directKnown,
    summary: e.summary.map((l) => (l === "—" ? "" : l)),
    caption: row?.edits?.caption ?? img?.caption ?? "",
    image: img,
    reason: e.reason,
    quality: e.quality,
  };
}

export async function buildReportDoc(period: Period, view: WeeklyView, report: WeeklyReport): Promise<ReportDoc> {
  const data = buildExport(view.rows, view.curation);
  const byId = new Map(view.rows.map((r) => [r.id, r]));
  const { vol, auto } = await resolveVol(report);
  const items = data.report.map((e) => toArticle(e, byId.get(e.id)));
  const warnings = [...data.warnings];
  const google = items.filter((a) => !a.linkVerified);
  if (google.length) warnings.push(`Google News 경유 링크만 있는 기사 ${google.length}건 — 발행 매체 직접 URL을 확인하세요 (기사 상세 → 직접 URL 확인).`);
  const noImg = items.filter((a) => a.image?.status !== "approved");
  if (noImg.length) warnings.push(`PPT 이미지 미확정 ${noImg.length}건 — 이미지 영역은 비워 두고 '이미지 확인 필요'로 표시됩니다.`);
  return {
    startDate: period.startDate,
    endDate: period.endDate,
    weekTitle: report.pptMeta?.weekTitle || weekTitleOf(period.startDate),
    coverDate: report.pptMeta?.coverDate || coverDateOf(period.startDate),
    coverAssetId: report.pptMeta?.coverAssetId ?? null,
    coverPrompt: coverPromptOf(items),
    coverCandidates: report.pptMeta?.coverCandidates ?? [],
    vol,
    volAuto: auto,
    items,
    rejects: data.rejects.map((e) => toArticle(e, byId.get(e.id))),
    warnings,
  };
}



// ---- 표지 이미지 프롬프트: 이번 주 선정 기사 주제를 반영한 매거진 표지 배경 (텍스트·로고 없는 배경만)
const THEMES: [RegExp, string][] = [
  [/휴머노이드|humanoid|피지컬 ?AI/i, "humanoid robots working alongside automated systems"],
  [/AMR|AGV|자율|무인|mobile robot/i, "autonomous mobile robots moving through aisles"],
  [/자동창고|AS\/RS|셔틀|스마트창고|물류센터|warehouse|fulfil/i, "a high-bay automated warehouse with shuttle racks and conveyors"],
  [/콜드체인|냉동|냉장|cold/i, "a cold-chain logistics hub with frosted blue lighting"],
  [/배터리|battery|이차전지/i, "an EV battery gigafactory production line"],
  [/자동차|완성차|vehicle|automotive/i, "an automotive assembly plant with robotic arms"],
  [/반도체|semiconductor/i, "a clean semiconductor fab with automated transport"],
  [/스마트팩토리|제조|공장|factory|plant/i, "a smart factory floor with robotic cells"],
  [/항만|공항|port|airport|cargo/i, "an automated cargo terminal with sorters"],
];
export function coverPromptOf(items: { label: string; title: string }[]): string {
  const text = items.map((a) => `${a.label} ${a.title}`).join(" ");
  const scored = THEMES.map(([re, t]) => ({ t, n: (text.match(new RegExp(re.source, "gi")) ?? []).length })).filter((x) => x.n).sort((a, b) => b.n - a.n).slice(0, 3).map((x) => x.t);
  const scene = (scored.length ? scored : ["a modern automated logistics center with robots and conveyors"]).join(", ");
  return [
    `Editorial B2B magazine cover background illustration about logistics automation: ${scene}.`,
    "Deep dark navy palette (#0B1E3F to #050C18) with subtle neon mint accents (#2EF2C4), cinematic lighting, clean and premium industrial look, slight depth of field.",
    "Square composition (1:1), important subject in the lower two thirds, calm empty area at the top.",
    "No text, no letters, no logos, no watermarks, no real company brands, not a photo of a real site.",
  ].join(" ");
}
