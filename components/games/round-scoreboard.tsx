"use client";
import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { getLeaderboardAction } from "@/lib/actions/game";
import type { GameKind, PlayerResult } from "@/lib/games/types";

type LeaderboardRow = {
  player_id: string;
  display_name: string;
  total_points: number;
  rounds_played: number;
  last_played_at: string;
};

export function RoundScoreboard({
  roundId,
  kind,
  initialResults,
}: {
  roundId: string;
  kind: GameKind;
  initialResults: PlayerResult[];
}) {
  const [tab, setTab] = useState<"round" | "alltime">("round");
  const [alltime, setAlltime] = useState<LeaderboardRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const instanceId = useId();

  useEffect(() => {
    const s = createSupabaseBrowserClient();
    const ch = s
      .channel(`round:${roundId}:${instanceId}`)
      .on(
        "postgres_changes" as never,
        {
          event: "UPDATE",
          schema: "public",
          table: "game_rounds",
          filter: `id=eq.${roundId}`,
        },
        () => router.refresh(),
      )
      .subscribe();
    return () => {
      s.removeChannel(ch);
    };
  }, [roundId, instanceId, router]);

  async function loadAllTime() {
    if (alltime) return;
    setLoading(true);
    const res = await getLeaderboardAction();
    setLoading(false);
    if (res.ok) setAlltime(res.data);
  }

  const sorted = [...initialResults].sort((a, b) => b.points - a.points);

  return (
    <div className="space-y-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        Round · {kind === "target_number" ? "Target Number" : "Zero In"}
      </div>
      <div className="inline-flex rounded-md border p-0.5">
        <button
          type="button"
          className={`rounded px-3 py-1 text-sm ${tab === "round" ? "bg-primary text-primary-foreground" : ""}`}
          onClick={() => setTab("round")}
        >
          This round
        </button>
        <button
          type="button"
          className={`rounded px-3 py-1 text-sm ${tab === "alltime" ? "bg-primary text-primary-foreground" : ""}`}
          onClick={() => {
            setTab("alltime");
            void loadAllTime();
          }}
        >
          All time
        </button>
      </div>

      {tab === "round" ? (
        <ol className="space-y-1">
          {sorted.map((r, i) => (
            <li key={r.player_id} className="flex items-center justify-between rounded-md border px-3 py-2">
              <span className="tabular-nums">{i + 1}. {r.display}</span>
              <span className="font-semibold tabular-nums">+{r.points}</span>
            </li>
          ))}
          {sorted.length === 0 && (
            <li className="text-sm text-muted-foreground">No one submitted this round.</li>
          )}
        </ol>
      ) : loading || !alltime ? (
        <div className="text-sm text-muted-foreground">Loading leaderboard…</div>
      ) : (
        <ol className="space-y-1">
          {alltime.slice(0, 20).map((r, i) => (
            <li key={r.player_id} className="flex items-center justify-between rounded-md border px-3 py-2">
              <span>{i + 1}. {r.display_name}</span>
              <span className="font-semibold tabular-nums">{r.total_points}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
