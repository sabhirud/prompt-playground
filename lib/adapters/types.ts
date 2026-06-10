export type SiteName = "seatgeek" | "ticketmaster";

export const SITE_LABELS: Record<SiteName, string> = {
  seatgeek: "SeatGeek",
  ticketmaster: "Ticketmaster",
};

export interface SiteEvent {
  site: SiteName;
  siteEventId: string;
  title: string;
  homeTeam?: string;
  awayTeam?: string;
  venue?: string;
  city?: string;
  kickoffUtc: string; // ISO 8601
  url?: string;
}

export interface SitePriceStats {
  lowest?: number | null;
  highest?: number | null;
  average?: number | null;
  median?: number | null;
  listingCount?: number | null;
  currency?: string;
  raw: unknown;
}

export interface DateRange {
  from: string; // ISO 8601 UTC
  to: string;
}

export interface TicketSiteAdapter {
  site: SiteName;
  enabled(): boolean;
  searchEvents(q: string, range: DateRange): Promise<SiteEvent[]>;
  /** Batched price lookup; keys of the returned map are siteEventIds. */
  fetchPrices(siteEventIds: string[]): Promise<Map<string, SitePriceStats>>;
}
