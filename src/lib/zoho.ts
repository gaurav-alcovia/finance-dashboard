// Server-only Zoho Books client: refresh-token auth, pagination, rate-limit handling.
const env = (k: string, d?: string) => {
  const v = process.env[k] ?? d;
  if (!v) throw new Error(`Missing environment variable ${k}`);
  return v;
};

let cached: { token: string; expiresAt: number } | null = null;
let inflight: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: env("ZOHO_CLIENT_ID"),
    client_secret: env("ZOHO_CLIENT_SECRET"),
    refresh_token: env("ZOHO_REFRESH_TOKEN"),
  });
  const res = await fetch(`${env("ZOHO_ACCOUNTS_URL", "https://accounts.zoho.in")}/oauth/v2/token`, {
    method: "POST",
    body,
    cache: "no-store",
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) {
    throw new Error(`Zoho token refresh failed (${res.status}): ${json.error ?? "no access_token returned"}`);
  }
  cached = { token: json.access_token, expiresAt: Date.now() + (Number(json.expires_in ?? 3600) - 120) * 1000 };
  return cached.token;
}

async function accessToken(force = false): Promise<string> {
  if (!force && cached && cached.expiresAt > Date.now()) return cached.token;
  if (!inflight) inflight = refreshAccessToken().finally(() => (inflight = null));
  return inflight;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function zohoGet(path: string, query: Record<string, string | number> = {}): Promise<any> {
  const params = new URLSearchParams({ organization_id: env("ZOHO_ORGANIZATION_ID") });
  for (const [k, v] of Object.entries(query)) params.set(k, String(v));
  const url = `${env("ZOHO_API_DOMAIN", "https://www.zohoapis.in")}/books/v3/${path}?${params}`;

  let lastError = "";
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(url, {
      headers: { Authorization: `Zoho-oauthtoken ${await accessToken(attempt > 0 && lastError === "401")}` },
      cache: "no-store",
    });
    if (res.ok) return res.json();
    lastError = String(res.status);
    if (res.status === 401) continue; // token expired early: force a refresh and retry
    if (res.status === 429 || res.status >= 500) {
      // Zoho Books allows ~100 requests/minute per organisation; back off and retry.
      const retryAfter = Number(res.headers.get("retry-after"));
      await sleep(retryAfter > 0 ? retryAfter * 1000 : 2000 * 2 ** attempt);
      continue;
    }
    const text = await res.text().catch(() => "");
    throw new Error(`Zoho ${path} failed (${res.status}): ${text.slice(0, 200)}`);
  }
  throw new Error(`Zoho ${path} failed after retries (last status ${lastError})`);
}

/** Fetch every page of a list endpoint. */
export async function zohoList<T = any>(path: string, key: string, query: Record<string, string | number> = {}): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; page <= 500; page++) {
    const json = await zohoGet(path, { ...query, page, per_page: 200 });
    out.push(...((json[key] as T[]) ?? []));
    if (!json.page_context?.has_more_page) break;
  }
  return out;
}
