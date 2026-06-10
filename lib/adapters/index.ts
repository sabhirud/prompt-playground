import { seatgeekAdapter } from "./seatgeek";
import { ticketmasterAdapter } from "./ticketmaster";
import type { TicketSiteAdapter } from "./types";

export const ALL_ADAPTERS: TicketSiteAdapter[] = [seatgeekAdapter, ticketmasterAdapter];

/** Adapters whose API key env var is set. */
export function getEnabledAdapters(): TicketSiteAdapter[] {
  return ALL_ADAPTERS.filter((a) => a.enabled());
}
