// 원문 복원 + 본문 추출 (기사 수집·Gemini 분석·수동 복원이 함께 사용).
// - Google News 경유 링크 → 실제 언론사 URL로 복원해 기사 URL·도메인·발행일을 갱신 (보고서 표기용)
// - 본문 실패 이유를 구분: 접속 실패/차단 · robots.txt · HTTP 오류 · 본문 추출 실패 · Google 차단
// - 보조 근거(공식 보도자료·다른 매체)는 sourceTrace.support에만 저장 — 보고서의 언론사·발행일·URL은 바뀌지 않음
import "server-only";
import type { Article, BodyStatus, SourceTrace, SupportSource } from "@/lib/types";
import { verifyAndFetch, classifySource, type FetchedPage } from "@/lib/pipeline/verify";
import { isGoogleNews, resolveGoogleNewsUrl, searchSameStory } from "@/lib/news/resolve";
import { domainOf } from "@/lib/util/url";

export function bodyStatusOf(page: FetchedPage): { status: BodyStatus; note: string } {
  const v = page.verification;
  if (page.text && page.text.length > 200) return { status: "ok", note: `본문 ${page.text.length.toLocaleString()}자 확보` };
  if (/robots/.test(v.note ?? "")) return { status: "robots_blocked", note: "robots.txt 정책으로 본문 수집 생략 (링크는 정상)" };
  if (v.httpStatus == null) return { status: "network_error", note: `접속 실패·네트워크 차단 (${v.note ?? "응답 없음"})` };
  if (v.httpStatus >= 400) return { status: "http_error", note: `HTTP ${v.httpStatus}${v.access === "paywall" ? " · 유료 기사" : ""}` };
  return { status: "no_text", note: "페이지는 열렸으나 기사 본문을 추출하지 못함 (스크립트 렌더링·특수 구조)" };
}

async function fetchTwice(url: string): Promise<FetchedPage> {
  let last: FetchedPage | null = null;
  for (const t of [15000, 30000]) {
    try {
      last = await verifyAndFetch(url, t);
      if (last.text && last.text.length > 200) return last;
      if (last.verification.httpStatus) return last; // page answered — retrying will not help
    } catch { /* retry once */ }
  }
  return last ?? (await verifyAndFetch(url, 5000));
}

export interface ReadResult { trace: SourceTrace; page: FetchedPage | null; body: string; supportText: string }

/** Resolve + read the article. Mutates the article's URL / domain / date / verification when a real URL is recovered. */
export async function readArticleSource(a: Article, opts: { searchAlternatives?: boolean } = {}): Promise<ReadResult> {
  const prev = a.sourceTrace;
  const trace: SourceTrace = {
    originalUrl: prev?.originalUrl ?? a.url, resolvedUrl: null, method: "direct", bodyStatus: "no_text", httpStatus: null, chars: 0, note: "", checkedAt: new Date().toISOString(),
    support: prev?.support ?? [],
  };
  if (a.manualBody && a.manualBody.trim().length > 100) {
    Object.assign(trace, { method: "manual", bodyStatus: "manual", chars: a.manualBody.length, note: "사용자가 입력한 본문 사용", resolvedUrl: isGoogleNews(a.url) ? null : a.url });
    return { trace, page: null, body: a.manualBody.trim(), supportText: await supportText(trace) };
  }
  let url = a.url;
  if (isGoogleNews(url)) {
    const r = await resolveGoogleNewsUrl(url);
    if (r.url === null) {
      Object.assign(trace, { bodyStatus: r.reason === "google_blocked" ? "google_blocked" : r.reason === "network_error" ? "network_error" : "google_unresolved", note: r.note });
    } else {
      url = r.url;
      trace.method = r.method === "offline" ? "google_offline" : "google_decoder";
      // the recovered publisher URL becomes the article's report URL (original kept in sourceTrace)
      a.url = r.url;
      a.viaGoogleNews = false;
      a.sourceDomain = domainOf(r.url);
      a.sourceType = classifySource(r.url);
    }
  }
  let page: FetchedPage | null = null;
  let body = "";
  if (!isGoogleNews(url)) {
    page = await fetchTwice(url);
    const st = bodyStatusOf(page);
    Object.assign(trace, { resolvedUrl: page.verification.finalUrl || url, bodyStatus: st.status, httpStatus: page.verification.httpStatus, note: st.note, chars: page.text?.length ?? 0 });
    a.verification = page.verification;
    if (page.publishedAt) { a.publishedAt = page.publishedAt; a.publishedAtBasis = `원문 메타데이터 (${page.publishedAtBasis})`; }
    if (st.status === "ok") body = page.text!;
  }
  // article page unreadable → same story elsewhere (official press release / other outlet) as SUPPORT only
  if (!body && opts.searchAlternatives && !trace.support.some((s) => s.status === "ok")) {
    for (const alt of await searchSameStory(a.title, { exclude: [a.sourceDomain], max: 2 })) {
      const p = await fetchTwice(alt.url).catch(() => null);
      const st = p ? bodyStatusOf(p) : { status: "network_error" as BodyStatus, note: "" };
      trace.support.push({ url: alt.url, title: alt.title, kind: officialKind(alt.url, a), status: st.status, chars: p?.text?.length ?? 0, addedBy: "search", checkedAt: new Date().toISOString() });
      if (st.status === "ok") break;
    }
  }
  a.sourceTrace = trace;
  return { trace, page, body, supportText: await supportText(trace) };
}

