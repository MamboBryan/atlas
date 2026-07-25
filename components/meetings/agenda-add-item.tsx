"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetBody,
  SheetFooter,
  SheetTrigger,
} from "@/components/ui/sheet";
import { addAgendaItemAction } from "@/lib/actions/agenda";
import { createPrompt } from "@/lib/actions/prompt";
import { cn } from "@/lib/utils";

type Kind = "discussion" | "prompt" | "picker";
type PickerMode = "oneshot" | "shuffle";
type PickerScope = "meeting_participants" | "whole_roster";
type PromptResponseType =
  | "text"
  | "single_choice"
  | "multi_choice"
  | "yes_no"
  | "rating";
type PromptAnonymity = "attributed" | "hard_anonymous";
type PromptTiming = "async" | "live";
type RatingMax = 5 | 10;

export type PromptOption = { id: string; question: string };

const KINDS: { v: Kind; label: string }[] = [
  { v: "discussion", label: "Discussion" },
  { v: "prompt", label: "Prompt" },
  { v: "picker", label: "Picker" },
];

const MODES: { v: PickerMode; label: string }[] = [
  { v: "oneshot", label: "One-shot" },
  { v: "shuffle", label: "Shuffle" },
];

const SCOPES: { v: PickerScope; label: string }[] = [
  { v: "meeting_participants", label: "Meeting" },
  { v: "whole_roster", label: "Roster" },
];

const RESPONSE_TYPES: { v: PromptResponseType; label: string }[] = [
  { v: "text", label: "Text" },
  { v: "single_choice", label: "Single choice" },
  { v: "multi_choice", label: "Multi choice" },
  { v: "yes_no", label: "Yes / No" },
  { v: "rating", label: "Rating" },
];

const ANONYMITY: { v: PromptAnonymity; label: string }[] = [
  { v: "attributed", label: "Attributed" },
  { v: "hard_anonymous", label: "Anonymous" },
];

const TIMING: { v: PromptTiming; label: string }[] = [
  { v: "async", label: "Async" },
  { v: "live", label: "Live" },
];

const RATING_SCALES: { v: RatingMax; label: string }[] = [
  { v: 5, label: "1 – 5" },
  { v: 10, label: "1 – 10" },
];

function slugify(s: string, i: number) {
  const slug = s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug || `opt-${i}`;
}

function parseOptions(raw: string) {
  return raw
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((label, i) => ({ id: slugify(label, i), label }));
}

