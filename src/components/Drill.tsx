"use client";
import { useEffect, useMemo } from "react";
import type { Dataset, Txn } from "@/lib/types";
import { dateLabel, downloadCsv, inrFull } from "@/lib/format";

export type DrillSpec = { title: string; formula?: string; txns: Txn[]; note?: string };

const VIA: Record<Txn["paidVia"], string> = { bank: "Company bank", founder_card: "Founder card", other: "Other account" };
const KIND: Record<Txn["kind"], string> = { revenue: "Revenue", expense: "Expense", capital: "Founder transfer", other: "Other" };

export function bucketLabel(d: Dataset, t: Txn): string {
  if (t.kind === "revenue") return d.streams[t.stream ?? "other"];
  if (t.kind === "expense") return t.costType === "tax" ? "Taxes paid" : d.groups.find((g) => g.id === t.groupId)?.label ?? "";
  return KIND[t.kind];
}

export function exportTxns(d: Dataset, name: string, txns: Txn[]) {
  downloadCsv(
    name,
    ["Date", "Type", "Group", "Zoho account", "Account path", "Payee", "Description", "Paid from", "Paid via", "Amount (INR)", "Zoho transaction ID"],
    txns.map((t) => [t.date, KIND[t.kind], bucketLabel(d, t), t.account, t.accountPath, t.payee, t.description, t.paidAccount, VIA[t.paidVia], t.amount.toFixed(2), t.id]),
  );
}

export function TxnTable({ d, txns, limit = 400 }: { d: Dataset; txns: Txn[]; limit?: number }) {
  const sorted = useMemo(() => [...txns].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)), [txns]);
  if (!sorted.length) return <p className="muted pad">No transactions in Zoho for this selection.</p>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr><th>Date</th><th>Type</th><th>Group</th><th>Zoho account</th><th>Payee / description</th><th>Paid via</th><th className="r">Amount</th></tr>
        </thead>
        <tbody>
          {sorted.slice(0, limit).map((t) => (
            <tr key={t.id}>
              <td className="nowrap">{dateLabel(t.date)}</td>
              <td>{KIND[t.kind]}</td>
              <td>{bucketLabel(d, t)}</td>
              <td title={t.accountPath}>{t.account}</td>
              <td className="desc" title={t.description}>{t.payee || t.description || "—"}</td>
              <td className="nowrap">{VIA[t.paidVia]}</td>
              <td className="r num">{inrFull(t.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {sorted.length > limit && <p className="muted pad">Showing the latest {limit} of {sorted.length}. Export to see all.</p>}
    </div>
  );
}

export function DrillModal({ d, spec, onClose }: { d: Dataset; spec: DrillSpec | null; onClose: () => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  if (!spec) return null;
  const total = spec.txns.reduce((s, t) => s + t.amount, 0);
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={spec.title} onClick={(e) => e.stopPropagation()}>
        <header>
          <div>
            <h2>{spec.title}</h2>
            {spec.formula && <p className="muted">{spec.formula}</p>}
          </div>
          <button className="btn" onClick={onClose} aria-label="Close">Close</button>
        </header>
        {spec.note && <p className="notice">{spec.note}</p>}
        <div className="modal-bar">
          <span>{spec.txns.length} Zoho transaction{spec.txns.length === 1 ? "" : "s"} · sum {inrFull(total)}</span>
          <button className="btn" disabled={!spec.txns.length} onClick={() => exportTxns(d, spec.title, spec.txns)}>Export CSV</button>
        </div>
        <TxnTable d={d} txns={spec.txns} />
      </div>
    </div>
  );
}
