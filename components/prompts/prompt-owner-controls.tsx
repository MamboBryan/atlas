"use client";
import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { closePrompt, revealPrompt } from "@/lib/actions/prompt";
import { fireConfetti } from "@/components/ui/confetti-burst";

export function PromptOwnerControls({
  promptId,
  isOpen,
}: {
  promptId: string;
  isOpen: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function reveal() {
    setErr(null);
    start(async () => {
      const res = await revealPrompt(promptId);
      if (!res.ok) {
        setErr(res.error.message);
        return;
      }
      fireConfetti({ origin: { x: 0.5, y: 0.35 } });
      router.refresh();
    });
  }

  function close() {
    setErr(null);
    start(async () => {
      const res = await closePrompt(promptId);
      if (!res.ok) {
        setErr(res.error.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Button onClick={reveal} disabled={pending}>
          {pending ? "…" : "Reveal"}
        </Button>
        {isOpen && (
          <Button variant="outline" onClick={close} disabled={pending}>
            Close
          </Button>
        )}
      </div>
      {err && (
        <p className="text-sm text-destructive" role="alert">
          {err}
        </p>
      )}
    </div>
  );
}
