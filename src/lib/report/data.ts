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
}

export interface ReportDoc {
  startDate: string;
  endDate: string;
  weekTitle: string; // "11월 1주차"
  coverDate: string; // "Nov, 2026"
  vol: number;
  volAuto: boolean;
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
    vol,
    volAuto: auto,
    items,
    rejects: data.rejects.map((e) => toArticle(e, byId.get(e.id))),
    warnings,
  };
}


