"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import type { Palette } from "@/lib/present/palettes";
import type { AgendaItemLite, PromptLite } from "@/lib/present/slide-state";
import { startPromptTimer, expirePromptTimer } from "@/lib/actions/prompt-timer";
import { PromptResponsesInline } from "@/components/present/slides/prompt-responses-inline";

const DURATIONS = [30, 60, 120, 300] as const;

function fmtRemaining(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${rem.toString().padStart(2, "0")}`;
}

export function PromptSlide({
  palette,
  item,
  prompt,
  state,
  index,
  total,
  meetingTitle,
  onNext,
}: {
  palette: Palette;
  item: AgendaItemLite;
  prompt: PromptLite;
  state: "open" | "closed";
  index: number;
  total: number;
  meetingTitle: string;
  onNext: () => void;
}) {
  const [pending, start] = useTransition();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (state !== "open" || !item.timer_ends_at) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [state, item.timer_ends_at]);

  const ends = item.timer_ends_at ? new Date(item.timer_ends_at).getTime() : null;
  const remaining = ends != null ? ends - now : null;
  const expired = ends != null && ends <= now;

  useEffect(() => {
    if (state !== "open" || !expired) return;
    start(async () => {
      await expirePromptTimer({ agenda_item_id: item.id });
    });
  }, [state, expired, item.id]);

  const setTimer = useCallback(
    (seconds: (typeof DURATIONS)[number]) => {
      start(async () => {
        await startPromptTimer({ agenda_item_id: item.id, seconds });
      });
    },
    [item.id],
  );

  const closeNow = useCallback(() => {
    start(async () => {
      await expirePromptTimer({ agenda_item_id: item.id });
    });
  }, [item.id]);

  const questionText = prompt.question ?? item.title;

  return (
    <div className="flex h-full flex-col p-10">
      <div className="flex items-start justify-between text-xs uppercase tracking-widest font-extrabold opacity-90">
        <span>Item {String(index).padStart(2, "0")} of {String(total).padStart(2, "0")} · {meetingTitle}</span>
        <span
          className="inline-flex items-center gap-2 rounded-full border-2 px-3 py-1.5"
          style={{ borderColor: palette.ink }}
        >
          <span className="h-2 w-2 rounded-full" style={{ background: palette.ink }} />
          Prompt · {state}
        </span>
      </div>

      {state === "open" ? (
        <div className="flex-1 flex items-center gap-10">
          <h1 className="flex-1 font-display font-black leading-none tracking-tight" style={{ fontSize: 72 }}>
            {questionText}
          </h1>
          <div
            className="grid place-items-center rounded-full border-8 font-black tracking-tight"
            style={{ width: 128, height: 128, borderColor: palette.accent, fontSize: 32, color: palette.accent }}
          >
            {remaining != null ? fmtRemaining(remaining) : "--:--"}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col gap-8">
          <h1 className="font-display font-black leading-tight tracking-tight" style={{ fontSize: 48 }}>
            {questionText}
          </h1>
          <PromptResponsesInline
            palette={palette}
            promptId={prompt.id}
            responseType={prompt.response_type}
            options={prompt.options}
            ratingMin={prompt.rating_min ?? null}
            ratingMax={prompt.rating_max ?? null}
          />
        </div>
      )}

      <footer className="flex items-end justify-between gap-3">
        {state === "open" ? (
          <>
            <div className="flex gap-2">
              {DURATIONS.map((d) => (
                <button
                  key={d}
                  type="button"
                  disabled={pending}
                  onClick={() => setTimer(d)}
                  className="rounded-xl border-2 px-4 py-2 font-extrabold disabled:opacity-60"
                  style={{ borderColor: palette.ink, color: palette.ink }}
                >
                  {d < 60 ? `${d}s` : `${d / 60}m`}
                </button>
              ))}
            </div>
            <button
              type="button"
              disabled={pending}
              onClick={closeNow}
              className="rounded-xl border-2 px-5 py-3 font-extrabold shadow-[3px_3px_0_rgba(0,0,0,0.6)] disabled:opacity-60"
              style={{ background: palette.accent, color: palette.accentInk, borderColor: palette.accentInk }}
            >
              Close now
            </button>
          </>
        ) : (
          <>
            <span className="text-xs font-extrabold uppercase tracking-widest opacity-80">
              Responses shown · continue when ready
            </span>
            <button
              type="button"
              disabled={pending}
              onClick={onNext}
              className="rounded-xl border-2 px-5 py-3 font-extrabold shadow-[3px_3px_0_rgba(0,0,0,0.6)] disabled:opacity-60"
              style={{ background: palette.accent, color: palette.accentInk, borderColor: palette.accentInk }}
            >
              Next item →
            </button>
          </>
        )}
      </footer>
    </div>
  );
}
