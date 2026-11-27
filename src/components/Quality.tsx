"use client";
import type { Dataset } from "@/lib/types";
import { downloadCsv, inrFull } from "@/lib/format";
import { exportTxns, TxnTable } from "./Drill";

export function Quality({ d }: { d: Dataset }) {
  const misc = d.txns.filter((t) => t.kind === "expense" && t.groupId === "misc");
  const unclassified = d.txns.filter((t) => t.kind === "other");
  const byAccount = new Map<string, { path: string; n: number; total: number }>();
  for (const t of misc) {
    const cur = byAccount.get(t.account) ?? { path: t.accountPath, n: 0, total: 0 };
    cur.n++; cur.total += t.amount;
    byAccount.set(t.account, cur);
  }
  return (
    <>
      <section className="panel">
        <h3>Checks</h3>
        <ul className="notes">
          {d.dq.notes.map((n, i) => <li key={i} className={n.level}><b>{n.level === "warn" ? "⚠ Needs review" : "ℹ Note"}</b> {n.text}</li>)}
        </ul>
      </section>

      <section className="grid2">
        <div className="panel">
          <h3>GST (pass-through, not revenue or cost)</h3>
          <div className="table-wrap"><table>
            <thead><tr><th>Zoho account</th><th className="r">Balance</th></tr></thead>
            <tbody>
              {d.dq.gst.accounts.map((a) => <tr key={a.name}><td>{a.name}</td><td className="r num">{inrFull(a.balance)}</td></tr>)}
              <tr className="total-row"><td>GST collected (output)</td><td className="r num">{inrFull(d.dq.gst.output)}</td></tr>
              <tr className="total-row"><td>GST paid (input)</td><td className="r num">{inrFull(d.dq.gst.input)}</td></tr>
            </tbody>
          </table></div>
          {d.dq.gst.output === 0 && d.dq.gst.input === 0 && <p className="muted small-note">No GST is recorded in Zoho Books, so these totals are zero and all amounts on this dashboard are as booked.</p>}
        </div>
        <div className="panel">
          <h3>Bank and card reconciliation</h3>
          <div className="table-wrap"><table>
            <thead><tr><th>Account</th><th className="r">Balance in Zoho</th><th className="r">Sum of transactions</th><th>Status</th></tr></thead>
            <tbody>{d.dq.bankCheck.map((b) => <tr key={b.account}><td>{b.account}</td><td className="r num">{inrFull(b.zoho)}</td><td className="r num">{inrFull(b.computed)}</td><td>{Math.abs(b.zoho - b.computed) <= 1 ? "✓ Matches" : "⚠ Differs"}</td></tr>)}</tbody>
          </table></div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h3>Unmapped → Misc ({misc.length} transactions, {inrFull(misc.reduce((s, t) => s + t.amount, 0))})</h3>
          <button className="btn small" disabled={!misc.length} onClick={() => exportTxns(d, "Unmapped to Misc", misc)}>Export CSV</button>
        </div>
        <p className="muted">Expenses whose Zoho account is not listed under any cost head. To remap one, add its account name to the right group in <code>config/mapping.json</code>.</p>
        {byAccount.size > 0 && (
          <div className="table-wrap"><table>
            <thead><tr><th>Zoho account</th><th>Account path</th><th className="r">Transactions</th><th className="r">Total</th></tr></thead>
            <tbody>{[...byAccount].sort((a, b) => b[1].total - a[1].total).map(([name, v]) => <tr key={name}><td>{name}</td><td>{v.path}</td><td className="r num">{v.n}</td><td className="r num">{inrFull(v.total)}</td></tr>)}</tbody>
          </table></div>
        )}
        <TxnTable d={d} txns={misc} limit={100} />
      </section>

      {unclassified.length > 0 && (
        <section className="panel">
          <div className="panel-head"><h3>Not classified ({unclassified.length})</h3><button className="btn small" onClick={() => exportTxns(d, "Not classified", unclassified)}>Export CSV</button></div>
          <p className="muted">Transactions that are not revenue, expense or founder capital. They change the bank balance only.</p>
          <TxnTable d={d} txns={unclassified} limit={100} />
        </section>
      )}
    </>
  );
}

export function MappingView({ d }: { d: Dataset }) {
  const rows = [...d.accountRows].sort((a, b) => a.bucket.localeCompare(b.bucket) || a.path.localeCompare(b.path));
  return (
    <section className="panel">
      <div className="panel-head">
        <h3>Zoho account → dashboard group</h3>
        <button className="btn small" onClick={() => downloadCsv("Account mapping", ["Dashboard group", "Zoho account", "Account path", "Zoho type", "Matched on", "Zoho balance"], rows.map((r) => [r.bucket, r.account, r.path, r.zohoType, r.matchedOn, r.balance.toFixed(2)]))}>Export CSV</button>
      </div>
      <p className="muted">Each account is matched by its own name, then by each parent going up the tree, so anything new added under a listed account rolls up automatically. To change a mapping, edit <code>config/mapping.json</code> and redeploy.</p>
      <div className="table-wrap"><table>
        <thead><tr><th>Dashboard group</th><th>Zoho account</th><th>Account path</th><th>Matched on</th><th className="r">Zoho balance</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.path} className={r.matchedOn.startsWith("(unmapped") ? "warn-row" : ""}><td>{r.bucket}</td><td>{r.account}</td><td>{r.path}</td><td>{r.matchedOn}</td><td className="r num">{inrFull(r.balance)}</td></tr>)}</tbody>
      </table></div>
    </section>
  );
}
