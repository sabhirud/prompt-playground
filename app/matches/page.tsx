"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SITE_LABELS } from "@/lib/adapters/types";

interface MatchRow {
  id: number;
  label: string;
  venue?: string;
  city?: string;
  kickoffUtc: string;
  bestNow: { site: string; url?: string; decentPrice?: number; takenAtUtc?: string } | null;
  optimal: { site: string; price: number; hoursBeforeKickoff: number } | null;
}

function fmtMoney(n?: number | null): string {
  return n == null ? "—" : `$${n.toFixed(0)}`;
}

function countdown(kickoffUtc: string): string {
  const h = (Date.parse(kickoffUtc) - Date.now()) / 3.6e6;
  if (h < 0) return "kicked off";
  if (h < 48) return `in ${Math.round(h)}h`;
  return `in ${Math.round(h / 24)}d`;
}

export default function MatchesPage() {
  const [matches, setMatches] = useState<MatchRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/matches")
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? `HTTP ${r.status}`);
        setMatches(data.matches);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  return (
    <div>
      <h1>Tracked matches</h1>
      {error && <p className="error">{error}</p>}
      {matches && !matches.length && (
        <p>
          Nothing tracked yet — <Link href="/">search for a match</Link> to start.
        </p>
      )}
      {matches && matches.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Match</th>
              <th>Kickoff</th>
              <th>Best decent seat now</th>
              <th>Best seen so far</th>
            </tr>
          </thead>
          <tbody>
            {matches.map((m) => (
              <tr key={m.id}>
                <td>
                  <Link href={`/match/${m.id}`}>{m.label}</Link>
                  <div className="muted">{m.venue ?? ""}{m.city ? `, ${m.city}` : ""}</div>
                </td>
                <td>
                  {new Date(m.kickoffUtc).toLocaleString()}
                  <div className="muted">{countdown(m.kickoffUtc)}</div>
                </td>
                <td>
                  {fmtMoney(m.bestNow?.decentPrice)}{" "}
                  {m.bestNow?.decentPrice != null && (
                    <span className={`badge site-${m.bestNow.site}`}>
                      {SITE_LABELS[m.bestNow.site as keyof typeof SITE_LABELS] ?? m.bestNow.site}
                    </span>
                  )}
                </td>
                <td>
                  {m.optimal
                    ? `${fmtMoney(m.optimal.price)} at ~${Math.round(m.optimal.hoursBeforeKickoff)}h before kickoff`
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
