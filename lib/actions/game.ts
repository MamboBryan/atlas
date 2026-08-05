"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/require";
import { err, ok, type ActionResult } from "@/lib/actions/_result";
import {
  ensureRoundInput,
  submitTargetNumberInput,
  submitZeroInInput,
  finalizeRoundInput,
} from "@/lib/zod/game";
import { pickGame } from "@/lib/games/select";
import {
  generateTargetNumberPuzzle,
  TARGET_NUMBER_DURATION_MS,
  evaluateExpression,
  scoreTargetNumber,
} from "@/lib/games/target-number";
import {
  generateZeroInPuzzle,
  ZERO_IN_DURATION_MS,
  computeFeedback,
  ZERO_IN_MAX_GUESSES,
  scoreZeroInRound,
} from "@/lib/games/zero-in";
import type {
  GameKind,
  TargetNumberOp,
  TargetNumberPayload,
  ZeroInFeedback,
  ZeroInGuess,
  ZeroInPayload,
  PlayerResult,
} from "@/lib/games/types";

// Not exported: a "use server" file may only export async functions.
const LOBBY_OPEN_WINDOW_MS = 10 * 60_000;

type PublicPuzzle =
  | { kind: "target_number"; target: number; bases: number[] }
  | { kind: "zero_in" } // active: secret hidden
  | { kind: "zero_in"; secret: number }; // finished: secret revealed

export type EnsureRoundResult = {
  round_id: string;
  kind: GameKind;
  puzzle: PublicPuzzle;
  started_at: string;
  ends_at: string;
  status: "active" | "finished";
};

export async function ensureRoundAction(
  input: unknown,
): Promise<ActionResult<EnsureRoundResult>> {
  const parsed = ensureRoundInput.safeParse(input);
  if (!parsed.success) return err("invalid_input", parsed.error.message);

  const { supabase } = await requireUser();

  const { data: meeting } = await supabase
    .from("meetings")
    .select("id, scheduled_start, status")
    .eq("id", parsed.data.meeting_id)
    .single();
  if (!meeting) return err("not_found", "meeting");
  if (meeting.status !== "scheduled") {
    return err("lobby_closed", "meeting is not in scheduled state");
  }
  const startsAtMs = new Date(meeting.scheduled_start).getTime();
  if (Date.now() < startsAtMs - LOBBY_OPEN_WINDOW_MS) {
    return err("too_early", "lobby is not open yet");
  }

  // Try to read an existing round first (idempotent).
  const existing = await supabase
    .from("game_rounds")
    .select("id, kind, puzzle, started_at, ends_at, status")
    .eq("meeting_id", parsed.data.meeting_id)
    .maybeSingle();
  if (existing.data) {
    return ok(publicize(existing.data));
  }

  // Otherwise create it.
  const kind = pickGame();
  const now = new Date();
  const durationMs =
    kind === "target_number" ? TARGET_NUMBER_DURATION_MS : ZERO_IN_DURATION_MS;
  const puzzle =
    kind === "target_number"
      ? generateTargetNumberPuzzle()
      : generateZeroInPuzzle();

  const insert = await supabase
    .from("game_rounds")
    .insert({
      meeting_id: parsed.data.meeting_id,
      kind,
      puzzle,
      started_at: now.toISOString(),
      ends_at: new Date(now.getTime() + durationMs).toISOString(),
      status: "active",
    })
    .select("id, kind, puzzle, started_at, ends_at, status")
    .single();

  // If we lost the create race, read the winner's row.
  if (insert.error) {
    const again = await supabase
      .from("game_rounds")
      .select("id, kind, puzzle, started_at, ends_at, status")
      .eq("meeting_id", parsed.data.meeting_id)
      .maybeSingle();
    if (again.data) return ok(publicize(again.data));
    return err("db_error", insert.error.message);
  }

  // No revalidatePath here: the freshly-created round is returned and rendered
  // directly by GameLobbyPanel, and live updates arrive via realtime channels.
  // ensureRoundAction runs during that server render, where revalidatePath is
  // both unsupported and unnecessary.
  return ok(publicize(insert.data));
}

