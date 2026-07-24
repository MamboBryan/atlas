"use client";
import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  advanceMeetingAgenda,
  endMeeting,
  startMeeting,
} from "@/lib/actions/meeting";
import { AgendaRunner } from "@/components/meetings/agenda-runner";
import type { AgendaItem } from "@/components/meetings/agenda-editor";

type MeetingRow = {
  id: string;
  status: "scheduled" | "live" | "ended" | "postponed" | "cancelled";
  current_agenda_item_id: string | null;
};

export function MeetingLiveView({
  meetingId,
  initialMeeting,
  initialItems,
  isHost,
}: {
  meetingId: string;
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
      .select("id,ordinal,title,kind,prompt_id")
      .eq("meeting_id", meetingId)
      .order("ordinal", { ascending: true });
    if (data) setItems(data as AgendaItem[]);
  }, [meetingId]);

  useEffect(() => {
    const s = createSupabaseBrowserClient();
    const ch = s
      .channel(`meeting:${meetingId}`)
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

  function doStart() {
    setErr(null);
    start(async () => {
      const res = await startMeeting(meetingId);
      if (!res.ok) {
        setErr(res.error.message);
        return;
      }
      router.refresh();
    });
  }

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

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Agenda
          </h2>
          <Badge variant={meeting.status === "live" ? "default" : "outline"}>
            {meeting.status}
          </Badge>
        </div>
        <div className="space-y-1">
          {items.length === 0 && (
            <p className="text-sm text-muted-foreground">No items yet.</p>
          )}
          {items.map((it, i) => {
            const active = it.id === meeting.current_agenda_item_id;
            return (
              <div
                key={it.id}
                className={
                  "flex items-center gap-2 rounded-md border p-2 " +
                  (active ? "border-primary bg-primary/5" : "")
                }
              >
                <div className="text-xs w-6 text-muted-foreground">
                  {i + 1}.
                </div>
                <div className="flex-1 min-w-0">
                  <div className="truncate text-sm">{it.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {it.kind}
                  </div>
                </div>
                {isHost && meeting.status === "live" && !active && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => advanceTo(it.id)}
                    disabled={pending}
                  >
                    Go
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="space-y-3 lg:col-span-2">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Now
        </h2>
        {meeting.status === "scheduled" ? (
          <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
            Not started yet.
          </div>
        ) : meeting.status === "ended" ? (
          <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
            Meeting ended.
          </div>
        ) : (
          <AgendaRunner current={current} />
        )}

        {isHost && (
          <div className="rounded-lg border p-3 space-y-2">
            <div className="text-sm font-medium">Host controls</div>
            <div className="flex flex-wrap gap-2">
              {meeting.status === "scheduled" && (
                <Button onClick={doStart} disabled={pending}>
                  {pending ? "…" : "Start meeting"}
                </Button>
              )}
              {meeting.status === "live" && (
                <>
                  <Button
                    onClick={advanceNext}
                    disabled={pending || items.length === 0}
                  >
                    {currentIdx < 0 ? "Start agenda" : "Next"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={doEnd}
                    disabled={pending}
                  >
                    End meeting
                  </Button>
                </>
              )}
            </div>
            {err && (
              <p className="text-sm text-destructive" role="alert">
                {err}
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
