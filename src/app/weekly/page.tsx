import { loadWeekly } from "@/lib/weekly/view";
import { resolvePeriod } from "@/lib/weekly/period";
import { WeeklyBoard } from "./board";

export const dynamic = "force-dynamic";

export default async function WeeklyPage({ searchParams }: PageProps<"/weekly">) {
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const period = resolvePeriod({ p: one("p"), w: one("w"), start: one("start"), end: one("end") });
  const view = await loadWeekly(period);
  return <WeeklyBoard period={period} view={view} />;
}
