"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SheetBody, SheetFooter } from "@/components/ui/sheet";
import { fireConfettiFrom } from "@/components/ui/confetti-burst";
import { createPollAction } from "@/app/(app)/polls/actions";
import { cn } from "@/lib/utils";

type ResponseType =
  | "text"
  | "single_choice"
  | "multi_choice"
  | "yes_no"
  | "rating";
type Anonymity = "attributed" | "hard_anonymous";
type Timing = "async" | "live";
type RatingMax = 5 | 10;

const RESPONSE_TYPES: { v: ResponseType; label: string }[] = [
  { v: "text", label: "Text" },
  { v: "single_choice", label: "Single choice" },
  { v: "multi_choice", label: "Multiple choice" },
  { v: "yes_no", label: "Yes / No" },
  { v: "rating", label: "Rating" },
];

const ANONYMITY: { v: Anonymity; label: string }[] = [
  { v: "attributed", label: "Attributed" },
  { v: "hard_anonymous", label: "Anonymous" },
];

const TIMING: { v: Timing; label: string }[] = [
  { v: "async", label: "Async" },
  { v: "live", label: "Live" },
];

const RATING_SCALES: { v: RatingMax; label: string }[] = [
  { v: 5, label: "1 – 5" },
  { v: 10, label: "1 – 10" },
];

function TabRow<T extends string | number>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { v: T; label: string }[];
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const active = value === o.v;
        return (
          <button
            key={String(o.v)}
            type="button"
            onClick={() => onChange(o.v)}
            className={cn(
              "rounded-md border-[3px] border-solid border-ink px-3 py-2 text-sm shadow-flat transition-all",
              active
                ? "bg-accent text-accent-ink"
                : "bg-surface-raised text-ink hover:-translate-y-[1px] hover:shadow-lift",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function NewPollForm({ onDone }: { onDone: () => void }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const [responseType, setResponseType] = useState<ResponseType>("text");
  const [anonymity, setAnonymity] = useState<Anonymity>("attributed");
  const [timing, setTiming] = useState<Timing>("async");
  const [ratingMax, setRatingMax] = useState<RatingMax>(5);
  const [question, setQuestion] = useState("");
  const [optionsRaw, setOptionsRaw] = useState("");
  const [opensAt, setOpensAt] = useState("");
  const [closesAt, setClosesAt] = useState("");

  const submitRef = useRef<HTMLButtonElement>(null);
  const timezone =
    typeof window !== "undefined"
      ? (Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC")
      : "UTC";

  const needsOptions =
    responseType === "single_choice" || responseType === "multi_choice";
  const isRating = responseType === "rating";

  function submit() {
    setError(null);
    const fd = new FormData();
    fd.set("question", question);
    fd.set("response_type", responseType);
    fd.set("anonymity", anonymity);
    fd.set("timing", timing);
    fd.set("opens_at", opensAt);
    fd.set("closes_at", closesAt);
    fd.set("timezone", timezone);
    if (needsOptions) fd.set("options", optionsRaw);
    if (isRating) fd.set("rating_max", String(ratingMax));

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
  }

  return (
    <>
      <SheetBody className="space-y-5">
        <div className="space-y-2">
          <Label>Response type</Label>
          <TabRow
            value={responseType}
            onChange={setResponseType}
            options={RESPONSE_TYPES}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="np-question">Question</Label>
          <Input
            id="np-question"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            maxLength={500}
            placeholder="What would you like to ask?"
          />
        </div>

        {needsOptions && (
          <div className="space-y-2">
            <Label htmlFor="np-options">Options</Label>
            <Input
              id="np-options"
              value={optionsRaw}
              onChange={(e) => setOptionsRaw(e.target.value)}
              placeholder="Option A, Option B, Option C"
            />
            <p className="text-xs text-ink-soft">
              Comma-separated, minimum 2.
            </p>
          </div>
        )}

        {isRating && (
          <div className="space-y-2">
            <Label>Scale</Label>
            <TabRow
              value={ratingMax}
              onChange={setRatingMax}
              options={RATING_SCALES}
            />
          </div>
        )}

        <div className="space-y-2">
          <Label>Anonymity</Label>
          <TabRow value={anonymity} onChange={setAnonymity} options={ANONYMITY} />
        </div>

        <div className="space-y-2">
          <Label>Timing</Label>
          <TabRow value={timing} onChange={setTiming} options={TIMING} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="np-opens-at">
            Opens at{" "}
            <span className="text-ink-soft font-normal">(optional)</span>
          </Label>
          <Input
            id="np-opens-at"
            type="datetime-local"
            value={opensAt}
            onChange={(e) => setOpensAt(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="np-closes-at">
            Closes at{" "}
            <span className="text-ink-soft font-normal">(optional)</span>
          </Label>
          <Input
            id="np-closes-at"
            type="datetime-local"
            value={closesAt}
            onChange={(e) => setClosesAt(e.target.value)}
          />
        </div>

        {error && (
          <p className="text-sm text-danger-text" role="alert">
            {error}
          </p>
        )}

        <button
          ref={submitRef}
          type="button"
          className="sr-only"
          aria-hidden
          tabIndex={-1}
        >
          Submit
        </button>
      </SheetBody>

      <SheetFooter
        primary="Create poll"
        loading={pending}
        disabled={question.trim().length === 0}
        onPrimary={submit}
      />
    </>
  );
}
