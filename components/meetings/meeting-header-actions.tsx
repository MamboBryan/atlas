"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetBody,
  SheetFooter,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { startMeeting, postponeMeetingManual } from "@/lib/actions/meeting";

type MeetingStatus =
  | "scheduled"
  | "live"
  | "ended"
  | "postponed"
  | "cancelled";

function toLocalInputValue(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function MeetingHeaderActions({
  meetingId,
  status,
  scheduledStart,
  isHost,
}: {
  meetingId: string;
  status: MeetingStatus;
  scheduledStart: string;
  isHost: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [postponeOpen, setPostponeOpen] = useState(false);

  const defaultPostponeLocal = useMemo(() => {
    const d = new Date(scheduledStart);
    d.setDate(d.getDate() + 1);
    return toLocalInputValue(d.toISOString());
  }, [scheduledStart]);

  const [newStartLocal, setNewStartLocal] = useState(defaultPostponeLocal);

  if (status === "live") {
    if (!isHost) return null;
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="default"
          size="sm"
          render={<Link href={`/meetings/${meetingId}/present` as never} />}
        >
          Present →
        </Button>
      </div>
    );
  }

  if (status !== "scheduled" && status !== "postponed") return null;

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

  function doPostpone() {
    setErr(null);
    start(async () => {
      const iso = new Date(newStartLocal).toISOString();
      const res = await postponeMeetingManual({
        meeting_id: meetingId,
        new_scheduled_start: iso,
      });
      if (!res.ok) {
        setErr(res.error.message);
        return;
      }
      setPostponeOpen(false);
      router.push(`/meetings/${res.data.id}`);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="default"
        size="sm"
        disabled={pending || status !== "scheduled"}
        onClick={doStart}
      >
        {pending ? "…" : "Start meeting"}
      </Button>
      <Sheet open={postponeOpen} onOpenChange={setPostponeOpen}>
        <SheetTrigger
          render={
            <Button variant="outline" size="sm" disabled={pending}>
              Postpone
            </Button>
          }
        />
        <SheetContent>
          <SheetHeader
            title="Postpone meeting"
            description="Reschedule this meeting to a new time. A new occurrence will be created."
          />
          <SheetBody className="space-y-3">
            <label className="block space-y-1">
              <span className="text-sm font-medium text-ink">
                New start time
              </span>
              <Input
                type="datetime-local"
                value={newStartLocal}
                onChange={(e) => setNewStartLocal(e.target.value)}
              />
            </label>
            {err && (
              <p className="text-sm text-danger-text" role="alert">
                {err}
              </p>
            )}
          </SheetBody>
          <SheetFooter
            primary="Confirm postpone"
            loading={pending}
            onPrimary={doPostpone}
          />
        </SheetContent>
      </Sheet>
      {err && !postponeOpen && (
        <span className="text-xs text-danger-text" role="alert">
          {err}
        </span>
      )}
    </div>
  );
}
