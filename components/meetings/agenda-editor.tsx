"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MeetingRoomIcon } from "@hugeicons/core-free-icons";
import { EmptyState } from "@/components/ui/empty-state";
import {
  deleteAgendaItemAction,
  reorderAgendaAction,
} from "@/lib/actions/agenda";

export type PickerConfig = {
  mode: "oneshot" | "shuffle";
  scope: "meeting_participants" | "whole_roster";
};

export type PickerResult = { user_id: string } | { shuffle_session_id: string };

export type AgendaItem = {
  id: string;
  ordinal: number;
  title: string;
  kind: "discussion" | "prompt" | "picker";
  prompt_id: string | null;
  picker_config: PickerConfig | null;
  picker_result: PickerResult | null;
};

export type PromptOption = {
  id: string;
  question: string;
};

export function AgendaEditor({
  meetingId,
  items,
  readOnly = false,
}: {
  meetingId: string;
  items: AgendaItem[];
  /** Kept for API compatibility with existing callers. */
  availablePrompts?: PromptOption[];
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function remove(id: string) {
    setErr(null);
    start(async () => {
      const res = await deleteAgendaItemAction(id);
      if (!res.ok) {
        setErr(res.error.message);
        return;
      }
      router.refresh();
    });
  }

  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = items.slice();
    const [row] = next.splice(i, 1);
    next.splice(j, 0, row);
    setErr(null);
    start(async () => {
      const res = await reorderAgendaAction({
        meeting_id: meetingId,
        item_ids: next.map((r) => r.id),
      });
      if (!res.ok) {
        setErr(res.error.message);
        return;
      }
      router.refresh();
    });
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={MeetingRoomIcon}
        headline="No agenda items yet"
        body={
          readOnly
            ? "The host hasn't added any items."
            : "Add one from the panel on the right to keep the meeting on track."
        }
      />
    );
  }

  if (readOnly) {
    return (
      <div className="space-y-3">
        {items.map((it, i) => (
          <Card key={it.id} size="sm" className="!py-3">
            <CardContent className="flex items-center gap-3 !px-4">
              <div className="w-6 text-xs text-ink-soft">{i + 1}.</div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-ink">{it.title}</div>
                <div className="text-xs text-ink-soft capitalize">{it.kind}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((it, i) => (
        <Card key={it.id} size="sm" className="!py-3">
          <CardContent className="flex items-center gap-3 !px-4">
            <div className="w-6 text-xs text-ink-soft">{i + 1}.</div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-ink">{it.title}</div>
              <div className="text-xs text-ink-soft capitalize">{it.kind}</div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              onClick={() => move(i, -1)}
              disabled={pending || i === 0}
              aria-label="Move up"
            >
              ↑
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              onClick={() => move(i, 1)}
              disabled={pending || i === items.length - 1}
              aria-label="Move down"
            >
              ↓
            </Button>
            <Button
              type="button"
              variant="destructive-outline"
              size="sm"
              onClick={() => remove(it.id)}
              disabled={pending}
            >
              Remove
            </Button>
          </CardContent>
        </Card>
      ))}
      {err && (
        <p className="text-sm text-danger-text" role="alert">
          {err}
        </p>
      )}
    </div>
  );
}
