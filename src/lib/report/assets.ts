// Binary assets for the PPT (article images). Local store → files in <db dir>/assets; Supabase → settings row (base64).
import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { getStore } from "@/lib/db/store";

interface AssetRow { id: string; mime: string; data: string; size: number; updatedAt: string }

const localDir = () => path.join(process.env.LOCAL_DB_DIR || (process.env.VERCEL ? "/tmp/gor-data" : path.join(process.cwd(), ".data")), "assets");
const safeId = (id: string) => (/^[a-f0-9]{16,64}$/.test(id) ? id : null);

export async function saveAsset(buf: Buffer, mime: string): Promise<string> {
  const id = createHash("sha256").update(buf).digest("hex").slice(0, 32);
  const store = getStore();
  if (store.kind === "supabase") {
    await store.upsert<AssetRow>("settings", [{ id: `asset:${id}`, mime, data: buf.toString("base64"), size: buf.length, updatedAt: new Date().toISOString() }]);
  } else {
    await fs.mkdir(localDir(), { recursive: true });
    await fs.writeFile(path.join(localDir(), id), buf);
    await fs.writeFile(path.join(localDir(), `${id}.mime`), mime);
  }
  return id;
}

export async function getAsset(idRaw: string): Promise<{ buf: Buffer; mime: string } | null> {
  const id = safeId(idRaw);
  if (!id) return null;
  const store = getStore();
  if (store.kind === "supabase") {
    const row = await store.get<AssetRow>("settings", `asset:${id}`);
    return row ? { buf: Buffer.from(row.data, "base64"), mime: row.mime } : null;
  }
  try {
    const [buf, mime] = await Promise.all([fs.readFile(path.join(localDir(), id)), fs.readFile(path.join(localDir(), `${id}.mime`), "utf8").catch(() => "image/jpeg")]);
    return { buf, mime };
  } catch {
    return null;
  }
}
