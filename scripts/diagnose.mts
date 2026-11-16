// npm run diagnose -- [--week -1]   : 소스별 수집 성공률·실패 원인·유효 기사 수 + 주간 품질 지표 (호출 없음, 저장된 로그·기사 기준)
import { listArticles, listJobs } from "@/lib/db/repo";
import { buildDiagnostics, qualityMetrics } from "@/lib/news/diagnostics";
import { resolvePeriod } from "@/lib/weekly/period";

const i = process.argv.indexOf("--week");
const p = resolvePeriod({ w: i >= 0 ? process.argv[i + 1] : "-1" });
const jobs = (await listJobs(200)).filter((j) => j.mode === "weekly" || j.mode === "collect" || j.mode === "quick");
const articles = await listArticles({ sinceDays: Math.ceil((Date.now() - new Date(p.start).getTime()) / 86400_000) + 14 });
const d = buildDiagnostics(jobs, articles, p);
console.log(`\n기간 ${p.startDate} ~ ${p.endDate} · 수집 작업 ${d.jobs}건\n`);
console.log("소스".padEnd(26), "요청", "성공", "실패", "건너뜀", "결과", "저장", "기간내", "날짜검증", "중복", "필터제외", "분석", "직접URL", " 실패원인");
for (const s of d.sources) {
  console.log(s.source.slice(0, 25).padEnd(26), String(s.requests).padStart(4), String(s.ok).padStart(4), String(s.failed).padStart(4), String(s.skipped).padStart(5), String(s.results).padStart(5), String(s.stored).padStart(4), String(s.inPeriod).padStart(5), String(s.dateVerified).padStart(6), String(s.duplicates).padStart(4), String(s.filtered).padStart(6), String(s.analyzed).padStart(4), String(s.directUrl).padStart(6), " ", Object.entries(s.fail).map(([k, n]) => `${k}:${n}`).join(" "));
}
console.log("\n합계", d.totals, "\n건수 구분", d.breakdown);
console.log("\n품질 지표", JSON.stringify(qualityMetrics(articles, p), null, 1));
