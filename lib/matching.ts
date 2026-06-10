import type { SiteEvent, SiteName } from "./adapters/types";

const TEAM_ALIASES: Record<string, string> = {
  usa: "united states",
  us: "united states",
  usmnt: "united states",
  "united states of america": "united states",
  "korea republic": "south korea",
  "republic of korea": "south korea",
  "ir iran": "iran",
  "iran ir": "iran",
  "cote d'ivoire": "ivory coast",
  holland: "netherlands",
  ksa: "saudi arabia",
};

export function normalizeTeam(name: string): string {
  let s = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  s = s.replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim();
  s = s.replace(/\b(men's )?(national team|mnt)\b/g, "").replace(/\s+/g, " ").trim();
  return TEAM_ALIASES[s] ?? s;
}

/** Remove tournament boilerplate so titles from different sites compare cleanly. */
export function stripTournamentNoise(title: string): string {
  return title
    .replace(/\bfifa\b/gi, " ")
    .replace(/\bworld cup\b/gi, " ")
    .replace(/\b2026\b/g, " ")
    .replace(/\b(group [a-l]|match \d+|round of 32|round of 16|quarter-?finals?|semi-?finals?|third place|final)\b:?/gi, " ")
    .replace(/\(.*?\)/g, " ")
    .replace(/^[\s\-–—:]+|[\s\-–—:]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Pull a normalized, alphabetically sorted team pair out of an event title. */
export function extractTeams(title: string): [string, string] | null {
  const cleaned = stripTournamentNoise(title);
  const parts = cleaned.split(/\s+(?:vs\.?|v\.?)\s+/i);
  if (parts.length !== 2) return null;
  const a = normalizeTeam(parts[0]);
  const b = normalizeTeam(parts[1]);
  if (!a || !b) return null;
  return a < b ? [a, b] : [b, a];
}

function tokenOverlap(a: string, b: string): number {
  const ta = new Set(a.toLowerCase().split(/\W+/).filter((t) => t.length > 2));
  const tb = new Set(b.toLowerCase().split(/\W+/).filter((t) => t.length > 2));
  if (!ta.size || !tb.size) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return shared / Math.min(ta.size, tb.size);
}

export interface CandidateEvent {
  site: SiteName;
  siteEventId: string;
  url?: string;
  title: string;
  venueName?: string;
  confidence: number;
}

export interface MatchCandidate {
  label: string;
  homeTeam?: string;
  awayTeam?: string;
  kickoffUtc: string;
  venue?: string;
  city?: string;
  sites: SiteName[];
  events: CandidateEvent[];
}

function eventTeams(e: SiteEvent): [string, string] | null {
  if (e.homeTeam && e.awayTeam) {
    const a = normalizeTeam(e.homeTeam);
    const b = normalizeTeam(e.awayTeam);
    if (a && b) return a < b ? [a, b] : [b, a];
  }
  return extractTeams(e.title);
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Merge events from multiple sites into match candidates. Events merge when
 * their normalized team pairs match and they fall on the same UTC date;
 * venue token overlap feeds the confidence score.
 */
export function mergeEvents(events: SiteEvent[]): MatchCandidate[] {
  const groups = new Map<string, SiteEvent[]>();
  for (const e of events) {
    if (!e.kickoffUtc) continue;
    const date = e.kickoffUtc.slice(0, 10);
    const teams = eventTeams(e);
    const key = teams
      ? `teams:${teams[0]}|${teams[1]}|${date}`
      : `title:${stripTournamentNoise(e.title).toLowerCase()}|${date}`;
    const group = groups.get(key);
    if (group) group.push(e);
    else groups.set(key, [e]);
  }

  const candidates: MatchCandidate[] = [];
  for (const group of groups.values()) {
    const primary = group[0];
    const teams = eventTeams(primary);
    const withTeams = group.find((e) => e.homeTeam && e.awayTeam);
    const label =
      withTeams?.homeTeam && withTeams.awayTeam
        ? `${withTeams.homeTeam} vs ${withTeams.awayTeam}`
        : teams
          ? `${titleCase(teams[0])} vs ${titleCase(teams[1])}`
          : stripTournamentNoise(primary.title) || primary.title;
    const venue = group.map((e) => e.venue).find(Boolean);
    candidates.push({
      label,
      homeTeam: withTeams?.homeTeam,
      awayTeam: withTeams?.awayTeam,
      kickoffUtc: group.map((e) => e.kickoffUtc).sort()[0],
      venue,
      city: group.map((e) => e.city).find(Boolean),
      sites: [...new Set(group.map((e) => e.site))],
      events: group.map((e) => ({
        site: e.site,
        siteEventId: e.siteEventId,
        url: e.url,
        title: e.title,
        venueName: e.venue,
        confidence:
          (teams ? 0.6 : 0.4) +
          0.2 + // same-date requirement already enforced by the group key
          0.2 * (venue && e.venue ? tokenOverlap(venue, e.venue) : 0.5),
      })),
    });
  }
  return candidates.sort((a, b) => a.kickoffUtc.localeCompare(b.kickoffUtc));
}
