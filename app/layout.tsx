import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "WC2026 Ticket Tracker",
  description: "Compare World Cup 2026 ticket deals across sites and track the optimal time to buy",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="topbar">
          <Link href="/" className="brand">⚽ WC2026 Ticket Tracker</Link>
          <nav>
            <Link href="/">Search</Link>
            <Link href="/matches">Tracked matches</Link>
          </nav>
        </header>
        <main className="container">{children}</main>
        <footer className="footnote">
          Decent-seat prices are estimates from event-level stats (SeatGeek median, Ticketmaster
          range percentile) — the free APIs don&apos;t expose per-section listings, so this is a proxy
          for &quot;not in the nosebleeds&quot;, not a guaranteed section filter.
        </footer>
      </body>
    </html>
  );
}
