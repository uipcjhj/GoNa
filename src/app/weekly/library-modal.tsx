"use client";
// 보고서 이미지 자료실 — 선정 기사별 이미지 후보(기사 원문 / 기업 CI / 관련 사업·시설)를 보고 PPT에 바로 붙여넣을 수 있게
// 이미지 복사(PNG)·다운로드·한 줄 캡션 복사/수정을 제공한다. 이미지 검색은 기사를 열거나 '이미지 찾기'를 누를 때 해당 기사만 실행한다.
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Copy, Download, ExternalLink, Loader2, Pencil, RefreshCw, Search, Star, X } from "lucide-react";
import type { LibEntry, LibImage, LibImageType } from "@/lib/types";
import { cn } from "@/lib/utils";
import { postJson } from "./parts";

interface Item { articleId: string; order: number; title: string; company: string; date: string | null; country: string; category: string; url: string; sourceName: string; entry: LibEntry }
const TYPE_LABEL: Record<LibImageType, string> = { article: "기사 원문", logo: "기업 CI", facility: "관련 사업·시설" };
const FILTERS: { key: "all" | LibImageType; label: string }[] = [{ key: "all", label: "전체" }, { key: "article", label: "기사 원문" }, { key: "logo", label: "기업 CI" }, { key: "facility", label: "관련 사업·시설" }];
const NEEDS = "설명 확인 필요";

/** 클립보드·다운로드용 PNG: PNG는 그대로, SVG·WEBP·JPEG 등은 캔버스에서 PNG로 변환 (비율 유지, 투명 배경 유지). */
export async function toPng(blob: Blob): Promise<Blob> {
  if (blob.type === "image/png") return blob;
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = "async";
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error("이미지를 열 수 없습니다")); img.src = url; });
    let w = img.naturalWidth || 800, h = img.naturalHeight || 400;
    if (blob.type === "image/svg+xml" && w < 1200) { const k = 1200 / w; w = 1200; h = Math.round(h * k); } // 벡터는 선명하게 확대
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    c.getContext("2d")!.drawImage(img, 0, 0, w, h);
    return await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("PNG 변환 실패"))), "image/png"));
  } finally { URL.revokeObjectURL(url); }
}

const proxy = (a: string, i: string, extra = "") => `/api/weekly/image-proxy?a=${encodeURIComponent(a)}&i=${encodeURIComponent(i)}${extra}`;
const keyword = (t: string) => (t.replace(/[^0-9A-Za-z가-힣\s]/g, " ").split(/\s+/).filter((w) => w.length > 1).slice(0, 2).join("") || "기사").slice(0, 16);
const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif", "image/svg+xml": "svg", "image/avif": "avif" };

