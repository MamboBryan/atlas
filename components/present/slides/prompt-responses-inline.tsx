"use client";

import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { Palette } from "@/lib/present/palettes";

type Props = {
  palette: Palette;
  promptId: string;
  responseType:
    "text" | "single_choice" | "multi_choice" | "yes_no" | "rating" | undefined;
  options: unknown;
  ratingMin?: number | null;
  ratingMax?: number | null;
};

type ChoiceOption = { id: string; label: string };

export function PromptResponsesInline({
  palette,
  promptId,
  responseType,
  options,
  ratingMin,
  ratingMax,
}: Props) {
  const [rows, setRows] = useState<{ response: unknown }[]>([]);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    const load = async () => {
      const s = createSupabaseBrowserClient();
      const [{ data: attr }, { data: anon }] = await Promise.all([
        s
          .from("responses_attributed")
          .select("response")
          .eq("prompt_id", promptId),
        s
          .from("responses_anonymous")
          .select("response")
          .eq("prompt_id", promptId),
      ]);
      const all = [...(attr ?? []), ...(anon ?? [])] as { response: unknown }[];
      setRows(all);
      setTotal(all.length);
    };
    load();
  }, [promptId]);

  const bars = useMemo(() => {
    if (responseType === "single_choice" || responseType === "multi_choice") {
      const opts = (Array.isArray(options) ? options : []) as ChoiceOption[];
      const counts = new Map<string, number>();
      for (const r of rows) {
        const val = r.response as {
          choice_ids?: string[];
          choice_id?: string;
        } | null;
        if (!val) continue;
        const ids = val.choice_ids ?? (val.choice_id ? [val.choice_id] : []);
        for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
      }
      return opts
        .map((o) => ({ label: o.label, count: counts.get(o.id) ?? 0 }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 6);
    }
    if (responseType === "yes_no") {
      let y = 0,
        n = 0;
      for (const r of rows) {
        const val = r.response as { yes?: boolean } | null;
        if (val?.yes === true) y++;
        else if (val?.yes === false) n++;
      }
      return [
        { label: "Yes", count: y },
        { label: "No", count: n },
      ];
    }
    return [];
  }, [rows, options, responseType]);

  if (responseType === "text") {
    return (
      <p className="text-2xl font-extrabold opacity-90">
        {total} response{total === 1 ? "" : "s"} · open the poll page to read
        them
      </p>
    );
  }

  if (responseType === "rating") {
    const values: number[] = [];
    for (const r of rows) {
      const val = r.response as { value?: number } | null;
      if (typeof val?.value === "number") values.push(val.value);
    }
    const avg = values.length
      ? values.reduce((a, b) => a + b, 0) / values.length
      : 0;
    const min = ratingMin ?? 1;
    const max = ratingMax ?? 10;
    const buckets = new Array(max - min + 1).fill(0);
    for (const v of values) if (v >= min && v <= max) buckets[v - min]++;
    const bMax = Math.max(1, ...buckets);
    return (
      <div className="flex items-end gap-6">
        <div>
          <div className="text-xs uppercase tracking-widest opacity-70 font-extrabold">
            Average
          </div>
          <div
            className="font-display font-black leading-none"
            style={{ fontSize: 72 }}
          >
            {avg.toFixed(1)}
          </div>
          <div className="text-xs opacity-70">
            {values.length} rating{values.length === 1 ? "" : "s"}
          </div>
        </div>
        <div className="flex items-end gap-1" style={{ height: 96 }}>
          {buckets.map((count, i) => (
            <div
              key={i}
              className="w-4 rounded-t"
              title={`${min + i}: ${count}`}
              style={{
                background: palette.accent,
                height: `${(count / bMax) * 100}%`,
              }}
            />
          ))}
        </div>
      </div>
    );
  }

  if (bars.length === 0) {
    return <p className="opacity-70">No responses yet.</p>;
  }

  const barMax = Math.max(1, ...bars.map((b) => b.count));
  return (
    <ul className="space-y-2 w-full max-w-2xl">
      {bars.map((b) => {
        const pct = total > 0 ? Math.round((b.count / total) * 100) : 0;
        return (
          <li
            key={b.label}
            className="rounded-xl border-2 px-4 py-2"
            style={{ borderColor: palette.ink }}
          >
            <div className="flex justify-between text-sm font-extrabold">
              <span>{b.label}</span>
              <span>
                {b.count} · {pct}%
              </span>
            </div>
            <div
              className="mt-1 h-2 w-full rounded"
              style={{ background: `${palette.ink}22` }}
            >
              <div
                className="h-full rounded"
                style={{
                  background: palette.accent,
                  width: `${(b.count / barMax) * 100}%`,
                }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
