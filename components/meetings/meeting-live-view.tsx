"use client";
import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  CheckmarkCircle02Icon,
  MeetingRoomIcon,
} from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { advanceMeetingAgenda, endMeeting } from "@/lib/actions/meeting";
import { AgendaRunner } from "@/components/meetings/agenda-runner";
import { AgendaSummary } from "@/components/meetings/agenda-summary";
import type { AgendaItem } from "@/components/meetings/agenda-editor";
import { cn } from "@/lib/utils";

type MeetingRow = {
  id: string;
  status: "scheduled" | "live" | "ended" | "postponed" | "cancelled";
  current_agenda_item_id: string | null;
};

type TrackState = "done" | "current" | "next" | "upcoming";

export function MeetingLiveView({
  meetingId,
  initialMeeting,
  initialItems,
  isHost,
}: {
  meetingId: string;
  scheduledStart: string;
  initialMeeting: MeetingRow;
  initialItems: AgendaItem[];
  isHost: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [meeting, setMeeting] = useState<MeetingRow>(initialMeeting);
  const [items, setItems] = useState<AgendaItem[]>(initialItems);

  const refreshMeeting = useCallback(async () => {
    const s = createSupabaseBrowserClient();
    const { data } = await s
      .from("meetings")
      .select("id,status,current_agenda_item_id")
      .eq("id", meetingId)
      .single();
    if (data) setMeeting(data as MeetingRow);
  }, [meetingId]);

  const refreshItems = useCallback(async () => {
    const s = createSupabaseBrowserClient();
    const { data } = await s
      .from("agenda_items")
      .select("id,ordinal,title,kind,prompt_id,picker_config,picker_result")
      .eq("meeting_id", meetingId)
      .order("ordinal", { ascending: true });
    if (data) setItems(data as AgendaItem[]);
  }, [meetingId]);

  useEffect(() => {
    const s = createSupabaseBrowserClient();
    const ch = s
      .channel(`meeting:${meetingId}:${crypto.randomUUID()}`)
      .on(
        "postgres_changes" as never,
        {
          event: "UPDATE",
          schema: "public",
          table: "meetings",
          filter: `id=eq.${meetingId}`,
        },
        () => {
          refreshMeeting();
        },
      )
      .on(
        "postgres_changes" as never,
        {
          event: "*",
          schema: "public",
          table: "agenda_items",
          filter: `meeting_id=eq.${meetingId}`,
        },
        () => {
          refreshItems();
        },
      )
      .subscribe();
    return () => {
      s.removeChannel(ch);
    };
  }, [meetingId, refreshItems, refreshMeeting]);

  const currentIdx = items.findIndex(
    (i) => i.id === meeting.current_agenda_item_id,
  );
  const current = currentIdx >= 0 ? items[currentIdx] : null;

  function doEnd() {
    setErr(null);
    start(async () => {
      const res = await endMeeting(meetingId);
      if (!res.ok) {
        setErr(res.error.message);
        return;
      }
      router.refresh();
    });
  }

  function advanceTo(itemId: string | null) {
    setErr(null);
    start(async () => {
      const res = await advanceMeetingAgenda({
        meeting_id: meetingId,
        item_id: itemId,
      });
      if (!res.ok) {
        setErr(res.error.message);
        return;
      }
    });
  }

  function advanceNext() {
    if (items.length === 0) return;
    if (currentIdx < 0) return advanceTo(items[0].id);
    const next = items[currentIdx + 1];
    advanceTo(next ? next.id : null);
  }

  if (
    meeting.status === "ended" ||
    meeting.status === "cancelled" ||
    meeting.status === "postponed"
  ) {
    return <AgendaSummary items={items} status={meeting.status} />;
  }

  if (meeting.status !== "live") return null;

  return (
    <div className="space-y-6">
      {isHost && (
        <Card size="sm" className="!py-4">
          <CardContent className="flex flex-wrap items-center gap-3 !px-5">
            <span className="text-xs font-display font-extrabold uppercase tracking-widest text-ink-soft">
              Host controls
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="default"
                size="sm"
                onClick={advanceNext}
                disabled={pending || items.length === 0}
              >
                {currentIdx < 0
                  ? "Start agenda"
                  : currentIdx >= items.length - 1
                    ? "Finish agenda"
                    : "Next"}
              </Button>
              <Button
                variant="destructive-outline"
                size="sm"
                onClick={doEnd}
                disabled={pending}
              >
                End meeting
              </Button>
            </div>
            {err && (
              <span className="text-xs text-danger-text" role="alert">
                {err}
              </span>
            )}
          </CardContent>
        </Card>
      )}

      <section className="space-y-3">
        <h2 className="text-xs font-display font-extrabold uppercase tracking-widest text-ink-soft">
          Now
        </h2>
        {current ? (
          <AgendaRunner
            current={current}
            meetingId={meetingId}
            isHost={isHost}
          />
        ) : (
          <Card size="sm">
            <CardContent className="text-center text-sm text-ink-soft !py-6">
              Waiting for the host to start the agenda.
            </CardContent>
          </Card>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-display font-extrabold uppercase tracking-widest text-ink-soft">
          Agenda
        </h2>
        {items.length === 0 ? (
          <EmptyState
            icon={MeetingRoomIcon}
            headline="No agenda items yet"
            body="Anyone in the meeting can add an item from the right panel."
          />
        ) : (
          <div className="space-y-3">
            {items.map((it, i) => {
              const state: TrackState =
                currentIdx < 0
                  ? i === 0
                    ? "next"
                    : "upcoming"
                  : i < currentIdx
                    ? "done"
                    : i === currentIdx
                      ? "current"
                      : i === currentIdx + 1
                        ? "next"
                        : "upcoming";
              return (
                <AgendaTrackCard
                  key={it.id}
                  item={it}
                  index={i}
                  state={state}
                  isHost={isHost}
                  pending={pending}
                  onGo={() => advanceTo(it.id)}
                />
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function AgendaTrackCard({
  item,
  index,
  state,
  isHost,
  pending,
  onGo,
}: {
  item: AgendaItem;
  index: number;
  state: TrackState;
  isHost: boolean;
  pending: boolean;
  onGo: () => void;
}) {
  const isDone = state === "done";
  const isCurrent = state === "current";
  const isNext = state === "next";

  return (
    <Card
      size="sm"
      className={cn(
        "!py-3 transition-all",
        isCurrent &&
          "!bg-accent !border-accent !shadow-[-3px_3px_0_0_var(--accent-shadow)] [&_[data-slot=card-description]]:text-accent-ink/70",
        isDone && "opacity-60",
      )}
    >
      <CardContent className="flex items-center gap-3 !px-4">
        {isDone ? (
          <HugeiconsIcon
            icon={CheckmarkCircle02Icon}
            size={20}
            strokeWidth={2}
            className="shrink-0 text-success"
          />
        ) : (
          <div
            className={cn(
              "w-6 text-xs",
              isCurrent ? "text-accent-ink font-bold" : "text-ink-soft",
            )}
          >
            {index + 1}.
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div
            className={cn(
              "truncate",
              isDone && "line-through text-ink-soft",
              isCurrent && "text-accent-ink font-semibold",
            )}
          >
            {item.title}
          </div>
          <div
            className={cn(
              "text-xs capitalize",
              isCurrent ? "text-accent-ink/80" : "text-ink-soft",
            )}
          >
            {item.kind}
          </div>
        </div>
        {isCurrent && (
          <Badge variant="live" size="lg">
            Now
          </Badge>
        )}
        {isNext && (
          <Badge variant="postponed" size="lg">
            Next
          </Badge>
        )}
        {isHost && !isCurrent && !isDone && (
          <Button variant="outline" size="sm" onClick={onGo} disabled={pending}>
            Go
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
