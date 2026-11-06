import "server-only";
import { getStore } from "@/lib/db/store";
import { getSettings, saveSettings, visibleData } from "@/lib/db/repo";
import { seedDemo } from "@/lib/demo";

const g = globalThis as unknown as { __gorInit?: Promise<void> };

/** First launch: store default settings and load clearly-labelled demo data so the UI can be explored. */
export function ensureInitialized(): Promise<void> {
  g.__gorInit ??= (async () => {
    const row = await getStore().get("settings", "global");
    if (!row) {
      await saveSettings(await getSettings());
      await seedDemo();
    }
  })().catch((e) => {
    g.__gorInit = undefined;
    throw e;
  });
  return g.__gorInit;
}

export async function loadData(sinceDays?: number) {
  await ensureInitialized();
  return visibleData(sinceDays);
}
