import { describe, expect, it } from "vitest";
import type { SiteEvent } from "../adapters/types";
import { extractTeams, mergeEvents, normalizeTeam } from "../matching";

describe("normalizeTeam", () => {
  it("maps aliases to canonical names", () => {
    expect(normalizeTeam("USA")).toBe("united states");
    expect(normalizeTeam("Korea Republic")).toBe("south korea");
    expect(normalizeTeam("Holland")).toBe("netherlands");
  });

  it("strips accents and noise", () => {
    expect(normalizeTeam("Côte d'Ivoire")).toBe("ivory coast");
    expect(normalizeTeam("Mexico National Team")).toBe("mexico");
  });
});

describe("extractTeams", () => {
  it("parses titles with tournament boilerplate", () => {
    expect(extractTeams("FIFA World Cup 2026: Match 12 - USA vs Wales")).toEqual([
      "united states",
      "wales",
    ]);
  });

  it("handles 'v' and 'vs.' separators", () => {
    expect(extractTeams("Argentina v Mexico")).toEqual(["argentina", "mexico"]);
    expect(extractTeams("Argentina vs. Mexico")).toEqual(["argentina", "mexico"]);
  });

  it("returns null for non-match titles", () => {
    expect(extractTeams("World Cup 2026 Opening Ceremony")).toBeNull();
  });
});

describe("mergeEvents", () => {
  const sg: SiteEvent = {
    site: "seatgeek",
    siteEventId: "111",
    title: "FIFA World Cup: USA vs Wales",
    homeTeam: "USA",
    awayTeam: "Wales",
    venue: "SoFi Stadium",
    city: "Inglewood",
    kickoffUtc: "2026-06-12T02:00:00Z",
    url: "https://seatgeek.com/e/111",
  };
  const tm: SiteEvent = {
    site: "ticketmaster",
    siteEventId: "tm-222",
    title: "2026 FIFA World Cup: Match 4 - United States vs Wales",
    venue: "SoFi Stadium",
    city: "Inglewood",
    kickoffUtc: "2026-06-12T02:00:00Z",
    url: "https://ticketmaster.com/e/222",
  };

  it("merges the same match across sites despite different title formats", () => {
    const candidates = mergeEvents([sg, tm]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].sites.sort()).toEqual(["seatgeek", "ticketmaster"]);
    expect(candidates[0].events).toHaveLength(2);
    expect(candidates[0].label).toBe("USA vs Wales");
  });

  it("does not merge events on different dates", () => {
    const otherDay = { ...tm, kickoffUtc: "2026-06-13T02:00:00Z" };
    expect(mergeEvents([sg, otherDay])).toHaveLength(2);
  });

  it("does not merge different matches on the same date", () => {
    const otherMatch = { ...tm, title: "2026 FIFA World Cup: Argentina vs Mexico" };
    expect(mergeEvents([sg, otherMatch])).toHaveLength(2);
  });

  it("assigns higher confidence when venues agree", () => {
    const [candidate] = mergeEvents([sg, tm]);
    for (const e of candidate.events) expect(e.confidence).toBeGreaterThan(0.9);
  });
});
