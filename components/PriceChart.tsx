"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { SITE_LABELS } from "@/lib/adapters/types";

export interface SeriesPoint {
  site: string;
  takenAtUtc: string;
  decentPrice: number;
  hoursBeforeKickoff: number;
}

const SITE_COLORS: Record<string, string> = {
  seatgeek: "#ff5b49",
  ticketmaster: "#58a6ff",
};

/**
 * Decent-seat price over time. X axis is hours before kickoff, reversed so
 * "now" sits at the right edge.
 */
export default function PriceChart({ series }: { series: SeriesPoint[] }) {
  const sites = [...new Set(series.map((p) => p.site))];
  if (!series.length) return null;

  return (
    <div style={{ width: "100%", height: 320 }}>
      <ResponsiveContainer>
        <LineChart margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
          <CartesianGrid stroke="#2a3140" strokeDasharray="3 3" />
          <XAxis
            type="number"
            dataKey="hoursBeforeKickoff"
            reversed
            domain={["dataMax", "dataMin"]}
            stroke="#9aa4b2"
            label={{ value: "Hours before kickoff", position: "insideBottom", dy: 18, fill: "#9aa4b2" }}
            tickFormatter={(v: number) => `${Math.round(v)}h`}
          />
          <YAxis
            stroke="#9aa4b2"
            tickFormatter={(v: number) => `$${v}`}
            domain={["auto", "auto"]}
            width={70}
          />
          <Tooltip
            contentStyle={{ background: "#171c26", border: "1px solid #2a3140" }}
            formatter={(value) => [`$${Number(value).toFixed(2)}`, "decent seat"]}
            labelFormatter={(v) => `${Number(v).toFixed(1)}h before kickoff`}
          />
          <Legend verticalAlign="top" />
          {sites.map((site) => (
            <Line
              key={site}
              data={series.filter((p) => p.site === site)}
              dataKey="decentPrice"
              name={SITE_LABELS[site as keyof typeof SITE_LABELS] ?? site}
              stroke={SITE_COLORS[site] ?? "#3fb950"}
              dot={{ r: 3 }}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
