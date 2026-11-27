// Builds one self-contained HTML file with the latest Zoho data baked in.
// Usage: npm run export   → dist/alcovia-finance-dashboard.html (open by double-click)
import fs from "node:fs";
import { build } from "esbuild";

for (const f of [".env.local", ".env"]) {
  if (!fs.existsSync(f)) continue;
  for (const line of fs.readFileSync(f, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const { buildDataset } = await import("../src/lib/dataset");
const data = await buildDataset(true);

const out = await build({
  entryPoints: ["src/standalone.tsx"],
  bundle: true, minify: true, write: false, format: "iife", target: "es2020", jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  logLevel: "error",
});
const js = out.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
const css = fs.readFileSync("src/app/globals.css", "utf8");
// "<" is escaped so no transaction text can close the script tag.
const json = JSON.stringify(data).replace(/</g, "\\u003c").replace(/[\u2028\u2029]/g, "");
const taken = new Date(data.syncedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Alcovia Finance · snapshot ${taken}</title>
<style>${css}</style>
</head>
<body>
<div id="root"></div>
<script>window.__DATA__=${json};</script>
<script>${js}</script>
</body>
</html>`;
fs.mkdirSync("dist", { recursive: true });
const file = "dist/alcovia-finance-dashboard.html";
fs.writeFileSync(file, html);
console.log(`Wrote ${file} (${(html.length / 1024).toFixed(0)} KB) with ${data.txns.length} transactions, snapshot ${taken} IST`);
