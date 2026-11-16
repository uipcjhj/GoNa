// 자료실 이미지 프록시: 브라우저가 외부 이미지를 클립보드에 복사·다운로드할 수 있도록 같은 출처로 전달한다 (CORS 우회가 아니라 서버가 대신 받아옴).
// 보안: 저장된 자료실 이미지(기사ID+이미지ID)만 전달 → 임의 URL 프록시 불가. DNS 사설 IP 차단, 리다이렉트 재검사, 10MB 제한, 파일 내용으로 형식 확인.
import { getEntry } from "@/lib/report/library";
import { safeGetBuffer, sniffImage } from "@/lib/report/safe-fetch";
import { requireAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const deny = await requireAdmin();
  if (deny) return deny;
  const q = new URL(req.url).searchParams;
  const entry = await getEntry(q.get("a") ?? "");
  const img = entry.images.find((i) => i.id === q.get("i"));
  if (!img) return new Response("not found", { status: 404 });
  const f = await safeGetBuffer(img.imageUrl, { accept: "image/*", maxBytes: 10_000_000, timeoutMs: 20_000 });
  const mime = f ? sniffImage(f.buf) : null;
  if (!f || !mime) return new Response("이미지를 가져오지 못했습니다 (접근 제한·형식 오류)", { status: 502 });
  const headers: Record<string, string> = {
    "Content-Type": mime,
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    "Cache-Control": "private, max-age=3600",
  };
  const name = (q.get("name") ?? "image").replace(/[\\/:*?"<>|\r\n]+/g, "_").slice(0, 120);
  if (q.get("dl")) headers["Content-Disposition"] = `attachment; filename="image"; filename*=UTF-8''${encodeURIComponent(name)}`;
  return new Response(new Uint8Array(f.buf), { headers });
}
