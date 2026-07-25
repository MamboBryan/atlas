"use client";

import { useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Palette } from "@/lib/present/palettes";
import { pickJoke } from "@/lib/present/jokes";
import { endMeeting } from "@/lib/actions/meeting";

export function CurtainSlide({
  palette,
  meetingId,
  meetingTitle,
}: {
  palette: Palette;
  meetingId: string;
  meetingTitle: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const joke = pickJoke(meetingId);

  const onEnd = useCallback(() => {
    start(async () => {
      const res = await endMeeting(meetingId);
      if (res.ok) router.push(`/meetings/${meetingId}`);
    });
  }, [meetingId, router]);

  return (
    <div className="flex h-full flex-col p-10">
      <header className="flex items-start justify-between text-xs uppercase tracking-widest font-extrabold opacity-90">
        <span>{meetingTitle} · fin</span>
        <span
          className="inline-flex items-center gap-2 rounded-full border-2 px-3 py-1.5"
          style={{ borderColor: palette.ink }}
        >
          <span className="h-2 w-2 rounded-full" style={{ background: palette.ink }} />
          End
        </span>
      </header>

      <div className="flex-1 flex items-center justify-center">
        <blockquote
          className="max-w-4xl text-center font-display font-black leading-tight tracking-tight"
          style={{ fontSize: 48 }}
        >
          &ldquo;{joke}&rdquo;
        </blockquote>
      </div>

      <footer className="flex items-end justify-end">
        <button
          type="button"
          disabled={pending}
          onClick={onEnd}
          className="rounded-xl border-2 px-5 py-3 font-extrabold shadow-[3px_3px_0_rgba(0,0,0,0.6)] disabled:opacity-60"
          style={{ background: palette.accent, color: palette.accentInk, borderColor: palette.accentInk }}
        >
          End meeting
        </button>
      </footer>
    </div>
  );
}
