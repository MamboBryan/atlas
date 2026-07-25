"use client";
import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { buttonVariants, Button } from "@/components/ui/button";
import type { AgendaItem } from "@/components/meetings/agenda-editor";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  oneShotPick,
  setAgendaPickerResult,
  startShuffle,
} from "@/lib/actions/picker";
import { ShuffleRunner } from "@/components/tools/shuffle-runner";

export function AgendaRunner({
  current,
  meetingId,
  isHost,
}: {
  current: AgendaItem | null;
  meetingId: string;
  isHost: boolean;
}) {
  if (!current) {
    return (
      <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
        Nothing selected. Host will advance to the next item.
      </div>
    );
  }

  if (current.kind === "discussion") {
    return (
      <div className="rounded-lg border p-4 space-y-2">
        <div className="text-xs text-muted-foreground uppercase tracking-wide">
          Discussion
        </div>
        <div className="text-lg font-medium">{current.title}</div>
        <p className="text-sm text-muted-foreground">
          Open discussion — no recording in v1.
        </p>
      </div>
    );
  }

  if (current.kind === "picker") {
    return (
      <PickerAgendaItem
        item={current}
        meetingId={meetingId}
        isHost={isHost}
      />
    );
  }

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="text-xs text-muted-foreground uppercase tracking-wide">
        Prompt
      </div>
      <div className="text-lg font-medium">{current.title}</div>
      {current.prompt_id && (
        <div className="pt-2">
          <Link
            href={`/polls/${current.prompt_id}` as never}
            className={buttonVariants({ variant: "outline" })}
          >
            Open prompt
          </Link>
          <p className="text-xs text-muted-foreground mt-2">
            Live embed of the prompt lands with Phase 7.
          </p>
        </div>
      )}
    </div>
  );
}

function PickerAgendaItem({
  item,
  meetingId,
  isHost,
}: {
  item: AgendaItem;
  meetingId: string;
  isHost: boolean;
}) {
  const config = item.picker_config;
  const result = item.picker_result;
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [pickName, setPickName] = useState<string | null>(null);

  const oneshotUserId =
    result && "user_id" in result ? result.user_id : null;
  const shuffleSessionId =
    result && "shuffle_session_id" in result
      ? result.shuffle_session_id
      : null;

  const resolveName = useCallback(async (id: string) => {
    const s = createSupabaseBrowserClient();
    const { data } = await s
      .from("profiles")
      .select("display_name")
      .eq("id", id)
      .single();
    setPickName((data?.display_name as string) ?? "?");
  }, []);

  useEffect(() => {
    if (oneshotUserId) resolveName(oneshotUserId);
  }, [oneshotUserId, resolveName]);

  const doOneShot = () => {
    setErr(null);
    start(async () => {
      const pick = await oneShotPick(meetingId);
      if (!pick.ok) {
        setErr(pick.error.message);
        return;
      }
      const persist = await setAgendaPickerResult(item.id, {
        user_id: pick.data.user_id,
      });
      if (!persist.ok) {
        setErr(persist.error.message);
      }
    });
  };

  const doStartShuffle = () => {
    setErr(null);
    start(async () => {
      const s = await startShuffle(meetingId);
      if (!s.ok) {
        setErr(s.error.message);
        return;
      }
      const persist = await setAgendaPickerResult(item.id, {
        shuffle_session_id: s.data.id,
      });
      if (!persist.ok) {
        setErr(persist.error.message);
      }
    });
  };

  if (!config) {
    return (
      <div className="rounded-lg border p-4 text-sm text-destructive">
        Missing picker config.
      </div>
    );
  }

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="text-xs text-muted-foreground uppercase tracking-wide">
        Picker · {config.mode}
      </div>
      <div className="text-lg font-medium">{item.title}</div>

      {config.mode === "oneshot" && (
        <div className="space-y-3">
          {oneshotUserId ? (
            <div className="rounded-md border p-6 text-center">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                And the pick is
              </div>
              <div className="text-3xl font-semibold">
                {pickName ?? "…"}
              </div>
            </div>
          ) : (
            <div className="rounded-md border p-6 text-center text-sm text-muted-foreground">
              {isHost ? "Click Pick to draw." : "Waiting for host to pick."}
            </div>
          )}
          {isHost && (
            <div className="flex justify-center">
              <Button onClick={doOneShot} disabled={pending}>
                {pending ? "…" : oneshotUserId ? "Pick again" : "Pick"}
              </Button>
            </div>
          )}
        </div>
      )}

      {config.mode === "shuffle" && (
        <div className="space-y-3">
          {shuffleSessionId ? (
            <ShuffleRunner
              sessionId={shuffleSessionId}
              meetingId={meetingId}
              canControl={isHost}
            />
          ) : isHost ? (
            <div className="flex justify-center">
              <Button onClick={doStartShuffle} disabled={pending}>
                {pending ? "…" : "Start shuffle"}
              </Button>
            </div>
          ) : (
            <div className="rounded-md border p-6 text-center text-sm text-muted-foreground">
              Waiting for host to start.
            </div>
          )}
        </div>
      )}

      {err && (
        <p className="text-sm text-destructive text-center" role="alert">
          {err}
        </p>
      )}
    </div>
  );
}
