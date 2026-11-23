// 로컬 DB(.data) → Supabase 데이터 이전 (기본은 점검만, 아무것도 쓰지 않음)
//
//   점검(읽기 전용):  npm run db:migrate
//   실제 이전:        npm run db:migrate -- --apply --confirm <Supabase 프로젝트 호스트> --expect-articles <점검에서 본 기사 수>
//   충돌 행 덮어쓰기: ... --overwrite   (기본은 Supabase에 이미 있는 행을 건드리지 않음)
//   원본 폴더 지정:   --source /경로/.data
//
// 필요한 환경변수(.env.local 이 아니라 현재 터미널에만): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY — 키는 출력하지 않습니다.
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { apply, loadLocalSnapshot, plan, rowHash, summarize, verify, type Summary, type Target } from "../src/lib/db/migrate";
import { sortAt, type Row, type TableName } from "../src/lib/db/store";

const args = process.argv.slice(2);
const flag = (k: string) => args.includes(k);
const opt = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const dir = path.resolve(opt("--source") ?? ".data");
const url = process.env.SUPABASE_URL ?? "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const host = (() => { try { return new URL(url).host; } catch { return ""; } })();

const row = (label: string, s: Summary) => console.log(`  ${label.padEnd(10)} 기사 ${s.articles} · 요약(4줄) ${s.withSummary} (완료 ${s.summaryDone}/실패 ${s.summaryFailed}) · 주간보고 ${s.weeklyReports} · 선정 ${s.selected} · 사용자수정 ${s.userEdited} · 승인 ${s.approved} · 수주기회 ${s.opportunities} · 작업 ${s.jobs} · 설정행 ${s.settingsRows} · 이미지자산 ${s.assets} · 자료실 ${s.imageLibraryRows}`);

if (!fs.existsSync(path.join(dir, "db.json"))) { console.error(`원본을 찾을 수 없습니다: ${path.join(dir, "db.json")}`); process.exit(1); }
const src = loadLocalSnapshot(dir);
console.log(`\n원본: ${dir}`);
row("원본(로컬)", summarize(src));

if (!url || !key) { console.log("\nSUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 없어 원본 점검만 했습니다. (Supabase는 건드리지 않음)"); process.exit(0); }
console.log(`대상: ${host} (키는 표시하지 않음)`);

const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const target: Target = {
  async hashes(table: TableName) {
    const m = new Map<string, string>();
    for (let from = 0; ; from += 300) {
      const { data, error } = await sb.from(table).select("id,data").order("id").range(from, from + 299);
      if (error) throw new Error(`Supabase 읽기 실패(${table}): ${error.message} — schema.sql 을 실행했는지 확인하세요`);
      for (const r of data ?? []) m.set(r.id as string, rowHash(r.data));
      if (!data || data.length < 300) break;
    }
    return m;
  },
  async upsert(table, rows: Row[]) {
    const now = new Date().toISOString();
    const { error } = await sb.from(table).upsert(rows.map((r) => ({ id: r.id, data: r, sort_at: sortAt(table, r), updated_at: now })), { onConflict: "id" });
    if (error) throw new Error(`Supabase 쓰기 실패(${table}): ${error.message}`);
  },
};

const plans = await plan(src, target);
console.log("\n[이전 계획] (표: 원본 / 추가 예정 / 이미 동일 / 내용 다름)");
for (const p of plans) console.log(`  ${p.table.padEnd(14)} ${String(p.source).padStart(6)} / +${p.insert.length} / =${p.identical} / ≠${p.conflicts.length}`);
const conflicts = plans.reduce((n, p) => n + p.conflicts.length, 0);
if (conflicts) console.log(`  ※ 내용이 다른 ${conflicts}건은 ${flag("--overwrite") ? "원본으로 덮어씁니다(--overwrite)" : "건드리지 않습니다 (Supabase 쪽 값 유지)"}.`);

if (!flag("--apply")) { console.log("\n점검만 했습니다. 실제 이전은 --apply --confirm <호스트> 를 붙여 실행하세요."); process.exit(0); }
const srcArticles = summarize(src).articles;
if (Number(opt("--expect-articles")) !== srcArticles) { console.error(`\n중단: 이 원본(${dir})의 기사 수는 ${srcArticles}건입니다. 점검 화면에서 확인한 실제 데이터의 기사 수를 --expect-articles <N> 으로 입력해야 합니다 (테스트·다른 DB 이전 방지).`); process.exit(2); }
if (opt("--confirm") !== host) { console.error(`\n중단: --confirm ${host} 를 함께 입력해야 실제 이전합니다 (잘못된 프로젝트 방지).`); process.exit(2); }

const backup = path.join(dir, `backup-before-migrate-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
fs.copyFileSync(path.join(dir, "db.json"), backup);
console.log(`\n원본 백업: ${backup}`);
await apply(src, target, plans, flag("--overwrite") ? "overwrite" : "missing", (s) => console.log(`  ${s}`));

const res = await verify(src, target);
console.log("\n[검증] (누락 / 내용 불일치 / 대상에만 있는 행)");
for (const r of res) console.log(`  ${r.table.padEnd(14)} 누락 ${r.missing} / 불일치 ${r.mismatched} / 대상 전용 ${r.targetOnly} ${r.ok ? "✔" : "✘"}`);
const bad = res.some((r) => !r.ok);
console.log(bad ? "\n✘ 누락이 있습니다 — 다시 실행하세요 (이미 옮긴 행은 중복되지 않습니다)." : "\n✔ 원본의 모든 행이 Supabase에 있습니다. 중복 없음(같은 id는 한 행).");
process.exit(bad ? 1 : 0);
