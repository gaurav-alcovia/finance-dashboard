import { NextResponse } from "next/server";
import { buildDataset } from "@/lib/dataset";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function respond(force: boolean) {
  try {
    return NextResponse.json(await buildDataset(force), { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Sync failed" }, { status: 500 });
  }
}

// GET serves the cached copy; POST is the manual "Refresh" button and re-pulls Zoho.
export const GET = () => respond(false);
export const POST = () => respond(true);
