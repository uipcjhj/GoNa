// Optional slide rendering for the PPT preview: LibreOffice (soffice) → PDF → PNG (pdftoppm).
// Not installed in plain Codespaces by default; the HTML preview works without it.
import "server-only";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

async function has(cmd: string): Promise<boolean> {
  try {
    await run("which", [cmd], { timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}
let cached: boolean | null = null;
export async function renderAvailable(): Promise<boolean> {
  if (cached === null) cached = (await has("soffice")) && (await has("pdftoppm"));
  return cached;
}

/** Render a .pptx to PNG data URLs (one per slide). */
export async function renderPptx(buf: Buffer, dpi = 60): Promise<string[]> {
  if (!(await renderAvailable())) throw new Error("슬라이드 이미지 렌더링에는 LibreOffice가 필요합니다 (sudo apt-get install -y libreoffice-impress poppler-utils).");
  const dir = await fs.mkdtemp(path.join(/*turbopackIgnore: true*/ os.tmpdir(), "gor-render-"));
  try {
    const file = path.join(/*turbopackIgnore: true*/ dir, "deck.pptx");
    await fs.writeFile(file, buf);
    await run("soffice", ["--headless", `-env:UserInstallation=file://${dir}/profile`, "--convert-to", "pdf", "--outdir", dir, file], { timeout: 120_000 });
    await run("pdftoppm", ["-r", String(dpi), "-png", path.join(/*turbopackIgnore: true*/ dir, "deck.pdf"), path.join(/*turbopackIgnore: true*/ dir, "s")], { timeout: 60_000 });
    const pngs = (await fs.readdir(dir)).filter((f) => /^s-\d+\.png$/.test(f)).sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));
    return Promise.all(pngs.map(async (f) => `data:image/png;base64,${(await fs.readFile(path.join(/*turbopackIgnore: true*/ dir, f))).toString("base64")}`));
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
