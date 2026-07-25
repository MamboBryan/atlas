"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  restartShuffle,
  startShuffle,
} from "@/lib/actions/picker";

type SessionRow = {
  id: string;
  meeting_id: string | null;
  owner_user_id: string;
  roster_snapshot: string[];
  current_index: number;
  status: "active" | "finished";
};

type AnimPhase = "idle" | "out" | "in";

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function ShufflePlayground({
  sessionId,
}: {
  sessionId: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [session, setSession] = useState<SessionRow | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [animPhase, setAnimPhase] = useState<AnimPhase>("idle");
  const outTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadSession = useCallback(async (id: string) => {
    const s = createSupabaseBrowserClient();
    const { data, error } = await s
      .from("shuffle_sessions")
      .select("id,meeting_id,owner_user_id,roster_snapshot,current_index,status")
      .eq("id", id)
      .single();
    if (error || !data) {
      setErr(error?.message ?? "not found");
      return;
    }
    setSession(data as SessionRow);
    const ids = (data.roster_snapshot ?? []) as string[];
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

  useEffect(() => {
    if (sessionId) {
      loadSession(sessionId);
      return;
    }
    // No sessionId — create a new standalone session (no meeting).
    start(async () => {
      const res = await startShuffle(null);
      if (!res.ok) {
        setErr(res.error.message);
        return;
      }
      router.replace(`/tools/shuffle?id=${res.data.id}` as never);
    });
  }, [sessionId, loadSession, router]);

  // Cleanup timers on unmount.
  useEffect(() => {
    return () => {
      if (outTimerRef.current !== null) clearTimeout(outTimerRef.current);
    };
  }, []);

  const doShuffle = useCallback(() => {
    if (!session) return;
    setErr(null);

    if (prefersReducedMotion()) {
      // Skip animation; just reshuffle.
      start(async () => {
        const res = await restartShuffle(session.id);
        if (!res.ok) setErr(res.error.message);
        else if (sessionId) await loadSession(sessionId);
      });
      return;
    }

    const total = session.roster_snapshot.length;
    const outDuration = total * 60 + 200; // stagger 60ms per card + buffer

    // Phase 1: stagger out.
    setAnimPhase("out");

    outTimerRef.current = setTimeout(() => {
      // Phase 2: reshuffle on server then stagger in.
      start(async () => {
        const res = await restartShuffle(session.id);
        if (!res.ok) {
          setErr(res.error.message);
          setAnimPhase("idle");
          return;
        }
        // Load updated session from DB.
        if (sessionId) await loadSession(sessionId);
        setAnimPhase("in");

        // Return to idle after in-animation completes.
        outTimerRef.current = setTimeout(() => {
          setAnimPhase("idle");
        }, total * 60 + 400);
      });
    }, outDuration);
  }, [session, sessionId, loadSession]);

  if (!session) {
    return (
      <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
        {err ? (
          <span className="text-destructive">{err}</span>
        ) : (
          "Starting shuffle…"
        )}
      </div>
    );
  }

  const roster = session.roster_snapshot;
  const total = roster.length;

  return (
    <div className="space-y-6">
      {/* Roster grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {roster.map((userId, idx) => {
          const displayName = names[userId] ?? "…";
          const delayMs = idx * 60;

          let cardClass =
            "flex items-center justify-center text-center min-h-16 select-none";

          let style: React.CSSProperties = {};

          if (animPhase === "out") {
            // Staggered fade-out + rise.
            style = {
              animationDelay: `${delayMs}ms`,
              animationFillMode: "both",
            };
            cardClass += " animate-[rise-out_300ms_ease-in_both]";
          } else if (animPhase === "in") {
            // Staggered rise-in after reshuffle.
            style = {
              animationDelay: `${delayMs}ms`,
            };
            cardClass += " animate-rise-in";
          }

          return (
            <Card key={`${userId}-${idx}`} className={cardClass} style={style}>
              <CardContent className="py-4 px-3">
                <span className="font-display font-extrabold text-sm leading-snug">
                  {displayName}
                </span>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex justify-center gap-2">
        <Button
          size="lg"
          variant="accent"
          onClick={doShuffle}
          disabled={pending || animPhase !== "idle"}
        >
          {pending ? "Shuffling…" : "Shuffle"}
        </Button>
      </div>

      {err && (
        <p className="text-sm text-destructive text-center" role="alert">
          {err}
        </p>
      )}

      <div className="text-xs text-ink-soft text-center">
        Session: {session.id.slice(0, 8)} · {total} members
      </div>
    </div>
  );
}
