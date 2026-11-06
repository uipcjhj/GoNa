import "server-only";
import { getStore, supabaseConfigured } from "@/lib/db/store";
import { aiConfigured, aiModel } from "@/lib/pipeline/analyze";
import { gnewsEnabled } from "@/lib/news/gnews";
import { authEnabled } from "@/lib/auth";

export interface SystemStatus {
  storage: "supabase" | "local" | "local-ephemeral";
  supabase: boolean;
  ai: boolean;
  aiModel: string;
  gdelt: boolean;
  gnews: boolean;
  cron: boolean;
  auth: boolean;
}

export function systemStatus(): SystemStatus {
  return {
    storage: getStore().kind,
    supabase: supabaseConfigured(),
    ai: aiConfigured(),
    aiModel: aiModel(),
    gdelt: true,
    gnews: gnewsEnabled(),
    cron: Boolean(process.env.CRON_SECRET),
    auth: authEnabled(),
  };
}
