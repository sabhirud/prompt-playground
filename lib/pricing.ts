import type { SiteName, SitePriceStats } from "./adapters/types";

export type Confidence = "high" | "medium" | "low";

function decentPercentile(): number {
  const v = parseFloat(process.env.DECENT_PERCENTILE || "0.35");
  return Number.isFinite(v) && v >= 0 && v <= 1 ? v : 0.35;
}

/**
 * Estimate the price of a "decent" (non-nosebleed) seat from event-level
 * stats. Neither free API exposes per-section listings, so this is a proxy:
 * - SeatGeek: median listing price sits above the upper-deck cluster at the
 *   bottom of the distribution.
 * - Ticketmaster: only a min/max range exists, so take a configurable
 *   percentile point within it.
 */
export function decentPrice(
  stats: SitePriceStats,
  site: SiteName,
): { price: number; confidence: Confidence } | null {
  if (site === "seatgeek") {
    if (stats.median != null) return { price: stats.median, confidence: "high" };
    if (stats.average != null) return { price: stats.average, confidence: "medium" };
    if (stats.lowest != null) return { price: stats.lowest, confidence: "low" };
    return null;
  }
  if (stats.lowest != null && stats.highest != null && stats.highest > stats.lowest) {
    return {
      price: stats.lowest + decentPercentile() * (stats.highest - stats.lowest),
      confidence: "medium",
    };
  }
  if (stats.lowest != null) return { price: stats.lowest, confidence: "low" };
  return null;
}

export interface SnapshotPoint {
  site: string;
  takenAtUtc: string;
  decentPrice: number;
}

export interface OptimalBuy {
  site: string;
  price: number;
  takenAtUtc: string;
  hoursBeforeKickoff: number;
}

export interface OptimalBuyResult {
  overall: OptimalBuy;
  bySite: Record<string, OptimalBuy>;
  firstSnapshotAtUtc: string;
}

export function hoursBefore(kickoffUtc: string, takenAtUtc: string): number {
  return Math.round(((Date.parse(kickoffUtc) - Date.parse(takenAtUtc)) / 3.6e6) * 10) / 10;
}

/**
 * The optimal time to have bought: the snapshot with the minimum decent-seat
 * price, per site and overall, expressed in hours before kickoff.
 */
export function computeOptimalBuy(
  snapshots: SnapshotPoint[],
  kickoffUtc: string,
): OptimalBuyResult | null {
  if (!snapshots.length) return null;
  const bySite: Record<string, OptimalBuy> = {};
  let overall: OptimalBuy | null = null;
  let firstSnapshotAtUtc = snapshots[0].takenAtUtc;
  for (const s of snapshots) {
    if (s.takenAtUtc < firstSnapshotAtUtc) firstSnapshotAtUtc = s.takenAtUtc;
    const entry: OptimalBuy = {
      site: s.site,
      price: s.decentPrice,
      takenAtUtc: s.takenAtUtc,
      hoursBeforeKickoff: hoursBefore(kickoffUtc, s.takenAtUtc),
    };
    const best = bySite[s.site];
    if (!best || entry.price < best.price) bySite[s.site] = entry;
    if (!overall || entry.price < overall.price) overall = entry;
  }
  return { overall: overall!, bySite, firstSnapshotAtUtc };
}
