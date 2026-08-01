"use client";
import { useCallback, useEffect, useId, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function SubmissionCounter({
  roundId,
  eligibleCount,
}: {
  roundId: string;
  eligibleCount: number;
}) {
  const [n, setN] = useState(0);
  const instanceId = useId();

  const refresh = useCallback(async () => {
    const s = createSupabaseBrowserClient();
    const { count } = await s
      .from("game_submissions")
      .select("id", { count: "exact", head: true })
      .eq("round_id", roundId);
    setN(count ?? 0);
  }, [roundId]);

  useEffect(() => {
    const s = createSupabaseBrowserClient();
    refresh();
    const ch = s
      .channel(`round-subs:${roundId}:${instanceId}`)
      .on(
        "postgres_changes" as never,
        {
          event: "INSERT",
          schema: "public",
          table: "game_submissions",
          filter: `round_id=eq.${roundId}`,
        },
        () => refresh(),
      )
      .subscribe();
    return () => {
      s.removeChannel(ch);
    };
  }, [roundId, instanceId, refresh]);

  return (
    <div className="text-sm text-muted-foreground">
      {n} of {eligibleCount} submitted
    </div>
  );
}
