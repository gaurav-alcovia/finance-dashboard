"use client";
import { useMemo } from "react";
import type { Dataset, Txn } from "@/lib/types";
import { addMonths, fyMonths, kpis, ym, type Kpis, type MonthAgg } from "@/lib/metrics";
import { downloadCsv, inr, inrFull, monthLabel, monthShort, num, pct } from "@/lib/format";
import { ActualVsTarget, C, Donut, Lines } from "./charts";
import type { DrillSpec } from "./Drill";

type Props = { d: Dataset; M: Record<string, MonthAgg>; fy: number; month: string; mode: "month" | "ytd"; onDrill: (s: DrillSpec) => void };
type Good = "up" | "down" | "none";

function Delta({ cur, prev, good, points, label }: { cur: number | null; prev: number | null; good: Good; points?: boolean; label: string }) {
  if (cur == null || prev == null || (!points && prev === 0)) return <span className="delta flat">— {label}</span>;
  const change = points ? (cur - prev) * 100 : (cur - prev) / Math.abs(prev);
  if (Math.abs(change) < (points ? 0.05 : 0.0005)) return <span className="delta flat">● no change {label}</span>;
  const up = change > 0;
  const tone = good === "none" ? "flat" : (good === "up") === up ? "good" : "bad";
  const text = points ? `${Math.abs(change).toFixed(1)} pts` : `${(Math.abs(change) * 100).toFixed(1)}%`;
  return <span className={`delta ${tone}`}>{up ? "▲" : "▼"} {text} {label}</span>;
}

function Card({ title, value, sub, delta, onClick, off }: { title: string; value: string; sub?: string; delta?: React.ReactNode; onClick?: () => void; off?: boolean }) {
  return (
    <button className={`kpi${off ? " off" : ""}`} onClick={onClick} disabled={!onClick} title={onClick ? "Show the underlying Zoho transactions" : undefined}>
      <span className="kpi-title">{title}</span>
      <span className="kpi-value">{value}</span>
      {delta}
      {sub && <span className="kpi-sub">{sub}</span>}
    </button>
  );
}