type RoundRow = {
  id: string;
  kind: GameKind;
  puzzle: unknown;
  started_at: string;
  ends_at: string;
  status: "active" | "finished";
};

function publicize(row: RoundRow): EnsureRoundResult {
  if (row.kind === "target_number") {
    const p = row.puzzle as { target: number; bases: number[] };
    return {
      round_id: row.id,
      kind: "target_number",
      puzzle: { kind: "target_number", target: p.target, bases: p.bases },
      started_at: row.started_at,
      ends_at: row.ends_at,
      status: row.status,
    };
  }
  // Reveal the secret only after the round is finished.
  const p = row.puzzle as { secret: number };
  if (row.status === "finished") {
    return {
      round_id: row.id,
      kind: "zero_in",
      puzzle: { kind: "zero_in", secret: p.secret },
      started_at: row.started_at,
      ends_at: row.ends_at,
      status: row.status,
    };
  }
  return {
    round_id: row.id,
    kind: "zero_in",
    puzzle: { kind: "zero_in" },
    started_at: row.started_at,
    ends_at: row.ends_at,
    status: row.status,
  };
}

export async function submitTargetNumberAction(
  input: unknown,
): Promise<ActionResult<{ result: number; better: boolean }>> {
  const parsed = submitTargetNumberInput.safeParse(input);
  if (!parsed.success) return err("invalid_input", parsed.error.message);

  const { user, supabase } = await requireUser();

  const { data: round } = await supabase
    .from("game_rounds")
    .select("id, kind, puzzle, ends_at, status")
    .eq("id", parsed.data.round_id)
    .single();
  if (!round) return err("not_found", "round");
  if (round.kind !== "target_number")
    return err("wrong_kind", "not target_number");
  if (round.status !== "active")
    return err("round_closed", "round is finished");
  if (new Date(round.ends_at).getTime() <= Date.now()) {
    return err("round_closed", "past ends_at");
  }

  const puzzle = round.puzzle as { target: number; bases: number[] };
  const evalResult = evaluateExpression(
    puzzle.bases,
    parsed.data.expression as TargetNumberOp[],
  );
  if (!evalResult.ok) return err("invalid_expression", evalResult.reason);

  const nowIso = new Date().toISOString();
  const { data: prior } = await supabase
    .from("game_submissions")
    .select("id, payload")
    .eq("round_id", parsed.data.round_id)
    .eq("player_id", user.id)
    .maybeSingle();

  const priorPayload =
    (prior?.payload as TargetNumberPayload | undefined) ?? null;
  const priorDistance = priorPayload
    ? Math.abs(puzzle.target - priorPayload.best_result)
    : Infinity;
  const newDistance = Math.abs(puzzle.target - evalResult.result);

  if (priorPayload && newDistance >= priorDistance) {
    return ok({ result: evalResult.result, better: false });
  }

  const newPayload: TargetNumberPayload = {
    best_result: evalResult.result,
    expression: parsed.data.expression,
    best_submitted_at: nowIso,
  };

  const upsert = prior
    ? await supabase
        .from("game_submissions")
        .update({ payload: newPayload, submitted_at: nowIso })
        .eq("id", prior.id)
    : await supabase.from("game_submissions").insert({
        round_id: parsed.data.round_id,
        player_id: user.id,
        payload: newPayload,
        submitted_at: nowIso,
      });

  if (upsert.error) return err("db_error", upsert.error.message);
  return ok({ result: evalResult.result, better: true });
}

export async function submitZeroInGuessAction(input: unknown): Promise<
  ActionResult<{
    feedback: ZeroInFeedback;
    guesses_left: number;
    guess_count: number;
  }>
