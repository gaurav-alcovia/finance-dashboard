// Pulls Zoho once and prints a summary. Usage: npm run sync  (reads .env.local)
import fs from "node:fs";
for (const f of [".env.local", ".env"]) {
  if (!fs.existsSync(f)) continue;
  for (const line of fs.readFileSync(f, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const { buildDataset } = await import("../src/lib/dataset");
const { monthly } = await import("../src/lib/metrics");
const d = await buildDataset(true);
console.log(`Synced ${d.org.name}: ${d.txns.length} transactions at ${d.syncedAt}`);
const m = monthly(d);
for (const k of Object.keys(m).sort().slice(-6)) {
  const x = m[k];
  console.log(k, "revenue", Math.round(x.revenue.total), "expenses", Math.round(x.expenses.total), "bank", Math.round(x.bankClose));
}
console.log("Data-quality notes:");
for (const n of d.dq.notes) console.log(` [${n.level}] ${n.text}`);
