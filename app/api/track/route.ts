import { NextRequest, NextResponse } from "next/server";
import { getDb, nowUtc } from "@/lib/db";
import { runPollOnce } from "@/lib/poller";

export const dynamic = "force-dynamic";

interface TrackEvent {
  site: string;
  siteEventId: string;
  url?: string;
  title?: string;
  venueName?: string;
  confidence?: number;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const { label, homeTeam, awayTeam, venue, city, kickoffUtc, events } = (body ?? {}) as {
    label?: string;
    homeTeam?: string;
    awayTeam?: string;
    venue?: string;
    city?: string;
    kickoffUtc?: string;
    events?: TrackEvent[];
  };
  if (!label || !kickoffUtc || !Array.isArray(events) || !events.length) {
    return NextResponse.json(
      { error: "Required: label, kickoffUtc, events[] with at least one site event" },
      { status: 400 },
    );
  }

  const db = getDb();
  let match = db
    .prepare(`SELECT id FROM matches WHERE label = ? AND kickoff_utc = ?`)
    .get(label, kickoffUtc) as { id: number } | undefined;
  if (!match) {
    const info = db
      .prepare(
        `INSERT INTO matches (home_team, away_team, label, venue, city, kickoff_utc)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(homeTeam ?? null, awayTeam ?? null, label, venue ?? null, city ?? null, kickoffUtc);
    match = { id: Number(info.lastInsertRowid) };
  }

  const upsert = db.prepare(
    `INSERT INTO event_mappings (match_id, site, site_event_id, site_url, raw_title, venue_name, match_confidence, last_seen_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(site, site_event_id) DO UPDATE SET
       match_id = excluded.match_id,
       site_url = excluded.site_url,
       raw_title = excluded.raw_title,
       venue_name = excluded.venue_name,
       match_confidence = excluded.match_confidence`,
  );
  const now = nowUtc();
  for (const e of events) {
    if (!e.site || !e.siteEventId) continue;
    upsert.run(match.id, e.site, e.siteEventId, e.url ?? null, e.title ?? null, e.venueName ?? null, e.confidence ?? null, now);
  }

  // Poll immediately so the detail page has data on first load
  const poll = await runPollOnce();
  return NextResponse.json({ matchId: match.id, poll });
}
