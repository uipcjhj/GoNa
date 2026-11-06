"use client";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function HBar({ data, color = "#0e74b8", height = 240 }: { data: { name: string; value: number }[]; color?: string; height?: number }) {
  if (!data.length) return <div className="flex h-40 items-center justify-center text-sm text-slate-400">데이터 없음</div>;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
        <CartesianGrid horizontal={false} stroke="#eef2f7" />
        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11, fill: "#334155" }} axisLine={false} tickLine={false} />
        <Tooltip cursor={{ fill: "#f1f5f9" }} contentStyle={{ fontSize: 12, borderRadius: 8 }} formatter={(v) => [v, "건수"]} />
        <Bar dataKey="value" fill={color} radius={[0, 4, 4, 0]} barSize={14} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ScoreHistogram({ data }: { data: { name: string; value: number }[] }) {
  const colorFor = (n: string) => (Number(n.split("-")[0]) >= 80 ? "#dc2626" : Number(n.split("-")[0]) >= 60 ? "#f59e0b" : "#94a3b8");
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ left: -16, right: 8, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="#eef2f7" />
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
        <Tooltip cursor={{ fill: "#f1f5f9" }} contentStyle={{ fontSize: 12, borderRadius: 8 }} formatter={(v) => [v, "프로젝트"]} />
        <Bar dataKey="value" radius={[4, 4, 0, 0]} barSize={28}>
          {data.map((d) => (
            <Cell key={d.name} fill={colorFor(d.name)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
