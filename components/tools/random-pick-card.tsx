"use client";
import { useCallback, useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { oneShotPick } from "@/lib/actions/picker";

export function RandomPickCard({ meetingId }: { meetingId?: string }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);

  const resolveName = useCallback(async (id: string) => {
    const s = createSupabaseBrowserClient();
    const { data } = await s
      .from("profiles")
      .select("display_name")
      .eq("id", id)
      .single();
    setName((data?.display_name as string) ?? "?");
  }, []);

  const roll = useCallback(() => {
    setErr(null);
    setName(null);
    start(async () => {
      const res = await oneShotPick(meetingId);
      if (!res.ok) {
        setErr(res.error.message);
        return;
      }
      setUserId(res.data.user_id);
      await resolveName(res.data.user_id);
    });
  }, [meetingId, resolveName]);

  useEffect(() => {
    roll();
  }, [roll]);

  return (
    <div className="rounded-lg border p-6 space-y-4">
      <div className="min-h-24 flex items-center justify-center text-center">
        {pending ? (
          <div className="text-sm text-muted-foreground animate-pulse">
            Rolling…
          </div>
        ) : err ? (
          <div className="text-sm text-destructive" role="alert">
            {err}
          </div>
        ) : userId ? (
          <div
            key={userId}
            className="space-y-1 transition-opacity duration-300 opacity-100"
          >
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              And the pick is
            </div>
            <div className="text-3xl font-semibold">{name ?? "…"}</div>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">No pick yet.</div>
        )}
      </div>
      <div className="flex justify-center">
        <Button onClick={roll} disabled={pending} variant="outline">
          {pending ? "…" : "Pick again"}
        </Button>
      </div>
    </div>
  );
}
