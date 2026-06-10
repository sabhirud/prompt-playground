import { describe, expect, it } from "vitest";
import { computeOptimalBuy, decentPrice, hoursBefore } from "../pricing";

describe("decentPrice", () => {
  it("prefers SeatGeek median, then average, then lowest", () => {
    expect(decentPrice({ median: 250, average: 300, lowest: 80, raw: {} }, "seatgeek")).toEqual({
      price: 250,
      confidence: "high",
    });
    expect(decentPrice({ average: 300, lowest: 80, raw: {} }, "seatgeek")).toEqual({
      price: 300,
      confidence: "medium",
    });
    expect(decentPrice({ lowest: 80, raw: {} }, "seatgeek")).toEqual({
      price: 80,
      confidence: "low",
    });
    expect(decentPrice({ raw: {} }, "seatgeek")).toBeNull();
  });

  it("takes the configured percentile of the Ticketmaster range", () => {
    // default DECENT_PERCENTILE=0.35: 100 + 0.35 * (500 - 100) = 240
    expect(decentPrice({ lowest: 100, highest: 500, raw: {} }, "ticketmaster")).toEqual({
      price: 240,
      confidence: "medium",
    });
  });

  it("falls back to min when Ticketmaster has no real range", () => {
    expect(decentPrice({ lowest: 100, highest: 100, raw: {} }, "ticketmaster")).toEqual({
      price: 100,
      confidence: "low",
    });
    expect(decentPrice({ raw: {} }, "ticketmaster")).toBeNull();
  });
});

describe("hoursBefore", () => {
  it("converts a snapshot time to hours before kickoff", () => {
    expect(hoursBefore("2026-06-15T18:00:00Z", "2026-06-13T18:00:00Z")).toBe(48);
    expect(hoursBefore("2026-06-15T18:00:00Z", "2026-06-15T15:30:00Z")).toBe(2.5);
  });
});

describe("computeOptimalBuy", () => {
  const kickoff = "2026-06-15T18:00:00Z";
  const snapshots = [
    { site: "seatgeek", takenAtUtc: "2026-06-10T18:00:00Z", decentPrice: 320 },
    { site: "seatgeek", takenAtUtc: "2026-06-12T18:00:00Z", decentPrice: 240 }, // dip: 72h before
    { site: "seatgeek", takenAtUtc: "2026-06-14T18:00:00Z", decentPrice: 410 },
    { site: "ticketmaster", takenAtUtc: "2026-06-12T18:00:00Z", decentPrice: 290 },
  ];

  it("finds the minimum decent price and reports hours before kickoff", () => {
    const result = computeOptimalBuy(snapshots, kickoff)!;
    expect(result.overall.price).toBe(240);
    expect(result.overall.site).toBe("seatgeek");
    expect(result.overall.hoursBeforeKickoff).toBe(72);
    expect(result.bySite.ticketmaster.price).toBe(290);
    expect(result.firstSnapshotAtUtc).toBe("2026-06-10T18:00:00Z");
  });

  it("returns null without snapshots", () => {
    expect(computeOptimalBuy([], kickoff)).toBeNull();
  });
});
