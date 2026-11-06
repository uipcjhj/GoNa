// Source verification: follows redirects manually, records HTTP status, extracts publication date,
// description and body text, detects paywalls, respects robots.txt.
import * as cheerio from "cheerio";
import { USER_AGENT } from "@/lib/util/http";
import { domainOf } from "@/lib/util/url";
import type { AccessType, SourceType, Verification } from "@/lib/types";

export interface FetchedPage {
  verification: Verification;
  title: string | null;
  siteName: string | null;
  description: string | null;
  text: string | null;
  publishedAt: string | null;
  publishedAtBasis: string | null;
}

const PAYWALL_DOMAINS = [
  "wsj.com", "ft.com", "bloomberg.com", "nikkei.com", "asia.nikkei.com", "economist.com", "thetimes.co.uk",
  "businessinsider.com", "theinformation.com", "handelsblatt.com", "lesechos.fr", "nytimes.com", "washingtonpost.com",
  "barrons.com", "afr.com", "theaustralian.com.au", "spglobal.com", "fastmarkets.com", "argusmedia.com",
];

const robotsCache = new Map<string, { at: number; disallow: string[] }>();

async function robotsAllows(url: string): Promise<boolean> {
  try {
    const u = new URL(url);
    const key = u.origin;
    let entry = robotsCache.get(key);
    if (!entry || Date.now() - entry.at > 6 * 3600_000) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 6000);
      let disallow: string[] = [];
      try {
        const res = await fetch(`${key}/robots.txt`, { headers: { "User-Agent": USER_AGENT }, signal: ctrl.signal });
        if (res.ok) {
          const body = await res.text();
          let applies = false;
          for (const raw of body.split(/\r?\n/)) {
            const line = raw.replace(/#.*/, "").trim();
            const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
            if (!m) continue;
            const k = m[1].toLowerCase();
            const v = m[2].trim();
            if (k === "user-agent") applies = v === "*" || /globalopportunityradar/i.test(v);
            else if (k === "disallow" && applies && v) disallow.push(v);
          }
        }
      } catch {
        disallow = [];
      } finally {
        clearTimeout(t);
      }
      entry = { at: Date.now(), disallow };
      robotsCache.set(key, entry);
    }
    return !entry.disallow.some((p) => p === "/" || u.pathname.startsWith(p.replace(/\*.*$/, "")));
  } catch {
    return true;
  }
}

function isoOrNull(s: string | undefined | null): string | null {
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  if (d.getFullYear() < 1995 || d.getTime() > Date.now() + 2 * 86400_000) return null;
  return d.toISOString();
}

function extract(html: string) {
  const $ = cheerio.load(html);
  const meta = (sel: string) => $(sel).attr("content")?.trim() || null;
  let publishedAt: string | null = null;
  let basis: string | null = null;
  const cands: [string | null | undefined, string][] = [
    [meta('meta[property="article:published_time"]'), "meta article:published_time"],
    [meta('meta[name="article:published_time"]'), "meta article:published_time"],
    [meta('meta[itemprop="datePublished"]'), "meta itemprop datePublished"],
    [meta('meta[name="pubdate"]'), "meta pubdate"],
    [meta('meta[name="publish-date"]'), "meta publish-date"],
    [meta('meta[name="date"]'), "meta date"],
    [meta('meta[name="DC.date.issued"]'), "meta DC.date.issued"],
  ];
  let jsonLdFree: boolean | null = null;
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).text());
      const arr = Array.isArray(data) ? data : data["@graph"] ?? [data];
      for (const d of arr) {
        if (d?.datePublished) cands.push([d.datePublished, "JSON-LD datePublished"]);
        if (d?.isAccessibleForFree !== undefined) jsonLdFree = String(d.isAccessibleForFree).toLowerCase() === "true";
      }
    } catch {
      /* ignore */
    }
  });
  cands.push([$("time[datetime]").first().attr("datetime"), "<time datetime>"]);
  for (const [v, b] of cands) {
    const iso = isoOrNull(v ?? null);
    if (iso) {
      publishedAt = iso;
      basis = b;
      break;
    }
  }
  $("script,style,noscript,nav,header,footer,aside,form,iframe,svg").remove();
  const paras: string[] = [];
  const root = $("article").length ? $("article") : $("main").length ? $("main") : $("body");
  root.find("p, h2, li").each((_, el) => {
    const t = $(el).text().replace(/\s+/g, " ").trim();
    if (t.length > 40) paras.push(t);
  });
  const text = [...new Set(paras)].join("\n").slice(0, 9000) || null;
  const lower = html.toLowerCase();
  const paywallMarker =
    jsonLdFree === false ||
    /subscribe to (continue|read)|subscriber[- ]only|this article is for subscribers|already a subscriber|premium content|paywall/.test(lower);
  return {
    title: meta('meta[property="og:title"]') || $("title").first().text().trim() || null,
    siteName: meta('meta[property="og:site_name"]'),
    description: meta('meta[name="description"]') || meta('meta[property="og:description"]'),
    text,
    publishedAt,
    basis,
    paywall: paywallMarker,
    free: jsonLdFree === true,
  };
}

