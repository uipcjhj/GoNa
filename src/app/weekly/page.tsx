import { loadWeekly } from "@/lib/weekly/view";
import { resolvePeriod } from "@/lib/weekly/period";
import { WeeklyBoard, type Tab } from "./board";

export const dynamic = "force-dynamic";

export default async function WeeklyPage({ searchParams }: PageProps<"/weekly">) {
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const period = resolvePeriod({ p: one("p"), w: one("w"), start: one("start"), end: one("end") });
  const view = await loadWeekly(period);
  const t = one("tab");
  const tab: Tab = t === "all" || t === "rejects" || t === "edit" ? t : "rec";
  return <WeeklyBoard period={period} view={view} tab={tab} />;
}
