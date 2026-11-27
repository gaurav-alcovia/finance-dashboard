const full = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const two = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** ₹ with Indian lakh/crore units: ₹4,500 · ₹12.35 L · ₹1.24 Cr */
export function inr(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const sign = n < 0 ? "−" : "";
  const a = Math.abs(n);
  if (a >= 1e7) return `${sign}₹${two.format(a / 1e7)} Cr`;
  if (a >= 1e5) return `${sign}₹${two.format(a / 1e5)} L`;
  return `${sign}₹${full.format(Math.round(a))}`;
}
/** Full rupee amount with Indian digit grouping: ₹12,34,567 */
export function inrFull(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n < 0 ? "−" : ""}₹${full.format(Math.round(Math.abs(n)))}`;
}
export const pct = (n: number | null | undefined, digits = 1) => (n == null || !Number.isFinite(n) ? "—" : `${(n * 100).toFixed(digits)}%`);
export const num = (n: number | null | undefined, digits = 0) => (n == null || !Number.isFinite(n) ? "—" : n.toLocaleString("en-IN", { maximumFractionDigits: digits }));

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const monthLabel = (m: string) => `${MON[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
export const monthShort = (m: string) => `${MON[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`;
export const dateLabel = (d: string) => `${Number(d.slice(8, 10))} ${MON[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;

export function downloadCsv(filename: string, headers: string[], rows: (string | number | null | undefined)[][]) {
  const esc = (v: string | number | null | undefined) => {
    const s = v == null ? "" : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // BOM so Excel opens the file as UTF-8 (₹ and names render correctly).
  const body = "﻿" + [headers, ...rows].map((r) => r.map(esc).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([body], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
