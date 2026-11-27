"use client";
import { Bar, CartesianGrid, Cell, ComposedChart, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, BarChart } from "recharts";
import { inr, inrFull } from "@/lib/format";

// Categorical slots 1-3 of the validated palette; the AOP target is drawn in neutral ink.
export const C = { revenue: "#257de0", expenses: "#f47230", cash: "#00b894", target: "#3d3d3d", grid: "#e8e8e8", text: "#666666" };

const axis = { tick: { fill: C.text, fontSize: 12 }, axisLine: { stroke: C.grid }, tickLine: false as const };
const tip = { contentStyle: { borderRadius: 8, border: "1px solid #e0e0e0", fontSize: 13 }, formatter: (v: any) => (v == null ? "—" : inrFull(Number(v))) };
const legend = { wrapperStyle: { fontSize: 13 }, formatter: (value: any) => <span style={{ color: "#191919" }}>{value}</span> };
const compact = (v: number) => inr(v).replace(/\.00 /, " ").replace(/(\.\d)0 /, "$1 ");

export type Series = { key: string; name: string; color: string };

/** Actual as bars, AOP target as a line with markers. One shared ₹ axis. */
export function ActualVsTarget({ data, actual, height = 260 }: { data: any[]; actual: Series; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
        <CartesianGrid stroke={C.grid} vertical={false} />
        <XAxis dataKey="label" {...axis} />
        <YAxis {...axis} tickFormatter={compact} width={70} />
        <Tooltip {...tip} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
        <Legend {...legend} />
        <Bar dataKey={actual.key} name={actual.name} fill={actual.color} radius={[4, 4, 0, 0]} maxBarSize={28} />
        <Line dataKey="aop" name="AOP target" stroke={C.target} strokeWidth={2} strokeDasharray="5 4" dot={{ r: 4, fill: "#fff", stroke: C.target, strokeWidth: 2 }} connectNulls={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function Lines({ data, series, height = 240, xKey = "label" }: { data: any[]; series: (Series & { dashed?: boolean })[]; height?: number; xKey?: string }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
        <CartesianGrid stroke={C.grid} vertical={false} />
        <XAxis dataKey={xKey} {...axis} />
        <YAxis {...axis} tickFormatter={compact} width={70} />
        <Tooltip {...tip} />
        {series.length > 1 && <Legend {...legend} />}
        {series.map((s) => (
          <Line key={s.key} dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2} strokeDasharray={s.dashed ? "5 4" : undefined} dot={false} activeDot={{ r: 4 }} connectNulls={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function Bars({ data, series, height = 240, xKey = "label", onClick }: { data: any[]; series: Series[]; height?: number; xKey?: string; onClick?: (row: any) => void }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 4 }} barGap={2} onClick={(e: any) => e?.activePayload?.[0] && onClick?.(e.activePayload[0].payload)}>
        <CartesianGrid stroke={C.grid} vertical={false} />
        <XAxis dataKey={xKey} {...axis} />
        <YAxis {...axis} tickFormatter={compact} width={70} />
        <Tooltip {...tip} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
        {series.length > 1 && <Legend {...legend} />}
        {series.map((s) => (
          <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} radius={[4, 4, 0, 0]} maxBarSize={22} cursor={onClick ? "pointer" : undefined} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function Donut({ data, height = 220 }: { data: { name: string; value: number; color: string }[]; height?: number }) {
  const shown = data.filter((x) => x.value > 0);
  if (!shown.length) return <p className="muted pad">No revenue in this period.</p>;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={shown} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="88%" paddingAngle={2} stroke="#fff" strokeWidth={2}>
          {shown.map((x) => <Cell key={x.name} fill={x.color} />)}
        </Pie>
        <Tooltip {...tip} />
      </PieChart>
    </ResponsiveContainer>
  );
}
