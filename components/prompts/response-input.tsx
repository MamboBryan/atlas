"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { submitResponse } from "@/lib/actions/response";

export type PromptForResponse = {
  id: string;
  response_type:
    "text" | "single_choice" | "multi_choice" | "yes_no" | "rating";
  options?: { id: string; label: string }[] | null;
  rating_min?: number | null;
  rating_max?: number | null;
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

  const [text, setText] = useState("");
  const [choice, setChoice] = useState<string>("");
  const [multi, setMulti] = useState<Set<string>>(new Set());
  const [rating, setRating] = useState<number | null>(null);

  function toggleMulti(id: string) {
    setMulti((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function submit() {
    setErr(null);
    let response: unknown;
    switch (prompt.response_type) {
      case "text":
        response = { text };
        break;
      case "single_choice":
      case "yes_no":
        response = { option_id: choice };
        break;
      case "multi_choice":
        response = { option_ids: Array.from(multi) };
        break;
      case "rating":
        response = { value: rating };
        break;
    }
    start(async () => {
      const res = await submitResponse(prompt.id, response);
      if (!res.ok) {
        setErr(res.error.message);
        return;
      }
      setDone(true);
      router.refresh();
    });
  }

  if (done) {
    return (
      <div className="rounded-lg border bg-muted/30 p-4 text-sm">
        You&apos;ve responded. Waiting on others…
      </div>
    );
  }

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

      <Button
        onClick={submit}
        disabled={
          pending ||
          (prompt.response_type === "text" && text.trim().length === 0) ||
          ((prompt.response_type === "single_choice" ||
            prompt.response_type === "yes_no") &&
            !choice) ||
          (prompt.response_type === "multi_choice" && multi.size === 0) ||
          (prompt.response_type === "rating" && rating == null)
        }
      >
        {pending ? "Submitting…" : "Submit"}
      </Button>
    </div>
  );
}
