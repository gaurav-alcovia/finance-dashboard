"use client";
import { useMemo } from "react";
import type { Dataset } from "@/lib/types";
import { daily } from "@/lib/metrics";
import { dateLabel, downloadCsv, inr, inrFull, monthLabel } from "@/lib/format";
import { Bars, C, Lines } from "./charts";
import type { DrillSpec } from "./Drill";

export function Mtd({ d, month, today, onDrill }: { d: Dataset; month: string; today: string; onDrill: (s: DrillSpec) => void }) {
  const rows = useMemo(() => daily(d, month, today), [d, month, today]);
  const past = rows.filter((r) => !r.future);
  const last = past[past.length - 1];
  const sum = (f: (r: (typeof rows)[number]) => number) => past.reduce((s, r) => s + f(r), 0);
  const revenue = sum((r) => r.revenue), expenses = sum((r) => r.expenses), ads = sum((r) => r.adSpend);
  const target = month >= d.aop.benchmarkFrom ? d.aop.months[month]?.revenue : undefined;
  const prorated = last?.aopRevenueProrated ?? null;
  const gap = prorated != null ? revenue - prorated : null;
  const chart = rows.map((r) => ({ ...r, label: String(r.day), revenue: r.future ? null : r.revenue, expenses: r.future ? null : r.expenses, adSpend: r.future ? null : r.adSpend }));
  const dayDrill = (row: { date: string }) => onDrill({ title: `Transactions on ${dateLabel(row.date)}`, txns: d.txns.filter((t) => t.date === row.date) });
  const adSource = d.metaDaily ? "Meta Ads API" : "Zoho META account";

  if (!last) return <p className="panel muted">{monthLabel(month)} has not started yet.</p>;
  return (
    <>
      <section className="kpis">
        <div className="kpi static"><span className="kpi-title">Revenue, month to date</span><span className="kpi-value">{inr(revenue)}</span><span className="kpi-sub">1 – {dateLabel(last.date)}</span></div>
        <div className="kpi static"><span className="kpi-title">Expenses, month to date</span><span className="kpi-value">{inr(expenses)}</span><span className="kpi-sub">Of which on founder card {inr(sum((r) => r.cardExpenses))}</span></div>
        <div className="kpi static"><span className="kpi-title">Cash in bank</span><span className="kpi-value">{inr(last.bankClose)}</span><span className="kpi-sub">Closing balance on {dateLabel(last.date)}</span></div>
        <div className="kpi static"><span className="kpi-title">Revenue vs pro-rated AOP</span>
          <span className="kpi-value">{gap == null ? "No target" : `${gap >= 0 ? "▲" : "▼"} ${inr(Math.abs(gap))}`}</span>
          <span className={`delta ${gap == null ? "flat" : gap >= 0 ? "good" : "bad"}`}>{gap == null ? `AOP benchmarks start ${monthLabel(d.aop.benchmarkFrom)}` : `${gap >= 0 ? "ahead of" : "behind"} ${inr(prorated)} pro-rated target`}</span>
          {target != null && <span className="kpi-sub">Full-month target {inr(target)}</span>}
        </div>
        <div className="kpi static"><span className="kpi-title">Ad spend, month to date</span><span className="kpi-value">{inr(ads)}</span><span className="kpi-sub">Source: {adSource}</span></div>
      </section>

      <section className="grid2">
        <div className="panel"><h3>Daily revenue and expenses</h3><Bars data={chart} series={[{ key: "revenue", name: "Revenue", color: C.revenue }, { key: "expenses", name: "Expenses", color: C.expenses }]} onClick={dayDrill} /><p className="muted small-note">Click a day to see its transactions.</p></div>
        <div className="panel"><h3>Cumulative revenue vs pro-rated AOP target</h3><Lines data={chart} series={[{ key: "cumRevenue", name: "Cumulative revenue", color: C.revenue }, ...(target != null ? [{ key: "aopRevenueProrated", name: "AOP target (pro-rated)", color: C.target, dashed: true }] : [])]} /></div>
        <div className="panel"><h3>Daily cash in bank</h3><Lines data={chart} series={[{ key: "bankClose", name: "Cash in bank", color: C.cash }]} /></div>
        <div className="panel"><h3>Daily ad spend</h3><Bars data={chart} series={[{ key: "adSpend", name: "Ad spend", color: C.expenses }]} onClick={dayDrill} /><p className="muted small-note">Source: {adSource}. Zoho records the date Meta charged the card, not the day the ads ran.</p></div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h3>Day by day · {monthLabel(month)}</h3>
          <button className="btn small" onClick={() => downloadCsv(`Daily ${month}`, ["Date", "Revenue", "Expenses", "Of which founder card", "Ad spend", "Cash in bank", "Cumulative revenue", "AOP target pro-rated"], past.map((r) => [r.date, r.revenue.toFixed(2), r.expenses.toFixed(2), r.cardExpenses.toFixed(2), r.adSpend.toFixed(2), r.bankClose?.toFixed(2), r.cumRevenue?.toFixed(2), r.aopRevenueProrated?.toFixed(2)]))}>Export CSV</button>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Date</th><th className="r">Revenue</th><th className="r">Expenses</th><th className="r">Ad spend</th><th className="r">Cash in bank</th><th className="r">Cumulative revenue</th><th className="r">AOP pro-rated</th></tr></thead>
            <tbody>
              {past.map((r) => (
                <tr key={r.date} className={`click${r.revenue === 0 && r.expenses === 0 ? " zero" : ""}`} tabIndex={0} onClick={() => dayDrill(r)} onKeyDown={(e) => e.key === "Enter" && dayDrill(r)}>
                  <td>{dateLabel(r.date)}</td><td className="r num">{inrFull(r.revenue)}</td><td className="r num">{inrFull(r.expenses)}</td><td className="r num">{inrFull(r.adSpend)}</td><td className="r num">{inrFull(r.bankClose)}</td><td className="r num">{inrFull(r.cumRevenue)}</td><td className="r num">{inrFull(r.aopRevenueProrated)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
