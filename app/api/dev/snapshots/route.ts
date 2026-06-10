import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

interface DevSnapshot {
  mappingId: number;
  takenAtUtc: string;
  decentPrice: number;
  lowestPrice?: number;
  highestPrice?: number;
  averagePrice?: number;
  medianPrice?: number;
  listingCount?: number;
  currency?: string;
}

/**
 * Inject backdated snapshots so price-history features can be tested without
 * waiting for the poller. Disabled in production unless DEV_TOOLS=1.
 */
export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production" && process.env.DEV_TOOLS !== "1") {
    return NextResponse.json({ error: "Dev tools disabled" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const snapshots = (body?.snapshots ?? []) as DevSnapshot[];
  if (!Array.isArray(snapshots) || !snapshots.length) {
    return NextResponse.json({ error: "Required: snapshots[]" }, { status: 400 });
  }

  const db = getDb();
  const insert = db.prepare(
    `INSERT INTO price_snapshots
       (mapping_id, taken_at_utc, lowest_price, highest_price, average_price,
        median_price, listing_count, decent_price, decent_confidence, currency, raw_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'high', ?, '"dev-injected"')`,
  );
  let inserted = 0;
  for (const s of snapshots) {
    if (!s.mappingId || !s.takenAtUtc || s.decentPrice == null) continue;
    insert.run(
      s.mappingId,
      s.takenAtUtc,
      s.lowestPrice ?? null,
      s.highestPrice ?? null,
      s.averagePrice ?? null,
      s.medianPrice ?? null,
      s.listingCount ?? null,
      s.decentPrice,
      s.currency ?? "USD",
    );
    inserted++;
  }
  return NextResponse.json({ inserted });
}
