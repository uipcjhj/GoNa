// 보고서에 쓰이는 값의 우선순위 (화면·Excel·PPT 공통):
//   1) 사용자 직접 수정값  >  2) 최신 Gemini 원문 검증 결과  >  3) (제목·구분만) 키워드 예비 분류  >  4) 없음
// 규칙 기반 문장은 4줄 요약으로 쓰지 않고, 빈 문자열·빈 배열은 "수정 없음"으로 본다 (최신 Gemini 값을 가리지 못함).
import type { WeeklyRow } from "./view";

export type ValueSource = "user" | "gemini" | "rules" | "none";
export interface Effective {
  titleKo: string; label: string; lines: string[];
  source: { title: ValueSource; label: ValueSource; summary: ValueSource };
}
const filled = (s: string[] | undefined | null): s is string[] => Array.isArray(s) && s.some((l) => l.trim());

/** Latest Gemini values (what the report shows when the user has not edited a field). */
export function baselineOf(r: Pick<WeeklyRow, "title" | "titleKo" | "detail" | "detailBasis" | "summary4" | "ai">): Effective {
  const gemini = Boolean(r.ai && r.ai.status !== "failed" && r.ai.status !== "insufficient_source");
  return {
    titleKo: r.titleKo || r.title,
    label: r.detail?.label || "확인 필요",
    lines: r.summary4.length === 4 ? r.summary4 : ["", "", "", ""],
    source: {
      title: gemini && r.ai?.titleKo ? "gemini" : "rules",
      label: r.detailBasis === "ai" ? "gemini" : r.detail ? "rules" : "none",
      summary: r.summary4.length === 4 ? "gemini" : "none",
    },
  };
}

export function effectiveOf(r: Pick<WeeklyRow, "title" | "titleKo" | "detail" | "detailBasis" | "summary4" | "ai" | "edits">): Effective {
  const b = baselineOf(r);
  const e = r.edits;
  const userLines = filled(e?.summary4);
  return {
    titleKo: e?.titleKo?.trim() || b.titleKo,
    label: e?.detailLabel?.trim() || b.label,
    lines: userLines ? [...e!.summary4!.map((l) => l.trim()), "", "", "", ""].slice(0, 4) : b.lines,
    source: { title: e?.titleKo?.trim() ? "user" : b.source.title, label: e?.detailLabel?.trim() ? "user" : b.source.label, summary: userLines ? "user" : b.source.summary },
  };
}

/** What must be stored as the user's edit: only fields that really differ from the latest Gemini values.
 *  (Saving unchanged text would freeze an old summary as a "user edit" and hide every later re-analysis.) */
export function editsToSave(draft: { titleKo: string; label: string; lines: string[] }, r: Parameters<typeof baselineOf>[0]): { titleKo?: string; detailLabel?: string; summary4?: string[] } {
  const b = baselineOf(r);
  const lines = [...draft.lines.map((l) => l.trim()), "", "", "", ""].slice(0, 4);
  const out: { titleKo?: string; detailLabel?: string; summary4?: string[] } = {};
  if (draft.titleKo.trim() && draft.titleKo.trim() !== b.titleKo) out.titleKo = draft.titleKo.trim();
  if (draft.label.trim() && draft.label.trim() !== b.label) out.detailLabel = draft.label.trim();
  if (lines.some(Boolean) && JSON.stringify(lines) !== JSON.stringify(b.lines.map((l) => l.trim()))) out.summary4 = lines;
  return out;
}

/** A user summary differs from a newer/other Gemini summary → show a notice (never replaced automatically). */
export function userSummaryDiffersFromGemini(r: Parameters<typeof baselineOf>[0] & Pick<WeeklyRow, "edits">): boolean {
  const b = baselineOf(r);
  return filled(r.edits?.summary4) && b.source.summary === "gemini" && JSON.stringify(r.edits!.summary4!.map((l) => l.trim())) !== JSON.stringify(b.lines.map((l) => l.trim()));
}

/** Signature of everything the editor shows — used as the React key so a re-analysis re-initialises the inputs. */
export function dataSignature(r: Pick<WeeklyRow, "edits" | "summary4" | "titleKo" | "detail" | "ai" | "approvedAt">): string {
  return JSON.stringify([r.edits ?? null, r.summary4, r.titleKo, r.detail?.label, r.ai?.analyzedAt ?? null, r.ai?.status ?? null, r.approvedAt]);
}

/** One short revision string for all selected rows (changes on analysis / edit / approval) — keeps previews in sync without refreshing. */
export function revOf(rows: Pick<WeeklyRow, "reportStatus" | "edits" | "summary4" | "titleKo" | "detail" | "ai" | "approvedAt">[]): string {
  const sig = rows.filter((r) => r.reportStatus === "selected").map(dataSignature).join("|");
  let h = 5381;
  for (let i = 0; i < sig.length; i++) h = ((h << 5) + h + sig.charCodeAt(i)) | 0;
  return String(h >>> 0);
}
