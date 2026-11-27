import type { AccountRow, DataQuality, Mapping, RawData, Stream, Txn, ZohoAccount } from "./types";

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
const INCOME_TYPES = new Set(["income", "other_income"]);
const EXPENSE_TYPES = new Set(["expense", "cost_of_goods_sold", "other_expense"]);

type Bucket =
  | { kind: "revenue"; stream: Stream; matchedOn: string }
  | { kind: "expense"; groupId: string; costType: "fixed" | "variable" | "tax"; tags: string[]; matchedOn: string }
  | { kind: "capital"; matchedOn: string }
  | { kind: "other"; matchedOn: string };

export function classify(raw: RawData, mapping: Mapping): { txns: Txn[]; accountRows: AccountRow[]; dq: DataQuality } {
  const notes: DataQuality["notes"] = [];
  const byId = new Map(raw.accounts.map((a) => [a.account_id, a]));
  const byName = new Map<string, ZohoAccount[]>();
  for (const a of raw.accounts) {
    const k = norm(a.account_name);
    byName.set(k, [...(byName.get(k) ?? []), a]);
  }
  for (const [, list] of byName) {
    if (list.length > 1) notes.push({ level: "warn", text: `Zoho has ${list.length} accounts named "${list[0].account_name}". Transactions are matched by name, so these cannot be told apart. Rename one of them in Zoho.` });
  }

  // Chain of names from the account up to its top-level parent.
  const chain = (a: ZohoAccount): string[] => {
    const out: string[] = [];
    let cur: ZohoAccount | undefined = a;
    for (let i = 0; cur && i < 10; i++) {
      out.push(cur.account_name);
      cur = cur.parent_account_id ? byId.get(cur.parent_account_id) : undefined;
    }
    return out;
  };

  const nameSet = (names: string[]) => new Set(names.map(norm));
  const streamSets: [Stream, Set<string>][] = (["programme", "workshop", "other"] as Stream[]).map((s) => [s, nameSet(mapping.revenue[s].accounts)]);
  const groupSets = mapping.groups.map((gr) => ({ gr, set: nameSet(gr.accounts) }));
  const taxSet = nameSet(mapping.taxAccounts);
  const capitalSet = nameSet(mapping.founderCapitalAccounts);
  const catchAll = mapping.groups.find((x) => x.catchAll) ?? mapping.groups[mapping.groups.length - 1];

  for (const { gr, set } of groupSets) for (const n of set) if (!byName.has(n)) notes.push({ level: "warn", text: `Mapping lists account "${n}" under "${gr.label}", but no such account exists in Zoho.` });

  const bucketOf = (a: ZohoAccount): Bucket => {
    const names = chain(a);
    if (INCOME_TYPES.has(a.account_type) || streamSets.some(([, set]) => set.has(norm(a.account_name)))) {
      for (const n of names) for (const [stream, set] of streamSets) if (set.has(norm(n))) return { kind: "revenue", stream, matchedOn: n };
      return { kind: "revenue", stream: "other", matchedOn: "(any other income account)" };
    }
    if (EXPENSE_TYPES.has(a.account_type)) {
      for (const n of names) {
        if (taxSet.has(norm(n))) return { kind: "expense", groupId: "taxes", costType: "tax", tags: [], matchedOn: n };
        const hit = groupSets.find(({ set }) => set.has(norm(n)));
        if (hit) return { kind: "expense", groupId: hit.gr.id, costType: hit.gr.type, tags: hit.gr.tags ?? [], matchedOn: n };
      }
      return { kind: "expense", groupId: catchAll.id, costType: catchAll.type, tags: catchAll.tags ?? [], matchedOn: "(unmapped → Misc)" };
    }
    if (names.some((n) => capitalSet.has(norm(n)))) return { kind: "capital", matchedOn: a.account_name };
    return { kind: "other", matchedOn: "(not revenue, expense or founder capital)" };
  };

  const bankSet = nameSet(mapping.bankAccounts);
  const cardSet = nameSet(mapping.founderCardAccounts);
  const programmeAccount = raw.accounts.find((a) => norm(a.account_name) === norm(mapping.revenue.programme.accounts[0] ?? "")) ?? null;

  const txns: Txn[] = [];
  const unknownOffsets = new Map<string, number>();
  for (const t of raw.bankTransactions) {
    const paidVia = bankSet.has(norm(t.account_name)) ? "bank" : cardSet.has(norm(t.account_name)) ? "founder_card" : "other";
    const signedIn = t.debit_or_credit === "debit" ? t.amount : -t.amount; // money into the paying account
    const base = {
      id: t.transaction_id,
      date: t.date,
      paidAccount: t.account_name,
      paidVia,
      bankEffect: paidVia === "bank" ? signedIn : 0,
      payee: t.payee ?? "",
      description: t.description ?? "",
      customerId: t.customer_id ?? "",
      zohoType: t.transaction_type,
    } as const;

    // Customer payments carry no offset account in the bank feed: they are receipts held
    // against the customer (Unearned Revenue / Sales), i.e. programme revenue.
    let acct: ZohoAccount | null = null;
    if (!t.offset_account_name && t.transaction_type === "customer_payment") acct = programmeAccount;
    else acct = byName.get(norm(t.offset_account_name))?.[0] ?? null;

    if (!acct) {
      unknownOffsets.set(t.offset_account_name || "(blank)", (unknownOffsets.get(t.offset_account_name || "(blank)") ?? 0) + 1);
      txns.push({ ...base, kind: "other", amount: Math.abs(signedIn), account: t.offset_account_name || "(blank)", accountPath: t.offset_account_name || "(blank)", tags: [] });
      continue;
    }
    const b = bucketOf(acct);
    const path = chain(acct).reverse().join(" > ");
    if (b.kind === "revenue") txns.push({ ...base, kind: "revenue", amount: signedIn, account: acct.account_name, accountPath: path, stream: b.stream, tags: [] });
    else if (b.kind === "expense") txns.push({ ...base, kind: "expense", amount: -signedIn, account: acct.account_name, accountPath: path, groupId: b.groupId, costType: b.costType, tags: b.tags });
    else if (b.kind === "capital") txns.push({ ...base, kind: "capital", amount: signedIn, account: acct.account_name, accountPath: path, tags: [] });
    else txns.push({ ...base, kind: "other", amount: signedIn, account: acct.account_name, accountPath: path, tags: [] });
  }
  txns.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : 1));

  // ---- Settings view: where every income / expense account lands ----
  const used = new Set(txns.map((t) => norm(t.account)));
  const labelOf = (b: Bucket) =>
    b.kind === "revenue" ? `Revenue · ${mapping.revenue[b.stream].label}`
    : b.kind === "expense" ? (b.costType === "tax" ? "Taxes paid" : `${b.costType === "fixed" ? "Fixed" : "Variable"} · ${mapping.groups.find((x) => x.id === b.groupId)?.label ?? b.groupId}`)
    : b.kind === "capital" ? "Founder capital (bank transfers)"
    : "Not classified";
  const accountRows: AccountRow[] = raw.accounts
    .filter((a) => INCOME_TYPES.has(a.account_type) || EXPENSE_TYPES.has(a.account_type) || used.has(norm(a.account_name)))
    .map((a) => {
      const b = bucketOf(a);
      return { account: a.account_name, path: chain(a).reverse().join(" > "), zohoType: a.account_type, bucket: labelOf(b), balance: a.current_balance ?? 0, matchedOn: b.matchedOn };
    });

  // ---- Data quality ----
  for (const [name, n] of unknownOffsets) notes.push({ level: "warn", text: `${n} transaction(s) post to "${name}", which is not in the Chart of Accounts. They are excluded from revenue and expenses.` });
  const other = txns.filter((t) => t.kind === "other");
  if (other.length) notes.push({ level: "warn", text: `${other.length} transaction(s) are neither revenue, expense nor founder capital (e.g. transfers or liabilities). They affect the bank balance only.` });
  const otherPaid = txns.filter((t) => t.kind === "expense" && t.paidVia === "other");
  if (otherPaid.length) {
    const accts = [...new Set(otherPaid.map((t) => t.paidAccount))].join(", ");
    const total = otherPaid.reduce((s, t) => s + t.amount, 0);
    notes.push({ level: "warn", text: `${otherPaid.length} expense(s) totalling ₹${Math.round(total).toLocaleString("en-IN")} were paid from "${accts}", which is neither the company bank nor the founder's card. They count in Total Expenses but not in Capital Invested or Cash in Bank. Add the account to bankAccounts or founderCardAccounts in config/mapping.json.` });
  }
  const unc = raw.bankAccounts.reduce((s, b) => s + b.uncategorized_transactions, 0);
  if (unc) notes.push({ level: "warn", text: `${unc} bank feed transaction(s) are still uncategorised in Zoho and are not in any figure here.` });
  if (raw.counts.journals) notes.push({ level: "warn", text: `${raw.counts.journals} manual journal(s) exist in Zoho. Journals that do not touch a bank or card account are not included.` });
  if (raw.counts.bills) notes.push({ level: "warn", text: `${raw.counts.bills} vendor bill(s) exist in Zoho. The dashboard is on cash basis, so unpaid bills are not included.` });
  if (raw.counts.draftInvoices) notes.push({ level: "info", text: `${raw.counts.draftInvoices} invoice(s) are in draft in Zoho. Revenue is counted from payments received, not from invoices.` });
  notes.push({ level: "info", text: "All figures are as booked in Zoho Books on cash basis. Zoho currently holds no GST split, so amounts include any GST that was paid or collected." });

  const gstNames = nameSet([...mapping.gst.outputAccounts, ...mapping.gst.inputAccounts]);
  const outSet = nameSet(mapping.gst.outputAccounts);
  // Leaf GST accounts only, so a parent's rolled-up balance is never double counted.
  const gstAccounts = raw.accounts
    .filter((a) => chain(a).some((n) => gstNames.has(norm(n))))
    .filter((a) => !raw.accounts.some((c) => c.parent_account_id === a.account_id));
  const sumIf = (pred: (a: ZohoAccount) => boolean) => gstAccounts.filter(pred).reduce((s, a) => s + (a.current_balance ?? 0), 0);
  const isOut = (a: ZohoAccount) => chain(a).some((n) => outSet.has(norm(n)));

  const computed = new Map<string, number>();
  for (const t of raw.bankTransactions) computed.set(t.account_name, (computed.get(t.account_name) ?? 0) + (t.debit_or_credit === "debit" ? t.amount : -t.amount));
  const bankCheck = raw.bankAccounts
    .filter((b) => computed.has(b.account_name))
    .map((b) => ({ account: b.account_name, zoho: Math.abs(b.balance), computed: Math.abs(computed.get(b.account_name) ?? 0) }));
  for (const c of bankCheck) if (Math.abs(c.zoho - c.computed) > 1) notes.push({ level: "warn", text: `Balance of "${c.account}" in Zoho (₹${Math.round(c.zoho).toLocaleString("en-IN")}) differs from the sum of its transactions (₹${Math.round(c.computed).toLocaleString("en-IN")}). There may be an opening balance or transactions the API did not return.` });

  return {
    txns,
    accountRows,
    dq: {
      notes,
      gst: { output: sumIf(isOut), input: sumIf((a) => !isOut(a)), accounts: gstAccounts.map((a) => ({ name: a.account_name, balance: a.current_balance ?? 0 })) },
      bankCheck,
    },
  };
}
