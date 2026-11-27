// Pure calculations shared by the server script, the tests and the browser.
import type { Dataset, Stream, Txn } from "./types";

export type MonthAgg = {
  month: string;
  revenue: Record<Stream | "total", number>;
  expenses: { fixed: number; variable: number; tax: number; total: number };
  byGroup: Record<string, number>;
  bankExpenses: number;
  cardExpenses: number;
  otherPaidExpenses: number;
  capitalTransfers: number;
  capital: number;
  capitalCumulative: number;
  cogs: number;
  cacSpend: number;
  trueCacSpend: number;
  adSpendZoho: number;
  newCustomersZoho: number;
  bankClose: number;
};

export const ym = (date: string) => date.slice(0, 7);
export const addMonths = (month: string, n: number) => {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};
export const monthRange = (from: string, to: string) => {
  const out: string[] = [];
  for (let m = from; m <= to; m = addMonths(m, 1)) out.push(m);
  return out;
};
/** Financial year a month belongs to, as its starting calendar year (FY 2026-27 → 2026). */
export const fyOf = (month: string, fyStart: number) => {
  const [y, m] = month.split("-").map(Number);
  return m >= fyStart ? y : y - 1;
};
export const fyMonths = (fy: number, fyStart: number) => monthRange(`${fy}-${String(fyStart).padStart(2, "0")}`, addMonths(`${fy}-${String(fyStart).padStart(2, "0")}`, 11));
export const fyLabel = (fy: number, fyStart: number) => (fyStart === 1 ? `${fy}` : `FY ${fy}-${String((fy + 1) % 100).padStart(2, "0")}`);
export const daysIn = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};

const empty = (month: string): MonthAgg => ({
  month,
  revenue: { programme: 0, workshop: 0, other: 0, total: 0 },
  expenses: { fixed: 0, variable: 0, tax: 0, total: 0 },
  byGroup: {},
  bankExpenses: 0, cardExpenses: 0, otherPaidExpenses: 0,
  capitalTransfers: 0, capital: 0, capitalCumulative: 0,
  cogs: 0, cacSpend: 0, trueCacSpend: 0, adSpendZoho: 0,
  newCustomersZoho: 0, bankClose: 0,
});

/** First month in which each customer paid (used for "new customers acquired"). */
export function firstPaymentMonth(txns: Txn[]): Map<string, string> {
  const first = new Map<string, string>();
  for (const t of txns) {
    if (t.kind !== "revenue" || t.stream !== "programme" || t.amount <= 0) continue;
    const key = t.customerId || t.payee;
    if (key && !first.has(key)) first.set(key, ym(t.date)); // txns are sorted by date
  }
  return first;
}

export function monthly(d: Dataset, through?: string): Record<string, MonthAgg> {
  const out: Record<string, MonthAgg> = {};
  if (!d.txns.length) return out;
  const last = [ym(d.txns[d.txns.length - 1].date), through ?? ""].sort().pop()!;
  for (const m of monthRange(ym(d.txns[0].date), last)) out[m] = empty(m);

  for (const t of d.txns) {
    const a = out[ym(t.date)];
    a.bankClose += t.bankEffect; // per-month movement for now; made cumulative below
    if (t.kind === "revenue") {
      a.revenue[t.stream ?? "other"] += t.amount;
      a.revenue.total += t.amount;
    } else if (t.kind === "expense") {
      a.expenses[t.costType ?? "variable"] += t.amount;
      a.expenses.total += t.amount;
      if (t.groupId) a.byGroup[t.groupId] = (a.byGroup[t.groupId] ?? 0) + t.amount;
      if (t.paidVia === "bank") a.bankExpenses += t.amount;
      else if (t.paidVia === "founder_card") a.cardExpenses += t.amount;
      else a.otherPaidExpenses += t.amount;
      if (t.tags.includes("cogs")) a.cogs += t.amount;
      if (t.tags.includes("cac")) a.cacSpend += t.amount;
      if (t.tags.includes("cac") || t.tags.includes("true_cac")) a.trueCacSpend += t.amount;
      if (t.tags.includes("ad_spend")) a.adSpendZoho += t.amount;
    } else if (t.kind === "capital") a.capitalTransfers += t.amount;
  }
  for (const m of firstPaymentMonth(d.txns).values()) if (out[m]) out[m].newCustomersZoho++;

  let bank = 0, cap = 0;
  for (const m of Object.keys(out).sort()) {
    const a = out[m];
    a.capital = a.capitalTransfers + a.cardExpenses;
    cap += a.capital;
    a.capitalCumulative = cap;
    bank += a.bankClose;
    a.bankClose = bank;
  }
  return out;
}