export async function verifyAndFetch(url: string): Promise<FetchedPage> {
  const checkedAt = new Date().toISOString();
  const base: FetchedPage = {
    verification: { status: "unchecked", httpStatus: null, finalUrl: null, redirects: 0, checkedAt, access: "unknown", note: null },
    title: null, siteName: null, description: null, text: null, publishedAt: null, publishedAtBasis: null,
  };
  let current = url;
  let redirects = 0;
  const robotsOk = await robotsAllows(url);
  try {
    for (;;) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 15000);
      let res: Response;
      try {
        res = await fetch(current, {
          method: robotsOk ? "GET" : "HEAD",
          redirect: "manual",
          signal: ctrl.signal,
          headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml" },
        });
      } finally {
        clearTimeout(timer);
      }
      if (res.status >= 300 && res.status < 400 && res.headers.get("location") && redirects < 6) {
        current = new URL(res.headers.get("location")!, current).toString();
        redirects++;
        continue;
      }
      const v = base.verification;
      v.httpStatus = res.status;
      v.finalUrl = current;
      v.redirects = redirects;
      if (res.ok) {
        v.status = "verified";
        v.note = redirects ? `리다이렉트 ${redirects}회 후 정상 응답` : "정상 응답 (HTTP 200)";
        if (!robotsOk) {
          v.note = "링크 정상 · robots.txt 정책으로 본문 수집 생략";
        } else if ((res.headers.get("content-type") || "").includes("html")) {
          const html = (await res.text()).slice(0, 1_500_000);
          const ex = extract(html);
          Object.assign(base, { title: ex.title, siteName: ex.siteName, description: ex.description, text: ex.text, publishedAt: ex.publishedAt, publishedAtBasis: ex.basis });
          const dom = domainOf(current);
          const paywallDomain = PAYWALL_DOMAINS.some((d) => dom === d || dom.endsWith("." + d));
          v.access = (ex.paywall || paywallDomain ? "paywall" : ex.text && ex.text.length > 800 ? "free" : "unknown") as AccessType;
          if (ex.free) v.access = "free";
        }
      } else if (res.status === 404 || res.status === 410) {
        v.status = "broken";
        v.note = `원문을 찾을 수 없음 (HTTP ${res.status})`;
      } else {
        // 401/403/429/451/5xx: bot protection or temporary — do not declare it unreachable
        v.status = "needs_check";
        v.note = `자동 접근 제한 또는 일시 오류 (HTTP ${res.status}) — 브라우저에서 확인 필요`;
        const dom = domainOf(current);
        if (PAYWALL_DOMAINS.some((d) => dom === d || dom.endsWith("." + d))) v.access = "paywall";
      }
      return base;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const dns = /ENOTFOUND|EAI_AGAIN|getaddrinfo/.test(msg + String((e as { cause?: unknown })?.cause ?? ""));
    base.verification = {
      ...base.verification,
      status: dns ? "broken" : "needs_check",
      finalUrl: current,
      redirects,
      note: dns ? "도메인을 찾을 수 없음 (DNS)" : `접속 시간 초과 또는 네트워크 오류 — 확인 필요 (${msg.slice(0, 80)})`,
    };
    return base;
  }
}

const PR_WIRES = ["prnewswire.com", "businesswire.com", "globenewswire.com", "accesswire.com", "newswire.ca", "einpresswire.com", "presseportal.de", "news.cision.com", "mynewsdesk.com", "prweb.com", "newsfilecorp.com"];
const INDUSTRY_PUBS = [
  "supplychaindive.com", "manufacturingdive.com", "logisticsmgmt.com", "mmh.com", "dcvelocity.com", "supplychainbrain.com", "logisticsmiddleeast.com",
  "theloadstar.com", "aircargonews.net", "aircargoweek.com", "stattimes.com", "electrive.com", "batteriesnews.com", "just-auto.com", "automotivelogistics.media",
  "foodengineeringmag.com", "foodprocessing.com", "refrigeratedfrozenfoods.com", "coldchainnews.com", "assemblymag.com", "therobotreport.com", "roboticsandautomationnews.com",
  "logisticsit.com", "warehouseautomation.news", "chemanager-online.com", "chemicalprocessing.com", "tirebusiness.com", "tyrepress.com", "industryweek.com", "plantengineering.com",
  "dsnews.com", "logistik-heute.de", "trans.info", "logistyka.net.pl", "warehouse-logistics.com", "materialhandling247.com",
];
const TENDER = ["ted.europa.eu", "sam.gov", "tenders.gov.au", "etimad.sa", "tendersontime.com", "globaltenders.com", "dgmarket.com", "bidnetdirect.com", "devex.com/funding", "ungm.org"];

export function classifySource(url: string, companyHint?: string): SourceType {
  const d = domainOf(url);
  const is = (list: string[]) => list.some((x) => d === x || d.endsWith("." + x) || url.includes(x));
  if (is(TENDER) || /tender|procurement|eprocure|bids?\./.test(d)) return "Tender / Procurement Notice";
  if (/\.gov(\.[a-z]{2})?$|\.gob\.|\.go\.(id|th|kr|jp)$|\.gouv\.|\.gv\.|\.gov\.[a-z]{2}$|europa\.eu$|\.mil$/.test(d) || /\.(gov|govt)\./.test(d)) return "Government Announcement";
  if (is(PR_WIRES)) return "Official Company Press Release";
  if (/\/(press|newsroom|media-centre|media-center|press-release|pressroom|investors?)\//i.test(url)) return "Official Company Press Release";
  if (companyHint) {
    const c = companyHint.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (c.length >= 4 && d.replace(/[^a-z0-9]/g, "").includes(c)) return "Official Company Press Release";
  }
  if (is(INDUSTRY_PUBS)) return "Industry Publication";
  return "Media Report";
}
