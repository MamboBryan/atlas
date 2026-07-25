"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { AgendaItem } from "@/components/meetings/agenda-editor";

type Status = "ended" | "postponed" | "cancelled";

export function AgendaSummary({
  items,
  status,
}: {
  items: AgendaItem[];
  status: Status;
}) {
  const label =
    status === "ended"
      ? "Meeting ended"
      : status === "postponed"
        ? "Meeting postponed"
        : "Meeting cancelled";

  if (items.length === 0) {
    return (
      <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
        {label} — no agenda items.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        {label} — final state
      </div>
      <div className="space-y-2">
        {items.map((it, i) => (
          <SummaryCard key={it.id} item={it} index={i} />
        ))}
      </div>
    </div>
  );
}

function SummaryCard({ item, index }: { item: AgendaItem; index: number }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">
            {index + 1}. {item.kind}
          </div>
          <div className="text-sm font-medium truncate">{item.title}</div>
        </div>
      </div>
      <div className="mt-2">
        {item.kind === "discussion" && (
          <p className="text-xs text-muted-foreground">Open discussion.</p>
        )}
        {item.kind === "prompt" && <PromptFinal promptId={item.prompt_id} />}
        {item.kind === "picker" && <PickerFinal item={item} />}
      </div>
    </div>
  );
}

function PromptFinal({ promptId }: { promptId: string | null }) {
  const [status, setStatus] = useState<{
    is_revealed: boolean;
    is_open: boolean;
  } | null>(null);

  useEffect(() => {
    if (!promptId) return;
    let cancelled = false;
    const s = createSupabaseBrowserClient();
    s.from("prompts")
      .select("is_revealed,is_open")
      .eq("id", promptId)
      .single()
      .then(({ data }) => {
        if (cancelled || !data) return;
        setStatus({
          is_revealed: !!data.is_revealed,
          is_open: !!data.is_open,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [promptId]);

  if (!promptId) {
    return <p className="text-xs text-muted-foreground">No prompt attached.</p>;
  }
  return (
    <div className="flex items-center gap-2">
      {status?.is_revealed ? (
        <Badge variant="secondary">Revealed</Badge>
      ) : status?.is_open ? (
        <Badge>Open</Badge>
      ) : (
        <Badge variant="outline">Closed</Badge>
      )}
      <Link
        href={`/polls/${promptId}` as never}
        className={buttonVariants({ variant: "outline", size: "sm" })}
      >
        Open prompt
      </Link>
    </div>
  );
}

function PickerFinal({ item }: { item: AgendaItem }) {
  const result = item.picker_result;
  const config = item.picker_config;
  const oneshotUserId =
    result && "user_id" in result ? (result.user_id as string) : null;
  const shuffleSessionId =
    result && "shuffle_session_id" in result
      ? (result.shuffle_session_id as string)
      : null;

  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    if (!oneshotUserId) return;
    let cancelled = false;
    const s = createSupabaseBrowserClient();
    s.from("profiles")
      .select("display_name")
      .eq("id", oneshotUserId)
      .single()
      .then(({ data }) => {
        if (cancelled) return;
        setName((data?.display_name as string) ?? "?");
      });
    return () => {
      cancelled = true;
    };
  }, [oneshotUserId]);

  if (!config) {
    return (
      <p className="text-xs text-muted-foreground">No picker configured.</p>
    );
  }
  if (config.mode === "oneshot") {
    return oneshotUserId ? (
      <p className="text-sm">Picked: {name ?? "…"}</p>
    ) : (
      <p className="text-xs text-muted-foreground">No pick made.</p>
    );
  }
  return shuffleSessionId ? (
    <p className="text-xs text-muted-foreground">Shuffle session recorded.</p>
  ) : (
    <p className="text-xs text-muted-foreground">Shuffle not started.</p>
  );
}
