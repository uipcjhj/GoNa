// 기업 공식 CI 찾기 (무료·공개 출처만): Wikidata(기업명 정확 일치 확인) → 공식 홈페이지(P856) / Wikimedia Commons 로고(P154).
// 이름이 비슷한 다른 기업과 연결하지 않도록 레이블·별칭이 기업명과 정확히 일치할 때만 채택한다.
import "server-only";
import * as cheerio from "cheerio";
import { getStore } from "@/lib/db/store";
import { domainOf } from "@/lib/util/url";
import { safeGetBuffer } from "./safe-fetch";

export const normCompany = (s: string) =>
  s.toLowerCase().replace(/\(.*?\)/g, " ").replace(/주식회사|\(주\)|㈜|\b(inc|corp|corporation|co|ltd|limited|llc|gmbh|ag|plc|sa|group|holdings?|company)\b\.?/g, " ").replace(/[^0-9a-z가-힣]/g, "");

export interface LogoHit { imageUrl: string; pageUrl: string; sourceSite: string; kind: "official_site" | "commons"; note: string }
export interface LogoResult { company: string; entity: string | null; officialSite: string | null; logos: LogoHit[]; note: string; checkedAt: string }

interface WdEntity { id: string; labels?: Record<string, { value: string }>; aliases?: Record<string, { value: string }[]>; descriptions?: Record<string, { value: string }>; claims?: Record<string, { mainsnak?: { datavalue?: { value?: unknown } } }[]> }

/** 순수: 검색 결과 중 기업명과 레이블·별칭이 정확히 일치하고 공식 사이트·로고 정보가 있는 항목만 고른다. */
export function pickEntity(company: string, entities: WdEntity[]): WdEntity | null {
  const want = normCompany(company);
  if (!want) return null;
  const hit = entities.filter((e) => {
    const names = [...Object.values(e.labels ?? {}).map((l) => l.value), ...Object.values(e.aliases ?? {}).flat().map((a) => a.value)];
    return names.some((n) => normCompany(n) === want) && (e.claims?.P856?.length || e.claims?.P154?.length);
  });
  return hit[0] ?? null;
}

const claimStr = (e: WdEntity, p: string): string | null => { const v = e.claims?.[p]?.[0]?.mainsnak?.datavalue?.value; return typeof v === "string" ? v : null; };

async function wd(params: Record<string, string>): Promise<{ json: unknown } | null> {
  const r = await safeGetBuffer(`https://www.wikidata.org/w/api.php?${new URLSearchParams({ format: "json", origin: "*", ...params })}`, { accept: "application/json", maxBytes: 2_000_000, timeoutMs: 10_000 });
  if (!r) return null;
  try { return { json: JSON.parse(r.buf.toString("utf8")) }; } catch { return null; }
}

/** 공식 홈페이지에서 로고 이미지 후보 (헤더의 logo 이미지 → 없으면 없음. 파비콘은 로고로 쓰지 않는다). */
export function homepageLogo(html: string, pageUrl: string): string | null {
  const $ = cheerio.load(html);
  const abs = (u?: string) => { if (!u) return null; try { return new URL(u.trim(), pageUrl).toString(); } catch { return null; } };
  const sel = ['header img[src*="logo" i]', 'a[class*="logo" i] img', '[class*="logo" i] img', 'img[alt*="logo" i]', 'img[src*="logo" i]'];
  for (const s of sel) {
    for (const el of $(s).toArray()) {
      const src = abs($(el).attr("src") || $(el).attr("data-src"));
      if (src && !/\.(ico)(\?|$)/i.test(src) && !/(sprite|icon-|favicon|footer)/i.test(src)) return src;
    }
  }
  return null;
}

export async function findCompanyLogo(company: string, opts: { force?: boolean } = {}): Promise<LogoResult> {
  const key = `imglogo:${normCompany(company)}`;
  const store = getStore();
  if (!opts.force && key !== "imglogo:") {
    const cached = await store.get<LogoResult & { id: string }>("settings", key);
    if (cached) return cached; // 동일 기업의 CI는 재사용
  }
  const out: LogoResult = { company, entity: null, officialSite: null, logos: [], note: "", checkedAt: new Date().toISOString() };
  try {
    const search = await wd({ action: "wbsearchentities", search: company, language: /[가-힣]/.test(company) ? "ko" : "en", uselang: "en", type: "item", limit: "8" });
    const ids = ((search?.json as { search?: { id: string }[] })?.search ?? []).map((x) => x.id);
    if (!ids.length) { out.note = "공개 기업 정보에서 같은 이름의 기업을 찾지 못함 — 확인 필요"; }
    else {
      const ent = await wd({ action: "wbgetentities", ids: ids.join("|"), props: "labels|aliases|claims|descriptions", languages: "en|ko" });
      const entities = Object.values(((ent?.json as { entities?: Record<string, WdEntity> })?.entities) ?? {});
      const e = pickEntity(company, entities);
      if (!e) out.note = "이름이 정확히 일치하는 기업을 확인하지 못함 (유사 이름 기업과의 오연결 방지) — 확인 필요";
      else {
        out.entity = e.id;
        const site = claimStr(e, "P856");
        out.officialSite = site;
        if (site) {
          const home = await safeGetBuffer(site, { accept: "text/html", maxBytes: 3_000_000, timeoutMs: 12_000 });
          const logo = home && /html/i.test(home.type) ? homepageLogo(home.buf.toString("utf8"), home.finalUrl) : null;
          if (logo) out.logos.push({ imageUrl: logo, pageUrl: home!.finalUrl, sourceSite: domainOf(home!.finalUrl), kind: "official_site", note: "공식 홈페이지 게시 로고" });
        }
        const file = claimStr(e, "P154");
        if (file) out.logos.push({ imageUrl: `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file.replace(/ /g, "_"))}`, pageUrl: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file.replace(/ /g, "_"))}`, sourceSite: "commons.wikimedia.org", kind: "commons", note: "Wikimedia Commons 로고 (위키데이터 공식 로고 항목)" });
        if (!out.logos.length) out.note = "공식 사이트·로고 이미지를 찾지 못함 — 확인 필요";
      }
    }
  } catch {
    out.note = "CI 조회 중 오류 — 나중에 다시 시도";
    return out; // 오류 결과는 저장하지 않는다 (재시도 가능)
  }
  if (key !== "imglogo:") await store.upsert("settings", [{ id: key, ...out }]);
  return out;
}
