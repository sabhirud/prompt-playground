import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { computeOptimalBuy, type SnapshotPoint } from "@/lib/pricing";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = getDb();
  const matches = db
    .prepare(`SELECT id, label, venue, city, kickoff_utc AS kickoffUtc FROM matches ORDER BY kickoff_utc`)
    .all() as { id: number; label: string; venue?: string; city?: string; kickoffUtc: string }[];

  const latestStmt = db.prepare(
    `SELECT em.site, em.site_url AS url, ps.decent_price AS decentPrice, ps.taken_at_utc AS takenAtUtc
     FROM event_mappings em
     LEFT JOIN price_snapshots ps ON ps.id = (
       SELECT id FROM price_snapshots
       WHERE mapping_id = em.id ORDER BY taken_at_utc DESC, id DESC LIMIT 1
     )
     WHERE em.match_id = ?`,
  );
  const allSnapshotsStmt = db.prepare(
    `SELECT em.site, ps.taken_at_utc AS takenAtUtc, ps.decent_price AS decentPrice
     FROM price_snapshots ps
     JOIN event_mappings em ON em.id = ps.mapping_id
     WHERE em.match_id = ?`,
  );

  const result = matches.map((m) => {
    const latest = latestStmt.all(m.id) as {
      site: string;
      url?: string;
      decentPrice?: number;
      takenAtUtc?: string;
    }[];
    const priced = latest.filter((l) => l.decentPrice != null);
    const bestNow = priced.length
      ? priced.reduce((a, b) => (a.decentPrice! <= b.decentPrice! ? a : b))
      : null;
    const optimal = computeOptimalBuy(allSnapshotsStmt.all(m.id) as SnapshotPoint[], m.kickoffUtc);
    return { ...m, bestNow, optimal: optimal?.overall ?? null };
  });

  return NextResponse.json({ matches: result });
}
