// Week helpers (Monday–Sunday) in a given IANA timezone (default Asia/Seoul).
function tzOffsetMinutes(tz: string, at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(at);
  const v = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(v("year"), v("month") - 1, v("day"), v("hour"), v("minute"), v("second"));
  return Math.round((asUtc - at.getTime()) / 60000);
}

export function localDateStr(iso: string | Date, tz = "Asia/Seoul"): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** Returns [startISO, endISO) of the Monday-start week containing `ref` (or offset weeks). */
export function weekRange(ref: Date, tz = "Asia/Seoul", offsetWeeks = 0): { start: string; end: string; label: string; startDate: string; endDate: string } {
  const local = localDateStr(ref, tz);
  const [y, m, d] = local.split("-").map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun
  const diffToMon = (day + 6) % 7;
  const monUtc = Date.UTC(y, m - 1, d - diffToMon + offsetWeeks * 7);
  const off = tzOffsetMinutes(tz, new Date(monUtc));
  const start = new Date(monUtc - off * 60000);
  const end = new Date(start.getTime() + 7 * 86400_000);
  const startDate = new Date(monUtc).toISOString().slice(0, 10);
  const endDate = new Date(monUtc + 6 * 86400_000).toISOString().slice(0, 10);
  return { start: start.toISOString(), end: end.toISOString(), startDate, endDate, label: `${startDate} (월) ~ ${endDate} (일)` };
}
