"use client";
// World map — dark radar style: mint detection signals per country, HOT pulses, slow radar sweep from Korea (HQ).
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { geoNaturalEarth1, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";
import world from "world-atlas/countries-110m.json";
import { COUNTRY_META } from "@/lib/config/countries";

type Props = { counts: Record<string, { total: number; hot: number }> };

const W = 960;
const H = 470;
const isoToName = Object.fromEntries(Object.entries(COUNTRY_META).map(([n, m]) => [m.iso, n]));
const MINT = "#2ef2c4";

export function WorldMap({ counts }: Props) {
  const router = useRouter();
  const [hover, setHover] = useState<{ name: string; x: number; y: number } | null>(null);
  const { paths, hq } = useMemo(() => {
    const topo = world as unknown as Topology<{ countries: GeometryCollection<{ name: string }> }>;
    const fc = feature(topo, topo.objects.countries);
    const proj = geoNaturalEarth1().fitSize([W, H], fc);
    const gp = geoPath(proj);
    const seoul = proj([126.98, 37.57]) ?? [W * 0.83, H * 0.33];
    return {
      hq: { x: seoul[0], y: seoul[1] },
      paths: fc.features
        .filter((f) => f.properties?.name !== "Antarctica")
        .map((f) => {
          const id = String(f.id).padStart(3, "0");
          const c = gp.centroid(f);
          return { id, name: isoToName[id] ?? f.properties?.name ?? "", d: gp(f) ?? "", cx: c[0], cy: c[1] };
        }),
    };
  }, []);
  const max = Math.max(1, ...Object.values(counts).map((c) => c.total));
  const signals = paths.filter((p) => counts[p.name] && Number.isFinite(p.cx));
  const R = Math.hypot(W, H) * 0.75;
  const go = (name: string) => router.push(`/opportunities?country=${encodeURIComponent(name)}`);

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full select-none" role="img" aria-label="국가별 수주기회 지도">
        <defs>
          <radialGradient id="sig" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={MINT} stopOpacity="0.9" />
            <stop offset="60%" stopColor={MINT} stopOpacity="0.25" />
            <stop offset="100%" stopColor={MINT} stopOpacity="0" />
          </radialGradient>
          <linearGradient id="sweep" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={MINT} stopOpacity="0" />
            <stop offset="100%" stopColor={MINT} stopOpacity="0.16" />
          </linearGradient>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#12304d" strokeWidth="0.6" />
          </pattern>
        </defs>

        <rect width={W} height={H} fill="url(#grid)" opacity="0.6" />

        {/* radar rings + sweep centred on Korea (HQ) */}
        <g pointerEvents="none">
          {[90, 180, 300, 440, 600].map((r) => (
            <circle key={r} cx={hq.x} cy={hq.y} r={r} fill="none" stroke={MINT} strokeOpacity="0.08" strokeDasharray="2 6" />
          ))}
          <g className="radar-sweep" style={{ transformOrigin: `${hq.x}px ${hq.y}px` }}>
            <path d={`M ${hq.x} ${hq.y} L ${hq.x + R} ${hq.y} A ${R} ${R} 0 0 0 ${hq.x + R * Math.cos(-Math.PI / 7)} ${hq.y + R * Math.sin(-Math.PI / 7)} Z`} fill="url(#sweep)" />
            <line x1={hq.x} y1={hq.y} x2={hq.x + R} y2={hq.y} stroke={MINT} strokeOpacity="0.35" strokeWidth="1" />
          </g>
        </g>

        {paths.map((p) => {
          const c = counts[p.name];
          const t = c ? 0.25 + 0.6 * (c.total / max) : 0;
          return (
            <path
              key={p.id + p.name}
              d={p.d}
              fill={c ? `rgba(46,242,196,${(0.12 + 0.38 * t).toFixed(2)})` : "#0f2036"}
              stroke={c ? "rgba(46,242,196,0.75)" : "#1d3656"}
              strokeWidth={c ? 0.9 : 0.45}
              className={c ? "cursor-pointer transition-opacity hover:opacity-80" : ""}
              onMouseMove={(e) => {
                const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                setHover({ name: p.name, x: e.clientX - r.left, y: e.clientY - r.top });
              }}
              onMouseLeave={() => setHover(null)}
              onClick={() => c && go(p.name)}
            />
          );
        })}

        {/* detection signals */}
        {signals.map((p) => {
          const c = counts[p.name];
          const size = 4 + 6 * Math.sqrt(c.total / max);
          return (
            <g key={`s-${p.id}`} className="cursor-pointer" onClick={() => go(p.name)}>
              <circle cx={p.cx} cy={p.cy} r={size * 2.4} fill="url(#sig)" opacity={c.hot ? 0.9 : 0.55} pointerEvents="none" />
              {c.hot > 0 && <circle cx={p.cx} cy={p.cy} r={size} fill="none" stroke={MINT} strokeWidth="1.4" className="radar-ping" pointerEvents="none" />}
              <circle cx={p.cx} cy={p.cy} r={c.hot ? 3.4 : 2.4} fill={c.hot ? "#ffffff" : MINT} stroke={MINT} strokeWidth="1" />
            </g>
          );
        })}

        {/* HQ marker */}
        <g pointerEvents="none">
          <circle cx={hq.x} cy={hq.y} r="3.2" fill={MINT} />
          <circle cx={hq.x} cy={hq.y} r="7" fill="none" stroke={MINT} strokeOpacity="0.6" className="radar-ping" />
        </g>
      </svg>

      {hover && (
        <div className="pointer-events-none absolute z-10 rounded-md border border-sky-200 bg-navy-900/95 px-2 py-1 text-xs text-slate-900 shadow-lg" style={{ left: hover.x + 12, top: hover.y + 12 }}>
          <div className="font-semibold">{hover.name}</div>
          {counts[hover.name] ? <div className="text-sky-700">기회 {counts[hover.name].total}건 · HOT {counts[hover.name].hot}건</div> : <div className="text-slate-500">탐지된 기회 없음</div>}
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-brand shadow-[0_0_8px_#2ef2c4]" />탐지 신호</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full border-2 border-brand bg-white" />HOT 포함</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-sm bg-sky-200" />기회가 많을수록 진하게</span>
        <span className="hidden sm:inline">· 국가를 누르면 해당 국가 프로젝트 목록으로 이동</span>
      </div>
    </div>
  );
}
