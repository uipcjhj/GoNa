"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { geoNaturalEarth1, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";
import world from "world-atlas/countries-110m.json";
import { COUNTRY_META } from "@/lib/config/countries";

type Props = { counts: Record<string, { total: number; hot: number }> };

const isoToName = Object.fromEntries(Object.entries(COUNTRY_META).map(([n, m]) => [m.iso, n]));

export function WorldMap({ counts }: Props) {
  const router = useRouter();
  const [hover, setHover] = useState<{ name: string; x: number; y: number } | null>(null);
  const { paths } = useMemo(() => {
    const topo = world as unknown as Topology<{ countries: GeometryCollection<{ name: string }> }>;
    const fc = feature(topo, topo.objects.countries);
    const proj = geoNaturalEarth1().fitSize([960, 470], fc);
    const gp = geoPath(proj);
    return {
      paths: fc.features
        .filter((f) => f.properties?.name !== "Antarctica")
        .map((f) => ({ id: String(f.id).padStart(3, "0"), name: f.properties?.name ?? "", d: gp(f) ?? "" })),
    };
  }, []);
  const max = Math.max(1, ...Object.values(counts).map((c) => c.total));
  const color = (n: number) => {
    if (!n) return "#e2e8f0";
    const t = 0.25 + 0.75 * (n / max);
    return `rgba(14,116,184,${t.toFixed(2)})`;
  };
  return (
    <div className="relative">
      <svg viewBox="0 0 960 470" className="h-auto w-full">
        {paths.map((p) => {
          const name = isoToName[p.id] ?? p.name;
          const c = counts[name];
          return (
            <path
              key={p.id + p.name}
              d={p.d}
              fill={c ? color(c.total) : "#e2e8f0"}
              stroke={c?.hot ? "#dc2626" : "#fff"}
              strokeWidth={c?.hot ? 1.2 : 0.5}
              className={c ? "cursor-pointer hover:opacity-80" : ""}
              onMouseMove={(e) => {
                const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                setHover({ name, x: e.clientX - r.left, y: e.clientY - r.top });
              }}
              onMouseLeave={() => setHover(null)}
              onClick={() => c && router.push(`/opportunities?country=${encodeURIComponent(name)}`)}
            />
          );
        })}
      </svg>
      {hover && (
        <div className="pointer-events-none absolute z-10 rounded-md bg-slate-900 px-2 py-1 text-xs text-white shadow" style={{ left: hover.x + 12, top: hover.y + 12 }}>
          <div className="font-semibold">{hover.name}</div>
          {counts[hover.name] ? <div>기회 {counts[hover.name].total}건 · HOT {counts[hover.name].hot}</div> : <div className="text-slate-300">기회 없음</div>}
        </div>
      )}
      <div className="mt-1 flex items-center gap-3 text-[11px] text-slate-500">
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-4 rounded-sm bg-sky-200" /> 적음</span>
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-4 rounded-sm bg-sky-700" /> 많음</span>
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-4 rounded-sm border-2 border-red-600" /> HOT 포함</span>
        <span>· 국가를 클릭하면 해당 국가의 프로젝트 목록으로 이동합니다</span>
      </div>
    </div>
  );
}
