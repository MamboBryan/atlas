"use client";

import { useState } from "react";
import { smoothPath } from "@/lib/thamani/chart-path";

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const W = 600;
const H = 140;
const PAD_X = 12;
const PAD_TOP = 20;
const PAD_BOTTOM = 16;

export function MetricChart({
  values,
  year,
  title,
}: {
  values: number[];
  year: number;
  /** Metric name used in the accessible labels, e.g. "New devices". */
  title: string;
}) {
  const noun = title.toLowerCase();
  const [hover, setHover] = useState<number | null>(null);
  const n = values.length;
  const max = Math.max(1, ...values);
  const xAt = (i: number) => PAD_X + (i / Math.max(1, n - 1)) * (W - 2 * PAD_X);
  const yAt = (v: number) =>
    PAD_TOP + (1 - v / max) * (H - PAD_TOP - PAD_BOTTOM);
  const d = smoothPath(values.map((v, i) => [xAt(i), yAt(v)]));

  const showBelow = hover !== null && yAt(values[hover]) < H * 0.3;

  return (
    <div className="w-full">
      <div className="relative w-full" onMouseLeave={() => setHover(null)}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="xMidYMid meet"
          className="block w-full text-accent"
          role="img"
          aria-label={`${title} per month in ${year}`}
        >
          {hover !== null && (
            <line
              x1={xAt(hover)}
              y1={PAD_TOP - 8}
              x2={xAt(hover)}
              y2={H - PAD_BOTTOM}
              stroke="currentColor"
              strokeWidth={1}
              className="text-ink/20"
            />
          )}
          <path
            d={d}
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
          {hover !== null && (
            <circle
              cx={xAt(hover)}
              cy={yAt(values[hover])}
              r={4}
              fill="currentColor"
            />
          )}
        </svg>

        {/* hover zones — one focusable button per month */}
        <div className="absolute inset-0 flex">
          {values.map((v, i) => (
            <button
              key={MONTH_LABELS[i]}
              type="button"
              aria-label={`${MONTH_LABELS[i]} ${year}: ${v} ${noun}`}
              className="flex-1 cursor-default focus:outline-none"
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
            />
          ))}
        </div>

        {/* tooltip */}
        {hover !== null && (
          <div
            className="pointer-events-none absolute z-10 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-xs text-surface shadow-md"
            style={{
              left: `${Math.min(86, Math.max(14, ((hover + 0.5) / n) * 100))}%`,
              top: `${(yAt(values[hover]) / H) * 100}%`,
              transform: showBelow
                ? "translate(-50%, 10px)"
                : "translate(-50%, calc(-100% - 10px))",
            }}
          >
            <span className="font-semibold">
              {MONTH_LABELS[hover]}: {values[hover]}
            </span>
            {hover > 0 && (
              <span className="ml-1 opacity-75">
                {values[hover] - values[hover - 1] >= 0 ? "+" : ""}
                {values[hover] - values[hover - 1]} vs {MONTH_LABELS[hover - 1]}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="mt-1 flex text-[10px] text-ink-soft">
        {values.map((_, i) => (
          <span key={MONTH_LABELS[i]} className="flex-1 text-center">
            {MONTH_LABELS[i]}
          </span>
        ))}
      </div>
    </div>
  );
}
