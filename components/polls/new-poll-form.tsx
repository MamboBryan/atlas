"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SheetBody, SheetFooter } from "@/components/ui/sheet";
import { fireConfettiFrom } from "@/components/ui/confetti-burst";
import { createPollAction } from "@/app/(app)/polls/actions";

type ResponseType = "text" | "single_choice" | "multi_choice" | "yes_no" | "rating";

const RESPONSE_TYPES: { value: ResponseType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "single_choice", label: "Single choice" },
  { value: "multi_choice", label: "Multiple choice" },
  { value: "yes_no", label: "Yes / No" },
  { value: "rating", label: "Rating" },
];

export function NewPollForm({ onDone }: { onDone: () => void }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [responseType, setResponseType] = useState<ResponseType>("text");
  const submitRef = useRef<HTMLButtonElement>(null);
  const router = useRouter();

  const needsOptions =
    responseType === "single_choice" || responseType === "multi_choice";
  const isRating = responseType === "rating";

  return (
    <>
      <SheetBody className="space-y-5">
        <form
          id="new-poll-form"
          action={(fd: FormData) => {
            // Inject the selected response_type (driven by pill buttons, not a select)
            fd.set("response_type", responseType);
            setError(null);
            startTransition(async () => {
              const res = await createPollAction(fd);
              if (res?.error) {
                setError(res.error);
                return;
              }
              toast.success("Poll created!");
              fireConfettiFrom(submitRef.current);
              onDone();
              router.refresh();
            });
          }}
          className="space-y-5"
        >
          {/* Response type */}
          <div className="space-y-2">
            <span className="text-sm font-medium text-ink">Response type</span>
            <div className="flex flex-wrap gap-2 pt-1">
              {RESPONSE_TYPES.map((rt) => (
                <button
                  key={rt.value}
                  type="button"
                  onClick={() => setResponseType(rt.value)}
                  className={
                    "px-3 py-1.5 text-sm rounded-md border transition-colors " +
                    (responseType === rt.value
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-ink/30 hover:bg-muted")
                  }
                >
                  {rt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Question */}
          <label className="block space-y-1">
            <span className="text-sm font-medium text-ink">Question</span>
            <Textarea
              name="question"
              required
              autoFocus
              placeholder="What would you like to ask?"
              rows={3}
            />
          </label>

          {/* Options (single_choice / multi_choice) */}
          {needsOptions && (
            <label className="block space-y-1">
              <span className="text-sm font-medium text-ink">Options</span>
              <Input
                name="options"
                placeholder="Option A, Option B, Option C"
              />
              <span className="text-xs text-ink-soft">
                Comma-separated, minimum 2.
              </span>
            </label>
          )}

          {/* Rating scale */}
          {isRating && (
            <div className="space-y-2">
              <span className="text-sm font-medium text-ink">Scale</span>
              <Select name="rating_max" defaultValue="5">
                <option value="5">1 – 5</option>
                <option value="10">1 – 10</option>
              </Select>
            </div>
          )}

          {/* Anonymity */}
          <div className="space-y-1">
            <span className="text-sm font-medium text-ink">Anonymity</span>
            <Select name="anonymity" defaultValue="attributed">
              <option value="attributed">Attributed — responses show names</option>
              <option value="hard_anonymous">Anonymous — names never stored</option>
            </Select>
          </div>

          {/* Timing */}
          <div className="space-y-1">
            <span className="text-sm font-medium text-ink">Timing</span>
            <Select name="timing" defaultValue="async">
              <option value="async">Async — respond any time</option>
              <option value="live">Live — during a meeting</option>
            </Select>
          </div>

          {/* Opens at */}
          <label className="block space-y-1">
            <span className="text-sm font-medium text-ink">
              Opens at{" "}
              <span className="text-ink-soft font-normal">(optional)</span>
            </span>
            <Input type="datetime-local" name="opens_at" />
          </label>

          {error && (
            <p className="text-sm text-danger" role="alert">
              {error}
            </p>
          )}

          {/* Hidden submit so form dispatching works */}
          <button ref={submitRef} type="submit" className="sr-only" aria-hidden>
            Submit
          </button>
        </form>
      </SheetBody>

      <SheetFooter
        primary="Create poll"
        loading={pending}
        onPrimary={() => {
          document
            .getElementById("new-poll-form")
            ?.dispatchEvent(
              new Event("submit", { cancelable: true, bubbles: true }),
            );
        }}
      />
    </>
  );
}