> {
  const parsed = submitZeroInInput.safeParse(input);
  if (!parsed.success) return err("invalid_input", parsed.error.message);

  const { user, supabase } = await requireUser();

  const { data: round } = await supabase
    .from("game_rounds")
    .select("id, kind, puzzle, ends_at, status")
    .eq("id", parsed.data.round_id)
    .single();
  if (!round) return err("not_found", "round");
  if (round.kind !== "zero_in") return err("wrong_kind", "not zero_in");
  if (round.status !== "active")
    return err("round_closed", "round is finished");
  if (new Date(round.ends_at).getTime() <= Date.now()) {
    return err("round_closed", "past ends_at");
  }

  const puzzle = round.puzzle as { secret: number };
  const feedback = computeFeedback(puzzle.secret, parsed.data.guess);

  const { data: prior } = await supabase
    .from("game_submissions")
    .select("id, payload")
    .eq("round_id", parsed.data.round_id)
    .eq("player_id", user.id)
    .maybeSingle();

  const priorPayload = (prior?.payload as ZeroInPayload | undefined) ?? {
    guesses: [],
    best_guess: parsed.data.guess,
  };

  if (priorPayload.guesses.length >= ZERO_IN_MAX_GUESSES) {
    return err("no_guesses_left", "3-guess limit reached");
  }

  const newGuess: ZeroInGuess = {
    value: parsed.data.guess,
    at: new Date().toISOString(),
    feedback,
  };
  const nextGuesses = [...priorPayload.guesses, newGuess];
  const bestGuess = nextGuesses.reduce(
    (best, g) =>
      Math.abs(puzzle.secret - g.value) < Math.abs(puzzle.secret - best)
        ? g.value
        : best,
    nextGuesses[0].value,
  );
  const newPayload: ZeroInPayload = {
    guesses: nextGuesses,
    best_guess: bestGuess,
  };

  const nowIso = new Date().toISOString();
  const written = prior
    ? await supabase
        .from("game_submissions")
        .update({ payload: newPayload, submitted_at: nowIso })
        .eq("id", prior.id)
    : await supabase.from("game_submissions").insert({
        round_id: parsed.data.round_id,
        player_id: user.id,
        payload: newPayload,
        submitted_at: nowIso,
      });

  if (written.error) return err("db_error", written.error.message);

  return ok({
    feedback,
    guesses_left: ZERO_IN_MAX_GUESSES - nextGuesses.length,
    guess_count: nextGuesses.length,
  });
}

export async function finalizeRoundAction(
  input: unknown,
): Promise<ActionResult<{ results: PlayerResult[] }>> {
  const parsed = finalizeRoundInput.safeParse(input);
  if (!parsed.success) return err("invalid_input", parsed.error.message);

  const { supabase } = await requireUser();

  const { data: round } = await supabase
    .from("game_rounds")
    .select("id, kind, puzzle, started_at, ends_at, status, meeting_id")
    .eq("id", parsed.data.round_id)
    .single();
  if (!round) return err("not_found", "round");

  const { data: subs } = await supabase
    .from("game_submissions")
    .select("id, player_id, payload, submitted_at")
    .eq("round_id", parsed.data.round_id);

  const submissions = subs ?? [];
  const startedAtMs = new Date(round.started_at).getTime();

  const results: Array<{ player_id: string; points: number; display: string }> =
    [];

  if (round.kind === "target_number") {
    const puzzle = round.puzzle as { target: number; bases: number[] };
    for (const s of submissions) {
      const payload = s.payload as {
        best_result: number;
        best_submitted_at: string;
      };
      const submittedAtMs = new Date(payload.best_submitted_at).getTime();
      const points = scoreTargetNumber(
        puzzle.target,
        payload.best_result,
        submittedAtMs,
        startedAtMs,
      );
      results.push({
        player_id: s.player_id,
        points,
        display: String(payload.best_result),
      });
    }
  } else {
    const puzzle = round.puzzle as { secret: number };
    const scored = scoreZeroInRound(
      puzzle.secret,
      submissions.map((s) => {
        const payload = s.payload as {
          guesses: Array<{
            value: number;
            at: string;
            feedback: "higher" | "lower" | "exact";
          }>;
          best_guess: number;
        };
        const closest = payload.guesses.reduce(
          (best, g) =>
            Math.abs(puzzle.secret - g.value) <
            Math.abs(puzzle.secret - best.value)
              ? g
              : best,
          payload.guesses[0] ?? {
            value: 0,
            at: s.submitted_at,
            feedback: "exact" as const,
          },
        );
        return {
          player_id: s.player_id,
          guesses: payload.guesses,
          earliest_closest_at: closest.at,
        };
      }),
    );
    for (const r of scored) {
      results.push({
        player_id: r.player_id,
        points: r.points,
        display: r.best_guess === null ? "—" : String(r.best_guess),
      });
    }
  }

  const { error: finErr } = await supabase.rpc("atlas_finalize_game_round", {
    p_round: parsed.data.round_id,
    p_results: results.map((r) => ({
      player_id: r.player_id,
      points: r.points,
    })),
  });
  if (finErr) return err("db_error", finErr.message);

  revalidatePath(`/meetings/${round.meeting_id}`);
  revalidatePath(`/leaderboard`);
  return ok({ results });
}

