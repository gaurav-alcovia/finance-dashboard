// Single shared password. The cookie holds a hash, never the password itself.
export const COOKIE = "fd_session";

export async function sessionToken(): Promise<string | null> {
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) return null;
  const data = new TextEncoder().encode(`${password}|${process.env.SESSION_SECRET ?? "alcovia-finance"}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
