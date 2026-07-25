"use client";

import { useCallback, useTransition } from "react";
import type { Palette } from "@/lib/present/palettes";
import { advanceMeetingAgenda } from "@/lib/actions/meeting";

type Item = { id: string; ordinal: number; kind: string; title: string };

export function StandbySlide({
  palette,
  meetingId,
  meetingTitle,
  items,
}: {
  palette: Palette;
  meetingId: string;
  meetingTitle: string;
  items: Item[];
}) {
  const [pending, start] = useTransition();

  const startAgenda = useCallback(() => {
    if (items.length === 0) return;
    start(async () => {
      await advanceMeetingAgenda({ meeting_id: meetingId, item_id: items[0].id });
    });
  }, [items, meetingId]);

  return (
    <div className="flex h-full flex-col p-10">
      <div className="flex items-start justify-between text-xs uppercase tracking-widest font-extrabold opacity-90">
        <span>{meetingTitle} · standby</span>
        <span
          className="inline-flex items-center gap-2 rounded-full border-2 px-3 py-1.5"
          style={{ borderColor: palette.ink }}
        >
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: palette.ink }}
          />
          Waiting
        </span>
      </div>

      <div className="flex-1 flex flex-col justify-center max-w-3xl">
        <h1 className="font-display font-black leading-none tracking-tight" style={{ fontSize: 64 }}>
          Ready when you are
        </h1>
        <ul className="mt-8 space-y-2">
          {items.length === 0 && (
            <li className="opacity-70">No agenda items yet — add some from the meeting page.</li>
          )}
          {items.map((it) => (
            <li
              key={it.id}
              className="flex items-center justify-between rounded-2xl border-2 px-5 py-3 font-extrabold"
              style={{ borderColor: `${palette.ink}55` }}
            >
              <span>
                <span className="opacity-60 font-mono mr-3">
                  {String(it.ordinal).padStart(2, "0")}
                </span>
                {it.title}
              </span>
              <span className="opacity-70 capitalize">{it.kind}</span>
            </li>
          ))}
        </ul>
      </div>

      <footer className="flex items-end justify-between">
        <span className="opacity-70 text-xs">Press Esc to exit · → or Space to advance</span>
        <button
          type="button"
          className="rounded-xl border-2 px-5 py-3 font-extrabold shadow-[3px_3px_0_rgba(0,0,0,0.6)] disabled:opacity-60"
          style={{ background: palette.accent, color: palette.accentInk, borderColor: palette.accentInk }}
          onClick={startAgenda}
          disabled={pending || items.length === 0}
        >
          Start agenda →
        </button>
      </footer>
    </div>
  );
}
