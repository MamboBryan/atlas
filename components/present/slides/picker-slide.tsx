"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import type { Palette } from "@/lib/present/palettes";
import type { AgendaItemLite } from "@/lib/present/slide-state";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  oneShotPick,
  setAgendaPickerResult,
  startShuffle,
} from "@/lib/actions/picker";
import { Confetti } from "@/components/present/confetti";
import { NextUpCard } from "@/components/present/next-up-card";

type Roster = { id: string; display_name: string };

async function fetchName(id: string): Promise<string> {
  const s = createSupabaseBrowserClient();
  const { data } = await s.from("profiles").select("display_name").eq("id", id).single();
  return (data?.display_name as string) ?? "?";
}

async function fetchProfiles(ids: string[]): Promise<Record<string, string>> {
  if (ids.length === 0) return {};
  const s = createSupabaseBrowserClient();
  const { data } = await s.from("profiles").select("id,display_name").in("id", ids);
  const map: Record<string, string> = {};
  for (const row of data ?? []) {
    map[row.id as string] = (row.display_name as string) ?? "?";
  }
  return map;
}

export function PickerSlide({
  palette,
  item,
  state,
  index,
  total,
  meetingTitle,
  meetingId,
  onNext,
}: {
  palette: Palette;
  item: AgendaItemLite;
  state: "oneshot-idle" | "oneshot-revealed" | "shuffle-idle" | "shuffle-revealed";
  index: number;
  total: number;
  meetingTitle: string;
  meetingId: string;
  onNext: () => void;
}) {
  const [pending, start] = useTransition();

  const oneshotUserId =
    item.picker_result && typeof item.picker_result === "object" && "user_id" in item.picker_result
      ? ((item.picker_result as { user_id: string }).user_id)
      : null;
  const shuffleSessionId =
    item.picker_result && typeof item.picker_result === "object" && "shuffle_session_id" in item.picker_result
      ? ((item.picker_result as { shuffle_session_id: string }).shuffle_session_id)
      : null;

  const [pickName, setPickName] = useState<string | null>(null);
  useEffect(() => {
    if (oneshotUserId) fetchName(oneshotUserId).then(setPickName);
  }, [oneshotUserId]);

  const doOneShot = useCallback(() => {
    start(async () => {
      const pick = await oneShotPick(meetingId);
      if (!pick.ok) return;
      await setAgendaPickerResult(item.id, { user_id: pick.data.user_id });
    });
  }, [meetingId, item.id]);

  const doStartShuffle = useCallback(() => {
    start(async () => {
      const s = await startShuffle(meetingId);
      if (!s.ok) return;
      await setAgendaPickerResult(item.id, { shuffle_session_id: s.data.id });
    });
  }, [meetingId, item.id]);

  // roster_snapshot in DB is string[] (user IDs), not Roster objects.
  // We fetch display names separately via profiles.
  const [shuffleState, setShuffleState] = useState<{
    current: Roster | null;
    upcoming: Roster | null;
    round: number;
    outOf: number;
    finished: boolean;
  } | null>(null);

  useEffect(() => {
    if (!shuffleSessionId) return;
    const load = async () => {
      const s = createSupabaseBrowserClient();
      const { data } = await s
        .from("shuffle_sessions")
        .select("roster_snapshot,current_index,status")
        .eq("id", shuffleSessionId)
        .single();
      if (!data) return;
      const ids = (data.roster_snapshot as string[]) ?? [];
      const idx = (data.current_index as number) ?? 0;
      const nameMap = await fetchProfiles(ids);
      const toRoster = (id: string | undefined): Roster | null =>
        id ? { id, display_name: nameMap[id] ?? "?" } : null;
      setShuffleState({
        current: toRoster(ids[idx]),
        upcoming: toRoster(ids[idx + 1]),
        round: Math.min(idx + 1, ids.length),
        outOf: ids.length,
        finished: (data.status as string) === "finished",
      });
    };
    void load();
    const s = createSupabaseBrowserClient();
    const ch = s
      .channel(`shuffle:${shuffleSessionId}:${crypto.randomUUID()}`)
      .on(
        "postgres_changes" as never,
        { event: "UPDATE", schema: "public", table: "shuffle_sessions", filter: `id=eq.${shuffleSessionId}` },
        () => void load(),
      )
      .subscribe();
    return () => { void s.removeChannel(ch); };
  }, [shuffleSessionId]);

  const advanceShuffle = useCallback(() => {
    if (!shuffleSessionId || !shuffleState || shuffleState.finished) return;
    start(async () => {
      const s = createSupabaseBrowserClient();
      const nextIdx = shuffleState.round; // 1-based round == next 0-based idx
      const finished = nextIdx >= shuffleState.outOf;
      await s
        .from("shuffle_sessions")
        .update({
          current_index: finished ? shuffleState.outOf - 1 : nextIdx,
          status: finished ? "finished" : "active",
        })
        .eq("id", shuffleSessionId);
    });
  }, [shuffleSessionId, shuffleState]);

  return (
    <div className="relative flex h-full flex-col p-10">
      <Confetti trigger={oneshotUserId ?? shuffleState?.current?.id ?? null} />

      <div className="flex items-start justify-between text-xs uppercase tracking-widest font-extrabold opacity-90">
        <span>Item {String(index).padStart(2, "0")} of {String(total).padStart(2, "0")} · {meetingTitle}</span>
        <span
          className="inline-flex items-center gap-2 rounded-full border-2 px-3 py-1.5"
          style={{ borderColor: palette.ink }}
        >
          <span className="h-2 w-2 rounded-full" style={{ background: palette.ink }} />
          Picker · {state.startsWith("oneshot") ? "oneshot" : "shuffle"}
        </span>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center gap-6">
        {state === "oneshot-idle" && (
          <button
            type="button"
            disabled={pending}
            onClick={doOneShot}
            className="rounded-2xl border-2 px-8 py-5 font-black text-2xl shadow-[6px_6px_0_rgba(0,0,0,0.7)] disabled:opacity-60"
            style={{ background: palette.accent, color: palette.accentInk, borderColor: palette.accentInk }}
          >
            {pending ? "…" : "Pick"}
          </button>
        )}
        {state === "oneshot-revealed" && (
          <div
            className="rounded-2xl border-[3px] bg-white/95 px-8 py-6 text-center shadow-[4px_4px_0_rgba(0,0,0,0.8)]"
            style={{ borderColor: "#111", color: "#111" }}
          >
            <div className="text-xs uppercase tracking-widest font-extrabold opacity-70">Now presenting</div>
            <div className="font-black tracking-tight leading-none mt-1" style={{ fontSize: 64 }}>
              {pickName ?? "…"}
            </div>
          </div>
        )}
        {state === "shuffle-idle" && (
          <button
            type="button"
            disabled={pending}
            onClick={doStartShuffle}
            className="rounded-2xl border-2 px-8 py-5 font-black text-2xl shadow-[6px_6px_0_rgba(0,0,0,0.7)] disabled:opacity-60"
            style={{ background: palette.accent, color: palette.accentInk, borderColor: palette.accentInk }}
          >
            {pending ? "…" : "Start shuffle"}
          </button>
        )}
        {state === "shuffle-revealed" && shuffleState && (
          <div
            className="rounded-2xl border-[3px] bg-white/95 px-8 py-6 text-center shadow-[4px_4px_0_rgba(0,0,0,0.8)]"
            style={{ borderColor: "#111", color: "#111" }}
          >
            <div className="text-xs uppercase tracking-widest font-extrabold opacity-70">
              {shuffleState.finished ? "Done" : `Round ${shuffleState.round} of ${shuffleState.outOf}`}
            </div>
            <div className="font-black tracking-tight leading-none mt-1" style={{ fontSize: 56 }}>
              {shuffleState.current?.display_name ?? "?"}
            </div>
          </div>
        )}
      </div>

      <footer className="flex items-end justify-between">
        <span className="text-xs font-extrabold uppercase tracking-widest opacity-80">
          {state === "shuffle-revealed" && shuffleState
            ? shuffleState.finished ? "Everyone's had a turn" : `Round ${shuffleState.round} of ${shuffleState.outOf}`
            : ""}
        </span>
        {state === "oneshot-revealed" && (
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={doOneShot}
              className="rounded-xl border-2 px-4 py-2 font-extrabold"
              style={{ borderColor: palette.ink, color: palette.ink }}
            >
              Pick again
            </button>
            <button
              type="button"
              onClick={onNext}
              className="rounded-xl border-2 px-5 py-3 font-extrabold shadow-[3px_3px_0_rgba(0,0,0,0.6)]"
              style={{ background: palette.accent, color: palette.accentInk, borderColor: palette.accentInk }}
            >
              Next item →
            </button>
          </div>
        )}
        {state === "shuffle-revealed" && shuffleState && !shuffleState.finished && (
          <button
            type="button"
            disabled={pending}
            onClick={advanceShuffle}
            className="rounded-xl border-2 px-5 py-3 font-extrabold shadow-[3px_3px_0_rgba(0,0,0,0.6)]"
            style={{ background: palette.accent, color: palette.accentInk, borderColor: palette.accentInk }}
          >
            Next person →
          </button>
        )}
        {state === "shuffle-revealed" && shuffleState?.finished && (
          <button
            type="button"
            onClick={onNext}
            className="rounded-xl border-2 px-5 py-3 font-extrabold shadow-[3px_3px_0_rgba(0,0,0,0.6)]"
            style={{ background: palette.accent, color: palette.accentInk, borderColor: palette.accentInk }}
          >
            Next item →
          </button>
        )}
      </footer>

      {state === "shuffle-revealed" && shuffleState?.upcoming && (
        <NextUpCard name={shuffleState.upcoming.display_name} color="#111" />
      )}
    </div>
  );
}