export function LibraryModal({ pq, onClose }: { pq: Record<string, string>; onClose: () => void }) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | LibImageType>("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  const [zoom, setZoom] = useState<{ a: string; img: LibImage } | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const refs = useRef<Record<string, HTMLElement | null>>({});
  const say = (text: string, error = false) => { setToast({ text, error }); window.setTimeout(() => setToast((t) => (t?.text === text ? null : t)), 3500); };

  const setEntry = (e: LibEntry) => setItems((l) => l?.map((it) => (it.articleId === e.articleId ? { ...it, entry: e } : it)) ?? l);
  const find = useCallback(async (articleId: string, types?: LibImageType[]) => {
    setBusy(`find:${articleId}`);
    try { const d = await postJson("/api/weekly/library", { ...pq, action: "find", articleId, types }); setEntry(d.entry); } catch (e) { say(`이미지 검색 실패: ${e instanceof Error ? e.message : e}`, true); } finally { setBusy(null); }
  }, [pq]);

  useEffect(() => {
    postJson("/api/weekly/library", { ...pq, action: "list" }).then((d) => {
      setItems(d.items);
      const first = d.items?.[0];
      if (first) { setActive(first.articleId); if (!first.entry.foundAt) void find(first.articleId); }
    }).catch((e) => setErr(e instanceof Error ? e.message : String(e)));
    const k = (e: KeyboardEvent) => e.key === "Escape" && (zoom ? setZoom(null) : onClose());
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goto = (it: Item) => {
    setActive(it.articleId);
    refs.current[it.articleId]?.scrollIntoView({ behavior: "smooth", block: "start" });
    if (!it.entry.foundAt) void find(it.articleId); // 기사에 진입할 때 그 기사만 검색
  };

  async function copyImage(it: Item, img: LibImage) {
    setBusy(`copy:${img.id}`);
    try {
      if (!navigator.clipboard || typeof ClipboardItem === "undefined") throw new Error("이 브라우저·주소(https 필요)에서는 이미지 복사를 지원하지 않습니다");
      const png = (async () => { const r = await fetch(proxy(it.articleId, img.id)); if (!r.ok) throw new Error(`이미지를 가져오지 못했습니다 (${r.status})`); return toPng(await r.blob()); })();
      await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
      say("이미지를 복사했습니다 — PowerPoint에서 Ctrl+V");
    } catch (e) { say(`이미지 복사 실패: ${e instanceof Error ? e.message : e} — “다운로드”로 저장해 삽입하세요`, true); } finally { setBusy(null); }
  }
  async function download(it: Item, img: LibImage, asPng: boolean) {
    setBusy(`dl:${img.id}`);
    try {
      const r = await fetch(proxy(it.articleId, img.id, "&dl=1"));
      if (!r.ok) throw new Error(`이미지를 가져오지 못했습니다 (${r.status})`);
      let blob = await r.blob();
      if (asPng) blob = await toPng(blob);
      const name = `${(it.company || "기업").replace(/[\\/:*?"<>|\s]+/g, "")}_${keyword(it.title)}_${TYPE_LABEL[img.type].replace(/[·\s]/g, "")}.${asPng ? "png" : EXT[blob.type] ?? "img"}`;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = name; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      say(`저장했습니다: ${name}`);
    } catch (e) { say(`다운로드 실패: ${e instanceof Error ? e.message : e} — 출처 링크에서 직접 저장하세요`, true); } finally { setBusy(null); }
  }
  async function copyText(text: string) {
    try { await navigator.clipboard.writeText(text); say("캡션을 복사했습니다 — 이미지 아래에 Ctrl+V"); } catch { say("캡션 복사에 실패했습니다 (브라우저 권한 확인)", true); }
  }
  async function saveCaption(it: Item, img: LibImage, text: string) {
    try { const d = await postJson("/api/weekly/library", { ...pq, action: "caption", articleId: it.articleId, imageId: img.id, caption: text }); setEntry(d.entry); say(d.warning ? `저장했습니다 (${d.warning})` : "캡션을 저장했습니다"); } catch (e) { say(`저장 실패: ${e instanceof Error ? e.message : e}`, true); }
  }
  async function regen(it: Item, img: LibImage) {
    let override = false;
    if (img.captionEdited) { if (!window.confirm("직접 수정한 캡션이 있습니다. AI 캡션으로 덮어쓸까요?")) return; override = true; }
    setBusy(`regen:${img.id}`);
    try { const d = await postJson("/api/weekly/library", { ...pq, action: "regen", articleId: it.articleId, imageId: img.id, override }); setEntry(d.entry); say("AI 캡션을 다시 만들었습니다"); } catch (e) { say(`재생성 실패: ${e instanceof Error ? e.message : e}`, true); } finally { setBusy(null); }
  }
  async function primary(it: Item, img: LibImage) {
    try { const d = await postJson("/api/weekly/library", { ...pq, action: "primary", articleId: it.articleId, imageId: img.id }); setEntry(d.entry); } catch (e) { say(String(e), true); }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-navy-950" role="dialog" aria-modal="true" aria-label="보고서 이미지 자료실">
      <header className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold text-slate-950">보고서 이미지 자료실</h2>
          <p className="text-[13px] text-slate-500">선정 기사 {items?.length ?? 0}건 · 이미지 복사 → PowerPoint Ctrl+V, 캡션 복사 → 이미지 아래 Ctrl+V</p>
        </div>
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="이미지 유형">
          {FILTERS.map((f) => <button key={f.key} onClick={() => setFilter(f.key)} className={cn("rounded-full px-3 py-1.5 text-sm", filter === f.key ? "bg-brand font-semibold text-brand-ink" : "bg-slate-100 text-slate-600 hover:text-slate-900")}>{f.label}</button>)}
        </div>
        <button onClick={onClose} aria-label="닫기" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
      </header>

      {err && <p className="m-4 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700">{err}</p>}
      {!items && !err && <p className="m-6 flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />불러오는 중…</p>}
      {items && !items.length && <p className="m-6 text-sm text-slate-500">보고서에 선정한 기사가 없습니다. 먼저 “AI 추천 기사” 또는 “전체 수집 기사”에서 기사를 선정하세요.</p>}

      {items && items.length > 0 && (
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          {/* 기사 빠른 이동 (보고서 편집 순서와 동일) */}
          <nav aria-label="기사 이동" className="flex shrink-0 gap-1.5 overflow-x-auto border-b border-line p-2 md:w-64 md:flex-col md:overflow-y-auto md:border-b-0 md:border-r md:p-3">
            {items.map((it) => (
              <button key={it.articleId} onClick={() => goto(it)} className={cn("flex shrink-0 items-start gap-2 rounded-lg px-3 py-2 text-left text-sm md:shrink", active === it.articleId ? "bg-sky-50 text-slate-950" : "text-slate-600 hover:bg-slate-100")}>
                <span className="tabular mt-0.5 text-sky-700">{it.order}</span>
                <span className="line-clamp-2 max-w-[11rem] md:max-w-none">{it.company ? `${it.company} · ` : ""}{it.title}</span>
              </button>
            ))}
          </nav>

          <div className="min-h-0 flex-1 space-y-8 overflow-y-auto px-4 py-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-6">
            {items.map((it) => {
              const list = it.entry.images.filter((i) => filter === "all" || i.type === filter);
              const searching = busy === `find:${it.articleId}`;
              const notes = it.entry.notes.map((n) => ({ type: n.split(":")[0] as LibImageType, text: n.slice(n.indexOf(":") + 1) })).filter((n) => filter === "all" || n.type === filter);
              return (
                <section key={it.articleId} ref={(el) => { refs.current[it.articleId] = el; }} className="scroll-mt-4 rounded-2xl border border-line bg-surface/90 p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[13px] text-sky-700"><span className="tabular font-semibold">#{it.order}</span> · {it.company || "기업명 확인 필요"} · {it.date ?? "발행일 미확인"} · {it.country} · {it.category}</p>
                      <h3 className="mt-1 text-[17px] font-semibold leading-snug text-slate-950">{it.title}</h3>
                      <a href={it.url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-[13px] text-slate-500 hover:text-sky-700"><ExternalLink className="h-3.5 w-3.5" />{it.sourceName} 원문 기사</a>
                    </div>
                    <button onClick={() => find(it.articleId, it.entry.foundAt ? (["article", "logo", "facility"] as LibImageType[]).filter((t) => !it.entry.images.some((i) => i.type === t)) : undefined)} disabled={searching} className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 px-3 py-1.5 text-sm text-sky-700 hover:bg-sky-50 disabled:opacity-50">
                      {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}{it.entry.foundAt ? "없는 유형 다시 찾기" : "이미지 찾기"}
                    </button>
                  </div>

                  {searching && <p className="mt-3 flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />이 기사의 이미지·CI를 찾는 중…</p>}
                  {!searching && !it.entry.foundAt && <p className="mt-3 text-sm text-slate-500">아직 이미지를 찾지 않았습니다. “이미지 찾기”를 누르거나 왼쪽 목록에서 기사를 선택하세요.</p>}

                  {list.length > 0 && (
                    <ul className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                      {list.map((img) => {
                        const cap = (img.captionEdited ?? img.caption) || "";
                        return <ImageCard key={img.id} it={it} img={img} cap={cap} primary={it.entry.primary === img.id} busy={busy}
                          onZoom={() => setZoom({ a: it.articleId, img })} onCopy={() => copyImage(it, img)} onDownload={(png) => download(it, img, png)} onCopyCaption={() => cap ? copyText(cap) : say("복사할 캡션이 없습니다 — 직접 입력하세요", true)}
                          onSave={(t) => saveCaption(it, img, t)} onRegen={() => regen(it, img)} onPrimary={() => primary(it, img)} />;
                      })}
                    </ul>
                  )}
                  {it.entry.foundAt && !searching && (
                    <ul className="mt-3 space-y-1 text-[13px] text-amber-700">
                      {notes.map((n) => <li key={n.type}>· {TYPE_LABEL[n.type]}: 이미지 없음/확인 필요 — {n.text}</li>)}
                      {!list.length && !notes.length && <li className="text-slate-500">이 유형의 이미지가 없습니다 (관련 없는 사진으로 채우지 않습니다).</li>}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>
        </div>
      )}

      {toast && <div role="status" className={cn("fixed bottom-6 left-1/2 z-[60] max-w-[92vw] -translate-x-1/2 rounded-lg px-4 py-2.5 text-sm shadow-xl", toast.error ? "bg-red-600 text-white" : "bg-brand text-brand-ink")}>{toast.text}</div>}
      {zoom && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/85 p-4" onClick={() => setZoom(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={proxy(zoom.a, zoom.img.id)} alt={zoom.img.caption || TYPE_LABEL[zoom.img.type]} className="max-h-[88vh] max-w-[94vw] bg-white object-contain" />
        </div>
      )}
    </div>,
    document.body,
  );
}

function ImageCard({ it, img, cap, primary, busy, onZoom, onCopy, onDownload, onCopyCaption, onSave, onRegen, onPrimary }: {
  it: Item; img: LibImage; cap: string; primary: boolean; busy: string | null; onZoom: () => void; onCopy: () => void; onDownload: (png: boolean) => void; onCopyCaption: () => void; onSave: (t: string) => void; onRegen: () => void; onPrimary: () => void;
}) {
  const [edit, setEdit] = useState(false);
  const [text, setText] = useState(cap);
  const [broken, setBroken] = useState(false);
  const checker = img.type === "logo" ? "bg-white" : "bg-navy-900";
  return (
    <li className="flex flex-col overflow-hidden rounded-xl border border-line bg-navy-900/60">
      <div className="relative">
        <button onClick={onZoom} aria-label="확대 보기" className={cn("flex h-52 w-full items-center justify-center p-1", checker)}>
          {broken ? <span className="px-3 text-sm text-slate-500">미리보기를 불러오지 못했습니다 — 출처 링크에서 확인하세요</span>
            // eslint-disable-next-line @next/next/no-img-element
            : <img src={proxy(it.articleId, img.id)} alt={cap || TYPE_LABEL[img.type]} loading="lazy" onError={() => setBroken(true)} className="max-h-full max-w-full object-contain" />}
        </button>
        <span className="absolute left-2 top-2 rounded bg-black/70 px-2 py-0.5 text-[11px] text-white">{TYPE_LABEL[img.type]}</span>
        <button onClick={onPrimary} aria-pressed={primary} aria-label="대표 이미지로 선택" className={cn("absolute right-2 top-2 rounded-full p-1.5", primary ? "bg-brand text-brand-ink" : "bg-black/60 text-white hover:bg-black/80")}><Star className="h-4 w-4" /></button>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        {edit ? (
          <div className="space-y-1.5">
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={80} className="w-full rounded-lg border border-slate-300 bg-surface-2 p-2 text-sm outline-none focus:border-sky-500" placeholder="명사형 한 줄 (예: 자동창고 시스템이 설치된 물류센터 내부)" />
            <div className="flex gap-1.5"><button onClick={() => { onSave(text); setEdit(false); }} className="rounded-lg bg-brand px-3 py-1 text-sm font-semibold text-brand-ink">저장</button><button onClick={() => { setText(cap); setEdit(false); }} className="rounded-lg border border-slate-300 px-3 py-1 text-sm">취소</button></div>
          </div>
        ) : (
          <p className={cn("min-h-[2.5rem] text-sm leading-snug", cap ? "text-slate-900" : "text-amber-700")}>
            {cap || NEEDS}
            {img.captionEdited && <span className="ml-1.5 rounded bg-slate-100 px-1.5 text-[11px] text-slate-500">수정본</span>}
            {!img.captionEdited && cap && img.captionBasis === "ai" && <span className="ml-1.5 rounded bg-slate-100 px-1.5 text-[11px] text-slate-500">AI</span>}
          </p>
        )}
        <div className="flex flex-wrap gap-1.5">
          <button onClick={onCopy} disabled={!!busy} className="inline-flex items-center gap-1 rounded-lg bg-brand px-2.5 py-1.5 text-[13px] font-semibold text-brand-ink disabled:opacity-50">{busy === `copy:${img.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}이미지 복사</button>
          <button onClick={onCopyCaption} className="inline-flex items-center gap-1 rounded-lg border border-sky-200 px-2.5 py-1.5 text-[13px] text-sky-700 hover:bg-sky-50"><Check className="h-3.5 w-3.5" />캡션 복사</button>
          <button onClick={() => onDownload(false)} disabled={!!busy} className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-[13px] text-slate-700 hover:border-sky-200 disabled:opacity-50"><Download className="h-3.5 w-3.5" />원본</button>
          {img.mime !== "image/png" && <button onClick={() => onDownload(true)} disabled={!!busy} className="rounded-lg border border-line px-2.5 py-1.5 text-[13px] text-slate-700 hover:border-sky-200 disabled:opacity-50">PNG</button>}
          <button onClick={() => { setText(cap); setEdit(true); }} aria-label="캡션 수정" className="rounded-lg border border-line p-1.5 text-slate-600 hover:border-sky-200"><Pencil className="h-3.5 w-3.5" /></button>
          {img.captionBasis !== "fixed" && <button onClick={onRegen} disabled={!!busy} aria-label="AI 캡션 다시 생성" title="AI 캡션 다시 생성" className="rounded-lg border border-line p-1.5 text-slate-600 hover:border-sky-200 disabled:opacity-50">{busy === `regen:${img.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}</button>}
        </div>
        <p className="text-[12px] leading-relaxed text-slate-500">
          {img.sourceNote} · <a href={img.pageUrl} target="_blank" rel="noopener noreferrer" className="text-sky-700 hover:underline">{img.sourceSite}</a>
          {img.width && img.height ? ` · ${img.width}×${img.height}` : ""}
        </p>
        {img.check && <p className="text-[12px] text-amber-700">확인 필요: {img.check}</p>}
      </div>
    </li>
  );
}
