"use client";
// 보고서 편집: order (drag or ↑↓), edit 한국어 제목 / 구분 / 4줄 요약 (saved as user edits, originals kept), preview + Excel.
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Download, Eye, GripVertical, Loader2, RotateCcw, Save, X, AlertTriangle } from "lucide-react";
import type { WeeklyRow } from "@/lib/weekly/view";
import type { ExportData } from "@/lib/weekly/export";
import type { ReportStatus } from "@/lib/types";
import { allLabels } from "@/lib/weekly/taxonomy";
import { cn } from "@/lib/utils";
import { postJson, type PeriodQuery } from "./parts";

type Draft = { titleKo: string; label: string; lines: string[] };

function draftOf(r: WeeklyRow): Draft {
  const lines = r.edits?.summary4?.some(Boolean) ? r.edits.summary4 : r.summary4;
  return { titleKo: r.edits?.titleKo || r.titleKo || r.title, label: r.edits?.detailLabel || r.detail?.label || "확인 필요", lines: [...(lines ?? []), "", "", "", ""].slice(0, 4) };
}

function EditorItem({ r, index, total, pq, onMove, onRemove, onSaved, dragProps }: {
  r: WeeklyRow; index: number; total: number; pq: PeriodQuery;
  onMove: (dir: -1 | 1) => void; onRemove: () => void; onSaved: () => void; dragProps: React.HTMLAttributes<HTMLDivElement>;
}) {
  const [d, setD] = useState<Draft>(() => draftOf(r));
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [showOrig, setShowOrig] = useState(false);
  const original = { titleKo: r.titleKo || r.title, label: r.detail?.label || "확인 필요", lines: r.summary4 };
  const dirty = JSON.stringify(d) !== JSON.stringify(draftOf(r));
  const labels = useMemo(() => [...new Set([original.label, d.label, ...allLabels()])], [original.label, d.label]);

  async function save(edits: object | null) {
    setSaving(true);
    setMsg(null);
    try {
      await postJson("/api/weekly/item", { ...pq, articleId: r.id, edits });
      setMsg(edits ? "저장됨" : "원본으로 되돌림");
      onSaved();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }
  const lineWarn = d.lines.filter((l) => l.trim()).length !== 4;

  return (
    <div className="rounded-2xl border border-line bg-surface/90 p-4 sm:p-5" {...dragProps}>
      <div className="flex items-start gap-3">
        <div className="flex shrink-0 flex-col items-center gap-1 pt-1">
          <GripVertical className="hidden h-5 w-5 cursor-grab text-slate-400 sm:block" aria-hidden />
          <span className="text-lg font-bold tabular text-slate-500">{index + 1}</span>
          <button onClick={() => onMove(-1)} disabled={index === 0} aria-label="위로" className="rounded p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
          <button onClick={() => onMove(1)} disabled={index === total - 1} aria-label="아래로" className="rounded p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          <div className="grid gap-3 md:grid-cols-[1fr_260px]">
            <label className="block">
              <span className="mb-1 block text-[13px] text-slate-500">제목 (한국어)</span>
              <input value={d.titleKo} onChange={(e) => setD({ ...d, titleKo: e.target.value })} className="h-10 w-full rounded-lg border border-slate-300 bg-surface-2 px-3 text-[15px] font-medium text-slate-950 outline-none focus:border-sky-500" />
            </label>
            <label className="block">
              <span className="mb-1 block text-[13px] text-slate-500">구분</span>
              <select value={d.label} onChange={(e) => setD({ ...d, label: e.target.value })} className="h-10 w-full rounded-lg border border-slate-300 bg-surface-2 px-2 text-sm">
                {labels.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </label>
          </div>
          <div>
            <span className="mb-1 block text-[13px] text-slate-500">내용 요약 (4줄 · 줄당 20~30자 권장)</span>
            <div className="space-y-1.5">
              {d.lines.map((l, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-4 text-right text-xs tabular text-slate-400">{i + 1}</span>
                  <input value={l} onChange={(e) => setD({ ...d, lines: d.lines.map((x, k) => (k === i ? e.target.value : x)) })} className="h-9 min-w-0 flex-1 rounded-lg border border-slate-300 bg-surface-2 px-3 text-sm text-slate-900 outline-none focus:border-sky-500" />
                  <span className={cn("w-10 text-right text-xs tabular", l.length > 34 ? "text-amber-700" : "text-slate-400")}>{l.length}자</span>
                </div>
              ))}
            </div>
            {lineWarn && <p className="mt-1 text-xs text-amber-700">요약은 정확히 4줄이어야 합니다.</p>}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3 text-[13px]">
              <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-slate-500 hover:text-sky-700">{r.sourceName} · 원문</a>
              <span className={r.dateStatus === "verified" ? "text-slate-500" : "text-amber-700"}>{r.dateStatus === "verified" ? r.kstDate : "발행일 미확인"}</span>
              <button onClick={() => setShowOrig(!showOrig)} className="text-slate-500 underline-offset-2 hover:underline">{showOrig ? "원본 숨기기" : "원본 보기"}</button>
              {r.edits && <span className="text-sky-700">수정본 사용 중</span>}
            </div>
            <div className="flex items-center gap-2">
              {msg && <span className="text-xs text-slate-500">{msg}</span>}
              {r.edits && <button onClick={() => { setD({ titleKo: original.titleKo, label: original.label, lines: [...original.lines, "", "", "", ""].slice(0, 4) }); save(null); }} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[13px] text-slate-500 hover:bg-slate-100"><RotateCcw className="h-3.5 w-3.5" />원본</button>}
              <button onClick={onRemove} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[13px] text-slate-500 hover:bg-slate-100"><X className="h-3.5 w-3.5" />보고서에서 빼기</button>
              <button disabled={!dirty || saving} onClick={() => save({ titleKo: d.titleKo, detailLabel: d.label, summary4: d.lines })} className="inline-flex items-center gap-1 rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-brand-ink disabled:opacity-40">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}저장
              </button>
            </div>
          </div>
          {showOrig && (
            <div className="rounded-lg bg-navy-900/60 p-3 text-[13px] text-slate-600">
              <div className="mb-1 text-xs text-slate-500">원본 (기사 데이터 · {r.summary4Basis === "ai" ? "AI 요약" : "규칙 기반 요약"})</div>
              <div className="font-medium text-slate-800">{original.titleKo}</div>
              <div className="text-xs">{original.label}</div>
              <ol className="mt-1 list-decimal pl-5">{original.lines.map((l, i) => <li key={i}>{l}</li>)}</ol>
              {r.titleKo && r.titleKo !== r.title && <div className="mt-1 text-xs">원문 제목: {r.title}</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function EditorTab({ rows, target, pq, onSet, onRefresh }: { rows: WeeklyRow[]; target: number; pq: PeriodQuery; onSet: (ids: string[], s: ReportStatus) => void; onRefresh: () => void }) {
  const initial = useMemo(() => rows.filter((r) => r.reportStatus === "selected").sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999)).map((r) => r.id), [rows]);
  const [order, setOrder] = useState<string[] | null>(null);
  const ids = order && order.length === initial.length && order.every((id) => initial.includes(id)) ? order : initial;
  const byId = new Map(rows.map((r) => [r.id, r]));
  const [drag, setDrag] = useState<string | null>(null);
  const [preview, setPreview] = useState<ExportData | null>(null);
  const [pv, setPv] = useState<"report" | "rejects" | "opportunities">("report");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function persist(next: string[]) {
    setOrder(next);
    await postJson("/api/weekly/item", { ...pq, orders: next.map((id, i) => ({ id, order: i + 1 })) }).catch((e) => setErr(e.message));
  }
  const move = (i: number, dir: -1 | 1) => {
    const next = [...ids];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    persist(next);
  };
  async function openPreview() {
    setBusy("preview");
    try { setPreview((await postJson("/api/weekly/preview", pq)).data); setPv("report"); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
  }
  async function download() {
    setBusy("excel");
    setErr(null);
    try {
      const r = await fetch("/api/weekly/excel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(pq) });
      if (!r.ok) throw new Error((await r.json()).error ?? "다운로드 실패");
      const blob = await r.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = decodeURIComponent((r.headers.get("Content-Disposition") ?? "").split("''")[1] ?? "주간업계동향.xlsx");
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-navy-900/50 px-4 py-3">
        <div className="text-sm text-slate-600">
          선정 기사 <b className={cn("text-lg tabular", ids.length === target ? "text-sky-700" : "text-slate-900")}>{ids.length}</b> / 기준 {target}건
          <span className="ml-2 text-[13px] text-slate-500">순서는 드래그 또는 ↑↓로 변경 · 수정 내용은 원본과 별도로 저장됩니다</span>
        </div>
        <div className="flex gap-2">
          <button onClick={openPreview} disabled={!ids.length || !!busy} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-800 hover:border-sky-200 disabled:opacity-40">
            {busy === "preview" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}미리보기
          </button>
          <button onClick={download} disabled={!ids.length || !!busy} className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-sm font-semibold text-brand-ink disabled:opacity-40">
            {busy === "excel" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}Excel 다운로드
          </button>
        </div>
      </div>
      {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
      {!ids.length && <div className="rounded-2xl border border-line bg-surface p-8 text-center text-sm text-slate-500">선정된 기사가 없습니다. &lsquo;AI 추천 기사&rsquo;에서 선정하세요.</div>}

      <div className="space-y-3">
        {ids.map((id, i) => {
          const r = byId.get(id);
          if (!r) return null;
          return (
            <EditorItem
              key={`${id}-${r.edits ? JSON.stringify(r.edits) : "o"}`}
              r={r}
              index={i}
              total={ids.length}
              pq={pq}
              onMove={(dir) => move(i, dir)}
              onRemove={() => onSet([id], "unreviewed")}
              onSaved={onRefresh}
              dragProps={{
                draggable: true,
                onDragStart: (e) => { setDrag(id); e.dataTransfer.effectAllowed = "move"; },
                onDragOver: (e) => e.preventDefault(),
                onDrop: (e) => {
                  e.preventDefault();
                  if (!drag || drag === id) return;
                  const next = ids.filter((x) => x !== drag);
                  next.splice(next.indexOf(id) + (ids.indexOf(drag) < i ? 1 : 0), 0, drag);
                  setDrag(null);
                  persist(next);
                },
                className: cn(drag === id && "opacity-50"),
              }}
            />
          );
        })}
      </div>

      {preview && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/60 p-3 sm:p-6">
          <div className="w-full max-w-6xl rounded-2xl border border-line bg-navy-950 shadow-2xl">
            <div className="flex items-center justify-between border-b border-line px-5 py-3">
              <b className="text-base text-slate-900">Excel 미리보기</b>
              <div className="flex gap-2">
                <button onClick={download} className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-brand-ink"><Download className="h-4 w-4" />Excel 다운로드</button>
                <button onClick={() => setPreview(null)} aria-label="닫기" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
              </div>
            </div>
            {preview.warnings.length > 0 && (
              <div className="mx-5 mt-4 rounded-lg bg-amber-50 p-3 text-[13px] text-amber-800">
                <div className="mb-1 flex items-center gap-1.5 font-semibold"><AlertTriangle className="h-4 w-4" />출력 전 확인 사항</div>
                <ul className="list-disc space-y-0.5 pl-5">{preview.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
              </div>
            )}
            <div className="flex flex-wrap gap-1.5 px-5 pt-4">
              {([["report", "주간 업계동향"], ["rejects", "후보 탈락 리스트"], ["opportunities", "잠재 수주기회"]] as const).map(([k, l]) => (
                <button key={k} onClick={() => setPv(k)} className={cn("rounded-full px-3.5 py-1.5 text-sm", pv === k ? "bg-brand font-semibold text-brand-ink" : "bg-slate-100 text-slate-600")}>{l} {preview[k].length}</button>
              ))}
            </div>
            <div className="max-h-[68vh] overflow-auto p-5">
              <table className="w-full min-w-[900px] border-collapse text-[13px]">
                <thead>
                  <tr className="bg-[#0b2a4a] text-left text-white">
                    {["순서", "구분", "일자", "제목", "언론사", "내용 요약", ...(pv === "rejects" ? ["후보 사유"] : []), ...(pv === "opportunities" ? ["점수", "공급사", "발주 여지", "연관 솔루션"] : [])].map((h) => <th key={h} className="border border-[#1d3a5c] px-2 py-2 font-semibold">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {preview[pv].map((r) => (
                    <tr key={r.id} className="align-top">
                      <td className="border border-line px-2 py-2 text-center tabular">{r.order}</td>
                      <td className="border border-line px-2 py-2">{r.label}</td>
                      <td className={cn("border border-line px-2 py-2 whitespace-nowrap", r.dateWarning && "text-amber-700")}>{r.date}</td>
                      <td className="border border-line px-2 py-2"><a href={r.url} target="_blank" rel="noopener noreferrer" className="text-sky-700 underline">{r.title}</a></td>
                      <td className="border border-line px-2 py-2">{r.media}</td>
                      <td className="border border-line px-2 py-2 leading-relaxed">{r.summary.map((l, i) => <div key={i}>{l}</div>)}{r.summaryNote && <div className="mt-1 text-xs text-amber-700">{r.summaryNote}</div>}</td>
                      {pv === "rejects" && <td className="border border-line px-2 py-2">{r.reason}</td>}
                      {pv === "opportunities" && <><td className="border border-line px-2 py-2 text-center">{r.score ?? "—"}</td><td className="border border-line px-2 py-2">{r.supplier}</td><td className="border border-line px-2 py-2">{r.orderRoom}</td><td className="border border-line px-2 py-2">{r.solutions}</td></>}
                    </tr>
                  ))}
                  {!preview[pv].length && <tr><td colSpan={10} className="px-2 py-8 text-center text-slate-500">해당 기사 없음</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