export type AdSpend = { value: number; source: "manual" | "meta" | "zoho" };
export function adSpend(d: Dataset, M: Record<string, MonthAgg>, month: string): AdSpend {
  const manual = d.manual[month]?.metaAdSpend;
  if (manual != null) return { value: manual, source: "manual" };
  if (d.metaDaily) {
    let v = 0;
    for (const [day, s] of Object.entries(d.metaDaily)) if (day.startsWith(month)) v += s;
    return { value: v, source: "meta" };
  }
  return { value: M[month]?.adSpendZoho ?? 0, source: "zoho" };
}

export type Kpis = {
  months: string[];
  revenue: Record<Stream | "total", number>;
  expenses: { fixed: number; variable: number; tax: number; total: number };
  byGroup: Record<string, number>;
  capitalPeriod: number; capitalTransfers: number; cardExpenses: number; capitalCumulative: number;
  netBurn: number; cashBurn: number; avgNetBurn3: number;
  bankClose: number; runway: number | null;
  arpu: number | null; alcovians: number | null;
  cogs: number; cogsPct: number | null;
  grossMargin: number | null; netMargin: number | null;
  newCustomers: number; newCustomersSource: "manual" | "zoho";
  cacSpend: number; trueCacSpend: number; cac: number | null; trueCac: number | null;
  adSpend: number; adSpendSource: AdSpend["source"];
  adRevenue: number | null; roas: number | null;
  trialRetention: number | null; trialCounts: [number, number] | null;
  renewal: number | null; renewalCounts: [number, number] | null;
  workshopConversion: number | null; workshopCounts: [number, number] | null;
};

const ratio = (a: number, b: number) => (b ? a / b : null);

/** KPIs for a period (list of months). Balances are taken at the last month. */
export function kpis(d: Dataset, M: Record<string, MonthAgg>, months: string[]): Kpis {
  const sel = months[months.length - 1];
  const get = (m: string) => M[m] ?? empty(m);
  const sum = (f: (a: MonthAgg) => number, ms = months) => ms.reduce((s, m) => s + f(get(m)), 0);

  const revenue = { programme: sum((a) => a.revenue.programme), workshop: sum((a) => a.revenue.workshop), other: sum((a) => a.revenue.other), total: sum((a) => a.revenue.total) };
  const expenses = { fixed: sum((a) => a.expenses.fixed), variable: sum((a) => a.expenses.variable), tax: sum((a) => a.expenses.tax), total: sum((a) => a.expenses.total) };
  const byGroup: Record<string, number> = {};
  for (const m of months) for (const [g, v] of Object.entries(get(m).byGroup)) byGroup[g] = (byGroup[g] ?? 0) + v;

  const last3 = [addMonths(sel, -2), addMonths(sel, -1), sel];
  const avgNetBurn3 = (sum((a) => a.expenses.total, last3) - sum((a) => a.revenue.total, last3)) / 3;
  // Latest known balance at or before the selected month.
  const known = Object.keys(M).sort().filter((m) => m <= sel);
  const bankClose = known.length ? M[known[known.length - 1]].bankClose : 0;
  const capitalCumulative = known.length ? M[known[known.length - 1]].capitalCumulative : 0;

  const man = (f: keyof Dataset["manual"][string]) => {
    const vals = months.map((m) => d.manual[m]?.[f]).filter((v): v is number => v != null);
    return vals.length ? vals.reduce((s, v) => s + v, 0) : null;
  };
  const pair = (num: keyof Dataset["manual"][string], den: keyof Dataset["manual"][string]) => {
    const n = man(num), dn = man(den);
    return n != null && dn != null && dn > 0 ? ([n, dn] as [number, number]) : null;
  };

  const everyMonthHas = months.every((m) => d.manual[m]?.uniqueAlcovians != null);
  const alcovians = everyMonthHas ? man("uniqueAlcovians") : null;

  const manualNew = months.every((m) => d.manual[m]?.newCustomers != null) ? man("newCustomers") : null;
  const newCustomers = manualNew ?? sum((a) => a.newCustomersZoho);
  const cacSpend = sum((a) => a.cacSpend), trueCacSpend = sum((a) => a.trueCacSpend);

  const spends = months.map((m) => adSpend(d, M, m));
  const ad = spends.reduce((s, x) => s + x.value, 0);
  const adRevenue = man("adAttributedRevenue");
  const cogs = sum((a) => a.cogs);
  const trial = pair("trialsConverted", "trialsEligible"), renew = pair("renewalsDone", "renewalsEligible"), ws = pair("workshopConverted", "workshopAttendees");

  return {
    months, revenue, expenses, byGroup,
    capitalPeriod: sum((a) => a.capital), capitalTransfers: sum((a) => a.capitalTransfers), cardExpenses: sum((a) => a.cardExpenses), capitalCumulative,
    netBurn: expenses.total - revenue.total,
    cashBurn: sum((a) => a.bankExpenses) - revenue.total,
    avgNetBurn3, bankClose,
    runway: avgNetBurn3 > 0 ? bankClose / avgNetBurn3 : null,
    arpu: alcovians ? revenue.programme / alcovians : null, alcovians,
    cogs, cogsPct: ratio(cogs, revenue.total),
    grossMargin: ratio(revenue.total - cogs, revenue.total),
    netMargin: ratio(revenue.total - expenses.total, revenue.total),
    newCustomers, newCustomersSource: manualNew != null ? "manual" : "zoho",
    cacSpend, trueCacSpend, cac: ratio(cacSpend, newCustomers), trueCac: ratio(trueCacSpend, newCustomers),
    adSpend: ad, adSpendSource: spends.some((s) => s.source === "meta") ? "meta" : spends.some((s) => s.source === "manual") ? "manual" : "zoho",
    adRevenue, roas: adRevenue != null ? ratio(adRevenue, ad) : null,
    trialRetention: trial ? trial[0] / trial[1] : null, trialCounts: trial,
    renewal: renew ? renew[0] / renew[1] : null, renewalCounts: renew,
    workshopConversion: ws ? ws[0] / ws[1] : null, workshopCounts: ws,
  };
}

