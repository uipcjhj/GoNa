// ISO 3166 numeric codes (used by world-atlas topojson) + region mapping.
import type { Region } from "@/lib/types";

export const COUNTRY_META: Record<string, { iso: string; region: Region }> = {
  "United States": { iso: "840", region: "North America" },
  Canada: { iso: "124", region: "North America" },
  Mexico: { iso: "484", region: "North America" },
  Poland: { iso: "616", region: "Europe" },
  Hungary: { iso: "348", region: "Europe" },
  "Czech Republic": { iso: "203", region: "Europe" },
  Slovakia: { iso: "703", region: "Europe" },
  Romania: { iso: "642", region: "Europe" },
  Germany: { iso: "276", region: "Europe" },
  France: { iso: "250", region: "Europe" },
  Spain: { iso: "724", region: "Europe" },
  Italy: { iso: "380", region: "Europe" },
  Netherlands: { iso: "528", region: "Europe" },
  Belgium: { iso: "056", region: "Europe" },
  Austria: { iso: "040", region: "Europe" },
  Serbia: { iso: "688", region: "Europe" },
  Portugal: { iso: "620", region: "Europe" },
  Sweden: { iso: "752", region: "Europe" },
  Finland: { iso: "246", region: "Europe" },
  Norway: { iso: "578", region: "Europe" },
  Denmark: { iso: "208", region: "Europe" },
  Ireland: { iso: "372", region: "Europe" },
  Switzerland: { iso: "756", region: "Europe" },
  Turkey: { iso: "792", region: "Europe" },
  "United Kingdom": { iso: "826", region: "Europe" },
  Vietnam: { iso: "704", region: "Southeast Asia" },
  Indonesia: { iso: "360", region: "Southeast Asia" },
  Thailand: { iso: "764", region: "Southeast Asia" },
  Malaysia: { iso: "458", region: "Southeast Asia" },
  Philippines: { iso: "608", region: "Southeast Asia" },
  Singapore: { iso: "702", region: "Southeast Asia" },
  Cambodia: { iso: "116", region: "Southeast Asia" },
  India: { iso: "356", region: "South Asia" },
  "United Arab Emirates": { iso: "784", region: "Middle East" },
  "Saudi Arabia": { iso: "682", region: "Middle East" },
  Qatar: { iso: "634", region: "Middle East" },
  Oman: { iso: "512", region: "Middle East" },
  Kuwait: { iso: "414", region: "Middle East" },
  Israel: { iso: "376", region: "Middle East" },
  Egypt: { iso: "818", region: "Africa" },
  Morocco: { iso: "504", region: "Africa" },
  "South Africa": { iso: "710", region: "Africa" },
  Australia: { iso: "036", region: "Oceania" },
  "New Zealand": { iso: "554", region: "Oceania" },
  China: { iso: "156", region: "East Asia" },
  Japan: { iso: "392", region: "East Asia" },
  "South Korea": { iso: "410", region: "East Asia" },
  Taiwan: { iso: "158", region: "East Asia" },
  Brazil: { iso: "076", region: "Latin America" },
  Chile: { iso: "152", region: "Latin America" },
  Argentina: { iso: "032", region: "Latin America" },
  Colombia: { iso: "170", region: "Latin America" },
};

// GDELT "sourcecountry" names and common variants -> canonical name
const ALIASES: Record<string, string> = {
  us: "United States", usa: "United States", "u.s.": "United States", "united states of america": "United States", america: "United States",
  uk: "United Kingdom", britain: "United Kingdom", england: "United Kingdom", "great britain": "United Kingdom",
  uae: "United Arab Emirates", emirates: "United Arab Emirates", dubai: "United Arab Emirates", "abu dhabi": "United Arab Emirates",
  "viet nam": "Vietnam", czechia: "Czech Republic", ksa: "Saudi Arabia", korea: "South Korea", "republic of korea": "South Korea",
};

export function canonicalCountry(name: string | null | undefined): string | null {
  if (!name) return null;
  const t = name.trim();
  if (!t) return null;
  if (COUNTRY_META[t]) return t;
  const low = t.toLowerCase();
  if (ALIASES[low]) return ALIASES[low];
  const hit = Object.keys(COUNTRY_META).find((k) => k.toLowerCase() === low);
  return hit ?? t;
}

export function regionOf(country: string | null | undefined): Region | "Unknown" {
  const cc = canonicalCountry(country);
  if (!cc) return "Unknown";
  return COUNTRY_META[cc]?.region ?? "Unknown";
}
