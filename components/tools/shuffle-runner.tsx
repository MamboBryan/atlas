"use client";
import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  advanceShuffle,
  backShuffle,
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

export function ShuffleRunner({
  sessionId,
  meetingId,
  canControl,
}: {
  sessionId: string | null;
  meetingId?: string | null;
  canControl?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [session, setSession] = useState<SessionRow | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const controllable = canControl ?? true;

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
    if (meetingId) return;
    start(async () => {
      const res = await startShuffle(null);
      if (!res.ok) {
        setErr(res.error.message);
        return;
      }
      router.replace(`/tools/shuffle?id=${res.data.id}` as never);
    });
  }, [sessionId, meetingId, loadSession, router]);

  useEffect(() => {
    if (!sessionId) return;
    const s = createSupabaseBrowserClient();
    const ch = s
      .channel(`shuffle:${sessionId}`)
      .on(
        "postgres_changes" as never,
        {
          event: "UPDATE",
          schema: "public",
          table: "shuffle_sessions",
          filter: `id=eq.${sessionId}`,
        },
        () => {
          loadSession(sessionId);
        },
      )
      .subscribe();
    return () => {
      s.removeChannel(ch);
    };
  }, [sessionId, loadSession]);

  const doPrev = () => {
    if (!session) return;
    setErr(null);
    start(async () => {
      const res = await backShuffle(session.id);
      if (!res.ok) setErr(res.error.message);
    });
  };
  const doNext = () => {
    if (!session) return;
    setErr(null);
    start(async () => {
      const res = await advanceShuffle(session.id);
      if (!res.ok) setErr(res.error.message);
    });
  };
  const doRestart = () => {
    if (!session) return;
    setErr(null);
    start(async () => {
      const res = await restartShuffle(session.id);
      if (!res.ok) setErr(res.error.message);
    });
  };

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

  const total = session.roster_snapshot.length;
  const idx = session.current_index;
  const currentId = session.roster_snapshot[idx];
  const currentName = names[currentId] ?? "…";

  return (
    <div className="space-y-4">
      <div className="rounded-lg border p-6 space-y-2 text-center">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          {idx + 1} of {total}
          {session.status === "finished" && " · done"}
        </div>
        <div key={currentId} className="text-3xl font-semibold">
          {currentName}
        </div>
      </div>

      {controllable && (
        <div className="flex justify-center gap-2">
          <Button variant="outline" onClick={doPrev} disabled={pending || idx === 0}>
            Prev
          </Button>
          <Button onClick={doNext} disabled={pending || session.status === "finished"}>
            Next
          </Button>
          <Button variant="ghost" onClick={doRestart} disabled={pending}>
            Restart
          </Button>
        </div>
      )}

      {err && (
        <p className="text-sm text-destructive text-center" role="alert">
          {err}
        </p>
      )}

      <div className="text-xs text-muted-foreground text-center">
        Session ID: {session.id.slice(0, 8)} · shareable link
      </div>
    </div>
  );
}
