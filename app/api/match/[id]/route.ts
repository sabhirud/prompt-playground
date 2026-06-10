import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { computeOptimalBuy, hoursBefore, type SnapshotPoint } from "@/lib/pricing";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const matchId = Number(id);
  if (!Number.isInteger(matchId)) {
    return NextResponse.json({ error: "Invalid match id" }, { status: 400 });
  }

  const db = getDb();
  const match = db
    .prepare(
      `SELECT id, label, home_team AS homeTeam, away_team AS awayTeam,
              venue, city, kickoff_utc AS kickoffUtc, created_at AS createdAt
       FROM matches WHERE id = ?`,
    )
    .get(matchId) as Record<string, unknown> | undefined;
  if (!match) return NextResponse.json({ error: "Match not found" }, { status: 404 });

  const kickoffUtc = match.kickoffUtc as string;

  const sites = db
    .prepare(
      `SELECT em.id AS mappingId, em.site, em.site_url AS url, em.raw_title AS title,
              em.venue_name AS venueName, em.match_confidence AS confidence,
              ps.taken_at_utc AS takenAtUtc, ps.lowest_price AS lowest, ps.highest_price AS highest,
              ps.average_price AS average, ps.median_price AS median,
              ps.listing_count AS listingCount, ps.decent_price AS decentPrice,
              ps.decent_confidence AS decentConfidence, ps.currency
       FROM event_mappings em
       LEFT JOIN price_snapshots ps ON ps.id = (
         SELECT id FROM price_snapshots
         WHERE mapping_id = em.id ORDER BY taken_at_utc DESC, id DESC LIMIT 1
       )
       WHERE em.match_id = ?
       ORDER BY em.site`,
    )
    .all(matchId);

  const snapshots = db
    .prepare(
      `SELECT em.site, ps.taken_at_utc AS takenAtUtc, ps.decent_price AS decentPrice
       FROM price_snapshots ps
       JOIN event_mappings em ON em.id = ps.mapping_id
       WHERE em.match_id = ?
       ORDER BY ps.taken_at_utc`,
    )
    .all(matchId) as SnapshotPoint[];

  const series = snapshots.map((s) => ({
    ...s,
    hoursBeforeKickoff: hoursBefore(kickoffUtc, s.takenAtUtc),
  }));

  return NextResponse.json({
    match,
    sites,
    series,
    optimal: computeOptimalBuy(snapshots, kickoffUtc),
  });
}
