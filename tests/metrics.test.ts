import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { classify } from "../src/lib/classify";
import { daily, fyMonths, fyOf, kpis, monthly } from "../src/lib/metrics";
import { parseAopCsv } from "../src/lib/aop";
import type { Dataset, Mapping, RawData } from "../src/lib/types";

const mapping = JSON.parse(fs.readFileSync("config/mapping.json", "utf8")) as Mapping;
const acct = (id: string, name: string, type: string, parent?: string) => ({ account_id: id, account_name: name, account_type: type, parent_account_id: parent, current_balance: 0 });
const BANK = "HDFC BANK --- 76521", CARD = "SAHIL PURI";
let n = 0;
const tx = (date: string, account: string, offset: string, dc: "debit" | "credit", amount: number, type = "expense", customer = "") =>
  ({ transaction_id: String(++n), date, amount, transaction_type: type, account_name: account, offset_account_name: offset, debit_or_credit: dc, customer_id: customer, payee: customer, description: "" });

const raw: RawData = {
  syncedAt: "2026-11-27T00:00:00Z", org: { id: "1", name: "Test" },
  accounts: [
    acct("1", "Unearned Revenue", "other_current_liability"), acct("2", "General Income", "income"), acct("3", "Interest Income", "income"),
    acct("4", "Owner's Equity", "equity"), acct("5", "META", "expense"),
    acct("10", "Salaries", "expense"), acct("11", "Salaries - Service", "expense", "10"), acct("12", "Neera Handa", "expense", "11"), acct("13", "New Coach", "expense", "11"),
    acct("14", "Salaries - GTM", "expense", "10"), acct("15", "New Intern", "expense", "14"), acct("20", "Mystery Spend", "expense"),
  ],
  bankTransactions: [
    tx("2026-10-05", BANK, "", "debit", 100000, "customer_payment", "cust-A"),
    tx("2026-10-10", BANK, "Owner's Equity", "debit", 50000, "owner_contribution"),
    tx("2026-11-03", BANK, "", "debit", 200000, "customer_payment", "cust-B"),
    tx("2026-11-04", BANK, "", "debit", 50000, "customer_payment", "cust-A"),
    tx("2026-11-05", BANK, "General Income", "debit", 20000, "other_income"),
    tx("2026-11-06", BANK, "Interest Income", "debit", 1000, "other_income"),
    tx("2026-11-07", CARD, "META", "credit", 40000),
    tx("2026-11-08", BANK, "Neera Handa", "credit", 30000),
    tx("2026-11-09", BANK, "New Coach", "credit", 25000),
    tx("2026-11-10", BANK, "New Intern", "credit", 10000),
    tx("2026-11-11", BANK, "Mystery Spend", "credit", 5000),
  ],
  bankAccounts: [], counts: { journals: 0, bills: 0, invoices: 0, draftInvoices: 0, creditNotes: 0 },
};
const c = classify(raw, mapping);
const d: Dataset = {
  syncedAt: raw.syncedAt, org: raw.org, fyStartMonth: 4, txns: c.txns,
  groups: mapping.groups.map((g) => ({ id: g.id, label: g.label, type: g.type, team: g.team, tags: g.tags ?? [] })),
  streams: { programme: "P", workshop: "W", other: "O" }, accountRows: c.accountRows,
  aop: { benchmarkFrom: "2026-11", months: { "2026-11": { revenue: 300000, expenses: 100000 } }, live: false },
  manual: {}, metaDaily: null, dq: c.dq,
};
const M = monthly(d);
const group = (account: string) => c.txns.find((t) => t.account === account)!.groupId;

test("accounts roll up by parent; nearest match wins", () => {
  assert.equal(group("Neera Handa"), "emp_service"); // named explicitly → in-house (fixed)
  assert.equal(group("New Coach"), "out_service"); // new sub-account under Salaries - Service → outsourced
  assert.equal(group("New Intern"), "emp_gtm"); // new sub-account under Salaries - GTM
  assert.equal(group("Mystery Spend"), "misc"); // unmapped → Misc
});

test("revenue streams", () => {
  const k = kpis(d, M, ["2026-11"]);
  assert.deepEqual(k.revenue, { programme: 250000, workshop: 20000, other: 1000, total: 271000 });
});

test("expenses, founder capital and bank balance", () => {
  const k = kpis(d, M, ["2026-11"]);
  assert.equal(k.expenses.total, 110000);
  assert.equal(k.expenses.fixed, 40000); // Neera 30,000 + intern 10,000
  assert.equal(k.cardExpenses, 40000);
  assert.equal(k.capitalPeriod, 40000); // card spend counts as capital
  assert.equal(k.capitalCumulative, 90000); // + ₹50,000 bank transfer in October
  // Card spend never touches the bank: 150,000 (Oct) + 271,000 − 70,000 bank expenses
  assert.equal(k.bankClose, 351000);
  assert.equal(k.netBurn, 110000 - 271000);
  assert.equal(k.cashBurn, 70000 - 271000);
});

test("margins, CAC and runway", () => {
  const k = kpis(d, M, ["2026-11"]);
  assert.equal(k.cogs, 55000); // in-house + outsourced service
  assert.ok(Math.abs(k.grossMargin! - (271000 - 55000) / 271000) < 1e-9);
  assert.equal(k.newCustomers, 1); // cust-B is new in Nov; cust-A first paid in Oct
  assert.equal(k.cac, 40000); // Meta ads only
  assert.equal(k.trueCac, 50000); // + GTM intern
  assert.equal(k.runway, null); // revenue exceeded expenses over the last 3 months
  assert.equal(k.arpu, null); // unique Alcovians not connected
});

test("year-to-date covers April to the selected month", () => {
  assert.equal(fyOf("2026-11", 4), 2026);
  assert.equal(fyOf("2027-02", 4), 2026);
  const ytd = kpis(d, M, fyMonths(2026, 4).filter((m) => m <= "2026-11"));
  assert.equal(ytd.revenue.total, 371000);
});

test("daily view: balance, cumulative revenue and pro-rated AOP", () => {
  const rows = daily(d, "2026-11", "2026-11-10");
  assert.equal(rows[2].bankClose, 350000); // 150,000 opening + 200,000 on the 3rd
  assert.equal(rows[9].cumRevenue, 271000);
  assert.equal(rows[9].aopRevenueProrated, 100000); // 300,000 × 10/30
  assert.equal(rows[10].bankClose, null); // future day
  assert.equal(rows[6].adSpend, 40000);
});

test("AOP sheet parser handles the year roll-over and number formats", () => {
  const csv = 'Year,2026,,,2027\nMonths,October,November,December,January\n  Total Operating Revenue,"1,645,000.00","5,988,580.00","2,169,369.31","2,261,599.52"\nTOTAL CASH OUTFLOWS,"1,571,393.00",,"1,802,977.00",\n';
  const out = parseAopCsv(csv, { revenue: "Total Operating Revenue", expenses: "TOTAL CASH OUTFLOWS" });
  assert.equal(out["2026-11"].revenue, 5988580);
  assert.equal(out["2027-01"].revenue, 2261599.52);
  assert.equal(out["2026-12"].expenses, 1802977);
  assert.equal(out["2026-11"].expenses, undefined);
});
