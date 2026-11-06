import "server-only";
import { getStore } from "./store";
import { mergeSettings } from "@/lib/config/defaults";
import type { Article, Job, Opportunity, Settings } from "@/lib/types";

const SETTINGS_ID = "global";

export async function getSettings(): Promise<Settings> {
  const row = await getStore().get<{ id: string; value: Partial<Settings> }>("settings", SETTINGS_ID);
  return mergeSettings(row?.value);
}

export async function saveSettings(s: Settings): Promise<void> {
  await getStore().upsert("settings", [{ id: SETTINGS_ID, value: s }]);
}

export async function listArticles(opts: { sinceDays?: number; includeDemo?: boolean } = {}): Promise<Article[]> {
  const since = opts.sinceDays ? new Date(Date.now() - opts.sinceDays * 86400_000).toISOString() : undefined;
  const rows = await getStore().list<Article>("articles", { since });
  return opts.includeDemo === false ? rows.filter((a) => !a.isDemo) : rows;
}

export async function listOpportunities(opts: { includeDemo?: boolean } = {}): Promise<Opportunity[]> {
  const rows = await getStore().list<Opportunity>("opportunities");
  return opts.includeDemo === false ? rows.filter((o) => !o.isDemo) : rows;
}

export const getArticle = (id: string) => getStore().get<Article>("articles", id);
export const getArticles = (ids: string[]) => getStore().getMany<Article>("articles", ids);
export const getOpportunity = (id: string) => getStore().get<Opportunity>("opportunities", id);
export const saveArticles = (rows: Article[]) => getStore().upsert("articles", rows);
export const saveOpportunities = (rows: Opportunity[]) => getStore().upsert("opportunities", rows);

export const getJob = (id: string) => getStore().get<Job>("jobs", id);
export const saveJob = (job: Job) => getStore().upsert("jobs", [job]);
export async function listJobs(limit = 50): Promise<Job[]> {
  return getStore().list<Job>("jobs", { limit });
}

/** Visible data respects the "show demo data" setting. */
export async function visibleData(sinceDays?: number) {
  const settings = await getSettings();
  const includeDemo = settings.showDemoData;
  const [articles, opportunities] = await Promise.all([
    listArticles({ sinceDays, includeDemo }),
    listOpportunities({ includeDemo }),
  ]);
  return { settings, articles, opportunities };
}