/** Company newsroom / press page = official; everything else = other media. */
export function officialKind(url: string, a: Pick<Article, "competitors" | "title">): SupportSource["kind"] {
  const d = domainOf(url);
  const names = [...(a.competitors ?? []), ...(a.title.match(/^[A-Za-z][\w&.-]+/) ?? [])].map((n) => n.toLowerCase().replace(/[^a-z0-9]/g, ""));
  return /\/(newsroom|press|news-?room|pressroom|media)\b/i.test(url) || names.some((n) => n.length >= 3 && d.replace(/[^a-z0-9]/g, "").includes(n)) ? "official_press" : "other_media";
}

/** Text of readable support sources (labelled), for Gemini verification only. */
async function supportText(trace: SourceTrace): Promise<string> {
  const parts: string[] = [];
  for (const s of trace.support.slice(0, 3)) {
    if (s.status !== "ok" && s.addedBy !== "user") continue;
    const p = await fetchTwice(s.url).catch(() => null);
    const st = p ? bodyStatusOf(p) : { status: "network_error" as BodyStatus, note: "" };
    s.status = st.status;
    s.chars = p?.text?.length ?? 0;
    s.checkedAt = new Date().toISOString();
    if (st.status === "ok") parts.push(`SUPPORT (${s.kind === "official_press" ? "공식 보도자료" : "다른 매체"}: ${s.url}):\n${p!.text!.slice(0, 5000)}`);
  }
  return parts.join("\n\n");
}

export function addSupportUrl(a: Article, url: string, title = ""): SupportSource {
  const s: SupportSource = { url, title, kind: officialKind(url, a), status: "no_text", chars: 0, addedBy: "user", checkedAt: new Date().toISOString() };
  const trace = a.sourceTrace ?? { originalUrl: a.url, resolvedUrl: isGoogleNews(a.url) ? null : a.url, method: "direct", bodyStatus: "no_text", httpStatus: null, chars: 0, note: "", checkedAt: s.checkedAt, support: [] };
  trace.support = [...trace.support.filter((x) => x.url !== url), s];
  a.sourceTrace = trace;
  return s;
}

export const BODY_STATUS_LABEL: Record<BodyStatus, string> = {
  ok: "본문 확보", network_error: "접속 실패·네트워크 차단", robots_blocked: "robots.txt로 수집 제한", http_error: "HTTP 오류", no_text: "본문 추출 실패",
  google_blocked: "Google News 복원 차단(captcha)", google_unresolved: "Google News 링크 복원 실패", manual: "사용자 입력 본문",
};
