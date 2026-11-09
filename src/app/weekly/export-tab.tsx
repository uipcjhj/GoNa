"use client";
// 보고서 내보내기 · PPT 미리보기: 표지 / 전체 기사 List / 기사 본문 (2건씩) 미리보기, 이미지 확인·교체·업로드,
// 순서 변경, Vol.·날짜 수정, Excel·PowerPoint 다운로드. Excel과 PPT는 같은 데이터(선정 순서·편집 문구)를 사용한다.
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, Check, FileSpreadsheet, Files, ImageOff, ImagePlus, Loader2, Maximize2, Minimize2, Presentation, RefreshCw, Search, Upload, X } from "lucide-react";
import type { ReportArticle, ReportDoc } from "@/lib/report/data";
import type { FitIssue } from "@/lib/report/fit";
import { cn } from "@/lib/utils";
import { postJson } from "./parts";

type DocResp = { doc: ReportDoc; fit: Record<string, FitIssue[]>; render: boolean };
const SOURCE_LABEL = { article: "원문 기사 이미지", press_release: "보도자료 배포 이미지", official: "기업 공식 이미지", upload: "직접 업로드" } as const;

export function ExportTab({ pq, selected, onDownload, busy }: { pq: Record<string, string>; selected: number; onDownload: (k: "excel" | "pptx" | "both") => void; busy: string | null }) {
  const [data, setData] = useState<DocResp | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [work, setWork] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [shots, setShots] = useState<string[] | null>(null);
  const pqKey = JSON.stringify(pq);

  const [reload, setReload] = useState(0);
  const load = useCallback(() => setReload((n) => n + 1), []);
  useEffect(() => {
    let alive = true;
    postJson("/api/weekly/report-doc", JSON.parse(pqKey))
      .then((d) => { if (alive) { setData(d); setErr(null); } })
      .catch((e) => { if (alive) setErr(e instanceof Error ? e.message : String(e)); });
    return () => { alive = false; };
  }, [pqKey, selected, reload]);

  async function task(key: string, fn: () => Promise<string | void>) {
    setWork(key);
    setNote(null);
    try {
      const m = await fn();
      if (m) setNote(m);
      load();
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
    } finally {
      setWork(null);
    }
  }
  const img = (articleId: string, action: string, extra: object = {}) => task(`${action}:${articleId}`, async () => { const d = await postJson("/api/weekly/image", { ...pq, articleId, action, ...extra }); return d.message; });
  const move = (i: number, dir: -1 | 1) => task("order", async () => {
    const items = [...data!.doc.items];
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    [items[i], items[j]] = [items[j]!, items[i]!];
    await postJson("/api/weekly/item", { ...pq, orders: items.map((a, k) => ({ id: a.id, order: k + 1 })) });
  });

  if (err) return <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{err}</div>;
  if (!data) return <div className="flex items-center gap-2 py-16 text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />보고서 데이터를 불러오는 중…</div>;
  const { doc, fit } = data;
  if (!doc.items.length) return <div className="rounded-2xl border border-line bg-surface p-8 text-center text-slate-500">보고서 선정 기사가 없습니다. ‘AI 추천 기사’ 탭에서 기사를 선정하세요.</div>;
  const pairs = Array.from({ length: Math.ceil(doc.items.length / 2) }, (_, k) => doc.items.slice(k * 2, k * 2 + 2));
  const lists = Array.from({ length: Math.ceil(doc.items.length / 12) }, (_, k) => doc.items.slice(k * 12, k * 12 + 12));
  const missing = doc.items.filter((a) => a.image?.status !== "approved").length;
  const fitCount = Object.values(fit).reduce((n, f) => n + f.length, 0);

  return (
    <div className="space-y-6">
      {/* controls */}
      <section className="space-y-4 rounded-2xl border border-line bg-surface/90 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">보고서 내보내기</h2>
            <p className="mt-0.5 text-sm text-slate-500">회사 원본 양식(업계동향리스트.xlsx · 업계동향.pptx)에 선정 기사 <b className="text-sky-700">{doc.items.length}</b>건을 같은 순서·문구로 채웁니다. PPT {1 + lists.length + pairs.length}페이지 (표지 1 · 목록 {lists.length} · 본문 {pairs.length}).</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <ExportBtn icon={<FileSpreadsheet className="h-4 w-4" />} label="Excel" busy={busy === "excel"} onClick={() => onDownload("excel")} />
            <ExportBtn icon={<Presentation className="h-4 w-4" />} label="PowerPoint" busy={busy === "pptx"} onClick={() => onDownload("pptx")} />
            <ExportBtn icon={<Files className="h-4 w-4" />} label="두 파일 모두" primary busy={busy === "both"} onClick={() => onDownload("both")} />
          </div>
        </div>
        <MetaForm doc={doc} pq={pq} onSaved={load} />
        <div className="flex flex-wrap gap-2">
          <button onClick={() => task("findall", async () => { const d = await postJson("/api/weekly/image", { ...pq, action: "find_all" }); const ok = d.results.filter((r: { ok: boolean }) => r.ok).length; return `이미지 자동 찾기: ${ok}건 확보 · ${d.results.length - ok}건 없음 (원문에 대표 이미지가 없거나 접근 불가). 기사 이미지 후보는 사용 권한 확인 후 승인해야 PPT에 들어갑니다.`; })} disabled={!!work} className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-slate-300 bg-surface-2 px-3.5 text-sm text-slate-800 hover:border-sky-200 disabled:opacity-50">
            {work === "findall" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}이미지 없는 기사 자동 찾기
          </button>
          {data.render ? (
            <button onClick={() => task("render", async () => { const d = await postJson("/api/weekly/pptx/render", pq); setShots(d.images); return `실제 PPT 파일을 렌더링했습니다 (${d.images.length}장).`; })} disabled={!!work} className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-slate-300 bg-surface-2 px-3.5 text-sm text-slate-800 hover:border-sky-200 disabled:opacity-50">
              {work === "render" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}실제 슬라이드 렌더링
            </button>
          ) : (
            <span className="self-center text-[13px] text-slate-500">실제 슬라이드 이미지 렌더링은 서버에 LibreOffice가 있을 때만 제공됩니다 (아래는 레이아웃 미리보기).</span>
          )}
        </div>
        {note && <div role="status" className="rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-800">{note}</div>}
        {(doc.warnings.length > 0 || fitCount > 0 || missing > 0) && (
          <ul className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[13px] text-amber-800">
            {doc.warnings.map((w) => <li key={w} className="flex gap-1.5"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{w}</li>)}
            {fitCount > 0 && <li className="flex gap-1.5"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />텍스트 길이 점검 {fitCount}건 — 글꼴을 줄이지 않으므로 아래 표시된 기사의 문구를 줄여 주세요.</li>}
          </ul>
        )}
      </section>

      {shots && (
        <section>
          <div className="mb-2 flex items-center justify-between"><h3 className="text-base font-semibold text-slate-900">실제 PPT 렌더링 ({shots.length}장)</h3><button onClick={() => setShots(null)} className="text-sm text-slate-500">닫기</button></div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {shots.map((s, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <a key={i} href={s} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border border-line bg-white"><img src={s} alt={`슬라이드 ${i + 1}`} className="w-full" /><div className="bg-surface px-2 py-1 text-xs text-slate-500">{i + 1}페이지</div></a>
            ))}
          </div>
        </section>
      )}

      {/* slide previews */}
      <div className="grid gap-6 lg:grid-cols-2">
        <SlideFrame n={1} label="표지">
          <div className="bg-[#002060] px-[6%] pb-[4%] pt-[5%] text-white">
            <div className="flex items-start justify-between">
              <div className="text-[34px] font-medium leading-none">업계동향</div>
              <div className="text-right"><div className="text-xs opacity-80">Weekly Update</div><div className="text-sm">Vol.</div><div className="text-[34px] leading-none">{doc.vol}</div></div>
            </div>
            <div className="mt-3 text-sm">{doc.coverDate}</div>
          </div>
          <div className="mx-[6%] mt-[4%] flex aspect-[1.02] items-center justify-center rounded bg-gradient-to-b from-[#0b2a57] to-[#123d73] text-center text-xs text-white/80">원본 표지 그림·로고·배경은<br />그대로 유지됩니다</div>
          <Footer />
        </SlideFrame>
        {lists.map((chunk, li) => (
          <SlideFrame key={li} n={2 + li} label="전체 기사 List">
            <Header no={1 + li} />
            <div className="mx-[3%] bg-[#002060] px-3 py-2 text-[13px] font-semibold text-white">전체 기사 List</div>
            <table className="mx-[3%] w-[94%] table-fixed text-[12px] text-black">
              <thead><tr className="border-b border-[#cbd5e1] bg-[#f1f5f9] text-[12px]"><th className="w-[8%] py-1">NO</th><th className="w-[23%]">구분</th><th>기사 제목</th></tr></thead>
              <tbody>
                {chunk.map((a, k) => (
                  <tr key={a.id} className="border-b border-[#e2e8f0] align-middle">
                    <td className="py-1 text-center">{li * 12 + k + 1}</td>
                    <td className="py-1 pr-1 leading-tight text-[#64748b]">{a.label}</td>
                    <td className="py-1 leading-tight"><a href={a.url} target="_blank" rel="noopener noreferrer" className="line-clamp-2 text-[#0563c1] hover:underline">{a.title}</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Footer />
          </SlideFrame>
        ))}
        {pairs.map((pair, bi) => (
          <div key={bi} className="min-w-0 space-y-2">
          <SlideFrame n={2 + lists.length + bi} label={`기사 본문 ${bi * 2 + 1}${pair[1] ? `·${bi * 2 + 2}` : ""}`}>
            <Header no={lists.length + bi + 1} />
            {[0, 1].map((h) => {
              const a = pair[h];
              if (!a) return <div key={h} className="mx-[3%] mt-3 flex h-[42%] items-center justify-center rounded border border-dashed border-[#cbd5e1] text-xs text-[#94a3b8]">기사 수가 홀수 — 이 영역은 비워 둡니다</div>;
              const i = bi * 2 + h;
              return <ArticlePreview key={a.id} part="slide" a={a} issues={fit[a.id] ?? []} first={i === 0} last={i === doc.items.length - 1} work={work}
                onUp={() => move(i, -1)} onDown={() => move(i, 1)} onImg={(act, extra) => img(a.id, act, extra)} pq={pq} onUploaded={load} />;
            })}
            <Footer />
          </SlideFrame>
          {pair.map((a, h) => a && (
            <ArticlePreview key={a.id} part="controls" a={a} issues={fit[a.id] ?? []} first={bi * 2 + h === 0} last={bi * 2 + h === doc.items.length - 1} work={work}
              onUp={() => move(bi * 2 + h, -1)} onDown={() => move(bi * 2 + h, 1)} onImg={(act, extra) => img(a.id, act, extra)} pq={pq} onUploaded={load} />
          ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function ExportBtn({ icon, label, onClick, busy, primary }: { icon: React.ReactNode; label: string; onClick: () => void; busy: boolean; primary?: boolean }) {
  return (
    <button onClick={onClick} disabled={busy} className={cn("inline-flex h-10 items-center gap-1.5 rounded-lg px-3.5 text-sm disabled:opacity-50", primary ? "bg-brand font-semibold text-brand-ink" : "border border-slate-300 bg-surface-2 text-slate-800 hover:border-sky-200")}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}{label}
    </button>
  );
}

function MetaForm({ doc, pq, onSaved }: { doc: ReportDoc; pq: Record<string, string>; onSaved: () => void }) {
  const [vol, setVol] = useState(String(doc.vol));
  const [coverDate, setCoverDate] = useState(doc.coverDate);
  const [weekTitle, setWeekTitle] = useState(doc.weekTitle);
  const [state, setState] = useState<string | null>(null);
  const dirty = vol !== String(doc.vol) || coverDate !== doc.coverDate || weekTitle !== doc.weekTitle;
  async function save() {
    setState("저장 중…");
    try {
      await postJson("/api/weekly/report-meta", { ...pq, vol: vol ? Number(vol) : null, coverDate, weekTitle });
      setState("저장됨");
      onSaved();
    } catch (e) {
      setState(e instanceof Error ? e.message : String(e));
    }
  }
  const field = "h-10 rounded-lg border border-slate-300 bg-surface-2 px-3 text-sm text-slate-900";
  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="text-[13px] text-slate-500">Vol.<input value={vol} onChange={(e) => setVol(e.target.value.replace(/\D/g, ""))} inputMode="numeric" className={cn(field, "mt-1 block w-24")} /></label>
      <label className="text-[13px] text-slate-500">표지 월·연도<input value={coverDate} onChange={(e) => setCoverDate(e.target.value)} className={cn(field, "mt-1 block w-32")} /></label>
      <label className="text-[13px] text-slate-500">주차 제목 (Excel 제목·시트명)<input value={weekTitle} onChange={(e) => setWeekTitle(e.target.value)} className={cn(field, "mt-1 block w-36")} /></label>
      <button onClick={save} disabled={!dirty} className="h-10 rounded-lg border border-slate-300 px-3.5 text-sm text-slate-800 hover:border-sky-200 disabled:opacity-40">저장</button>
      <span className="pb-2.5 text-[13px] text-slate-500">{state ?? (doc.volAuto ? "Vol.은 이전 호수에서 자동 증가한 값입니다 (PPT를 내려받으면 이 주차의 Vol.로 저장)." : "저장된 Vol.을 사용합니다.")}</span>
    </div>
  );
}

function SlideFrame({ n, label, children }: { n: number; label: string; children: React.ReactNode }) {
  return (
    <figure className="min-w-0">
      <figcaption className="mb-1.5 text-[13px] text-[#64748b]"><b className="text-[#1e293b]">{n}페이지</b> · {label}</figcaption>
      <div className="relative flex aspect-[8191500/10477500] flex-col overflow-hidden rounded-lg border border-line bg-white text-black shadow-lg">{children}</div>
    </figure>
  );
}
const Header = ({ no }: { no: number }) => (
  <div className="mx-[3%] mb-2 mt-[5%] flex items-end justify-between border-b-2 border-[#002060] pb-1">
    <span className="text-[20px] font-bold text-[#002060]">INDUSTRY &amp; MARKET</span><span className="text-xs font-bold text-[#002060]">NO.{String(no).padStart(2, "0")}</span>
  </div>
);
const Footer = () => <div className="mt-auto px-[3%] pb-[2%] text-right text-xs font-bold text-[#002060]">HYUNDAI MOVEX</div>;

function ArticlePreview({ part, a, issues, first, last, work, onUp, onDown, onImg, pq, onUploaded }: {
  part: "slide" | "controls"; a: ReportArticle; issues: FitIssue[]; first: boolean; last: boolean; work: string | null; pq: Record<string, string>;
  onUp: () => void; onDown: () => void; onImg: (action: string, extra?: object) => void; onUploaded: () => void;
}) {
  const [caption, setCaption] = useState(a.caption);
  const [upErr, setUpErr] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const im = a.image;
  async function upload(f: File) {
    setUploading(true);
    setUpErr(null);
    const fd = new FormData();
    Object.entries(pq).forEach(([k, v]) => fd.append(k, v));
    fd.append("articleId", a.id);
    fd.append("file", f);
    fd.append("caption", caption);
    const r = await fetch("/api/weekly/image", { method: "POST", body: fd });
    if (!r.ok) setUpErr((await r.json().catch(() => ({}))).error ?? "업로드 실패");
    setUploading(false);
    onUploaded();
  }
  const busy = (k: string) => work === `${k}:${a.id}`;
  if (part === "controls") return (
      <div className="space-y-1.5 rounded-lg border border-line bg-[#f1f5f9] p-2.5 text-[12px] text-[#334155]">
        <div className="text-[13px] font-semibold text-[#1e293b]">기사 {a.order} · {a.title}</div>
        {im && <div className="leading-snug text-[#475569]"><b>{SOURCE_LABEL[im.source]}</b> · {im.rights}{im.pageUrl && <> · <a href={im.pageUrl} target="_blank" rel="noopener noreferrer" className="text-[#0369a1] underline">출처</a></>}</div>}
        <div className="flex flex-wrap gap-1">
          <Mini onClick={() => onImg("find")} busy={busy("find")} icon={<Search className="h-3 w-3" />}>{im ? "다시 찾기" : "자동 찾기"}</Mini>
          {im && im.status !== "approved" && <Mini onClick={() => onImg("approve")} busy={busy("approve")} icon={<Check className="h-3 w-3" />}>사용 승인</Mini>}
          {im && im.status === "approved" && <Mini onClick={() => onImg("reject")} busy={busy("reject")} icon={<ImageOff className="h-3 w-3" />}>사용 안 함</Mini>}
          {im && <Mini onClick={() => onImg("fit")} busy={busy("fit")} icon={im.fit === "cover" ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}>{im.fit === "cover" ? "전체 보이기" : "영역 채우기"}</Mini>}
          <Mini onClick={() => file.current?.click()} busy={uploading} icon={<Upload className="h-3 w-3" />}>업로드</Mini>
          {im && <Mini onClick={() => onImg("remove")} busy={busy("remove")} icon={<X className="h-3 w-3" />}>삭제</Mini>}
          <input ref={file} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} />
        </div>
        <div className="flex gap-1">
          <input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="사진 설명 (이미지 내용 기준, 2줄 이내)" className="h-7 min-w-0 flex-1 rounded border border-[#cbd5e1] bg-white px-1.5 text-[12px] text-black" />
          <Mini onClick={() => onImg("caption", { caption })} busy={busy("caption")} icon={<ImagePlus className="h-3 w-3" />} disabled={caption === a.caption}>저장</Mini>
        </div>
        {upErr && <div className="text-[#dc2626]">{upErr}</div>}
        {issues.map((f) => <div key={f.field} className="flex gap-1 text-[#b45309]"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />{f.message}</div>)}
      </div>
  );
  return (
    <div className="mx-[3%] mt-2 flex flex-1 flex-col">
      <div className="flex items-center justify-between bg-[#002060] px-2.5 py-1.5 text-[13px] font-semibold text-white">
        <span className="truncate">{a.label}</span>
        <span className="flex shrink-0 gap-0.5">
          <button aria-label="위로" disabled={first || !!work} onClick={onUp} className="rounded p-0.5 hover:bg-white/20 disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" /></button>
          <button aria-label="아래로" disabled={last || !!work} onClick={onDown} className="rounded p-0.5 hover:bg-white/20 disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" /></button>
        </span>
      </div>
      <div className="bg-[#dae3f3] px-2.5 py-1.5 text-[13px] leading-snug">
        ❖ <a href={a.url} target="_blank" rel="noopener noreferrer" className="text-[#0563c1] hover:underline">{a.title}</a> <b className="text-[#002060]">| {a.media}</b>
        {!a.linkVerified && <span className="ml-1 rounded bg-[#fef3c7] px-1 text-xs text-[#92400e]">Google News 경유</span>}
      </div>
      <div className="mt-1.5 flex flex-1 gap-2">
        <ul className="flex-1 space-y-0.5 text-[12px] font-semibold leading-snug">
          {a.summary.map((l, i) => l && <li key={i} className={cn(i < 3 && "pl-3 -indent-3")}>{i < 3 ? "▪ " : "⇒  "}{l}</li>)}
        </ul>
        <div className="flex w-[33%] shrink-0 flex-col">
          <div className="relative flex aspect-[1941778/1850607] items-center justify-center overflow-hidden border border-[#002060] bg-white">
            {im ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/weekly/asset/${im.assetId}`} alt={a.caption || a.title} className={cn("h-full w-full", im.fit === "cover" ? "object-cover" : "object-contain p-[8%]", im.status !== "approved" && "opacity-40")} />
            ) : (
              <span className="px-1 text-center text-xs text-[#64748b]">[이미지 확인 필요]</span>
            )}
            {im && im.status !== "approved" && <span className="absolute inset-x-0 bottom-0 bg-[#f59e0b]/90 py-0.5 text-center text-xs font-semibold text-white">{im.status === "rejected" ? "제외됨" : "승인 필요"}</span>}
          </div>
          <div className="mt-0.5 border border-[#002060] px-1 py-0.5 text-center text-[12px] font-semibold leading-tight">{a.caption || <span className="font-normal text-[#94a3b8]">사진 설명 없음</span>}</div>
        </div>
      </div>
    </div>
  );
}

function Mini({ children, onClick, busy, icon, disabled }: { children: React.ReactNode; onClick: () => void; busy?: boolean; icon: React.ReactNode; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={busy || disabled} className="inline-flex h-7 items-center gap-1 rounded border border-[#cbd5e1] bg-white px-2 text-[12px] text-[#1e293b] hover:border-[#38bdf8] disabled:opacity-40">
      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : icon}{children}
    </button>
  );
}
