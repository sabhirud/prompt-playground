import { getEnabledAdapters } from "./adapters";
import { getDb, nowUtc } from "./db";
import { decentPrice } from "./pricing";

export interface PollResult {
  polledAt: string;
  inserted: number;
  errors: string[];
}

interface MappingRow {
  mappingId: number;
  site: string;
  siteEventId: string;
}

/** Record one price snapshot for every mapping of every upcoming tracked match. */
export async function runPollOnce(): Promise<PollResult> {
  const db = getDb();
  const polledAt = nowUtc();
  const rows = db
    .prepare(
      `SELECT em.id AS mappingId, em.site, em.site_event_id AS siteEventId
       FROM event_mappings em
       JOIN matches m ON m.id = em.match_id
       WHERE m.kickoff_utc > ?`,
    )
    .all(polledAt) as MappingRow[];

  const insert = db.prepare(
    `INSERT INTO price_snapshots
       (mapping_id, taken_at_utc, lowest_price, highest_price, average_price,
        median_price, listing_count, decent_price, decent_confidence, currency, raw_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const touch = db.prepare(`UPDATE event_mappings SET last_seen_at = ? WHERE id = ?`);
  const markPolled = db.prepare(
    `UPDATE event_mappings SET last_polled_at = ?, last_poll_note = ? WHERE id = ?`,
  );

  let inserted = 0;
  const errors: string[] = [];
  for (const adapter of getEnabledAdapters()) {
    const mine = rows.filter((r) => r.site === adapter.site);
    if (!mine.length) continue;
    try {
      const prices = await adapter.fetchPrices(mine.map((r) => r.siteEventId));
      for (const r of mine) {
        const stats = prices.get(r.siteEventId);
        if (!stats) {
          markPolled.run(polledAt, "site returned no price data", r.mappingId);
          errors.push(`${adapter.site}/${r.siteEventId}: no price data this poll`);
          continue;
        }
        const decent = decentPrice(stats, adapter.site);
        if (!decent) {
          markPolled.run(polledAt, "listed, but no usable price stats", r.mappingId);
          errors.push(`${adapter.site}/${r.siteEventId}: no usable price stats`);
          continue;
        }
        insert.run(
          r.mappingId,
          polledAt,
          stats.lowest ?? null,
          stats.highest ?? null,
          stats.average ?? null,
          stats.median ?? null,
          stats.listingCount ?? null,
          decent.price,
          decent.confidence,
          stats.currency ?? "USD",
          JSON.stringify(stats.raw ?? null),
        );
        touch.run(polledAt, r.mappingId);
        markPolled.run(polledAt, "ok", r.mappingId);
        inserted++;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      for (const r of mine) markPolled.run(polledAt, `site error: ${msg}`, r.mappingId);
      errors.push(`${adapter.site}: ${msg}`);
    }
  }
  return { polledAt, inserted, errors };
}

declare global {
  var __wcPollerStarted: boolean | undefined;
}

export function startPoller(): void {
  if (globalThis.__wcPollerStarted) return;
  globalThis.__wcPollerStarted = true;
  const minutes = parseInt(process.env.POLL_INTERVAL_MINUTES || "30", 10) || 30;
  const run = () =>
    runPollOnce()
      .then((r) => {
        if (r.inserted || r.errors.length)
          console.log(`[poller] ${r.polledAt}: ${r.inserted} snapshots`, r.errors);
      })
      .catch((e) => console.error("[poller] poll failed:", e));
  setTimeout(run, 10_000); // first poll shortly after boot
  setInterval(run, minutes * 60_000);
  console.log(`[poller] scheduled every ${minutes} min`);
}
