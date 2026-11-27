"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Dataset } from "@/lib/types";
import { fyLabel, fyMonths, fyOf, monthly, ym } from "@/lib/metrics";
import { monthLabel } from "@/lib/format";
import { DrillModal, type DrillSpec } from "@/components/Drill";
import { Ytm } from "@/components/Ytm";
import { Mtd } from "@/components/Mtd";
import { MappingView, Quality } from "@/components/Quality";

type Tab = "ytm" | "mtd" | "quality" | "mapping";
const TABS: [Tab, string][] = [["ytm", "Year to Month"], ["mtd", "Month to Day"], ["quality", "Data quality"], ["mapping", "Account mapping"]];

// Dates are handled in India time, matching Zoho Books.
const todayIST = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);

export function Dashboard({ snapshot }: { snapshot?: Dataset }) {
  const [d, setD] = useState<Dataset | null>(snapshot ?? null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>("ytm");
  const [fy, setFy] = useState<number | null>(null);
  const [month, setMonth] = useState("");
  const [mode, setMode] = useState<"month" | "ytd">("month");
  const [drill, setDrill] = useState<DrillSpec | null>(null);
  const today = useMemo(todayIST, []);

  const load = useCallback(async (refresh: boolean) => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/data", { method: refresh ? "POST" : "GET" });
      if (res.status === 401) { window.location.href = "/login"; return; }
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not load data");
      setD(json);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => { if (!snapshot) load(false); }, [load, snapshot]);

  const M = useMemo(() => (d ? monthly(d, ym(today)) : {}), [d, today]);
  const allMonths = useMemo(() => Object.keys(M).sort(), [M]);
  const years = useMemo(() => (d ? [...new Set(allMonths.map((m) => fyOf(m, d.fyStartMonth)))].sort((a, b) => b - a) : []), [allMonths, d]);
  useEffect(() => {
    if (!d || fy != null || !allMonths.length) return;
    const latest = allMonths[allMonths.length - 1];
    setFy(fyOf(latest, d.fyStartMonth));
    setMonth(latest);
  }, [d, fy, allMonths]);

  if (error && !d) return <main className="center"><div className="panel"><h2>Could not load the dashboard</h2><p className="error">{error}</p><button className="btn primary" onClick={() => load(false)}>Try again</button></div></main>;
  if (!d || fy == null) return <main className="center"><p className="muted">Loading Zoho Books data…</p></main>;

  const monthsInFy = fyMonths(fy, d.fyStartMonth).filter((m) => allMonths.includes(m));
  const pickFy = (y: number) => {
    setFy(y);
    const ms = fyMonths(y, d.fyStartMonth).filter((m) => allMonths.includes(m));
    setMonth(ms[ms.length - 1] ?? "");
  };

  return (
    <main>
      <header className="top">
        <div>
          <h1>Alcovia Finance</h1>
          <p className="muted">{d.org.name} · Source: Zoho Books, cash basis, amounts as booked</p>
        </div>
        <div className="sync">
          <span className="muted">{snapshot ? "Snapshot taken" : "Last synced"} {new Date(d.syncedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" })} IST</span>
          {!snapshot && <button className="btn primary" onClick={() => load(true)} disabled={busy}>{busy ? "Refreshing…" : "Refresh"}</button>}
          {!snapshot && <button className="btn" onClick={async () => { await fetch("/api/login", { method: "DELETE" }); window.location.href = "/login"; }}>Sign out</button>}
        </div>
      </header>
      {error && <p className="notice" role="alert">Refresh failed: {error}. Showing the last synced data.</p>}

      <nav className="bar">
        <div className="tabs" role="tablist">
          {TABS.map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? "on" : ""} onClick={() => setTab(id)}>{label}</button>)}
        </div>
        {(tab === "ytm" || tab === "mtd") && (
          <div className="filters">
            <label>Year<select value={fy} onChange={(e) => pickFy(Number(e.target.value))}>{years.map((y) => <option key={y} value={y}>{fyLabel(y, d.fyStartMonth)}</option>)}</select></label>
            <label>Month<select value={month} onChange={(e) => setMonth(e.target.value)}>{monthsInFy.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}</select></label>
            {tab === "ytm" && (
              <div className="seg" role="group" aria-label="Period">
                <button className={mode === "month" ? "on" : ""} aria-pressed={mode === "month"} onClick={() => setMode("month")}>Selected month</button>
                <button className={mode === "ytd" ? "on" : ""} aria-pressed={mode === "ytd"} onClick={() => setMode("ytd")}>Year-to-date</button>
              </div>
            )}
          </div>
        )}
      </nav>

      {tab === "ytm" && month && <Ytm d={d} M={M} fy={fy} month={month} mode={mode} onDrill={setDrill} />}
      {tab === "mtd" && month && <Mtd d={d} month={month} today={today} onDrill={setDrill} />}
      {tab === "quality" && <Quality d={d} />}
      {tab === "mapping" && <MappingView d={d} />}

      <DrillModal d={d} spec={drill} onClose={() => setDrill(null)} />
    </main>
  );
}