export type DayRow = {
  date: string; day: number; future: boolean;
  revenue: number; expenses: number; cardExpenses: number; adSpend: number;
  bankClose: number | null; cumRevenue: number | null; cumExpenses: number | null; aopRevenueProrated: number | null;
};

/** Day-by-day figures for one month. `today` (YYYY-MM-DD) marks later days as future. */
export function daily(d: Dataset, month: string, today: string): DayRow[] {
  const n = daysIn(month);
  const target = month >= d.aop.benchmarkFrom ? d.aop.months[month]?.revenue : undefined;
  const rows: DayRow[] = Array.from({ length: n }, (_, i) => {
    const date = `${month}-${String(i + 1).padStart(2, "0")}`;
    return { date, day: i + 1, future: date > today, revenue: 0, expenses: 0, cardExpenses: 0, adSpend: 0, bankClose: null, cumRevenue: null, cumExpenses: null, aopRevenueProrated: target != null ? (target * (i + 1)) / n : null };
  });
  let bank = 0;
  const move = new Array(n).fill(0);
  for (const t of d.txns) {
    if (t.date < `${month}-01`) { bank += t.bankEffect; continue; }
    if (ym(t.date) !== month) continue;
    const r = rows[Number(t.date.slice(8, 10)) - 1];
    move[r.day - 1] += t.bankEffect;
    if (t.kind === "revenue") r.revenue += t.amount;
    if (t.kind === "expense") {
      r.expenses += t.amount;
      if (t.paidVia === "founder_card") r.cardExpenses += t.amount;
      if (!d.metaDaily && t.tags.includes("ad_spend")) r.adSpend += t.amount;
    }
  }
  if (d.metaDaily) for (const r of rows) r.adSpend = d.metaDaily[r.date] ?? 0;
  let cumR = 0, cumE = 0;
  rows.forEach((r, i) => {
    bank += move[i]; cumR += r.revenue; cumE += r.expenses;
    if (!r.future) { r.bankClose = bank; r.cumRevenue = cumR; r.cumExpenses = cumE; }
  });
  return rows;
}
