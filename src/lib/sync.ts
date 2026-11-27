import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { zohoGet, zohoList } from "./zoho";
import type { RawData, ZohoAccount, ZohoBankTxn } from "./types";

const g = globalThis as unknown as { __fdRaw?: RawData; __fdSync?: Promise<RawData> | null };

function cacheFile(): string {
  const dir = process.env.CACHE_DIR || path.join(process.cwd(), ".cache");
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.accessSync(dir, fs.constants.W_OK);
    return path.join(dir, "zoho.json");
  } catch {
    // Read-only filesystem (e.g. serverless): fall back to the temp directory.
    return path.join(os.tmpdir(), "alcovia-finance-zoho.json");
  }
}

async function pull(): Promise<RawData> {
  const [org, accounts, bankTransactions, bankAccounts, journals, bills, invoices, creditNotes] = await Promise.all([
    zohoGet("organizations"),
    zohoList<ZohoAccount>("chartofaccounts", "chartofaccounts", { showbalance: "true" }),
    // Every posting in the books (expenses, customer payments, other income, owner
    // contributions) goes through a bank or card account, so this list is the full ledger.
    zohoList<ZohoBankTxn>("banktransactions", "banktransactions"),
    zohoList<any>("bankaccounts", "bankaccounts"),
    zohoList<any>("journals", "journals"),
    zohoList<any>("bills", "bills"),
    zohoList<any>("invoices", "invoices"),
    zohoList<any>("creditnotes", "creditnotes"),
  ]);
  const orgId = process.env.ZOHO_ORGANIZATION_ID!;
  const me = (org.organizations ?? []).find((o: any) => String(o.organization_id) === orgId);
  return {
    syncedAt: new Date().toISOString(),
    org: { id: orgId, name: me?.name ?? "" },
    accounts: accounts.map((a) => ({
      account_id: a.account_id,
      account_name: a.account_name,
      account_type: a.account_type,
      parent_account_id: a.parent_account_id,
      parent_account_name: a.parent_account_name,
      current_balance: a.current_balance,
      is_active: a.is_active,
      depth: a.depth,
    })),
    bankTransactions: bankTransactions.map((t) => ({
      transaction_id: t.transaction_id,
      date: t.date,
      amount: Number(t.amount) || 0,
      transaction_type: t.transaction_type,
      account_name: t.account_name,
      offset_account_name: t.offset_account_name ?? "",
      debit_or_credit: t.debit_or_credit,
      payee: t.payee ?? "",
      description: t.description ?? "",
      customer_id: t.customer_id ?? "",
      reference_number: t.reference_number ?? "",
    })),
    bankAccounts: bankAccounts.map((b: any) => ({
      account_name: b.account_name,
      account_type: b.account_type,
      balance: Number(b.balance) || 0,
      uncategorized_transactions: Number(b.uncategorized_transactions) || 0,
    })),
    counts: {
      journals: journals.length,
      bills: bills.length,
      invoices: invoices.length,
      draftInvoices: invoices.filter((i: any) => i.status === "draft").length,
      creditNotes: creditNotes.length,
    },
  };
}

function readDisk(): RawData | null {
  try {
    return JSON.parse(fs.readFileSync(cacheFile(), "utf8")) as RawData;
  } catch {
    return null;
  }
}

/** Returns cached Zoho data; pulls fresh data when forced, missing, or older than CACHE_TTL_HOURS. */
export async function getRaw(force = false): Promise<RawData> {
  const ttlMs = Number(process.env.CACHE_TTL_HOURS ?? 24) * 3600_000;
  const current = g.__fdRaw ?? readDisk();
  if (current) g.__fdRaw = current;
  const stale = !current || (ttlMs > 0 && Date.now() - Date.parse(current.syncedAt) > ttlMs);
  if (!force && current && !stale) return current;

  if (!g.__fdSync) {
    g.__fdSync = pull()
      .then((raw) => {
        g.__fdRaw = raw;
        try {
          fs.writeFileSync(cacheFile(), JSON.stringify(raw));
        } catch {
          /* cache stays in memory only */
        }
        return raw;
      })
      .finally(() => (g.__fdSync = null));
  }
  try {
    return await g.__fdSync;
  } catch (e) {
    if (current && !force) return current; // serve stale data rather than fail
    throw e;
  }
}
