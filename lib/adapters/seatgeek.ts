import type { DateRange, SiteEvent, SitePriceStats, TicketSiteAdapter } from "./types";

const BASE = "https://api.seatgeek.com/2";

function clientId(): string | undefined {
  return process.env.SEATGEEK_CLIENT_ID || undefined;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapEvent(e: any): SiteEvent {
  const performers: any[] = e.performers ?? [];
  const home = performers.find((p) => p.home_team)?.name;
  const away =
    performers.find((p) => p.away_team)?.name ??
    performers.find((p) => !p.home_team && p.name !== home)?.name;
  return {
    site: "seatgeek",
    siteEventId: String(e.id),
    title: e.title ?? e.short_title ?? "",
    homeTeam: home,
    awayTeam: away,
    venue: e.venue?.name ?? undefined,
    city: e.venue?.city ?? undefined,
    // datetime_utc comes back without a timezone suffix
    kickoffUtc: e.datetime_utc ? `${e.datetime_utc}Z` : "",
    url: e.url ?? undefined,
  };
}

function mapStats(e: any): SitePriceStats {
  const s = e.stats ?? {};
  return {
    lowest: s.lowest_price ?? null,
    highest: s.highest_price ?? null,
    average: s.average_price ?? null,
    median: s.median_price ?? null,
    listingCount: s.listing_count ?? null,
    currency: "USD",
    raw: s,
  };
}

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`SeatGeek HTTP ${res.status}`);
  return res.json();
}

export const seatgeekAdapter: TicketSiteAdapter = {
  site: "seatgeek",
  enabled: () => !!clientId(),

  async searchEvents(q: string, range: DateRange): Promise<SiteEvent[]> {
    const params = new URLSearchParams({
      client_id: clientId()!,
      q,
      "taxonomies.name": "soccer",
      "datetime_utc.gte": range.from.slice(0, 10),
      "datetime_utc.lte": range.to.slice(0, 10),
      per_page: "25",
    });
    const data = await getJson(`${BASE}/events?${params}`);
    return ((data.events ?? []) as any[]).map(mapEvent).filter((e) => e.kickoffUtc);
  },

  async fetchPrices(siteEventIds: string[]): Promise<Map<string, SitePriceStats>> {
    const map = new Map<string, SitePriceStats>();
    if (!siteEventIds.length) return map;
    const params = new URLSearchParams({
      client_id: clientId()!,
      per_page: String(siteEventIds.length),
    });
    for (const id of siteEventIds) params.append("id", id);
    const data = await getJson(`${BASE}/events?${params}`);
    for (const e of (data.events ?? []) as any[]) map.set(String(e.id), mapStats(e));
    return map;
  },
};
