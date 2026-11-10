"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Save, Trash2, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Select, Textarea, Badge } from "@/components/ui";
import { SCORE_CRITERIA } from "@/lib/config/defaults";
import type { PlannedQuery, Region, Settings, KeywordGroup } from "@/lib/types";
import type { SystemStatus } from "@/lib/status";
import { GeminiCheck } from "./gemini-check";

const REGIONS: Region[] = ["North America", "Europe", "Southeast Asia", "Middle East", "Oceania", "East Asia", "South Asia", "Latin America", "Africa", "Other"];
const splitList = (s: string) => s.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);

function Row({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <div className="flex items-start gap-2 py-1.5 text-sm">
      {ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />}
      <div><b>{label}</b> <span className="text-slate-500">— {detail}</span></div>
    </div>
  );
}

function GroupEditor({ title, groups, onChange }: { title: string; groups: KeywordGroup[]; onChange: (g: KeywordGroup[]) => void }) {
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle><Button size="sm" variant="outline" onClick={() => onChange([...groups, { name: "New", enabled: true, keywords: [] }])}><Plus className="h-3 w-3" />추가</Button></CardHeader>
      <CardContent className="space-y-2">
        {groups.map((g, i) => (
          <div key={i} className="grid grid-cols-[auto_1fr_auto] items-start gap-2 md:grid-cols-[auto_200px_1fr_auto]">
            <input type="checkbox" className="mt-2.5" checked={g.enabled} onChange={(e) => onChange(groups.map((x, k) => (k === i ? { ...x, enabled: e.target.checked } : x)))} />
            <Input value={g.name} onChange={(e) => onChange(groups.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))} />
            <Input className="order-4 col-span-3 md:order-none md:col-span-1" value={g.keywords.join(", ")} placeholder="검색 키워드 (쉼표로 구분)" onChange={(e) => onChange(groups.map((x, k) => (k === i ? { ...x, keywords: splitList(e.target.value) } : x)))} />
            <Button className="order-3 md:order-none" variant="ghost" size="sm" onClick={() => onChange(groups.filter((_, k) => k !== i))}><Trash2 className="h-3.5 w-3.5" /></Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function SettingsForm({ initial, initialQueries, status }: { initial: Settings; initialQueries: PlannedQuery[]; status: SystemStatus }) {
  const [s, setS] = useState(initial);
  const [queries, setQueries] = useState(initialQueries);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();
  const up = <K extends keyof Settings>(k: K, v: Settings[K]) => setS((p) => ({ ...p, [k]: v }));

  async function save() {
    setSaving(true);
    setMsg(null);
    const r = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(s) });
    const d = await r.json();
    setSaving(false);
    if (r.ok) { setS(d.settings); setQueries(d.queries); setMsg("저장되었습니다."); router.refresh(); } else setMsg(d.error ?? "저장 실패");
  }
  async function demo(action: "seed" | "remove") {
    await fetch("/api/demo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    setMsg(action === "remove" ? "데모 데이터를 삭제했습니다." : "데모 데이터를 불러왔습니다.");
    router.refresh();
  }
  async function reanalyze() {
    const r = await fetch("/api/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "reanalyze" }) });
    setMsg(r.ok ? "AI 재분석 작업을 시작했습니다. 상단 상태 표시에서 진행 상황을 확인하세요." : "실행 실패");
    router.refresh();
  }
  const totalW = SCORE_CRITERIA.reduce((a, c) => a + (Number(s.weights[c.key]) || 0), 0);

  return (
    <div className="space-y-4 pb-24">
      <Card>
        <CardHeader><CardTitle>외부 서비스 연결 상태</CardTitle><span className="text-xs text-slate-400">비밀키는 서버 환경변수로만 관리되며 화면에 노출되지 않습니다</span></CardHeader>
        <CardContent className="grid gap-x-8 md:grid-cols-2">
          <Row ok label="뉴스 검색 (GDELT)" detail="무료 · API 키 불필요 · 항상 사용" />
          <Row ok={status.gnews} label="GNews (선택)" detail={status.gnews ? "연결됨" : "미연결 — GNEWS_API_KEY 설정 시 추가 소스로 사용"} />
          <Row ok={status.ai} label="AI 분석 (Gemini)" detail={status.ai ? `API 키 설정됨 · 모델 ${status.aiModel}` : "미연결 — GEMINI_API_KEY 설정 전에는 보고서용 4줄 요약을 만들지 않음"} />
          <Row ok={status.supabase} label="데이터베이스 (Supabase)" detail={status.supabase ? "연결됨" : status.storage === "local" ? "미연결 — 로컬 파일(.data/db.json) 사용 중 (개발용)" : "미연결 — 임시 저장소 사용 중, 재배포 시 데이터 소실"} />
          <Row ok={status.cron} label="자동 수집 스케줄러" detail={status.cron ? "CRON_SECRET 설정됨 (vercel.json 매일 실행)" : "미연결 — CRON_SECRET 설정 필요"} />
          <Row ok={status.auth} label="접근 제어" detail={status.auth ? "비밀번호 보호 중" : "꺼짐 — APP_PASSWORD 설정 권장"} />
          {status.ai && <div className="pt-2"><Button size="sm" variant="outline" onClick={reanalyze}>규칙 기반 분석 기사 AI로 재분석</Button></div>}
          <GeminiCheck />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>관심 국가</CardTitle><Button size="sm" variant="outline" onClick={() => up("countries", [...s.countries, { name: "", region: "Other", enabled: true, priority: false, aliases: [] }])}><Plus className="h-3 w-3" />국가 추가</Button></CardHeader>
        <CardContent className="overflow-x-auto"><div className="min-w-[640px]">
          <div className="mb-2 grid grid-cols-[60px_1fr_160px_70px_1fr_40px] gap-2 text-[11px] font-semibold uppercase text-slate-400"><span>사용</span><span>국가 (영문)</span><span>Region</span><span>전략지역</span><span>별칭</span><span /></div>
          <div className="space-y-1.5">
            {s.countries.map((c, i) => {
              const set = (patch: Partial<typeof c>) => up("countries", s.countries.map((x, k) => (k === i ? { ...x, ...patch } : x)));
              return (
                <div key={i} className="grid grid-cols-[60px_1fr_160px_70px_1fr_40px] items-center gap-2">
                  <input type="checkbox" checked={c.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
                  <Input value={c.name} onChange={(e) => set({ name: e.target.value })} />
                  <Select value={c.region} onChange={(e) => set({ region: e.target.value as Region })}>{REGIONS.map((r) => <option key={r}>{r}</option>)}</Select>
                  <input type="checkbox" checked={c.priority} onChange={(e) => set({ priority: e.target.checked })} />
                  <Input value={c.aliases.join(", ")} onChange={(e) => set({ aliases: splitList(e.target.value) })} />
                  <Button variant="ghost" size="sm" onClick={() => up("countries", s.countries.filter((_, k) => k !== i))}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              );
            })}
          </div>
        </div></CardContent>
      </Card>

      <GroupEditor title="관심 산업 (산업별 검색 키워드)" groups={s.industries} onChange={(g) => up("industries", g)} />
      <GroupEditor title="수주 신호 (Signal 키워드)" groups={s.signals} onChange={(g) => up("signals", g)} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>추가 뉴스 검색 키워드</CardTitle></CardHeader>
          <CardContent>
            <Textarea rows={5} value={s.customQueries.join("\n")} placeholder={'한 줄에 하나씩. 예) "automated warehouse" Poland\n"cold storage" (Vietnam OR Thailand)'} onChange={(e) => up("customQueries", e.target.value.split("\n").map((x) => x.trim()).filter(Boolean))} />
            <p className="mt-1 text-[11px] text-slate-400">GDELT 문법: 구문은 큰따옴표, OR 그룹은 괄호 사용</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>경쟁사 목록</CardTitle><Button size="sm" variant="outline" onClick={() => up("competitors", [...s.competitors, { name: "", enabled: true, aliases: [] }])}><Plus className="h-3 w-3" />추가</Button></CardHeader>
          <CardContent className="overflow-x-auto"><div className="min-w-[560px] space-y-1.5">
            <div className="grid grid-cols-[auto_140px_1fr_96px_auto] gap-2 text-xs text-slate-500"><span>사용</span><span>경쟁사</span><span>검색 별칭</span><span title="물류자동화·제조물류 사업 기사일 때만 경쟁사로 판단">문맥 필요</span><span /></div>
            {s.competitors.map((c, i) => {
              const set = (patch: Partial<typeof c>) => up("competitors", s.competitors.map((x, k) => (k === i ? { ...x, ...patch } : x)));
              return (
                <div key={i} className="grid grid-cols-[auto_140px_1fr_96px_auto] items-center gap-2">
                  <input type="checkbox" checked={c.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
                  <Input value={c.name} onChange={(e) => set({ name: e.target.value })} />
                  <Input value={c.aliases.join(", ")} placeholder="검색 별칭" onChange={(e) => set({ aliases: splitList(e.target.value) })} />
                  <label className="flex items-center gap-1 text-xs text-slate-500"><input type="checkbox" checked={Boolean(c.requiresContext)} onChange={(e) => set({ requiresContext: e.target.checked })} />물류자동화</label>
                  <Button variant="ghost" size="sm" onClick={() => up("competitors", s.competitors.filter((_, k) => k !== i))}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              );
            })}
            <p className="pt-2 text-xs text-slate-500">&lsquo;물류자동화&rsquo;에 체크한 회사(LG CNS·포스코DX·삼성SDS·LX판토스 등)는 물류자동화·제조물류 사업 기사일 때만 경쟁사로 분류합니다. 회사명이 나왔다는 이유만으로 경쟁사로 보지 않습니다.</p>
            <label className="block pt-2 text-sm">
              <span className="text-xs font-semibold text-slate-600">물류부동산 개발사 (경쟁사 아님 — 투자·개발 주체로 분류)</span>
              <Input value={(s.developers ?? []).join(", ")} onChange={(e) => up("developers", splitList(e.target.value))} />
            </label>
          </div></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>산업 전문지 RSS 피드</CardTitle><Button size="sm" variant="outline" onClick={() => up("rssFeeds", [...s.rssFeeds, { name: "", url: "", enabled: true }])}><Plus className="h-3 w-3" />추가</Button></CardHeader>
        <CardContent className="overflow-x-auto"><div className="min-w-[620px] space-y-1.5">
          {s.rssFeeds.map((f, i) => {
            const set = (patch: Partial<typeof f>) => up("rssFeeds", s.rssFeeds.map((x, k) => (k === i ? { ...x, ...patch } : x)));
            return (
              <div key={i} className="grid grid-cols-[auto_180px_110px_1fr_auto] items-center gap-2">
                <input type="checkbox" checked={f.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
                <Input value={f.name} onChange={(e) => set({ name: e.target.value })} />
                <Select value={f.lang ?? "en"} onChange={(e) => set({ lang: e.target.value as "ko" | "en", scope: e.target.value === "ko" ? "domestic" : "global" })}><option value="ko">국문</option><option value="en">영문</option></Select>
                <Input value={f.url} onChange={(e) => set({ url: e.target.value })} />
                <Button variant="ghost" size="sm" onClick={() => up("rssFeeds", s.rssFeeds.filter((_, k) => k !== i))}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            );
          })}
        </div></CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>주간 업계동향 검색어</CardTitle><span className="text-xs text-slate-400">한 줄에 하나 · Google News 검색 문법(OR 사용 가능) · 기간은 자동 적용</span></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {([
            ["domesticQueries", "국내 산업동향 (국문)"], ["globalQueries", "글로벌 산업동향 (영문)"], ["competitorQueriesKo", "경쟁사 (국문, 영문은 경쟁사 목록 사용)"],
            ["policyQueriesKo", "정책·규제 (국문)"], ["policyQueriesEn", "정책·규제 (영문)"], ["techQueriesKo", "기술·시장 (국문)"], ["techQueriesEn", "기술·시장 (영문)"],
          ] as const).map(([k, label]) => (
            <label key={k} className="text-sm">
              <span className="text-xs font-semibold text-slate-600">{label}</span>
              <Textarea rows={6} value={s.weekly[k].join("\n")} onChange={(e) => up("weekly", { ...s.weekly, [k]: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean) })} />
            </label>
          ))}
          <div className="space-y-2 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" checked={s.weekly.googleNews} onChange={(e) => up("weekly", { ...s.weekly, googleNews: e.target.checked })} />Google News RSS 사용 (무료)</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={s.weekly.gdelt} onChange={(e) => up("weekly", { ...s.weekly, gdelt: e.target.checked })} />GDELT 사용 (무료, 글로벌)</label>
            <label className="block">후보 탈락 표시 수 (5~10)<Input type="number" min={5} max={10} value={s.weekly.rejectCount ?? 8} onChange={(e) => up("weekly", { ...s.weekly, rejectCount: Number(e.target.value) })} /></label>
            <label className="block">AI 분석 1회 최대 건수 (사용량 보호)<Input type="number" min={5} max={200} value={s.weekly.aiPerRun ?? 30} onChange={(e) => up("weekly", { ...s.weekly, aiPerRun: Number(e.target.value) })} /></label>
            <label className="block">주간 추천 기사 수 (기본 12)<Input type="number" value={s.weekly.recommendCount} onChange={(e) => up("weekly", { ...s.weekly, recommendCount: Number(e.target.value) })} /></label>
            <label className="block">1회 최대 분석 기사 수 (AI 연결 시 비용 영향)<Input type="number" value={s.weekly.maxAnalyzePerRun} onChange={(e) => up("weekly", { ...s.weekly, maxAnalyzePerRun: Number(e.target.value) })} /></label>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>수주기회 점수 가중치</CardTitle><Badge tone={totalW === 100 ? "green" : "amber"}>합계 {totalW} {totalW !== 100 && "(100으로 자동 정규화)"}</Badge></CardHeader>
          <CardContent className="space-y-2">
            {SCORE_CRITERIA.map((c) => (
              <div key={c.key} className="grid grid-cols-[1fr_90px] items-center gap-2 text-sm">
                <span>{c.labelKo} <span className="text-xs text-slate-400">(기본 {c.max})</span></span>
                <Input type="number" min={0} max={100} value={s.weights[c.key]} onChange={(e) => up("weights", { ...s.weights, [c.key]: Number(e.target.value) })} />
              </div>
            ))}
            <div className="grid grid-cols-2 gap-2 pt-2 text-sm">
              <label>HOT 기준 점수<Input type="number" value={s.hotThreshold} onChange={(e) => up("hotThreshold", Number(e.target.value))} /></label>
              <label>WATCH 기준 점수<Input type="number" value={s.watchThreshold} onChange={(e) => up("watchThreshold", Number(e.target.value))} /></label>
            </div>
            <p className="text-[11px] text-slate-400">변경 내용은 이후 분석되는 기사부터 적용됩니다.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>자동 수집 · 분석 · 보고서</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 text-sm">
            <label className="col-span-2 flex items-center gap-2"><input type="checkbox" checked={s.autoCollect} onChange={(e) => up("autoCollect", e.target.checked)} />매일 자동 수집 사용</label>
            <label>자동 수집 주기 (시간)<Select value={s.collectionIntervalHours} onChange={(e) => up("collectionIntervalHours", Number(e.target.value))} className="w-full">{[24, 48, 72, 168].map((h) => <option key={h} value={h}>{h === 24 ? "매일" : h === 168 ? "매주" : `${h / 24}일마다`}</option>)}</Select></label>
            <label>전체 탐색 제한시간 (분)<Input type="number" min={5} max={120} value={s.maxJobMinutes} onChange={(e) => up("maxJobMinutes", Number(e.target.value))} /></label>
            <label>검색 기간 (최근 N일)<Input type="number" value={s.lookbackDays} onChange={(e) => up("lookbackDays", Number(e.target.value))} /></label>
            <label>1회 최대 검색 수<Input type="number" value={s.maxQueriesPerRun} onChange={(e) => up("maxQueriesPerRun", Number(e.target.value))} /></label>
            <label>1회 최대 AI 분석 기사 수<Input type="number" value={s.maxAnalyzePerRun} onChange={(e) => up("maxAnalyzePerRun", Number(e.target.value))} /></label>
            <label>국가별 최대 분석 수 (편중 방지)<Input type="number" value={s.maxPerCountryPerRun} onChange={(e) => up("maxPerCountryPerRun", Number(e.target.value))} /></label>
            <label>AI 분석 언어<Select value={s.analysisLanguage} onChange={(e) => up("analysisLanguage", e.target.value as "ko" | "en")} className="w-full"><option value="ko">한국어</option><option value="en">English</option></Select></label>
            <label>주간동향 출력 기간<Select value={s.reportPeriodDays} onChange={(e) => up("reportPeriodDays", Number(e.target.value))} className="w-full"><option value={7}>1주 (월~일)</option><option value={14}>2주 (월~일)</option></Select></label>
            <label className="flex items-center gap-2 pt-5"><input type="checkbox" checked={s.englishOnly} onChange={(e) => up("englishOnly", e.target.checked)} />영문 기사만 수집</label>
            <p className="col-span-2 text-[11px] text-slate-400">실행 시각은 vercel.json의 cron(기본 매일 06:00 KST)으로 지정되며, 위 주기에 맞지 않는 실행은 자동으로 건너뜁니다. AI 분석 기사 수가 많을수록 API 비용이 증가합니다.</p>
          </CardContent>
        </Card>
      </div>

      <Card id="demo">
        <CardHeader><CardTitle>데모 데이터</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={s.showDemoData}
              onChange={async (e) => {
                const v = e.target.checked;
                up("showDemoData", v);
                await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ showDemoData: v }) });
                setMsg(v ? "DEMO 데이터를 표시합니다 (KPI·지도에도 포함)." : "DEMO 데이터를 숨겼습니다. 실제 데이터만 표시됩니다.");
                router.refresh();
              }}
            />
            DEMO 데이터 표시 (기본: 숨김 · 즉시 적용)
          </label>
          <Button size="sm" variant="outline" onClick={() => demo("seed")}>데모 데이터 불러오기</Button>
          <Button size="sm" variant="danger" onClick={() => demo("remove")}>데모 데이터 삭제</Button>
          <span className="text-xs text-slate-400">데모 데이터는 가상 기업·example.com 링크로 구성되며 실제 수집 데이터와 분리되어 있습니다.</span>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>자동 생성 검색어 미리보기 (다음 실행)</CardTitle><span className="text-xs text-slate-400">{queries.length}건 · 국가 × 산업 × 수주신호 조합, 매 실행마다 순환</span></CardHeader>
        <CardContent className="max-h-72 overflow-auto font-mono text-[11px] text-slate-600">
          {queries.map((q, i) => <div key={i}><b>{q.provider}</b> · {q.label} — {q.query}</div>)}
        </CardContent>
      </Card>

      <div className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-3 z-30 flex max-w-[calc(100vw-1.5rem)] items-center gap-3 rounded-xl border border-sky-200 bg-navy-900 px-4 py-2 shadow-2xl sm:right-6">
        {msg && <span className="text-sm text-slate-600">{msg}</span>}
        <Button onClick={save} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}설정 저장</Button>
      </div>
    </div>
  );
}
