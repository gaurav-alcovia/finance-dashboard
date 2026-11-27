export type GroupDef = {
  id: string;
  label: string;
  type: "fixed" | "variable";
  team?: string;
  accounts: string[];
  tags?: string[];
  catchAll?: boolean;
};

export type Mapping = {
  fiscalYearStartMonth: number;
  bankAccounts: string[];
  founderCardAccounts: string[];
  founderCapitalAccounts: string[];
  revenue: Record<"programme" | "workshop" | "other", { label: string; accounts: string[] }>;
  taxAccounts: string[];
  gst: { outputAccounts: string[]; inputAccounts: string[] };
  groups: GroupDef[];
};

export type ZohoAccount = {
  account_id: string;
  account_name: string;
  account_type: string;
  parent_account_id?: string;
  parent_account_name?: string;
  current_balance?: number;
  is_active?: boolean;
  depth?: number;
};

export type ZohoBankTxn = {
  transaction_id: string;
  date: string;
  amount: number;
  transaction_type: string;
  account_name: string;
  offset_account_name: string;
  debit_or_credit: "debit" | "credit";
  payee?: string;
  description?: string;
  customer_id?: string;
  reference_number?: string;
};

export type RawData = {
  syncedAt: string;
  org: { id: string; name: string };
  accounts: ZohoAccount[];
  bankTransactions: ZohoBankTxn[];
  bankAccounts: { account_name: string; account_type: string; balance: number; uncategorized_transactions: number }[];
  counts: { journals: number; bills: number; invoices: number; draftInvoices: number; creditNotes: number };
};

export type Stream = "programme" | "workshop" | "other";

export type Txn = {
  id: string;
  date: string; // YYYY-MM-DD
  kind: "revenue" | "expense" | "capital" | "other";
  amount: number; // positive = revenue / expense / capital in; refunds are negative
  account: string;
  accountPath: string; // "Parent > Child > Account"
  paidAccount: string;
  paidVia: "bank" | "founder_card" | "other";
  bankEffect: number; // signed effect on the company bank balance
  stream?: Stream;
  groupId?: string;
  costType?: "fixed" | "variable" | "tax";
  tags: string[];
  payee: string;
  description: string;
  customerId: string;
  zohoType: string;
};

export type AopMonth = { revenue?: number; expenses?: number; fixed?: number; variable?: number; metaAds?: number; alcovians?: number };

export type ManualMonth = {
  uniqueAlcovians?: number | null;
  trialsEligible?: number | null;
  trialsConverted?: number | null;
  renewalsEligible?: number | null;
  renewalsDone?: number | null;
  workshopAttendees?: number | null;
  workshopConverted?: number | null;
  newCustomers?: number | null;
  adAttributedRevenue?: number | null;
  metaAdSpend?: number | null;
};

export type AccountRow = { account: string; path: string; zohoType: string; bucket: string; balance: number; matchedOn: string };

export type DataQuality = {
  notes: { level: "info" | "warn"; text: string }[];
  gst: { output: number; input: number; accounts: { name: string; balance: number }[] };
  bankCheck: { account: string; zoho: number; computed: number }[];
};

export type Dataset = {
  syncedAt: string;
  org: { id: string; name: string };
  fyStartMonth: number;
  txns: Txn[];
  groups: { id: string; label: string; type: "fixed" | "variable"; team?: string; tags: string[] }[];
  streams: Record<Stream, string>;
  accountRows: AccountRow[];
  aop: { benchmarkFrom: string; months: Record<string, AopMonth>; live: boolean };
  manual: Record<string, ManualMonth>;
  metaDaily: Record<string, number> | null;
  metaError?: string;
  dq: DataQuality;
};
