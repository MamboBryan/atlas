"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RotationEditor } from "@/components/series/rotation-editor";
import {
  createSeriesAction,
  updateSeriesAction,
  setRotationAction,
} from "@/lib/actions/series";
import type { AgendaTemplateItem } from "@/lib/zod/series";

type RosterRow = { id: string; display_name: string };

type Mode =
  | { kind: "create" }
  | {
      kind: "edit";
      id: string;
      initial: {
        name: string;
        description: string | null;
        rrule: string;
        timezone: string;
        rotation_order: string[];
        default_participant_ids: string[] | null;
        agenda_template: AgendaTemplateItem[];
      };
    };

type RRule = {
  freq: "DAILY" | "WEEKLY" | "MONTHLY";
  byday: string;
  byhour: number;
  byminute: number;
};

const DAYS: { code: string; label: string }[] = [
  { code: "MO", label: "Mon" },
  { code: "TU", label: "Tue" },
  { code: "WE", label: "Wed" },
  { code: "TH", label: "Thu" },
  { code: "FR", label: "Fri" },
  { code: "SA", label: "Sat" },
  { code: "SU", label: "Sun" },
];

function parseRRule(s: string): RRule {
  const parts = new Map<string, string>();
  for (const kv of s.split(";")) {
    const [k, v] = kv.split("=");
    if (k && v) parts.set(k, v);
  }
  const freq = (parts.get("FREQ") ?? "WEEKLY") as RRule["freq"];
  const byday = parts.get("BYDAY") ?? "MO";
  const byhour = Number(parts.get("BYHOUR") ?? "9");
  const byminute = Number(parts.get("BYMINUTE") ?? "0");
  return { freq, byday, byhour, byminute };
}

function buildRRule(r: RRule): string {
  const bits = [`FREQ=${r.freq}`];
  if (r.freq === "WEEKLY") bits.push(`BYDAY=${r.byday}`);
  bits.push(`BYHOUR=${r.byhour}`);
  bits.push(`BYMINUTE=${r.byminute}`);
  return bits.join(";");
}

