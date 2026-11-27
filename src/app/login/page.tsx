"use client";
import { useState } from "react";

export default function Login() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <main className="login">
      <form
        className="card"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          const res = await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
          if (res.ok) window.location.href = "/";
          else { setError("Wrong password"); setBusy(false); }
        }}
      >
        <h1>Alcovia Finance</h1>
        <label htmlFor="pw">Password</label>
        <input id="pw" type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn primary" disabled={busy || !password}>{busy ? "Signing in…" : "Sign in"}</button>
      </form>
    </main>
  );
}
