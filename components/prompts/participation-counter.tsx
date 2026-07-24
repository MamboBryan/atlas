"use client";
import { useEffect, useState, useCallback } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function ParticipationCounter({ promptId }: { promptId: string }) {
  const [n, setN] = useState(0);
  const [d, setD] = useState(0);

  const refresh = useCallback(async () => {
    const s = createSupabaseBrowserClient();
    const [a, b] = await Promise.all([
      s.rpc("atlas_prompt_counter", { p_prompt: promptId }),
      s.rpc("atlas_prompt_denominator", { p_prompt: promptId }),
    ]);
    setN((a.data as number) ?? 0);
    setD((b.data as number) ?? 0);
  }, [promptId]);

  useEffect(() => {
    const s = createSupabaseBrowserClient();
    refresh();
    const ch = s
      .channel(`part:${promptId}`)
      .on(
        "postgres_changes" as never,
        {
          event: "INSERT",
          schema: "public",
          table: "participation",
          filter: `prompt_id=eq.${promptId}`,
        },
        () => {
          refresh();
        },
      )
      .subscribe();
    return () => {
      s.removeChannel(ch);
    };
  }, [promptId, refresh]);

  return (
    <div className="text-sm text-muted-foreground">
      {n} of {d} responded · {Math.max(d - n, 0)} to go
    </div>
  );
}
