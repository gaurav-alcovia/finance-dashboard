import fs from "node:fs";
import path from "node:path";
import { classify } from "./classify";
import { getRaw } from "./sync";
import { loadAop } from "./aop";
import { loadMetaDaily } from "./meta";
import type { Dataset, Mapping } from "./types";

const readConfig = (name: string) => JSON.parse(fs.readFileSync(path.join(process.cwd(), "config", name), "utf8"));

export async function buildDataset(force = false): Promise<Dataset> {
  const mapping = readConfig("mapping.json") as Mapping;
  const raw = await getRaw(force);
  const { txns, accountRows, dq } = classify(raw, mapping);
  const aop = await loadAop(readConfig("aop.json"));
  const since = txns.length ? txns[0].date : new Date().toISOString().slice(0, 10);
  // Meta only returns ~37 months of history; clamp the start date.
  const floor = new Date(Date.now() - 36 * 30 * 86400_000).toISOString().slice(0, 10);
  const meta = await loadMetaDaily(since > floor ? since : floor);
  if (aop.error) dq.notes.push({ level: "warn", text: aop.error });
  if (meta.error) dq.notes.push({ level: "warn", text: meta.error });

  return {
    syncedAt: raw.syncedAt,
    org: raw.org,
    fyStartMonth: mapping.fiscalYearStartMonth,
    txns,
    groups: mapping.groups.map((g) => ({ id: g.id, label: g.label, type: g.type, team: g.team, tags: g.tags ?? [] })),
    streams: { programme: mapping.revenue.programme.label, workshop: mapping.revenue.workshop.label, other: mapping.revenue.other.label },
    accountRows,
    aop: { benchmarkFrom: aop.benchmarkFrom, months: aop.months, live: aop.live },
    manual: readConfig("manual-inputs.json").months ?? {},
    metaDaily: meta.daily,
    metaError: meta.error,
    dq,
  };
}
