"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/require";
import { err, ok, type ActionResult } from "@/lib/actions/_result";
import { ensureRoundInput } from "@/lib/zod/game";
import { pickGame } from "@/lib/games/select";
import {
  generateTargetNumberPuzzle,
  TARGET_NUMBER_DURATION_MS,
} from "@/lib/games/target-number";
import {
  generateZeroInPuzzle,
  ZERO_IN_DURATION_MS,
} from "@/lib/games/zero-in";
import type { GameKind } from "@/lib/games/types";

export const LOBBY_OPEN_WINDOW_MS = 10 * 60_000;

type PublicPuzzle =
  | { kind: "target_number"; target: number; bases: number[] }
  | { kind: "zero_in" }; // secret hidden until finished

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

  revalidatePath(`/meetings/${parsed.data.meeting_id}`);
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
  return {
    round_id: row.id,
    kind: "zero_in",
    puzzle: { kind: "zero_in" },
    started_at: row.started_at,
    ends_at: row.ends_at,
    status: row.status,
  };
}
