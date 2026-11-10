import { getSettings, getArticles } from "@/lib/db/repo";
import { weeklyRules } from "@/lib/weekly/classify";
const ids = process.argv.slice(2);
const settings = await getSettings();
for (const a of await getArticles(ids)) {
  const w = weeklyRules(a, settings, null);
  console.log("\n#", a.title.slice(0, 90), "\n  country:", w.country, "| label:", w.detail?.label, "| analysis.country:", a.analysis?.country, "| amount:", a.analysis?.investmentAmount);
  console.log("  4줄:", JSON.stringify(w.summary4));
}