export function Ytm({ d, M, fy, month, mode, onDrill }: Props) {
  const months = useMemo(() => (mode === "month" ? [month] : fyMonths(fy, d.fyStartMonth).filter((m) => m <= month)), [mode, month, fy, d.fyStartMonth]);
  const prevMonths = useMemo(() => (mode === "month" ? [addMonths(month, -1)] : months.map((m) => addMonths(m, -12))), [mode, month, months]);
  const K = useMemo(() => kpis(d, M, months), [d, M, months]);
  const P = useMemo(() => kpis(d, M, prevMonths), [d, M, prevMonths]);
  const vs = mode === "month" ? `vs ${monthShort(prevMonths[0])}` : "vs same period last FY";
  const periodName = mode === "month" ? monthLabel(month) : `${monthLabel(months[0])} – ${monthLabel(month)}`;

  const inSet = (ms: string[]) => { const s = new Set(ms); return (t: Txn) => s.has(ym(t.date)); };
  const inPeriod = inSet(months);
  const drill = (title: string, formula: string, f: (t: Txn) => boolean, ms?: string[], note?: string) => () =>
    onDrill({ title: `${title} · ${ms ? `${monthLabel(ms[0])} – ${monthLabel(ms[ms.length - 1])}` : periodName}`, formula, note, txns: d.txns.filter((t) => (ms ? inSet(ms)(t) : inPeriod(t)) && f(t)) });
  const last3 = [addMonths(month, -2), addMonths(month, -1), month];
  const isRev = (t: Txn) => t.kind === "revenue", isExp = (t: Txn) => t.kind === "expense";
  const dl = (cur: number | null, prev: number | null, good: Good, points = false) => <Delta cur={cur} prev={prev} good={good} points={points} label={vs} />;
  const nc = "Not connected";
  const adSrc = { zoho: "from the Zoho META account", meta: "from the Meta Ads API", manual: "from manual input" }[K.adSpendSource];
  const custSrc = K.newCustomersSource === "zoho" ? "first payment in Zoho" : "manual input";

  // ---- Trend data for the financial year ----
  const latest = Object.keys(M).sort().pop() ?? month;
  const trend = fyMonths(fy, d.fyStartMonth).map((m) => {
    const a = M[m];
    const has = m <= latest && !!a;
    const t = m >= d.aop.benchmarkFrom ? d.aop.months[m] : undefined;
    return { month: m, label: monthShort(m), revenue: has ? a.revenue.total : null, expenses: has ? a.expenses.total : null, bank: has ? a.bankClose : null, netBurn: has ? a.expenses.total - a.revenue.total : null, aopRevenue: t?.revenue ?? null, aopExpenses: t?.expenses ?? null };
  });
  const variance = (actualKey: "revenue" | "expenses", aopKey: "aopRevenue" | "aopExpenses") =>
    trend.filter((r) => r[actualKey] != null && r[aopKey] != null).map((r) => ({ month: r.month, actual: r[actualKey] as number, aop: r[aopKey] as number, diff: (r[actualKey] as number) - (r[aopKey] as number) }));

  const VarianceTable = ({ rows, name, higherIsGood }: { rows: ReturnType<typeof variance>; name: string; higherIsGood: boolean }) =>
    rows.length ? (
      <div className="table-wrap">
        <table>
          <thead><tr><th>Month</th><th className="r">Actual</th><th className="r">AOP target</th><th className="r">Variance</th><th className="r">Variance %</th></tr></thead>
          <tbody>
            {rows.map((r) => {
              const good = r.diff === 0 ? "flat" : r.diff > 0 === higherIsGood ? "good" : "bad";
              return (
                <tr key={r.month}>
                  <td>{monthLabel(r.month)}{r.month === latest ? " (month to date)" : ""}</td>
                  <td className="r num">{inrFull(r.actual)}</td><td className="r num">{inrFull(r.aop)}</td>
                  <td className={`r num ${good}`}>{r.diff > 0 ? "▲ " : r.diff < 0 ? "▼ " : ""}{inrFull(Math.abs(r.diff))}</td>
                  <td className={`r num ${good}`}>{r.aop ? `${r.diff > 0 ? "+" : ""}${((r.diff / r.aop) * 100).toFixed(1)}%` : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <button className="btn small" onClick={() => downloadCsv(`${name} vs AOP`, ["Month", "Actual", "AOP target", "Variance", "Variance %"], rows.map((r) => [r.month, r.actual.toFixed(2), r.aop.toFixed(2), r.diff.toFixed(2), r.aop ? ((r.diff / r.aop) * 100).toFixed(1) : ""]))}>Export CSV</button>
      </div>
    ) : (
      <p className="muted pad">AOP benchmarks start in {monthLabel(d.aop.benchmarkFrom)}. No month in this financial year has both an actual and a target yet.</p>
    );

  // ---- Cost breakdown ----
  const costRows = d.groups.map((g) => ({ ...g, amount: K.byGroup[g.id] ?? 0, prev: P.byGroup[g.id] ?? 0 }));
  const section = (type: "fixed" | "variable") => costRows.filter((r) => r.type === type);
  const exportCosts = () =>
    downloadCsv(`Cost breakdown ${periodName}`, ["Cost head", "Type", "Team", "Amount (INR)", "Share of expenses %", "Previous period (INR)"],
      [...costRows.map((r) => [r.label, r.type, r.team ?? "", r.amount.toFixed(2), K.expenses.total ? ((r.amount / K.expenses.total) * 100).toFixed(1) : "", r.prev.toFixed(2)]),
       ["Taxes paid", "tax", "", K.expenses.tax.toFixed(2), "", P.expenses.tax.toFixed(2)]]);

  const mix = [
    { name: d.streams.programme, value: K.revenue.programme, color: C.revenue },
    { name: d.streams.workshop, value: K.revenue.workshop, color: C.expenses },
    { name: d.streams.other, value: K.revenue.other, color: C.cash },
  ];

  return (
    <>
      <section className="kpis" aria-label="KPI cards">
        <Card title="Capital invested" value={inr(K.capitalPeriod)} delta={dl(K.capitalPeriod, P.capitalPeriod, "none")}
          sub={`Bank transfers ${inr(K.capitalTransfers)} + card ${inr(K.cardExpenses)} · cumulative ${inr(K.capitalCumulative)}`}
          onClick={drill("Capital invested", "Founder bank transfers + company expenses paid on the founder's credit card", (t) => t.kind === "capital" || (t.kind === "expense" && t.paidVia === "founder_card"))} />
        <Card title="Total revenue" value={inr(K.revenue.total)} delta={dl(K.revenue.total, P.revenue.total, "up")}
          sub={`Programme ${inr(K.revenue.programme)} · Workshop ${inr(K.revenue.workshop)} · Other ${inr(K.revenue.other)}`}
          onClick={drill("Total revenue", "Programme + workshop + other income", isRev)} />
        <Card title="Total expenses" value={inr(K.expenses.total)} delta={dl(K.expenses.total, P.expenses.total, "down")}
          sub={`Fixed ${inr(K.expenses.fixed)} · Variable ${inr(K.expenses.variable)} · Taxes ${inr(K.expenses.tax)}`}
          onClick={drill("Total expenses", "Fixed costs + variable costs + taxes paid", isExp)} />
        <Card title="Net burn" value={inr(K.netBurn)} delta={dl(K.netBurn, P.netBurn, "down")}
          sub={`${K.netBurn < 0 ? "Negative = surplus. " : ""}From the company bank only: ${inr(K.cashBurn)}`}
          onClick={drill("Net burn", "Total expenses (including founder-card spend) − total revenue", (t) => isRev(t) || isExp(t))} />
        <Card title="Avg net burn (last 3 months)" value={inr(K.avgNetBurn3)} delta={dl(K.avgNetBurn3, P.avgNetBurn3, "down")}
          sub={`${monthShort(last3[0])} – ${monthShort(last3[2])}`}
          onClick={drill("Avg net burn", "(Total expenses over 3 months − total revenue over 3 months) ÷ 3", (t) => isRev(t) || isExp(t), last3)} />
        <Card title="Cash in bank" value={inr(K.bankClose)} delta={dl(K.bankClose, P.bankClose, "up")}
          sub={`Balance after the last transaction of ${monthShort(month)}`}
          onClick={drill("Cash in bank", "Company bank balance after the last transaction of the month. Listed: every bank movement in the period.", (t) => t.bankEffect !== 0)} />
        <Card title="Programme MRR" value={inr(K.revenue.programme)} delta={dl(K.revenue.programme, P.revenue.programme, "up")}
          sub={K.arpu != null ? `Per Alcovian ${inr(K.arpu)} (${num(K.alcovians)} unique)` : "Per Alcovian: not connected (needs unique Alcovians)"}
          onClick={drill("Programme revenue", "Monthly programme revenue; per Alcovian = programme revenue ÷ unique Alcovians that month", (t) => isRev(t) && t.stream === "programme")} />
        <Card title="Cash runway" value={K.runway != null ? `${K.runway.toFixed(1)} months` : "Not burning"} delta={dl(K.runway, P.runway, "up")}
          sub={K.runway != null ? "Cash in bank ÷ avg net burn (3 months)" : "Revenue exceeded expenses over the last 3 months"}
          onClick={drill("Cash runway", "Cash in bank ÷ average net burn of the last 3 months", (t) => isRev(t) || isExp(t), last3)} />
        <Card title="Service delivery cost" value={inr(K.cogs)} delta={dl(K.cogs, P.cogs, "down")} sub={`${pct(K.cogsPct)} of revenue`}
          onClick={drill("Service delivery cost", "All cost heads tagged as service delivery (cost of goods sold)", (t) => isExp(t) && t.tags.includes("cogs"))} />
        <Card title="Trial → 1-year retention" off={K.trialRetention == null} value={K.trialRetention != null ? pct(K.trialRetention) : nc} delta={K.trialRetention != null ? dl(K.trialRetention, P.trialRetention, "up", true) : undefined}
          sub={K.trialCounts ? `${K.trialCounts[0]} of ${K.trialCounts[1]} trial Alcovians converted` : "Needs Service Dashboard / ClickUp"} />
        <Card title="Annual renewal" off={K.renewal == null} value={K.renewal != null ? pct(K.renewal) : nc} delta={K.renewal != null ? dl(K.renewal, P.renewal, "up", true) : undefined}
          sub={K.renewalCounts ? `${K.renewalCounts[0]} of ${K.renewalCounts[1]} renewed` : "Needs Service Dashboard / ClickUp"} />
        <Card title="Workshop → programme conversion" off={K.workshopConversion == null} value={K.workshopConversion != null ? pct(K.workshopConversion) : nc} delta={K.workshopConversion != null ? dl(K.workshopConversion, P.workshopConversion, "up", true) : undefined}
          sub={K.workshopCounts ? `${K.workshopCounts[0]} of ${K.workshopCounts[1]} attendees` : "Needs ClickUp CRM"} />
        <Card title="Gross profit margin" value={pct(K.grossMargin)} delta={dl(K.grossMargin, P.grossMargin, "up", true)} sub="(Revenue − service delivery cost) ÷ revenue"
          onClick={drill("Gross profit margin", "(Revenue − cost of goods sold) ÷ revenue", (t) => isRev(t) || (isExp(t) && t.tags.includes("cogs")))} />
        <Card title="Net profit margin" value={pct(K.netMargin)} delta={dl(K.netMargin, P.netMargin, "up", true)} sub="(Revenue − total expenses) ÷ revenue"
          onClick={drill("Net profit margin", "(Revenue − total expenses) ÷ revenue", (t) => isRev(t) || isExp(t))} />
        <Card title="CAC" value={inr(K.cac)} delta={dl(K.cac, P.cac, "down")} sub={`${inr(K.cacSpend)} ÷ ${num(K.newCustomers)} new customers (${custSrc})`}
          onClick={drill("CAC spend", "Meta Ads + Influencer/Sponsorships/Advertisement ÷ new customers acquired", (t) => isExp(t) && t.tags.includes("cac"))} />
        <Card title="True CAC" value={inr(K.trueCac)} delta={dl(K.trueCac, P.trueCac, "down")} sub={`${inr(K.trueCacSpend)} ÷ ${num(K.newCustomers)} new customers`}
          onClick={drill("True CAC spend", "CAC spend + all marketing team salaries, agencies and interns stipend ÷ new customers acquired", (t) => isExp(t) && (t.tags.includes("cac") || t.tags.includes("true_cac")))} />
        <Card title="ROAS" off={K.roas == null} value={K.roas != null ? `${K.roas.toFixed(2)}×` : nc} delta={K.roas != null ? dl(K.roas, P.roas, "up") : undefined}
          sub={K.roas != null ? `${inr(K.adRevenue)} ad revenue ÷ ${inr(K.adSpend)}` : "Needs ad-attributed revenue (ClickUp lead source)"} />
        <Card title="Marketing spend (Meta Ads)" value={inr(K.adSpend)} delta={dl(K.adSpend, P.adSpend, "none")} sub={`Total Meta Ads spend, ${adSrc}`}
          onClick={K.adSpendSource === "zoho" ? drill("Meta Ads spend", "Total Meta Ads spend recorded in Zoho", (t) => isExp(t) && t.tags.includes("ad_spend")) : undefined} />
      </section>

      <section className="grid2">
        <div className="panel">
          <h3>Revenue: actual vs AOP</h3>
          <ActualVsTarget data={trend.map((r) => ({ ...r, aop: r.aopRevenue }))} actual={{ key: "revenue", name: "Actual revenue", color: C.revenue }} />
          <VarianceTable rows={variance("revenue", "aopRevenue")} name="Revenue" higherIsGood />
        </div>
        <div className="panel">
          <h3>Expenses: actual vs AOP</h3>
          <ActualVsTarget data={trend.map((r) => ({ ...r, aop: r.aopExpenses }))} actual={{ key: "expenses", name: "Actual expenses", color: C.expenses }} />
          <VarianceTable rows={variance("expenses", "aopExpenses")} name="Expenses" higherIsGood={false} />
        </div>
        <div className="panel">
          <h3>Cash in bank at month end</h3>
          <Lines data={trend} series={[{ key: "bank", name: "Cash in bank", color: C.cash }]} />
        </div>
        <div className="panel">
          <h3>Revenue mix · {periodName}</h3>
          <div className="mix">
            <Donut data={mix} />
            <ul className="legend">
              {mix.map((x) => (
                <li key={x.name}><i style={{ background: x.color }} /><span>{x.name}</span><b>{pct(K.revenue.total ? x.value / K.revenue.total : null)}</b><em>{inr(x.value)}</em></li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h3>Cost breakdown · {periodName}</h3>
          <button className="btn small" onClick={exportCosts}>Export CSV</button>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Cost head</th><th>Team</th><th className="r">Amount</th><th className="r">Share of expenses</th><th className="r">{mode === "month" ? monthShort(prevMonths[0]) : "Last FY, same period"}</th></tr></thead>
            {(["fixed", "variable"] as const).map((type) => (
              <tbody key={type}>
                <tr className="group-row"><td colSpan={2}>{type === "fixed" ? "Fixed costs" : "Variable costs"}</td><td className="r num">{inrFull(K.expenses[type])}</td><td className="r num">{pct(K.expenses.total ? K.expenses[type] / K.expenses.total : null)}</td><td className="r num">{inrFull(P.expenses[type])}</td></tr>
                {section(type).map((r) => (
                  <tr key={r.id} className={`click${r.amount === 0 ? " zero" : ""}`} tabIndex={0}
                    onClick={drill(r.label, "Every Zoho account mapped to this cost head", (t) => isExp(t) && t.groupId === r.id)}
                    onKeyDown={(e) => e.key === "Enter" && drill(r.label, "Every Zoho account mapped to this cost head", (t) => isExp(t) && t.groupId === r.id)()}>
                    <td>{r.label}</td><td>{r.team ?? ""}</td><td className="r num">{inrFull(r.amount)}</td><td className="r num">{pct(K.expenses.total ? r.amount / K.expenses.total : null)}</td><td className="r num">{inrFull(r.prev)}</td>
                  </tr>
                ))}
              </tbody>
            ))}
            <tbody>
              <tr className="group-row"><td colSpan={2}>Taxes paid</td><td className="r num">{inrFull(K.expenses.tax)}</td><td className="r num">{pct(K.expenses.total ? K.expenses.tax / K.expenses.total : null)}</td><td className="r num">{inrFull(P.expenses.tax)}</td></tr>
              <tr className="total-row"><td colSpan={2}>Total expenses</td><td className="r num">{inrFull(K.expenses.total)}</td><td className="r num">100.0%</td><td className="r num">{inrFull(P.expenses.total)}</td></tr>
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
