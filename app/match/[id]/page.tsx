"use client";

import { use, useCallback, useEffect, useState } from "react";
import PriceChart, { type SeriesPoint } from "@/components/PriceChart";
import { SITE_LABELS } from "@/lib/adapters/types";

interface SiteCard {
  mappingId: number;
  site: string;
  url?: string;
  title?: string;
  venueName?: string;
  takenAtUtc?: string;
  lowest?: number;
  highest?: number;
  average?: number;
  median?: number;
  listingCount?: number;
  decentPrice?: number;
  decentConfidence?: string;
  currency?: string;
}

interface Detail {
  match: {
    id: number;
    label: string;
    venue?: string;
    city?: string;
    kickoffUtc: string;
  };
  sites: SiteCard[];
  series: SeriesPoint[];
  optimal: {
    overall: { site: string; price: number; takenAtUtc: string; hoursBeforeKickoff: number };
    bySite: Record<string, { price: number; hoursBeforeKickoff: number }>;
    firstSnapshotAtUtc: string;
  } | null;
}

function fmtMoney(n?: number | null): string {
  return n == null ? "—" : `$${n.toFixed(2)}`;
}

function siteLabel(site: string): string {
  return SITE_LABELS[site as keyof typeof SITE_LABELS] ?? site;
}

export default function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/match/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setDetail(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function pollNow() {
    setPolling(true);
    try {
      await fetch("/api/poll", { method: "POST" });
      await load();
    } finally {
      setPolling(false);
    }
  }

  if (error) return <p className="error">{error}</p>;
  if (!detail) return <p className="muted">Loading…</p>;

  const { match, sites, series, optimal } = detail;
  const priced = sites.filter((s) => s.decentPrice != null);
  const bestSite = priced.length
    ? priced.reduce((a, b) => (a.decentPrice! <= b.decentPrice! ? a : b))
    : null;

  return (
    <div>
      <h1>{match.label}</h1>
      <p className="muted">
        {new Date(match.kickoffUtc).toLocaleString()} · {match.venue ?? "venue TBD"}
        {match.city ? `, ${match.city}` : ""}
      </p>

      <div className="cardrow">
        <h2>Best deal right now (decent seat estimate)</h2>
        <button className="secondary" onClick={pollNow} disabled={polling}>
          {polling ? "Polling…" : "Refresh prices now"}
        </button>
      </div>
      <div className="grid">
        {sites.map((s) => (
          <div key={s.mappingId} className={`card${bestSite?.mappingId === s.mappingId ? " best" : ""}`}>
            <div className="cardrow">
              <span className={`badge site-${s.site}`}>{siteLabel(s.site)}</span>
              {bestSite?.mappingId === s.mappingId && <span className="badge green">best deal</span>}
            </div>
            <div className={`price${bestSite?.mappingId === s.mappingId ? " best" : ""}`}>
              {fmtMoney(s.decentPrice)}
            </div>
            <div className="muted">
              range {fmtMoney(s.lowest)} – {fmtMoney(s.highest)}
              {s.listingCount != null ? ` · ${s.listingCount} listings` : ""}
              {s.decentConfidence ? ` · ${s.decentConfidence} confidence` : ""}
            </div>
            <div className="muted">
              {s.takenAtUtc ? `as of ${new Date(s.takenAtUtc).toLocaleString()}` : "no snapshot yet"}
            </div>
            {s.url && (
              <p>
                <a href={s.url} target="_blank" rel="noreferrer">
                  View on {siteLabel(s.site)} ↗
                </a>
              </p>
            )}
          </div>
        ))}
      </div>

      <h2>Optimal time to buy</h2>
      {optimal ? (
        <div className="optimal">
          <div className="price best">
            {fmtMoney(optimal.overall.price)} at ~{optimal.overall.hoursBeforeKickoff.toFixed(0)}h
            before kickoff
          </div>
          <div className="muted">
            Cheapest decent-seat price observed so far, on {siteLabel(optimal.overall.site)} (
            {new Date(optimal.overall.takenAtUtc).toLocaleString()}).
          </div>
          <div style={{ marginTop: "0.5rem" }}>
            {Object.entries(optimal.bySite).map(([site, o]) => (
              <div key={site} className="muted">
                <span className={`badge site-${site}`}>{siteLabel(site)}</span>
                {fmtMoney(o.price)} at ~{o.hoursBeforeKickoff.toFixed(0)}h before kickoff
              </div>
            ))}
          </div>
          <div className="muted" style={{ marginTop: "0.5rem" }}>
            History begins {new Date(optimal.firstSnapshotAtUtc).toLocaleString()} — the optimum
            only reflects prices observed since tracking started.
          </div>
        </div>
      ) : (
        <p className="muted">No price snapshots yet — hit &quot;Refresh prices now&quot;.</p>
      )}

      <h2>Decent-seat price history</h2>
      {series.length ? (
        <PriceChart series={series} />
      ) : (
        <p className="muted">The chart appears once the poller has recorded snapshots.</p>
      )}
    </div>
  );
}
