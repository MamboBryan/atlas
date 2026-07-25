"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { ChessKingIcon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetBody,
  SheetFooter,
  SheetTrigger,
} from "@/components/ui/sheet";
import { delegateMeetingHost } from "@/lib/actions/meeting";
import { cn } from "@/lib/utils";

type RosterMember = { id: string; display_name: string };

export function DelegateHostButton({
  meetingId,
  currentHostId,
  roster,
}: {
  meetingId: string;
  currentHostId: string | null;
  roster: RosterMember[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function submit() {
    if (!selectedId) return;
    setErr(null);
    start(async () => {
      const res = await delegateMeetingHost(meetingId, selectedId);
      if (!res.ok) {
        setErr(res.error.message);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  const candidates = roster.filter((m) => m.id !== currentHostId);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button variant="outline" size="sm">
            Delegate host
          </Button>
        }
      />
      <SheetContent>
        <SheetHeader
          title="Delegate host"
          description="Hand the host role to another team member. They'll take over control of this meeting."
        />
        <SheetBody className="space-y-2">
          {candidates.length === 0 ? (
            <p className="text-sm text-ink-soft">
              No other roster members available to delegate to.
            </p>
          ) : (
            candidates.map((m) => {
              const active = selectedId === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setSelectedId(m.id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-md border-[3px] border-solid border-ink px-4 py-3 text-left text-sm text-ink shadow-flat transition-all",
                    active
                      ? "bg-accent text-accent-ink"
                      : "bg-surface-raised hover:-translate-y-[1px] hover:shadow-lift",
                  )}
                >
                  <HugeiconsIcon
                    icon={ChessKingIcon}
                    size={18}
                    strokeWidth={2}
                    className="shrink-0"
                  />
                  <span className="capitalize">{m.display_name}</span>
                </button>
              );
            })
          )}
          {err && (
            <p className="text-sm text-danger-text" role="alert">
              {err}
            </p>
          )}
        </SheetBody>
        <SheetFooter
          primary="Delegate"
          loading={pending}
          disabled={!selectedId || candidates.length === 0}
          onPrimary={submit}
        />
      </SheetContent>
    </Sheet>
  );
}