export async function getLeaderboardAction(): Promise<
  ActionResult<
    Array<{
      player_id: string;
      display_name: string;
      total_points: number;
      rounds_played: number;
      last_played_at: string;
    }>
  >
> {
  const { supabase } = await requireUser();

  // Two-step approach for reliability: avoids reliance on schema-cache join inference.
  // Step 1: fetch all scored submissions with their round status.
  const { data: subsData, error: subsErr } = await supabase
    .from("game_submissions")
    .select("id, player_id, points, round_id, submitted_at")
    .not("points", "is", null);
  if (subsErr) return err("db_error", subsErr.message);

  const submissions = (subsData ?? []) as Array<{
    id: string;
    player_id: string;
    points: number;
    round_id: string;
    submitted_at: string;
  }>;

  if (submissions.length === 0) return ok([]);

  // Step 2: fetch finalized_at for all referenced rounds.
  const roundIds = [...new Set(submissions.map((s) => s.round_id))];
  const { data: roundsData, error: roundsErr } = await supabase
    .from("game_rounds")
    .select("id, finalized_at, status")
    .in("id", roundIds)
    .eq("status", "finished");
  if (roundsErr) return err("db_error", roundsErr.message);

  const roundMap = new Map(
    (roundsData ?? []).map((r) => [
      r.id,
      r as { id: string; finalized_at: string | null; status: string },
    ]),
  );

  // Step 3: fetch display names for all referenced players.
  const playerIds = [...new Set(submissions.map((s) => s.player_id))];
  const { data: profilesData, error: profilesErr } = await supabase
    .from("profiles")
    .select("id, display_name")
    .in("id", playerIds);
  if (profilesErr) return err("db_error", profilesErr.message);

  const profileMap = new Map(
    (profilesData ?? []).map((p) => [p.id, p.display_name as string]),
  );

  // Aggregate per player, only counting submissions from finished rounds.
  const agg = new Map<
    string,
    {
      display_name: string;
      total_points: number;
      rounds_played: number;
      last_played_at: string;
    }
  >();

  for (const s of submissions) {
    const round = roundMap.get(s.round_id);
    if (!round) continue; // skip if round isn't finished

    const finalized_at = round.finalized_at ?? s.submitted_at;
    const prev = agg.get(s.player_id) ?? {
      display_name: profileMap.get(s.player_id) ?? s.player_id,
      total_points: 0,
      rounds_played: 0,
      last_played_at: finalized_at,
    };
    prev.total_points += s.points ?? 0;
    prev.rounds_played += 1;
    if (finalized_at > prev.last_played_at) {
      prev.last_played_at = finalized_at;
    }
    agg.set(s.player_id, prev);
  }

  const rows = Array.from(agg.entries())
    .map(([player_id, v]) => ({ player_id, ...v }))
    .sort((a, b) => b.total_points - a.total_points);

  return ok(rows);
}
