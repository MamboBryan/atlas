"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { startMeeting } from "@/lib/actions/meeting";

export function NextMeetingActions({ meetingId }: { meetingId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function doStart() {
    setErr(null);
    start(async () => {
      const res = await startMeeting(meetingId);
      if (!res.ok) {
        setErr(res.error.message);
        return;
      }
      router.push(`/meetings/${meetingId}`);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button onClick={doStart} disabled={pending} size="sm">
        {pending ? "…" : "Start meeting"}
      </Button>
      {err && (
        <span className="text-xs text-destructive" role="alert">
          {err}
        </span>
      )}
    </div>
  );
}
