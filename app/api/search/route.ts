import { NextRequest, NextResponse } from "next/server";
import { getEnabledAdapters } from "@/lib/adapters";
import type { SiteEvent } from "@/lib/adapters/types";
import { mergeEvents } from "@/lib/matching";

export const dynamic = "force-dynamic";

// World Cup 2026 tournament window
const TOURNAMENT = { from: "2026-06-11T00:00:00Z", to: "2026-07-20T23:59:59Z" };

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ error: "Missing query parameter q" }, { status: 400 });

  const adapters = getEnabledAdapters();
  if (!adapters.length) {
    return NextResponse.json(
      { error: "No ticket-site API keys configured. Set SEATGEEK_CLIENT_ID and/or TICKETMASTER_API_KEY in .env." },
      { status: 503 },
    );
  }

  const results = await Promise.allSettled(adapters.map((a) => a.searchEvents(q, TOURNAMENT)));
  const events: SiteEvent[] = [];
  const siteErrors: string[] = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") events.push(...r.value);
    else siteErrors.push(`${adapters[i].site}: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`);
  });

  return NextResponse.json({ candidates: mergeEvents(events), siteErrors });
}