function toIsoOrUndefined(localValue: string) {
  if (!localValue) return undefined;
  const d = new Date(localValue);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

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
            key={o.v}
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

export function AgendaAddItem({
  meetingId,
  availablePrompts,
}: {
  meetingId: string;
  availablePrompts: PromptOption[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const [kind, setKind] = useState<Kind>("discussion");
  const [title, setTitle] = useState("");
  const [promptId, setPromptId] = useState<string>("");
  const [pickerScope, setPickerScope] =
    useState<PickerScope>("meeting_participants");
  const [pickerMode, setPickerMode] = useState<PickerMode>("oneshot");

  // Local list so newly-created prompts show up without a full refresh.
  const [prompts, setPrompts] = useState<PromptOption[]>(availablePrompts);

  const selectedPromptQuestion = useMemo(
    () => prompts.find((p) => p.id === promptId)?.question ?? null,
    [prompts, promptId],
  );

  useEffect(() => {
    if (kind === "prompt") setTitle(selectedPromptQuestion ?? "");
  }, [kind, selectedPromptQuestion]);

  const [pickOpen, setPickOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  function submit() {
    setErr(null);
    let input: unknown;
    if (kind === "discussion") {
      input = { meeting_id: meetingId, kind, title };
    } else if (kind === "prompt") {
      if (!promptId) {
        setErr("Pick a prompt.");
        return;
      }
      input = { meeting_id: meetingId, kind, title, prompt_id: promptId };
    } else {
      input = {
        meeting_id: meetingId,
        kind,
        title,
        picker_config: { mode: pickerMode, scope: pickerScope },
      };
    }
    start(async () => {
      const res = await addAgendaItemAction(input);
      if (!res.ok) {
        setErr(res.error.message);
        return;
      }
      setTitle("");
      setPromptId("");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="space-y-2">
        <Label>Kind</Label>
        <TabRow value={kind} onChange={setKind} options={KINDS} />
      </div>

      {kind !== "prompt" && (
        <div className="space-y-2">
          <Label htmlFor="ai-title">Title</Label>
          <Input
            id="ai-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            placeholder="e.g. Roundtable"
          />
        </div>
      )}

      {kind === "prompt" && (
        <div className="space-y-2">
          <Label>Prompt</Label>
          {selectedPromptQuestion ? (
            <div className="rounded-md border-[3px] border-solid border-ink bg-surface-raised px-3 py-3 text-sm text-ink shadow-flat">
              {selectedPromptQuestion}
            </div>
          ) : (
            <p className="text-xs text-ink-soft">No prompt selected yet.</p>
          )}
          <div className="flex flex-wrap gap-2">
            <PickPromptSheet
              open={pickOpen}
              onOpenChange={setPickOpen}
              prompts={prompts}
              selectedId={promptId}
              onPick={(id) => {
                setPromptId(id);
                setPickOpen(false);
              }}
            />
            <CreatePromptSheet
              meetingId={meetingId}
              open={createOpen}
              onOpenChange={setCreateOpen}
              onCreated={(created) => {
                setPrompts((prev) => [created, ...prev]);
                setPromptId(created.id);
                setCreateOpen(false);
              }}
            />
          </div>
        </div>
      )}

      {kind === "picker" && (
        <>
          <div className="space-y-2">
            <Label>Mode</Label>
            <TabRow value={pickerMode} onChange={setPickerMode} options={MODES} />
          </div>
          <div className="space-y-2">
            <Label>Scope</Label>
            <TabRow
              value={pickerScope}
              onChange={setPickerScope}
              options={SCOPES}
            />
          </div>
        </>
      )}

      {err && (
        <p className="text-sm text-danger-text" role="alert">
          {err}
        </p>
      )}

      <Button
        variant="default"
        size="lg"
        className="w-full mt-2"
        onClick={submit}
        disabled={
          pending ||
          (kind === "prompt" ? !promptId : title.trim().length === 0)
        }
      >
        {pending ? "Adding…" : "Add"}
      </Button>
    </div>
  );
}

function PickPromptSheet({
  open,
  onOpenChange,
  prompts,
  selectedId,
  onPick,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  prompts: PromptOption[];
  selectedId: string;
  onPick: (id: string) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger
        render={
          <Button variant="outline" size="sm">
            Pick existing
          </Button>
        }
      />
      <SheetContent>
        <SheetHeader
          title="Pick a prompt"
          description="Choose from the standalone prompts you own."
        />
        <SheetBody className="space-y-2">
          {prompts.length === 0 ? (
            <p className="text-sm text-ink-soft">
              You don&apos;t have any standalone prompts yet. Create one instead.
            </p>
          ) : (
            prompts.map((p) => {
              const active = selectedId === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onPick(p.id)}
                  className={cn(
                    "w-full rounded-md border-[3px] border-solid border-ink px-4 py-3 text-left text-sm text-ink shadow-flat transition-all",
                    active
                      ? "bg-accent text-accent-ink"
                      : "bg-surface-raised hover:-translate-y-[1px] hover:shadow-lift",
                  )}
                >
                  {p.question}
                </button>
              );
            })
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

function CreatePromptSheet({
  meetingId,
  open,
  onOpenChange,
  onCreated,
}: {
  meetingId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (p: PromptOption) => void;
}) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const [question, setQuestion] = useState("");
  const [responseType, setResponseType] = useState<PromptResponseType>("text");
  const [anonymity, setAnonymity] = useState<PromptAnonymity>("attributed");
  const [timing, setTiming] = useState<PromptTiming>("async");
  const [optionsRaw, setOptionsRaw] = useState("");
  const [ratingMax, setRatingMax] = useState<RatingMax>(5);
  const [opensAt, setOpensAt] = useState("");
  const [closesAt, setClosesAt] = useState("");

  const needsOptions =
    responseType === "single_choice" || responseType === "multi_choice";
  const isRating = responseType === "rating";

  function submit() {
    setErr(null);
    const base = {
      question,
      anonymity,
      timing,
      opens_at: toIsoOrUndefined(opensAt),
      closes_at: toIsoOrUndefined(closesAt),
      meeting_id: meetingId,
    };

    let input: unknown;
    if (responseType === "text" || responseType === "yes_no") {
      input = { response_type: responseType, ...base };
    } else if (needsOptions) {
      const options = parseOptions(optionsRaw);
      if (options.length < 2) {
        setErr("Add at least two options (comma-separated).");
        return;
      }
      input = { response_type: responseType, ...base, options };
    } else {
      input = {
        response_type: "rating" as const,
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
      onCreated({ id: res.data.id, question });
      setQuestion("");
      setOptionsRaw("");
      setOpensAt("");
      setClosesAt("");
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger
        render={
          <Button variant="outline" size="sm">
            Create new
          </Button>
        }
      />
      <SheetContent>
        <SheetHeader
          title="Create a prompt"
          description="Prompts are polls your team can respond to."
        />
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
            <TabRow
              value={anonymity}
              onChange={setAnonymity}
              options={ANONYMITY}
            />
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

          {err && (
            <p className="text-sm text-danger-text" role="alert">
              {err}
            </p>
          )}
        </SheetBody>
        <SheetFooter
          primary="Create prompt"
          loading={pending}
          disabled={question.trim().length === 0}
          onPrimary={submit}
        />
      </SheetContent>
    </Sheet>
  );
}
