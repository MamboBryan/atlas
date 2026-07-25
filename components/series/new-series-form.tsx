"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { SheetBody, SheetFooter } from "@/components/ui/sheet";
import { fireConfettiFrom } from "@/components/ui/confetti-burst";
import { RotationEditor } from "@/components/series/rotation-editor";
import { createSeriesAction } from "@/app/(app)/series/actions";

type RosterRow = { id: string; display_name: string };

type RRule = {
  freq: "DAILY" | "WEEKLY" | "MONTHLY";
  byday: string;
  byhour: number;
  byminute: number;
};

const DAYS = [
  { code: "MO", label: "Mon" },
  { code: "TU", label: "Tue" },
  { code: "WE", label: "Wed" },
  { code: "TH", label: "Thu" },
  { code: "FR", label: "Fri" },
  { code: "SA", label: "Sat" },
  { code: "SU", label: "Sun" },
];

function buildRRule(r: RRule): string {
  const bits = [`FREQ=${r.freq}`];
  if (r.freq === "WEEKLY") bits.push(`BYDAY=${r.byday}`);
  bits.push(`BYHOUR=${r.byhour}`);
  bits.push(`BYMINUTE=${r.byminute}`);
  return bits.join(";");
}

export function NewSeriesForm({
  roster,
  defaultTimezone,
  onDone,
}: {
  roster: RosterRow[];
  defaultTimezone: string;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  const router = useRouter();

  const defaultTz = useMemo(
    () =>
      typeof window !== "undefined"
        ? (Intl.DateTimeFormat().resolvedOptions().timeZone ?? defaultTimezone)
        : defaultTimezone,
    [defaultTimezone],
  );

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tz, setTz] = useState(defaultTz);
  const [rrule, setRRule] = useState<RRule>({
    freq: "WEEKLY",
    byday: "MO",
    byhour: 10,
    byminute: 0,
  });
  const [rotationOrder, setRotationOrder] = useState<string[]>([]);

  function handleSubmit() {
    setError(null);
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    if (rotationOrder.length === 0) {
      setError("Add at least one member to the rotation.");
      return;
    }
    startTransition(async () => {
      const res = await createSeriesAction({
        name: name.trim(),
        description: description.trim() || null,
        rrule: buildRRule(rrule),
        timezone: tz.trim() || "UTC",
        rotation_order: rotationOrder,
        default_participant_ids: null,
        agenda_template: [],
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      toast.success("Series created!");
      fireConfettiFrom(submitRef.current);
      onDone();
      router.refresh();
    });
  }

  return (
    <>
      <SheetBody className="space-y-5">
        <label className="block space-y-1">
          <span className="text-sm font-medium text-ink">Name</span>
          <Input
            name="name"
            required
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            placeholder="Weekly retro"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium text-ink">
            Description{" "}
            <span className="text-ink-soft font-normal">(optional)</span>
          </span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={2000}
            className="w-full min-h-[72px] rounded-md border border-ink/20 bg-transparent px-3 py-2 text-sm text-ink placeholder:text-ink-soft focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="What this series is for"
          />
        </label>

        <fieldset className="space-y-3 rounded-lg border border-ink/20 p-4">
          <legend className="text-sm font-semibold text-ink px-1">
            Recurrence
          </legend>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-ink-soft">
                Frequency
              </span>
              <select
                value={rrule.freq}
                onChange={(e) =>
                  setRRule({ ...rrule, freq: e.target.value as RRule["freq"] })
                }
                className="w-full rounded-md border border-ink/20 bg-transparent px-2 py-2 text-sm text-ink"
              >
                <option value="DAILY">Daily</option>
                <option value="WEEKLY">Weekly</option>
                <option value="MONTHLY">Monthly</option>
              </select>
            </label>
            {rrule.freq === "WEEKLY" && (
              <label className="block space-y-1">
                <span className="text-xs font-medium text-ink-soft">Day</span>
                <select
                  value={rrule.byday}
                  onChange={(e) =>
                    setRRule({ ...rrule, byday: e.target.value })
                  }
                  className="w-full rounded-md border border-ink/20 bg-transparent px-2 py-2 text-sm text-ink"
                >
                  {DAYS.map((d) => (
                    <option key={d.code} value={d.code}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="block space-y-1">
              <span className="text-xs font-medium text-ink-soft">
                Hour (0–23)
              </span>
              <Input
                type="number"
                min={0}
                max={23}
                value={rrule.byhour}
                onChange={(e) =>
                  setRRule({ ...rrule, byhour: Number(e.target.value) })
                }
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-ink-soft">
                Minute (0–59)
              </span>
              <Input
                type="number"
                min={0}
                max={59}
                value={rrule.byminute}
                onChange={(e) =>
                  setRRule({ ...rrule, byminute: Number(e.target.value) })
                }
              />
            </label>
          </div>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-ink-soft">Timezone</span>
            <Input
              value={tz}
              onChange={(e) => setTz(e.target.value)}
              placeholder="Africa/Nairobi"
            />
          </label>
          <p className="text-xs text-ink-soft">
            RRULE: <code className="font-mono">{buildRRule(rrule)}</code>
          </p>
        </fieldset>

        <fieldset className="space-y-3 rounded-lg border border-ink/20 p-4">
          <legend className="text-sm font-semibold text-ink px-1">
            Rotation
          </legend>
          {/* TODO: proper member picker */}
          <RotationEditor
            roster={roster}
            value={rotationOrder}
            onChange={setRotationOrder}
          />
        </fieldset>

        {error && (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        )}

        {/* Hidden submit for form dispatch */}
        <button ref={submitRef} type="button" className="sr-only" aria-hidden>
          Submit
        </button>
      </SheetBody>
      <SheetFooter
        primary="Create series"
        loading={pending}
        onPrimary={handleSubmit}
      />
    </>
  );
}
