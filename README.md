# WC2026 Ticket Tracker

Find the best ticket deal for any FIFA World Cup 2026 match across SeatGeek and
Ticketmaster, and track when the optimal time to buy a decent seat was — expressed
in **hours before kickoff**.

## What it does

- **Search**: type a match ("Argentina vs Mexico", "United States") and the app
  queries both ticket sites' APIs, fuzzy-merges the same match across sites
  (team aliases, title boilerplate, venue overlap), and shows it as one card.
- **Best deal**: per-site "decent seat" price estimates side by side, cheapest
  highlighted, with outbound links to buy.
- **Price history & optimal buy time**: a background poller snapshots prices for
  every tracked match (default every 30 min). Each match page shows a price-over-time
  chart (x-axis = hours before kickoff) and the cheapest decent-seat price seen so
  far with *when* it occurred, e.g. "$240 at ~72h before kickoff".

### The "decent seat" caveat

Neither free API exposes per-section listings, so "not in the nosebleeds" is an
estimate, clearly labeled in the UI:

- **SeatGeek**: the *median* listing price (sits above the upper-deck cluster at
  the bottom of the price distribution). Falls back to average, then lowest
  (flagged low-confidence).
- **Ticketmaster**: only a min–max `priceRanges` is available, so we take
  `min + DECENT_PERCENTILE × (max − min)` (default 0.35, configurable).

## Setup

1. **Get API keys** (both free):
   - SeatGeek: create an app at <https://seatgeek.com/account/develop> → copy the client ID.
   - Ticketmaster: register at <https://developer.ticketmaster.com> → copy the Consumer Key
     (Discovery API; default limit 5,000 calls/day, 5 req/s — the poller stays far under this).

2. **Configure**:

   ```bash
   cp .env.example .env
   # fill in SEATGEEK_CLIENT_ID and TICKETMASTER_API_KEY
   ```

   The app works with either key alone — a missing key just disables that site.

3. **Run**:

   ```bash
   npm install
   npm run dev          # http://localhost:3000
   ```

   For production: `npm run build && npm start`. The poller starts with the server
   and only records snapshots for matches you've tracked, until their kickoff.

## Usage

1. On the home page, search for a match and hit **Track & compare** — it polls
   immediately, so the match page has prices on first load.
2. **Tracked matches** lists everything with the current best deal and the best
   price seen so far (with its hours-before-kickoff timing).
3. The optimal-buy stat only reflects history since tracking began — track matches
   early to get a meaningful curve.

## API

| Endpoint | Description |
| --- | --- |
| `GET /api/search?q=...` | Search both sites, return merged match candidates |
| `POST /api/track` | Track a candidate (body: the candidate JSON from search) |
| `GET /api/matches` | Tracked matches with best-now and optimal-buy summary |
| `GET /api/match/:id` | Full detail: per-site prices, history series, optimal buy |
| `POST /api/poll` | Trigger a price snapshot poll immediately |
| `POST /api/dev/snapshots` | Inject backdated snapshots for testing (dev only, or `DEV_TOOLS=1`) |

## Testing

```bash
npm test   # vitest: matching + pricing units
```

To exercise the history features without waiting hours, inject backdated
snapshots (find `mappingId`s via `sqlite3 data/app.db 'SELECT id, site FROM event_mappings'`):

```bash
curl -X POST localhost:3000/api/dev/snapshots -H 'Content-Type: application/json' -d '{
  "snapshots": [
    {"mappingId": 1, "takenAtUtc": "2026-06-08T12:00:00Z", "decentPrice": 320},
    {"mappingId": 1, "takenAtUtc": "2026-06-09T12:00:00Z", "decentPrice": 240},
    {"mappingId": 1, "takenAtUtc": "2026-06-10T12:00:00Z", "decentPrice": 410}
  ]
}'
```

## Architecture

- **Next.js 15** (App Router, TypeScript), single process: UI + API routes +
  in-process poller (started from `instrumentation.ts`).
- **SQLite** (`better-sqlite3`): `matches`, `event_mappings` (one row per
  site-event), `price_snapshots`.
- **Adapters** (`lib/adapters/`): one per site behind a common interface
  (`searchEvents`, batched `fetchPrices`) — adding StubHub/Vivid Seats later is
  one new file, if you have partner API access.
- `lib/matching.ts` — cross-site event merging; `lib/pricing.ts` — decent-seat
  proxy + optimal-buy math; `lib/poller.ts` — snapshot scheduler.
