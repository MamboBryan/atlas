"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createOneOffMeeting } from "@/lib/actions/meeting";

type RosterRow = { id: string; display_name: string };

function localInputToIso(v: string, tz: string): string | null {
  if (!v) return null;
  const [datePart, timePart] = v.split("T");
  if (!datePart || !timePart) return null;
  const [y, m, d] = datePart.split("-").map(Number);
  const [hh, mm] = timePart.split(":").map(Number);
  const utcGuess = new Date(Date.UTC(y, m - 1, d, hh, mm));
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(utcGuess);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  const asUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour) === 24 ? 0 : Number(map.hour),
    Number(map.minute),
    Number(map.second),
  );
  const offset = asUtc - utcGuess.getTime();
  return new Date(utcGuess.getTime() - offset).toISOString();
}

export function MeetingForm({ roster }: { roster: RosterRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const defaultTz = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC",
    [],
  );

  const [title, setTitle] = useState("");
  const [when, setWhen] = useState("");
  const [tz, setTz] = useState(defaultTz);
  const [restrict, setRestrict] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function submit() {
    setErr(null);
    const iso = localInputToIso(when, tz);
    if (!iso) {
      setErr("Pick a start date and time.");
      return;
    }
    const participants =
      restrict && selected.size > 0 ? Array.from(selected) : null;
    start(async () => {
      const res = await createOneOffMeeting({
        title,
        scheduled_start: iso,
        timezone: tz,
        participants_override: participants,
      });
      if (!res.ok) {
        setErr(res.error.message);
        return;
      }
      router.push(`/meetings/${res.data.id}` as never);
    });
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
          placeholder="Weekly retro"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="when">Start</Label>
          <Input
            id="when"
            type="datetime-local"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="tz">Timezone</Label>
          <Input
            id="tz"
            value={tz}
            onChange={(e) => setTz(e.target.value)}
            placeholder="UTC"
          />
        </div>
      </div>

      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={restrict}
            onChange={(e) => setRestrict(e.target.checked)}
          />
          Restrict to specific participants
        </label>
        {restrict && (
          <div className="rounded-md border divide-y">
            {roster.length === 0 && (
              <div className="p-3 text-sm text-muted-foreground">
                No active members.
              </div>
            )}
            {roster.map((r) => (
              <label
                key={r.id}
                className="flex items-center gap-2 p-2 text-sm"
              >
                <input
                  type="checkbox"
                  checked={selected.has(r.id)}
                  onChange={() => toggle(r.id)}
                />
                {r.display_name}
              </label>
            ))}
          </div>
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
          disabled={pending || title.trim().length === 0 || when === ""}
        >
          {pending ? "Creating…" : "Create meeting"}
        </Button>
      </div>
    </div>
  );
}
