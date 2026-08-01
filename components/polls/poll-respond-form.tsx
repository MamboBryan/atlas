"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { BouncingDots } from "@/components/ui/bouncing-dots";
import { Textarea } from "@/components/ui/textarea";
import { fireConfetti } from "@/components/ui/confetti-burst";
import { Sticker } from "@/components/ui/sticker";
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

export function PollRespondForm({
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
  const [showThumb, setShowThumb] = useState(false);

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
      toast.success("Your answer's in ✓");
      // Fire confetti on every successful submit — roster_size is not
      // returned by submitResponse, so we can't detect "last respondent"
      // cheaply. Firing on every submit is still delightful.
      fireConfetti();
      setShowThumb(true);
      setTimeout(() => setShowThumb(false), 800);
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
      <div className="relative rounded-lg border border-ink/20 bg-surface-raised p-5 text-sm text-ink-soft">
        You&apos;ve responded. Waiting on others…
        {showThumb && (
          <span className="pointer-events-none absolute -top-6 right-4 animate-rise-in">
            <Sticker name="thumbs-up" size="md" rotate={-6} />
          </span>
        )}
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
    <div className="space-y-5">
      {prompt.response_type === "text" && (
        <div className="space-y-2">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={2000}
            rows={5}
            placeholder="Your answer…"
          />
          <div className="text-xs text-ink-soft">{text.length} / 2000</div>
        </div>
      )}

      {(prompt.response_type === "single_choice" ||
        prompt.response_type === "yes_no") && (
        <div className="space-y-3">
          {(prompt.options ?? []).map((o) => {
            const selected = choice === o.id;
            return (
              <label
                key={o.id}
                className={
                  "flex items-center rounded-md border-chunk px-4 py-3 cursor-pointer transition-all duration-fast " +
                  (selected
                    ? "bg-primary text-primary-ink border-primary shadow-[-6px_6px_0_0_var(--primary-shadow)]"
                    : "bg-surface-raised text-ink border-ink hover:bg-surface hover:-translate-y-[1px] hover:shadow-flat")
                }
              >
                <input
                  type="radio"
                  name="choice"
                  value={o.id}
                  checked={selected}
                  onChange={() => setChoice(o.id)}
                  className="sr-only"
                />
                <span className="font-medium">{o.label}</span>
              </label>
            );
          })}
        </div>
      )}

      {prompt.response_type === "multi_choice" && (
        <div className="space-y-3">
          {(prompt.options ?? []).map((o) => {
            const selected = multi.has(o.id);
            return (
              <label
                key={o.id}
                className={
                  "flex items-center rounded-md border-chunk px-4 py-3 cursor-pointer transition-all duration-fast " +
                  (selected
                    ? "bg-primary text-primary-ink border-primary shadow-[-6px_6px_0_0_var(--primary-shadow)]"
                    : "bg-surface-raised text-ink border-ink hover:bg-surface hover:-translate-y-[1px] hover:shadow-flat")
                }
              >
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => toggleMulti(o.id)}
                  className="sr-only"
                />
                <span className="font-medium">{o.label}</span>
              </label>
            );
          })}
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
                  "h-12 w-12 rounded-md border-chunk border-ink font-display font-extrabold text-sm transition-all duration-fast " +
                  (rating === v
                    ? "bg-primary text-primary-ink shadow-flat"
                    : "bg-surface-raised text-ink hover:bg-surface hover:-translate-y-[1px] hover:shadow-flat")
                }
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      )}

      {err && (
        <p className="text-sm text-danger-text" role="alert">
          {err}
        </p>
      )}

      <Button onClick={onSubmitClick} disabled={disabled} size="lg">
        {pending ? (
          <BouncingDots />
        ) : isAnonymous ? (
          "Submit anonymously"
        ) : (
          "Submit"
        )}
      </Button>

      {confirming && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="anon-confirm-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        >
          <div className="w-full max-w-sm rounded-lg border-chunk border-ink bg-surface-raised p-6 shadow-lift space-y-4">
            <div>
              <h2
                id="anon-confirm-title"
                className="font-display text-base font-extrabold text-ink"
              >
                Anonymous — final.
              </h2>
              <p className="text-sm text-ink-soft mt-1">
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
                {pending ? <BouncingDots /> : "Submit anonymously"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
