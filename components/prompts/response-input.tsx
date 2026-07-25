"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { submitResponse } from "@/lib/actions/response";

export type PromptForResponse = {
  id: string;
  response_type:
    "text" | "single_choice" | "multi_choice" | "yes_no" | "rating";
  options?: { id: string; label: string }[] | null;
  rating_min?: number | null;
  rating_max?: number | null;
  anonymity: "attributed" | "hard_anonymous";
};

export function ResponseInput({
  prompt,
  alreadyResponded,
}: {
  prompt: PromptForResponse;
  alreadyResponded: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(alreadyResponded);
  const [confirming, setConfirming] = useState(false);

  const [text, setText] = useState("");
  const [choice, setChoice] = useState<string>("");
  const [multi, setMulti] = useState<Set<string>>(new Set());
  const [rating, setRating] = useState<number | null>(null);

  const isAnonymous = prompt.anonymity === "hard_anonymous";

  function toggleMulti(id: string) {
    setMulti((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function buildResponse(): unknown {
    switch (prompt.response_type) {
      case "text":
        return { text };
      case "single_choice":
      case "yes_no":
        return { option_id: choice };
      case "multi_choice":
        return { option_ids: Array.from(multi) };
      case "rating":
        return { value: rating };
    }
  }

  function reallySubmit() {
    setErr(null);
    const response = buildResponse();
    start(async () => {
      const res = await submitResponse(prompt.id, response);
      if (!res.ok) {
        setErr(res.error.message);
        setConfirming(false);
        return;
      }
      setConfirming(false);
      setDone(true);
      router.refresh();
    });
  }

  function onSubmitClick() {
    if (isAnonymous) {
      setConfirming(true);
    } else {
      reallySubmit();
    }
  }

  if (done) {
    return (
      <div className="rounded-lg border bg-muted/30 p-4 text-sm">
        You&apos;ve responded. Waiting on others…
      </div>
    );
  }

  const disabled =
    pending ||
    (prompt.response_type === "text" && text.trim().length === 0) ||
    ((prompt.response_type === "single_choice" ||
      prompt.response_type === "yes_no") &&
      !choice) ||
    (prompt.response_type === "multi_choice" && multi.size === 0) ||
    (prompt.response_type === "rating" && rating == null);

  return (
    <div className="space-y-4">
      {prompt.response_type === "text" && (
        <div className="space-y-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={2000}
            rows={4}
            className="w-full rounded-lg border bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            placeholder="Your answer…"
          />
          <div className="text-xs text-muted-foreground">
            {text.length} / 2000
          </div>
        </div>
      )}

      {(prompt.response_type === "single_choice" ||
        prompt.response_type === "yes_no") && (
        <div className="space-y-2">
          {(prompt.options ?? []).map((o) => (
            <label
              key={o.id}
              className={
                "flex items-center gap-3 rounded-lg border px-3 py-2 cursor-pointer transition-colors " +
                (choice === o.id
                  ? "bg-primary/10 border-primary"
                  : "hover:bg-muted")
              }
            >
              <input
                type="radio"
                name="choice"
                value={o.id}
                checked={choice === o.id}
                onChange={() => setChoice(o.id)}
                className="accent-primary"
              />
              <span>{o.label}</span>
            </label>
          ))}
        </div>
      )}

      {prompt.response_type === "multi_choice" && (
        <div className="space-y-2">
          {(prompt.options ?? []).map((o) => (
            <label
              key={o.id}
              className={
                "flex items-center gap-3 rounded-lg border px-3 py-2 cursor-pointer transition-colors " +
                (multi.has(o.id)
                  ? "bg-primary/10 border-primary"
                  : "hover:bg-muted")
              }
            >
              <input
                type="checkbox"
                checked={multi.has(o.id)}
                onChange={() => toggleMulti(o.id)}
                className="accent-primary"
              />
              <span>{o.label}</span>
            </label>
          ))}
        </div>
      )}

      {prompt.response_type === "rating" && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {Array.from(
              {
                length: (prompt.rating_max ?? 5) - (prompt.rating_min ?? 1) + 1,
              },
              (_, i) => (prompt.rating_min ?? 1) + i,
            ).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setRating(v)}
                className={
                  "h-10 w-10 rounded-md border text-sm font-medium transition-colors " +
                  (rating === v
                    ? "bg-primary text-primary-foreground border-primary"
                    : "hover:bg-muted")
                }
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      )}

      {err && (
        <p className="text-sm text-destructive" role="alert">
          {err}
        </p>
      )}

      <Button onClick={onSubmitClick} disabled={disabled}>
        {pending
          ? "Submitting…"
          : isAnonymous
            ? "Submit anonymously"
            : "Submit"}
      </Button>

      {confirming && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="anon-confirm-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        >
          <div className="w-full max-w-sm rounded-lg border bg-background p-5 shadow-lg space-y-4">
            <div>
              <h2 id="anon-confirm-title" className="text-base font-semibold">
                Anonymous — final.
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Take a moment. Once submitted, this response cannot be edited or
                withdrawn, and it isn&apos;t tied to your account in the
                database.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setConfirming(false)}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button onClick={reallySubmit} disabled={pending}>
                {pending ? "Submitting…" : "Submit anonymously"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
