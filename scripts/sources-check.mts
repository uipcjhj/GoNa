// npm run sources:check : 설정된 RSS 소스와 공식(site:) 검색의 실제 접근성·항목 수·최신 발행일·날짜 보유율을 1회씩 측정 (소스당 요청 1건).
import { fetchRss } from "@/lib/news/rss";
import { searchGoogleNews } from "@/lib/news/googlenews";
import { getSettings } from "@/lib/db/repo";
import { planWeeklyQueries } from "@/lib/weekly/plan";
import { resolvePeriod } from "@/lib/weekly/period";

const s = await getSettings();
console.log("\n[RSS 소스]");
for (const f of s.rssFeeds.filter((x) => x.enabled)) {
  const t0 = Date.now();
  try {
    const items = await fetchRss(f.name, f.url, new Date(Date.now() - 14 * 86400_000).toISOString(), f.lang ?? "en", false);
    const dated = items.filter((i) => i.publishedAt).length;
    const latest = items.map((i) => i.publishedAt ?? "").sort().pop() ?? "-";
    console.log(`  OK   ${f.name.padEnd(28)} 항목 ${String(items.length).padStart(3)} · 날짜 ${dated}/${items.length} · 최신 ${latest.slice(0, 10)} · ${Date.now() - t0}ms${f.candidate ? " · 후보 소스" : ""}`);
  } catch (e) {
    console.log(`  FAIL ${f.name.padEnd(28)} ${(e as Error).message.slice(0, 70)}${f.candidate ? " · 후보 소스" : ""}`);
  }
}
console.log("\n[공식 소스 · 투자청 / 경쟁사 뉴스룸 (Google News site: 검색)]");
const p = resolvePeriod({ w: "-1" });
for (const q of planWeeklyQueries(s, { start: p.start, end: p.end, startDate: p.startDate, endDate: p.endDate }).filter((x) => /\(공식\)|\(..판\)/.test(x.label))) {
  const o = JSON.parse(q.query) as { q: string; lang: "ko" | "en"; startDate?: string; endDate?: string; edition?: string };
  try {
    const r = await searchGoogleNews(o.q, { lang: o.lang, startDate: o.startDate, endDate: o.endDate, max: 30, edition: o.edition });
    const domains = [...new Set(r.map((x) => x.domain))].slice(0, 5).join(", ");
    console.log(`  OK   ${q.label.padEnd(44)} ${String(r.length).padStart(3)}건 · ${domains}`);
  } catch (e) {
    console.log(`  FAIL ${q.label.padEnd(44)} ${(e as Error).message.slice(0, 60)}`);
  }
}
