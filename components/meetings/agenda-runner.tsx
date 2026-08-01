"use client";
import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { AgendaItem } from "@/components/meetings/agenda-editor";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  oneShotPick,
  setAgendaPickerResult,
  startShuffle,
} from "@/lib/actions/picker";
import { ShuffleRunner } from "@/components/tools/shuffle-runner";

function KindLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs font-display font-extrabold uppercase tracking-widest text-ink-soft">
      {children}
    </div>
  );
}

function RunnerCard({ children }: { children: React.ReactNode }) {
  return (
    <Card size="sm">
      <CardContent className="space-y-2">{children}</CardContent>
    </Card>
  );
}

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
      <Card size="sm">
        <CardContent className="text-center text-sm text-ink-soft">
          Nothing selected. Host will advance to the next item.
        </CardContent>
      </Card>
    );
  }

  if (current.kind === "discussion") {
    return (
      <RunnerCard>
        <KindLabel>Discussion</KindLabel>
        <div className="font-display text-xl font-extrabold text-ink">
          {current.title}
        </div>
        <p className="text-sm text-ink-soft">
          Open discussion — no recording in v1.
        </p>
      </RunnerCard>
    );
  }

  if (current.kind === "picker") {
    return (
      <PickerAgendaItem item={current} meetingId={meetingId} isHost={isHost} />
    );
  }

  return (
    <RunnerCard>
      <KindLabel>Prompt</KindLabel>
      <div className="font-display text-xl font-extrabold text-ink">
        {current.title}
      </div>
      {current.prompt_id && (
        <div className="pt-2 space-y-2">
          <Button
            variant="outline"
            render={<Link href={`/polls/${current.prompt_id}` as never} />}
          >
            Open prompt
          </Button>
          <p className="text-xs text-ink-soft">
            Live embed of the prompt lands with Phase 7.
          </p>
        </div>
      )}
    </RunnerCard>
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

  const oneshotUserId = result && "user_id" in result ? result.user_id : null;
  const shuffleSessionId =
    result && "shuffle_session_id" in result ? result.shuffle_session_id : null;

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
      <Card size="sm">
        <CardContent className="text-sm text-danger-text">
          Missing picker config.
        </CardContent>
      </Card>
    );
  }

  return (
    <RunnerCard>
      <KindLabel>Picker · {config.mode}</KindLabel>
      <div className="font-display text-xl font-extrabold text-ink">
        {item.title}
      </div>

      {config.mode === "oneshot" && (
        <div className="space-y-3 pt-2">
          {oneshotUserId ? (
            <Card size="sm" className="!py-6">
              <CardContent className="text-center">
                <div className="text-xs uppercase tracking-widest font-display font-extrabold text-ink-soft">
                  And the pick is
                </div>
                <div className="font-display text-3xl font-extrabold text-ink pt-1">
                  {pickName ?? "…"}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card size="sm" className="!py-6">
              <CardContent className="text-center text-sm text-ink-soft">
                {isHost ? "Click Pick to draw." : "Waiting for host to pick."}
              </CardContent>
            </Card>
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
        <div className="space-y-3 pt-2">
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
            <Card size="sm" className="!py-6">
              <CardContent className="text-center text-sm text-ink-soft">
                Waiting for host to start.
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {err && (
        <p className="text-sm text-danger-text text-center" role="alert">
          {err}
        </p>
      )}
    </RunnerCard>
  );
}
