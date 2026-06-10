"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { SITE_LABELS } from "@/lib/adapters/types";

interface CandidateEvent {
  site: string;
  siteEventId: string;
  url?: string;
  title: string;
  venueName?: string;
  confidence: number;
}

interface Candidate {
  label: string;
  homeTeam?: string;
  awayTeam?: string;
  kickoffUtc: string;
  venue?: string;
  city?: string;
  sites: string[];
  events: CandidateEvent[];
}

export default function SearchPage() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [tracking, setTracking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [siteErrors, setSiteErrors] = useState<string[]>([]);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    setLoading(true);
    setError(null);
    setCandidates(null);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q.trim())}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setCandidates(data.candidates);
      setSiteErrors(data.siteErrors ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function track(c: Candidate) {
    setTracking(c.label + c.kickoffUtc);
    setError(null);
    try {
      const res = await fetch("/api/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(c),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      router.push(`/match/${data.matchId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setTracking(null);
    }
  }

  return (
    <div>
      <h1>Find World Cup 2026 ticket deals</h1>
      <p className="muted">
        Enter a match (e.g. &quot;Argentina vs Mexico&quot; or &quot;United States&quot;) — we search
        SeatGeek and Ticketmaster, merge the listings, and track prices over time.
      </p>
      <form className="searchrow" onSubmit={search}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="e.g. Argentina vs Mexico"
          autoFocus
        />
        <button type="submit" disabled={loading || !q.trim()}>
          {loading ? "Searching…" : "Search"}
        </button>
      </form>

      {error && <p className="error">{error}</p>}
      {siteErrors.map((e) => (
        <p key={e} className="muted">⚠ {e}</p>
      ))}

      {candidates && !candidates.length && <p>No matches found in the tournament window. Try team names only.</p>}
      {candidates?.map((c) => (
        <div key={c.label + c.kickoffUtc} className="card cardrow">
          <div>
            <strong>{c.label}</strong>
            <div className="muted">
              {new Date(c.kickoffUtc).toLocaleString()} · {c.venue ?? "venue TBD"}
              {c.city ? `, ${c.city}` : ""}
            </div>
            <div style={{ marginTop: "0.35rem" }}>
              {c.sites.map((s) => (
                <span key={s} className={`badge site-${s}`}>
                  {SITE_LABELS[s as keyof typeof SITE_LABELS] ?? s}
                </span>
              ))}
            </div>
          </div>
          <button onClick={() => track(c)} disabled={tracking !== null}>
            {tracking === c.label + c.kickoffUtc ? "Tracking…" : "Track & compare"}
          </button>
        </div>
      ))}
    </div>
  );
}
