import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ensureRoundAction } from "@/lib/actions/game";
import { TargetNumberRound } from "./target-number-round";
import { ZeroInRound } from "./zero-in-round";
import { SubmissionCounter } from "./submission-counter";
import { RoundScoreboard } from "./round-scoreboard";
import type { PlayerResult } from "@/lib/games/types";

export async function GameLobbyPanel({
  meetingId,
  scheduledStart,
  status,
}: {
  meetingId: string;
  scheduledStart: string;
  status: string;
}) {
  if (status !== "scheduled") return null;

  const startMs = new Date(scheduledStart).getTime();
  const lobbyOpen = Date.now() >= startMs - 10 * 60_000;
  if (!lobbyOpen) {
    return (
      <section className="rounded-lg border p-4 text-sm text-muted-foreground">
        Pre-meeting game opens 10 minutes before the meeting starts.
      </section>
    );
  }

  const ensured = await ensureRoundAction({ meeting_id: meetingId });
  if (!ensured.ok) {
    return (
      <section className="rounded-lg border p-4 text-sm text-muted-foreground">
        Couldn&apos;t start the game: {ensured.error.message}
      </section>
    );
  }
  const round = ensured.data;

  // Eligible = participants of the meeting, or the whole profiles table if
  // participants_override is null (matches the RLS gate).
  const supabase = await createSupabaseServerClient();
  const { data: mtg } = await supabase
    .from("meetings")
    .select("participants_override")
    .eq("id", meetingId)
    .single();
  let eligibleCount = 0;
  if (mtg?.participants_override && Array.isArray(mtg.participants_override)) {
    eligibleCount = mtg.participants_override.length;
  } else {
    const { count } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true });
    eligibleCount = count ?? 0;
  }

  if (round.status === "finished") {
    const { data: subs } = await supabase
      .from("game_submissions")
      .select("player_id, points, payload, profiles!inner(display_name)")
      .eq("round_id", round.round_id)
      .not("points", "is", null);
    const results: PlayerResult[] = (
      (subs ?? []) as unknown as Array<{
        player_id: string;
        points: number;
        payload: unknown;
        profiles: { display_name: string };
      }>
    ).map((s) => ({
      player_id: s.player_id,
      points: s.points ?? 0,
      display: formatDisplay(round.kind, s.payload, s.profiles.display_name),
    }));
    // For Zero In, the round result reveals the secret number.
    const revealedSecret =
      round.kind === "zero_in" && round.puzzle.kind === "zero_in" && "secret" in round.puzzle
        ? round.puzzle.secret
        : undefined;
    return (
      <section className="space-y-4 rounded-lg border p-4">
        {revealedSecret !== undefined && (
          <div className="rounded-md bg-muted px-4 py-3 text-center">
            <span className="text-sm text-muted-foreground uppercase tracking-wide">The secret was</span>
            <div className="text-4xl font-bold tabular-nums">{revealedSecret}</div>
          </div>
        )}
        <RoundScoreboard
          roundId={round.round_id}
          kind={round.kind}
          initialResults={results}
        />
      </section>
    );
  }

  return (
    <section className="space-y-4 rounded-lg border p-4">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Pre-meeting game</h2>
          <p className="text-sm text-muted-foreground">
            {round.kind === "target_number"
              ? "Combine base numbers to hit the target."
              : "Guess the secret number. Three tries."}
          </p>
        </div>
        <SubmissionCounter roundId={round.round_id} eligibleCount={eligibleCount} />
      </header>
      {round.kind === "target_number" && round.puzzle.kind === "target_number" ? (
        <TargetNumberRound
          roundId={round.round_id}
          target={round.puzzle.target}
          bases={round.puzzle.bases}
          endsAt={round.ends_at}
        />
      ) : (
        <ZeroInRound roundId={round.round_id} endsAt={round.ends_at} />
      )}
    </section>
  );
}

function formatDisplay(
  kind: "target_number" | "zero_in",
  payload: unknown,
  name: string,
): string {
  if (kind === "target_number") {
    const p = payload as { best_result?: number } | null;
    return `${name} · ${p?.best_result ?? "—"}`;
  }
  const p = payload as { best_guess?: number } | null;
  return `${name} · ${p?.best_guess ?? "—"}`;
}
