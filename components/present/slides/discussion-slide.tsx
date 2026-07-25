"use client";

import { useCallback, useTransition } from "react";
import type { Palette } from "@/lib/present/palettes";
import type { AgendaItemLite } from "@/lib/present/slide-state";

export function DiscussionSlide({
  palette,
  item,
  index,
  total,
  meetingTitle,
  onNext,
}: {
  palette: Palette;
  item: AgendaItemLite & { title: string };
  index: number;
  total: number;
  meetingTitle: string;
  onNext: () => void;
}) {
  const [pending, start] = useTransition();

  const goNext = useCallback(() => {
    start(async () => {
      onNext();
    });
  }, [onNext]);

  return (
    <div className="flex h-full flex-col p-10">
      <div className="flex items-start justify-between text-xs uppercase tracking-widest font-extrabold opacity-90">
        <span>
          Item {String(index).padStart(2, "0")} of {String(total).padStart(2, "0")} · {meetingTitle}
        </span>
        <span
          className="inline-flex items-center gap-2 rounded-full border-2 px-3 py-1.5"
          style={{ borderColor: palette.ink }}
        >
          <span className="h-2 w-2 rounded-full" style={{ background: palette.ink }} />
          Discussion
        </span>
      </div>

      <div className="flex-1 flex items-center">
        <h1
          className="font-display font-black leading-none tracking-tight"
          style={{ fontSize: 88 }}
        >
          {item.title}
        </h1>
      </div>

      <footer className="flex items-end justify-between">
        <span className="text-xs font-extrabold uppercase tracking-widest opacity-80">
          Open floor · comments →
        </span>
        <NextButton palette={palette} disabled={pending} onClick={goNext} />
      </footer>
    </div>
  );
}

function NextButton({
  palette,
  disabled,
  onClick,
}: {
  palette: Palette;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="rounded-xl border-2 px-5 py-3 font-extrabold shadow-[3px_3px_0_rgba(0,0,0,0.6)] disabled:opacity-60"
      style={{
        background: palette.accent,
        color: palette.accentInk,
        borderColor: palette.accentInk,
      }}
      onClick={onClick}
      disabled={disabled}
    >
      Next item →
    </button>
  );
}
