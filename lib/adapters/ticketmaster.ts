import type { DateRange, SiteEvent, SitePriceStats, TicketSiteAdapter } from "./types";

const BASE = "https://app.ticketmaster.com/discovery/v2";
// Default key allows 5 req/s; space calls out to stay under it.
const REQUEST_SPACING_MS = 250;

function apiKey(): string | undefined {
  return process.env.TICKETMASTER_API_KEY || undefined;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function tmDate(iso: string): string {
  // Discovery API rejects milliseconds: wants YYYY-MM-DDTHH:mm:ssZ
  return `${iso.slice(0, 19)}Z`;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapEvent(e: any): SiteEvent {
  const venue = e._embedded?.venues?.[0];
  const start = e.dates?.start;
  return {
    site: "ticketmaster",
    siteEventId: String(e.id),
    title: e.name ?? "",
    venue: venue?.name ?? undefined,
    city: venue?.city?.name ?? undefined,
    kickoffUtc: start?.dateTime ?? (start?.localDate ? `${start.localDate}T00:00:00Z` : ""),
    url: e.url ?? undefined,
  };
}

function mapStats(e: any): SitePriceStats | null {
  const ranges: any[] = e.priceRanges ?? [];
  // priceRanges is often absent; treat that as "no price data this poll"
  const pr = ranges.find((p) => p.type === "standard") ?? ranges[0];
  if (!pr || (pr.min == null && pr.max == null)) return null;
  return {
    lowest: pr.min ?? null,
    highest: pr.max ?? null,
    currency: pr.currency ?? "USD",
    raw: ranges,
  };
}

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Ticketmaster HTTP ${res.status}`);
  return res.json();
}

// Resolved once per server process; lets fetchPrices batch all World Cup
// events in 1-2 calls instead of one call per event.
let cachedAttractionId: string | null | undefined;

async function resolveWorldCupAttractionId(): Promise<string | null> {
  if (cachedAttractionId !== undefined) return cachedAttractionId;
  try {
    const params = new URLSearchParams({ apikey: apiKey()!, keyword: "2026 World Cup", size: "5" });
    const data = await getJson(`${BASE}/attractions.json?${params}`);
    const attractions: any[] = data._embedded?.attractions ?? [];
    const id: string | null = attractions.find((a) => /world cup/i.test(a.name ?? ""))?.id ?? null;
    cachedAttractionId = id;
    return id;
  } catch {
    return null; // transient failure: leave cache unset so we retry next poll
  }
}

export const ticketmasterAdapter: TicketSiteAdapter = {
  site: "ticketmaster",
  enabled: () => !!apiKey(),

  async searchEvents(q: string, range: DateRange): Promise<SiteEvent[]> {
    const params = new URLSearchParams({
      apikey: apiKey()!,
      keyword: q,
      classificationName: "Soccer",
      startDateTime: tmDate(range.from),
      endDateTime: tmDate(range.to),
      size: "50",
      sort: "date,asc",
    });
    const data = await getJson(`${BASE}/events.json?${params}`);
    return ((data._embedded?.events ?? []) as any[]).map(mapEvent).filter((e) => e.kickoffUtc);
  },

  async fetchPrices(siteEventIds: string[]): Promise<Map<string, SitePriceStats>> {
    const map = new Map<string, SitePriceStats>();
    if (!siteEventIds.length) return map;
    const wanted = new Set(siteEventIds);
    const seenWithoutPrices = new Set<string>();

    const attractionId = await resolveWorldCupAttractionId();
    if (attractionId) {
      try {
        for (let page = 0; page < 5; page++) {
          const params = new URLSearchParams({
            apikey: apiKey()!,
            attractionId,
            size: "200",
            page: String(page),
          });
          const data = await getJson(`${BASE}/events.json?${params}`);
          for (const e of (data._embedded?.events ?? []) as any[]) {
            const id = String(e.id);
            if (!wanted.has(id)) continue;
            const stats = mapStats(e);
            if (stats) map.set(id, stats);
            else seenWithoutPrices.add(id);
          }
          if (page >= (data.page?.totalPages ?? 1) - 1) break;
          await sleep(REQUEST_SPACING_MS);
        }
      } catch {
        // fall through to per-event lookups
      }
    }

    // Per-event fallback for anything the batch didn't cover (events found
    // without priceRanges are not retried — the detail endpoint won't have
    // them either).
    const missing = siteEventIds.filter((id) => !map.has(id) && !seenWithoutPrices.has(id));
    for (const id of missing) {
      try {
        const e = await getJson(`${BASE}/events/${encodeURIComponent(id)}.json?apikey=${apiKey()!}`);
        const stats = mapStats(e);
        if (stats) map.set(id, stats);
      } catch {
        // skip this event this poll
      }
      await sleep(REQUEST_SPACING_MS);
    }
    return map;
  },
};
