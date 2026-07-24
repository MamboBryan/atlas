"use client";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import type { AgendaItem } from "@/components/meetings/agenda-editor";

export function AgendaRunner({ current }: { current: AgendaItem | null }) {
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
      <div className="rounded-lg border p-4 space-y-2">
        <div className="text-xs text-muted-foreground uppercase tracking-wide">
          Picker
        </div>
        <div className="text-lg font-medium">{current.title}</div>
        <p className="text-sm text-muted-foreground">
          Random picker lands in Phase 6.
        </p>
      </div>
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
            Live embed of the prompt lands in Phase 6 alongside the picker.
          </p>
        </div>
      )}
    </div>
  );
}
