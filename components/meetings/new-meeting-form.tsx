"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { SheetBody, SheetFooter } from "@/components/ui/sheet";
import { fireConfettiFrom } from "@/components/ui/confetti-burst";
import { createMeetingAction } from "@/app/(app)/meetings/actions";

export function NewMeetingForm({
  defaultTimezone,
  onDone,
}: {
  defaultTimezone: string;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  const router = useRouter();

  return (
    <>
      <SheetBody className="space-y-4">
        <form
          id="new-meeting-form"
          action={(fd: FormData) => {
            setError(null);
            startTransition(async () => {
              const res = await createMeetingAction(fd);
              if (res?.error) {
                setError(res.error);
                return;
              }
              toast.success("Meeting scheduled!");
              fireConfettiFrom(submitRef.current);
              onDone();
              router.refresh();
            });
          }}
          className="space-y-4"
        >
          <label className="block space-y-1">
            <span className="text-sm font-medium text-ink">Title</span>
            <Input name="title" required autoFocus placeholder="Weekly retro" />
          </label>

          <label className="block space-y-1">
            <span className="text-sm font-medium text-ink">Start</span>
            <Input type="datetime-local" name="scheduled_start" required />
          </label>

          <label className="block space-y-1">
            <span className="text-sm font-medium text-ink">Timezone</span>
            <Input
              name="timezone"
              defaultValue={defaultTimezone}
              required
              placeholder="UTC"
            />
          </label>

          {error && (
            <p className="text-sm text-danger-text" role="alert">
              {error}
            </p>
          )}

          {/* Hidden submit button so form dispatching works */}
          <button ref={submitRef} type="submit" className="sr-only" aria-hidden>
            Submit
          </button>
        </form>
      </SheetBody>
      <SheetFooter
        primary="Create meeting"
        loading={pending}
        onPrimary={() => {
          document
            .getElementById("new-meeting-form")
            ?.dispatchEvent(
              new Event("submit", { cancelable: true, bubbles: true }),
            );
        }}
      />
    </>
  );
}
