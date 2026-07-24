"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  addAgendaItemAction,
  deleteAgendaItemAction,
  reorderAgendaAction,
} from "@/lib/actions/agenda";

export type PickerConfig = {
  mode: "oneshot" | "shuffle";
  scope: "meeting_participants" | "whole_roster";
};

export type PickerResult = { user_id: string } | { shuffle_session_id: string };

export type AgendaItem = {
  id: string;
  ordinal: number;
  title: string;
  kind: "discussion" | "prompt" | "picker";
  prompt_id: string | null;
  picker_config: PickerConfig | null;
  picker_result: PickerResult | null;
};

export type PromptOption = {
  id: string;
  question: string;
};

export function AgendaEditor({
  meetingId,
  items,
  availablePrompts,
}: {
  meetingId: string;
  items: AgendaItem[];
  availablePrompts: PromptOption[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const [kind, setKind] = useState<AgendaItem["kind"]>("discussion");
  const [title, setTitle] = useState("");
  const [promptId, setPromptId] = useState<string>("");
  const [pickerScope, setPickerScope] = useState<
    "whole_roster" | "meeting_participants"
  >("meeting_participants");
  const [pickerMode, setPickerMode] = useState<"oneshot" | "shuffle">(
    "oneshot",
  );

  function add() {
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

  function remove(id: string) {
    setErr(null);
    start(async () => {
      const res = await deleteAgendaItemAction(id);
      if (!res.ok) {
        setErr(res.error.message);
        return;
      }
      router.refresh();
    });
  }

  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = items.slice();
    const [row] = next.splice(i, 1);
    next.splice(j, 0, row);
    setErr(null);
    start(async () => {
      const res = await reorderAgendaAction({
        meeting_id: meetingId,
        item_ids: next.map((r) => r.id),
      });
      if (!res.ok) {
        setErr(res.error.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {items.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No agenda items yet. Add one below.
          </p>
        )}
        {items.map((it, i) => (
          <div
            key={it.id}
            className="flex items-center gap-2 rounded-md border p-2"
          >
            <div className="text-xs w-6 text-muted-foreground">
              {i + 1}.
            </div>
            <div className="flex-1 min-w-0">
              <div className="truncate">{it.title}</div>
              <div className="text-xs text-muted-foreground">{it.kind}</div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => move(i, -1)}
              disabled={pending || i === 0}
            >
              ↑
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => move(i, 1)}
              disabled={pending || i === items.length - 1}
            >
              ↓
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => remove(it.id)}
              disabled={pending}
            >
              Remove
            </Button>
          </div>
        ))}
      </div>

      <div className="rounded-md border p-3 space-y-3">
        <div className="text-sm font-medium">Add item</div>

        <div className="space-y-2">
          <Label>Kind</Label>
          <div className="flex flex-wrap gap-2">
            {(
              [
                { v: "discussion", label: "Discussion" },
                { v: "prompt", label: "Prompt" },
                { v: "picker", label: "Picker" },
              ] as const
            ).map((o) => (
              <button
                key={o.v}
                type="button"
                onClick={() => setKind(o.v)}
                className={
                  "px-3 py-1.5 text-sm rounded-md border transition-colors " +
                  (kind === o.v
                    ? "bg-primary text-primary-foreground border-primary"
                    : "hover:bg-muted")
                }
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

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

        {kind === "prompt" && (
          <div className="space-y-2">
            <Label htmlFor="ai-prompt">Prompt</Label>
            <select
              id="ai-prompt"
              value={promptId}
              onChange={(e) => setPromptId(e.target.value)}
              className="w-full rounded-md border bg-transparent px-3 py-2 text-sm"
            >
              <option value="">— pick a prompt —</option>
              {availablePrompts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.question}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Only shows standalone prompts you own. Meeting-scoped prompts
              land in a later phase.
            </p>
          </div>
        )}

        {kind === "picker" && (
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-2">
              <Label>Mode</Label>
              <div className="flex gap-2">
                {(["oneshot", "shuffle"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setPickerMode(m)}
                    className={
                      "px-3 py-1.5 text-sm rounded-md border transition-colors " +
                      (pickerMode === m
                        ? "bg-primary text-primary-foreground border-primary"
                        : "hover:bg-muted")
                    }
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Scope</Label>
              <div className="flex gap-2">
                {(
                  [
                    { v: "meeting_participants", label: "Meeting" },
                    { v: "whole_roster", label: "Roster" },
                  ] as const
                ).map((s) => (
                  <button
                    key={s.v}
                    type="button"
                    onClick={() => setPickerScope(s.v)}
                    className={
                      "px-3 py-1.5 text-sm rounded-md border transition-colors " +
                      (pickerScope === s.v
                        ? "bg-primary text-primary-foreground border-primary"
                        : "hover:bg-muted")
                    }
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {err && (
          <p className="text-sm text-destructive" role="alert">
            {err}
          </p>
        )}

        <Button
          onClick={add}
          disabled={pending || title.trim().length === 0}
        >
          {pending ? "…" : "Add"}
        </Button>
      </div>
    </div>
  );
}
