import { getSettings } from "@/lib/db/repo";
import { ensureInitialized } from "@/lib/data";
import { planQueries } from "@/lib/news/queries";
import { systemStatus } from "@/lib/status";
import { SettingsForm } from "./form";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await ensureInitialized();
  const settings = await getSettings();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Settings</h1>
        <p className="text-sm text-slate-500">관심 국가·산업·키워드, 경쟁사, 점수 가중치, 자동 수집 주기, 분석 언어, 주간동향 기간을 관리합니다.</p>
      </div>
      <SettingsForm initial={settings} initialQueries={planQueries(settings)} status={systemStatus()} />
    </div>
  );
}
