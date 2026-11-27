import { NextRequest, NextResponse } from "next/server";
import { COOKIE, sessionToken } from "@/lib/auth";

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname === "/login" || pathname === "/api/login") return NextResponse.next();

  const expected = await sessionToken();
  if (!expected) {
    // No password configured: open on a developer machine, closed anywhere else.
    if (process.env.NODE_ENV !== "production") return NextResponse.next();
    return new NextResponse("Set the DASHBOARD_PASSWORD environment variable to enable this dashboard.", { status: 503 });
  }
  if (req.cookies.get(COOKIE)?.value === expected) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  return NextResponse.redirect(new URL("/login", req.url));
}
