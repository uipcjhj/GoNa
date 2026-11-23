import { NextResponse, after } from "next/server";
import { driveJob, isActive, latestJob } from "@/lib/pipeline/job";
import { saveJob } from "@/lib/db/repo";
import { requireAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const deny = await requireAdmin();
  if (deny) return deny;
  const job = await latestJob();
  // Render 무료 서버가 잠들었다 깨어난 뒤: 멈춘(하트비트 끊긴) 작업은 자동으로 이어서 실행 (조각 임대 잠금이 중복 실행을 막는다)
  if (process.env.RENDER && job && job.status === "running" && !isActive(job)) {
    job.heartbeatAt = new Date().toISOString(); // 재개 중으로 표시 → 폴링마다 중복 시작되지 않음
    job.lease = null;
    await saveJob(job);
    after(() => driveJob(job.id, new URL(req.url).origin));
  }
  return NextResponse.json({ job, active: job ? isActive(job) : false });
}
