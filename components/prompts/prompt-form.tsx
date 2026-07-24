"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createPrompt } from "@/lib/actions/prompt";

type ResponseType =
  "text" | "single_choice" | "multi_choice" | "yes_no" | "rating";

type Option = { id: string; label: string };

const RESPONSE_TYPES: { value: ResponseType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "single_choice", label: "Single choice" },
  { value: "multi_choice", label: "Multiple choice" },
  { value: "yes_no", label: "Yes / No" },
  { value: "rating", label: "Rating" },
];

function slugId(label: string, i: number) {
  const s = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return s || `opt-${i + 1}`;
}

export function PromptForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const [responseType, setResponseType] = useState<ResponseType>("text");
  const [question, setQuestion] = useState("");
  const [anonymity, setAnonymity] = useState<"attributed" | "hard_anonymous">(
    "attributed",
  );
  const [options, setOptions] = useState<Option[]>([
    { id: "", label: "" },
    { id: "", label: "" },
  ]);
  const [ratingMax, setRatingMax] = useState<5 | 10>(5);

  function updateOption(i: number, label: string) {
    setOptions((prev) => {
      const next = [...prev];
      next[i] = { id: slugId(label, i), label };
      return next;
    });
  }
  function addOption() {
    setOptions((prev) => [...prev, { id: "", label: "" }]);
  }
  function removeOption(i: number) {
    setOptions((prev) => prev.filter((_, idx) => idx !== i));
  }

  function submit() {
    setErr(null);
    const base = { question, anonymity, timing: "async" as const };
    let input: unknown;
    if (responseType === "text" || responseType === "yes_no") {
      input = { response_type: responseType, ...base };
    } else if (
      responseType === "single_choice" ||
      responseType === "multi_choice"
    ) {
      const cleaned = options
        .map((o, i) => ({
          id: slugId(o.label, i),
          label: o.label.trim(),
        }))
        .filter((o) => o.label.length > 0);
      input = { response_type: responseType, ...base, options: cleaned };
    } else {
      input = {
        response_type: "rating",
        ...base,
        rating_min: 1,
        rating_max: ratingMax,
      };
    }
    start(async () => {
      const res = await createPrompt(input);
      if (!res.ok) {
        setErr(res.error.message);
        return;
      }
      router.push(`/polls/${res.data.id}` as never);
    });
  }

  const needsOptions =
    responseType === "single_choice" || responseType === "multi_choice";

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label>Response type</Label>
        <div className="flex flex-wrap gap-2">
          {RESPONSE_TYPES.map((rt) => (
            <button
              key={rt.value}
              type="button"
              onClick={() => setResponseType(rt.value)}
              className={
                "px-3 py-1.5 text-sm rounded-md border transition-colors " +
                (responseType === rt.value
                  ? "bg-primary text-primary-foreground border-primary"
                  : "hover:bg-muted")
              }
            >
              {rt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="question">Question</Label>
        <Input
          id="question"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          maxLength={500}
          placeholder="What's on your mind?"
        />
      </div>

      {needsOptions && (
        <div className="space-y-2">
          <Label>Options</Label>
          <div className="space-y-2">
            {options.map((o, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  value={o.label}
                  onChange={(e) => updateOption(i, e.target.value)}
                  placeholder={`Option ${i + 1}`}
                />
                {options.length > 2 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeOption(i)}
                  >
                    Remove
                  </Button>
                )}
              </div>
            ))}
          </div>
          {options.length < 20 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addOption}
            >
              Add option
            </Button>
          )}
        </div>
      )}

      {responseType === "rating" && (
        <div className="space-y-2">
          <Label>Scale</Label>
          <div className="flex gap-2">
            {([5, 10] as const).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setRatingMax(n)}
                className={
                  "px-3 py-1.5 text-sm rounded-md border transition-colors " +
                  (ratingMax === n
                    ? "bg-primary text-primary-foreground border-primary"
                    : "hover:bg-muted")
                }
              >
                1 – {n}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label>Anonymity</Label>
        <div className="flex gap-2">
          {(
            [
              { v: "attributed", label: "Attributed" },
              { v: "hard_anonymous", label: "Anonymous" },
            ] as const
          ).map((o) => (
            <button
              key={o.v}
              type="button"
              onClick={() => setAnonymity(o.v)}
              className={
                "px-3 py-1.5 text-sm rounded-md border transition-colors " +
                (anonymity === o.v
                  ? "bg-primary text-primary-foreground border-primary"
                  : "hover:bg-muted")
              }
            >
              {o.label}
            </button>
          ))}
        </div>
        {anonymity === "hard_anonymous" && (
          <p className="text-xs text-muted-foreground">
            Anonymous prompts are supported starting in the next phase.
          </p>
        )}
      </div>

      {err && (
        <p className="text-sm text-destructive" role="alert">
          {err}
        </p>
      )}

      <div className="flex gap-2">
        <Button
          onClick={submit}
          disabled={pending || question.trim().length === 0}
        >
          {pending ? "Creating…" : "Create poll"}
        </Button>
      </div>
    </div>
  );
}
