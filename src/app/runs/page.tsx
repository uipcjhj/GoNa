import { listJobs } from "@/lib/db/repo";
import { isActive } from "@/lib/pipeline/job";
import { Card, CardHeader, CardTitle, Badge, Td, Th } from "@/components/ui";
import { fmtDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

const ST: Record<string, ["green" | "amber" | "red" | "blue" | "slate", string]> = {
  completed: ["green", "완료"], completed_with_errors: ["amber", "완료(일부 오류)"], failed: ["red", "실패"], cancelled: ["slate", "취소"], running: ["blue", "실행 중"],
};

export default async function RunsPage({ searchParams }: PageProps<"/runs">) {
  const sp = await searchParams;
  const jobs = await listJobs(60);
  const sel = jobs.find((j) => j.id === sp.id) ?? jobs[0];
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">실행 기록</h1>
        <p className="text-sm text-slate-500">예약/수동 수집 작업의 실행 기록, 처리 건수와 오류 원인을 확인합니다.</p>
      </div>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead><tr><Th>시작</Th><Th>유형</Th><Th>상태</Th><Th>검색</Th><Th>수집</Th><Th>신규</Th><Th>중복</Th><Th>분석</Th><Th>신규 기회</Th><Th>오류</Th><Th>소요</Th></tr></thead>
            <tbody>
              {jobs.map((j) => {
                const stalled = j.status === "running" && !isActive(j);
                const [tone, label] = stalled ? (["amber", "응답 없음(재개 대기)"] as const) : ST[j.status];
                const dur = j.finishedAt ? Math.round((new Date(j.finishedAt).getTime() - new Date(j.startedAt).getTime()) / 1000) : null;
                return (
                  <tr key={j.id} className={sel?.id === j.id ? "bg-sky-50" : "hover:bg-slate-50"}>
                    <Td className="text-xs tabular"><a href={`/runs?id=${j.id}`} className="text-sky-700 hover:underline">{fmtDate(j.startedAt, true)}</a></Td>
                    <Td className="text-xs">{j.trigger === "scheduled" ? "예약" : "수동"}{j.mode === "reanalyze" ? " · AI 재분석" : ""}</Td>
                    <Td><Badge tone={tone}>{label}</Badge></Td>
                    <Td className="text-xs tabular">{j.stats.queriesDone}/{j.stats.queriesTotal}</Td>
                    <Td className="text-xs tabular">{j.stats.found}</Td>
                    <Td className="text-xs tabular">{j.stats.newArticles}</Td>
                    <Td className="text-xs tabular">{j.stats.duplicates}</Td>
                    <Td className="text-xs tabular">{j.stats.analyzed}</Td>
                    <Td className="text-xs font-semibold text-orange-600 tabular">{j.stats.newOpportunities}</Td>
                    <Td className={`text-xs tabular ${j.stats.errors ? "font-semibold text-red-600" : ""}`}>{j.stats.errors}</Td>
                    <Td className="text-xs tabular">{dur != null ? `${Math.floor(dur / 60)}분 ${dur % 60}초` : "-"}</Td>
                  </tr>
                );
              })}
              {!jobs.length && <tr><Td colSpan={11} className="py-8 text-center text-slate-400">아직 실행 기록이 없습니다. 상단 수주기회 탐색를 눌러 첫 수집을 실행하세요.</Td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
      {sel && (
        <Card>
          <CardHeader><CardTitle>실행 로그 — {sel.id}</CardTitle>{sel.error && <span className="text-xs text-red-600">{sel.error}</span>}</CardHeader>
          <div className="max-h-[480px] overflow-auto p-4 font-mono text-[11px] leading-relaxed">
            {sel.log.map((l, i) => (
              <div key={i} className={l.level === "error" ? "text-red-600" : l.level === "warn" ? "text-amber-700" : "text-slate-600"}>
                <span className="text-slate-400">{l.t.slice(11, 19)}</span> [{l.level}] {l.msg}
              </div>
            ))}
          </div>
          <details className="border-t border-slate-100 p-4 text-xs text-slate-500">
            <summary className="cursor-pointer">이번 실행의 검색어 ({sel.queries.length})</summary>
            <ul className="mt-2 space-y-0.5 font-mono">{sel.queries.map((q, i) => <li key={i}><b>{q.provider}</b> · {q.label} — {q.query}</li>)}</ul>
          </details>
        </Card>
      )}
    </div>
  );
}
