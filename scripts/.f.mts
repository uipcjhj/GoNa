import { verifyAndFetch } from "@/lib/pipeline/verify";
for (const u of process.argv.slice(2)) { const p = await verifyAndFetch(u); console.log(u.slice(0,70), p.verification.status, p.verification.httpStatus, p.verification.note, "text", p.text?.length ?? null, "date", p.publishedAt); }
