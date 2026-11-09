"use client";
// Charts — dark navy + neon mint theme
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const GRID = "#152a45";
const TICK = "#8ca2c0";
const TICK_STRONG = "#c4d2e5";
const tooltipStyle = { fontSize: 12, borderRadius: 8, background: "#071226", border: "1px solid rgba(46,242,196,0.35)", color: "#eef4fb" };
const cursor = { fill: "rgba(46,242,196,0.06)" };

export function HBar({ data, color = "#2ef2c4", height = 240 }: { data: { name: string; value: number }[]; color?: string; height?: number }) {
  if (!data.length) return <div className="flex h-40 items-center justify-center text-sm text-slate-400">실제 데이터 없음</div>;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ left: 0, right: 12, top: 4, bottom: 4 }}>
        <CartesianGrid horizontal={false} stroke={GRID} />
        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: TICK }} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="name" width={112} tick={{ fontSize: 11, fill: TICK_STRONG }} axisLine={false} tickLine={false} />
        <Tooltip cursor={cursor} contentStyle={tooltipStyle} labelStyle={{ color: "#eef4fb" }} itemStyle={{ color }} formatter={(v) => [v, "건수"]} />
        <Bar dataKey="value" fill={color} fillOpacity={0.85} radius={[0, 4, 4, 0]} barSize={12} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ScoreHistogram({ data }: { data: { name: string; value: number }[] }) {
  const colorFor = (n: string) => (Number(n.split("-")[0]) >= 80 ? "#ff5d73" : Number(n.split("-")[0]) >= 60 ? "#fbbf24" : "#2ef2c4");
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ left: -20, right: 4, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: TICK }} axisLine={false} tickLine={false} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: TICK }} axisLine={false} tickLine={false} />
        <Tooltip cursor={cursor} contentStyle={tooltipStyle} labelStyle={{ color: "#eef4fb" }} formatter={(v) => [v, "프로젝트"]} />
        <Bar dataKey="value" radius={[4, 4, 0, 0]} barSize={26}>
          {data.map((d) => (
            <Cell key={d.name} fill={colorFor(d.name)} fillOpacity={0.85} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
