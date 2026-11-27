/**
 * Optional Meta Ads connection. When META_ACCESS_TOKEN and META_AD_ACCOUNT_ID are set,
 * returns daily ad spend (YYYY-MM-DD → amount in the ad account's currency).
 * NOTE: written against the Marketing API insights endpoint but not yet run against a
 * live ad account. Until it is configured the dashboard uses the Zoho "META" account.
 */
export async function loadMetaDaily(since: string): Promise<{ daily: Record<string, number> | null; error?: string }> {
  const token = process.env.META_ACCESS_TOKEN;
  const account = process.env.META_AD_ACCOUNT_ID?.replace(/^act_/, "");
  if (!token || !account) return { daily: null };
  try {
    const until = new Date().toISOString().slice(0, 10);
    const params = new URLSearchParams({
      fields: "spend",
      time_increment: "1",
      level: "account",
      limit: "500",
      time_range: JSON.stringify({ since, until }),
      access_token: token,
    });
    let url: string | null = `https://graph.facebook.com/${process.env.META_API_VERSION ?? "v21.0"}/act_${account}/insights?${params}`;
    const daily: Record<string, number> = {};
    for (let i = 0; url && i < 50; i++) {
      const res: Response = await fetch(url, { cache: "no-store" });
      const json: any = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
      for (const row of json.data ?? []) daily[row.date_start] = (daily[row.date_start] ?? 0) + Number(row.spend || 0);
      url = json.paging?.next ?? null;
    }
    return { daily };
  } catch (e: any) {
    return { daily: null, error: `Meta Ads could not be read (${e.message}); using ad spend recorded in Zoho.` };
  }
}