export function SeriesForm({
  roster,
  mode,
}: {
  roster: RosterRow[];
  mode: Mode;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [formErr, setFormErr] = useState<string | null>(null);

  const defaultTz = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC",
    [],
  );

  const initial = mode.kind === "edit" ? mode.initial : null;
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [tz, setTz] = useState(initial?.timezone ?? defaultTz);
  const [rrule, setRRule] = useState<RRule>(
    parseRRule(initial?.rrule ?? "FREQ=WEEKLY;BYDAY=MO;BYHOUR=10;BYMINUTE=0"),
  );
  const [rotationOrder, setRotationOrder] = useState<string[]>(
    initial?.rotation_order ?? [],
  );
  const [restrictParticipants, setRestrictParticipants] = useState(
    !!initial?.default_participant_ids?.length,
  );
  const [participants, setParticipants] = useState<Set<string>>(
    new Set(initial?.default_participant_ids ?? []),
  );
  const [template, setTemplate] = useState<AgendaTemplateItem[]>(
    initial?.agenda_template ?? [],
  );

  function toggleParticipant(id: string) {
    setParticipants((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function addTemplateItem(kind: "discussion" | "prompt" | "picker") {
    setTemplate((prev) => [
      ...prev,
      kind === "prompt"
        ? { kind: "prompt", title: "New prompt", prompt_id: null }
        : kind === "picker"
          ? { kind: "picker", title: "Pick someone" }
          : { kind: "discussion", title: "New topic" },
    ]);
  }

  function updateTemplateTitle(idx: number, title: string) {
    setTemplate((prev) =>
      prev.map((it, i) => (i === idx ? { ...it, title } : it)),
    );
  }

  function removeTemplateItem(idx: number) {
    setTemplate((prev) => prev.filter((_, i) => i !== idx));
  }

  function submit() {
    setFormErr(null);
    if (rotationOrder.length === 0) {
      setFormErr("Add at least one member to the rotation.");
      return;
    }
    if (restrictParticipants && participants.size === 0) {
      setFormErr(
        "Choose at least one default participant, or turn off restriction.",
      );
      return;
    }
    const payload = {
      name,
      description: description.trim() === "" ? null : description.trim(),
      rrule: buildRRule(rrule),
      timezone: tz,
      rotation_order: rotationOrder,
      default_participant_ids: restrictParticipants
        ? Array.from(participants)
        : null,
      agenda_template: template,
    };
    start(async () => {
      if (mode.kind === "create") {
        const res = await createSeriesAction(payload);
        if (!res.ok) {
          setFormErr(res.error.message);
          return;
        }
        router.push(`/series/${res.data.id}` as never);
      } else {
        const rotRes = await setRotationAction({
          id: mode.id,
          rotation_order: rotationOrder,
        });
        if (!rotRes.ok) {
          setFormErr(rotRes.error.message);
          return;
        }
        const res = await updateSeriesAction({ id: mode.id, ...payload });
        if (!res.ok) {
          setFormErr(res.error.message);
          return;
        }
        router.refresh();
      }
    });
  }

  const disabled = pending || name.trim().length === 0;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="s-name">Name</Label>
        <Input
          id="s-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={120}
          placeholder="Weekly retro"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="s-desc">Description (optional)</Label>
        <textarea
          id="s-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={2000}
          className="w-full min-h-[80px] rounded-md border bg-transparent px-3 py-2 text-sm"
          placeholder="What this series is for"
        />
      </div>

      <fieldset className="space-y-3 rounded-md border p-3">
        <legend className="text-sm font-medium px-1">Recurrence</legend>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div className="space-y-1">
            <Label htmlFor="s-freq">Frequency</Label>
            <select
              id="s-freq"
              value={rrule.freq}
              onChange={(e) =>
                setRRule({ ...rrule, freq: e.target.value as RRule["freq"] })
              }
              className="w-full rounded-md border bg-transparent px-2 py-2 text-sm"
            >
              <option value="DAILY">Daily</option>
              <option value="WEEKLY">Weekly</option>
              <option value="MONTHLY">Monthly</option>
            </select>
          </div>
          {rrule.freq === "WEEKLY" && (
            <div className="space-y-1">
              <Label htmlFor="s-day">Day</Label>
              <select
                id="s-day"
                value={rrule.byday}
                onChange={(e) => setRRule({ ...rrule, byday: e.target.value })}
                className="w-full rounded-md border bg-transparent px-2 py-2 text-sm"
              >
                {DAYS.map((d) => (
                  <option key={d.code} value={d.code}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="s-hour">Hour</Label>
            <Input
              id="s-hour"
              type="number"
              min={0}
              max={23}
              value={rrule.byhour}
              onChange={(e) =>
                setRRule({ ...rrule, byhour: Number(e.target.value) })
              }
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="s-min">Minute</Label>
            <Input
              id="s-min"
              type="number"
              min={0}
              max={59}
              value={rrule.byminute}
              onChange={(e) =>
                setRRule({ ...rrule, byminute: Number(e.target.value) })
              }
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="s-tz">Timezone</Label>
          <Input
            id="s-tz"
            value={tz}
            onChange={(e) => setTz(e.target.value)}
            placeholder="Africa/Nairobi"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Rendered as <code>{buildRRule(rrule)}</code>.
        </p>
      </fieldset>

      <fieldset className="space-y-3 rounded-md border p-3">
        <legend className="text-sm font-medium px-1">Rotation</legend>
        <RotationEditor
          roster={roster}
          value={rotationOrder}
          onChange={setRotationOrder}
        />
      </fieldset>

      <fieldset className="space-y-3 rounded-md border p-3">
        <legend className="text-sm font-medium px-1">Participants</legend>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={restrictParticipants}
            onChange={(e) => setRestrictParticipants(e.target.checked)}
          />
          Restrict generated meetings to specific participants
        </label>
        {restrictParticipants && (
          <div className="rounded-md border divide-y">
            {roster.length === 0 && (
              <div className="p-3 text-sm text-muted-foreground">
                No active members.
              </div>
            )}
            {roster.map((r) => (
              <label key={r.id} className="flex items-center gap-2 p-2 text-sm">
                <input
                  type="checkbox"
                  checked={participants.has(r.id)}
                  onChange={() => toggleParticipant(r.id)}
                />
                {r.display_name}
              </label>
            ))}
          </div>
        )}
      </fieldset>

      <fieldset className="space-y-3 rounded-md border p-3">
        <legend className="text-sm font-medium px-1">Agenda template</legend>
        {template.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Add items to auto-populate agendas for every occurrence.
          </p>
        )}
        {template.length > 0 && (
          <ol className="divide-y rounded-md border">
            {template.map((it, i) => (
              <li key={i} className="flex items-center gap-2 p-2 text-sm">
                <span className="w-6 text-muted-foreground tabular-nums">
                  {i + 1}.
                </span>
                <span className="text-xs uppercase text-muted-foreground w-20">
                  {it.kind}
                </span>
                <Input
                  value={it.title}
                  onChange={(e) => updateTemplateTitle(i, e.target.value)}
                  maxLength={120}
                  className="flex-1"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => removeTemplateItem(i)}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ol>
        )}
        <div className="flex flex-wrap gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => addTemplateItem("discussion")}
          >
            + Discussion
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => addTemplateItem("picker")}
          >
            + Picker
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Prompts can be attached later on the generated meeting.
        </p>
      </fieldset>

      {formErr && (
        <p className="text-sm text-destructive" role="alert">
          {formErr}
        </p>
      )}

      <div className="flex gap-2">
        <Button onClick={submit} disabled={disabled}>
          {pending
            ? mode.kind === "create"
              ? "Creating…"
              : "Saving…"
            : mode.kind === "create"
              ? "Create series"
              : "Save changes"}
        </Button>
      </div>
    </div>
  );
}
