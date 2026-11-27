import type { AopMonth } from "./types";

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const num = (s: string | undefined) => {
  const n = Number((s ?? "").replace(/[₹,\s]/g, ""));
  return Number.isFinite(n) && (s ?? "").trim() !== "" ? n : undefined;
};

/**
 * Parses the AOP sheet layout: a "Year" row, a "Months" row (month names from column B),
 * then one row per line item. `rowLabels` maps our keys to the label in column A.
 */
export function parseAopCsv(text: string, rowLabels: Record<string, string>): Record<string, AopMonth> {
  const rows = parseCsv(text);
  const yearRow = rows.find((r) => r[0]?.trim().toLowerCase() === "year");
  const monthRow = rows.find((r) => r[0]?.trim().toLowerCase() === "months");
  if (!yearRow || !monthRow) throw new Error("AOP sheet: could not find the 'Year' and 'Months' rows");
  let year = Number(yearRow.slice(1).find((c) => /^\d{4}$/.test(c.trim())));
  const keys: (string | null)[] = [null];
  let prev = -1;
  for (let c = 1; c < monthRow.length; c++) {
    const m = MONTHS.indexOf(monthRow[c].trim().toLowerCase());
    if (m < 0) { keys.push(null); continue; }
    if (prev >= 0 && m < prev) year++;
    prev = m;
    keys.push(`${year}-${String(m + 1).padStart(2, "0")}`);
  }
  const out: Record<string, AopMonth> = {};
  for (const [field, label] of Object.entries(rowLabels)) {
    const row = rows.find((r) => r[0]?.trim().toLowerCase() === label.trim().toLowerCase());
    if (!row) continue;
    keys.forEach((k, c) => {
      const v = num(row[c]);
      if (k && v !== undefined) (out[k] ??= {})[field as keyof AopMonth] = v;
    });
  }
  if (!Object.keys(out).length) throw new Error("AOP sheet: no target rows matched the labels in config/aop.json");
  return out;
}

export async function loadAop(config: { benchmarkFrom: string; rows: Record<string, string>; months: Record<string, AopMonth> }) {
  const url = process.env.AOP_SHEET_CSV_URL;
  if (url) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return { benchmarkFrom: config.benchmarkFrom, months: parseAopCsv(await res.text(), config.rows), live: true, error: undefined as string | undefined };
    } catch (e: any) {
      return { benchmarkFrom: config.benchmarkFrom, months: config.months, live: false, error: `Live AOP sheet could not be read (${e.message}); using the saved snapshot.` };
    }
  }
  return { benchmarkFrom: config.benchmarkFrom, months: config.months, live: false, error: undefined as string | undefined };
}
