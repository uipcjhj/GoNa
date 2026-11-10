// Real-article check for the weekly report analysis (run in Codespaces where .env.local has GEMINI_API_KEY):
//   npm run gemini:check                 → key / model / free-tier check (1 tiny call)
//   npm run report:compare               → analyse 5 report candidates of last week with Gemini
//   npm run report:compare -- <id> <id>  → specific article ids
// Results are saved on the articles (reused later, no extra quota) and written to .data/report-compare.md.
// The API key is never printed.
import fs from "node:fs/promises";
import { geminiHealth } from "@/lib/ai/gemini";
import { getArticles, getSettings, listArticles, saveArticles } from "@/lib/db/repo";
import { analyzeForReport } from "@/lib/report/factcheck";
import { resolvePeriod } from "@/lib/weekly/period";
import type { Article } from "@/lib/types";

const args = process.argv.slice(2);
const health = await geminiHealth();
console.log(`Gemini: key=${health.configured ? "설정됨" : "없음"} · 설정 모델=${health.configuredModel ?? "-"} · 사용 모델=${health.resolvedModel ?? "-"} · ${health.note}`);
console.log(`호출 테스트: ${health.test.ok ? `성공 (${health.test.ms}ms)` : `실패 — ${health.test.error}`}`);
if (health.flashModels.length) console.log(`사용 가능한 flash 모델: ${health.flashModels.join(", ")}`);
if (args[0] === "--check" || !health.test.ok) process.exit(health.test.ok ? 0 : 1);

const settings = await getSettings();
let arts: Article[];
if (args.length) arts = await getArticles(args);
else {
  const p = resolvePeriod({ w: "-1" });
  arts = (await listArticles({ sinceDays: 21 }))
    .filter((a) => !a.isDemo && a.status === "analyzed" && !a.viaGoogleNews && a.publishedAt && a.publishedAt >= p.start && a.publishedAt < p.end)
    .sort((a, b) => (b.weekly?.relevance ?? 0) - (a.weekly?.relevance ?? 0))
    .slice(0, 5);
}
const out: string[] = [`# 주간 업계동향 Gemini 원문 검증 — 실제 기사 ${arts.length}건 (${new Date().toISOString().slice(0, 16)}Z, 모델 ${health.resolvedModel})`, ""];
for (const a of arts) {
  const before = a.weekly?.summary4?.length ? a.weekly.summary4 : null;
  const r = await analyzeForReport(a, settings);
  a.report = r;
  await saveArticles([a]);
  console.log(`- [${r.status}] ${a.title.slice(0, 70)}`);
  out.push(
    `## ${a.title}`,
    `- 원문: ${a.url}`,
    `- 상태: **${r.status}** · 원문 확보: ${r.sourceLevel} (${r.sourceChars}자) · 보고 유형: ${r.reportType ?? "-"} · 분류: ${r.category.group}/${r.category.sub}${r.category.countryKo ? ` (${r.category.countryKo})` : ""}`,
    `- 소재지: ${r.location.countryKo || r.location.country} ${r.location.city} · 시설: ${r.facility.kind} · 단계: ${r.stage.value} · 금액: ${r.investment.amount || "-"} (${r.investment.purpose})`,
    "",
    "| 이전 (저장된 요약) | Gemini 원문 검증 요약 | 근거 원문 |",
    "|---|---|---|",
    ...[0, 1, 2, 3].map((i) => `| ${before?.[i] ?? "—"} | ${r.summary[i] ?? "—"} | ${(r.lineEvidence[i] ?? "").replace(/\|/g, "/").slice(0, 120)} |`),
    "",
    r.reviewReasons.length ? `- 검토 사유: ${r.reviewReasons.join(" · ")}` : "- 검토 사유: 없음",
    r.error ? `- 오류: ${r.error.kind} — ${r.error.message}` : "",
    "",
  );
}
await fs.mkdir(".data", { recursive: true });
await fs.writeFile(".data/report-compare.md", out.join("\n"));
console.log("\n결과: .data/report-compare.md");
