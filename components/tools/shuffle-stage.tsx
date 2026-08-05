"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Confetti } from "@/components/present/confetti";
import { NextUpCard } from "@/components/present/next-up-card";
import { ToolStage } from "@/components/tools/tool-stage";
import { stagePalettes } from "@/lib/present/palettes";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { startShuffle } from "@/lib/actions/picker";

type SessionRow = {
  id: string;
  roster_snapshot: string[];
  current_index: number;
  status: "active" | "finished";
};

/**
 * Full-screen sequential shuffle tool.
 *
 * Starts on a "Start Shuffle" screen; clicking Start reveals the first person.
 * Each "Next person" reveals the next name in the pre-shuffled order instantly
 * (no draw animation — the order is already decided) with a "Up next" card in
 * the bottom-right and a fresh palette. On the last person the button becomes
 * "Close". Order is persisted in `shuffle_sessions` so the `?id=` link resumes.
 */
export function ShuffleStage({ sessionId }: { sessionId: string | null }) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [session, setSession] = useState<SessionRow | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [index, setIndex] = useState(0);
  const [started, setStarted] = useState(false);
  const [paletteIdx, setPaletteIdx] = useState(0);
  const [confettiKey, setConfettiKey] = useState<string | null>(null);
  const creating = useRef(false);

  const palette = stagePalettes[paletteIdx % stagePalettes.length];

  const loadSession = useCallback(async (id: string) => {
    const s = createSupabaseBrowserClient();
    const { data, error } = await s
      .from("shuffle_sessions")
      .select("id,roster_snapshot,current_index,status")
      .eq("id", id)
      .single();
    if (error || !data) {
      setErr(error?.message ?? "not found");
      return;
    }
    const row = data as SessionRow;
    setSession(row);
    setIndex(row.current_index);
    // A link resumed mid-shuffle skips the "Start" screen.
    if (row.current_index > 0) setStarted(true);
    const ids = row.roster_snapshot ?? [];
    if (ids.length > 0) {
      const { data: profs } = await s
        .from("profiles")
        .select("id,display_name")
        .in("id", ids);
      const map: Record<string, string> = {};
      for (const p of (profs ?? []) as { id: string; display_name: string }[]) {
        map[p.id] = p.display_name;
      }
      setNames(map);
    }
  }, []);

  // Load an existing session, or create a fresh standalone one.
  useEffect(() => {
    if (sessionId) {
      void loadSession(sessionId);
      return;
    }
    if (creating.current) return;
    creating.current = true;
    void (async () => {
      const res = await startShuffle(null);
      if (!res.ok) {
        setErr(res.error.message);
        return;
      }
      router.replace(`/tools/shuffle?id=${res.data.id}` as never);
    })();
  }, [sessionId, loadSession, router]);

  const roster = session?.roster_snapshot ?? [];
  const total = roster.length;
  const currentId = roster[index];
  const currentName = names[currentId] ?? "…";
  const upcomingId = roster[index + 1];
  const upcomingName = upcomingId ? (names[upcomingId] ?? "…") : null;
  const isLast = total > 0 && index >= total - 1;

  const close = useCallback(() => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push("/" as never);
    }
  }, [router]);

  const persistIndex = useCallback(
    (id: string, idx: number, finished: boolean) => {
      const s = createSupabaseBrowserClient();
      void s
        .from("shuffle_sessions")
        .update({
          current_index: idx,
          status: finished ? "finished" : "active",
        })
        .eq("id", id);
    },
    [],
  );

  const doStart = useCallback(() => {
    if (!session) return;
    setStarted(true);
    setConfettiKey(session.roster_snapshot[index] ?? null);
  }, [session, index]);

  const doNext = useCallback(() => {
    if (!session || isLast) return;
    const nextIdx = index + 1;
    setPaletteIdx((i) => i + 1);
    setIndex(nextIdx);
    setConfettiKey(session.roster_snapshot[nextIdx]);
    persistIndex(session.id, nextIdx, nextIdx >= total - 1);
  }, [session, isLast, index, total, persistIndex]);

  const primaryBtn = (label: string, onClick: () => void) => (
    <button
      type="button"
      onClick={onClick}
      className="rounded-2xl border-2 px-8 py-4 text-2xl font-black shadow-[6px_6px_0_rgba(0,0,0,0.7)] transition-transform hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-[3px_3px_0_rgba(0,0,0,0.7)]"
      style={{
        background: palette.accent,
        color: palette.accentInk,
        borderColor: palette.accentInk,
      }}
    >
      {label}
    </button>
  );

  return (
    <ToolStage
      palette={palette}
      onClose={close}
      eyebrow={
        started && total > 0 ? `Shuffle · ${index + 1} of ${total}` : "Shuffle"
      }
      footer={
        !session || err
          ? null
          : !started
            ? primaryBtn("Start Shuffle", doStart)
            : isLast
              ? primaryBtn("Close", close)
              : primaryBtn("Next person →", doNext)
      }
    >
      <Confetti trigger={confettiKey} />

      {err ? (
        <p className="text-center text-lg font-extrabold" role="alert">
          {err}
        </p>
      ) : !session ? (
        <p className="animate-pulse text-center text-lg font-extrabold opacity-80">
          Starting shuffle…
        </p>
      ) : (
        <span
          key={started ? currentId : "start"}
          className="animate-rise-in text-center font-black leading-none tracking-tight"
          style={{ fontSize: "clamp(3rem, 12vw, 7rem)" }}
        >
          {started ? currentName : "Start Shuffle"}
        </span>
      )}

      {session && started && upcomingName && (
        <NextUpCard name={upcomingName} color={palette.accentInk} />
      )}
    </ToolStage>
  );
}
