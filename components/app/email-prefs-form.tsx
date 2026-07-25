"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { updateProfile } from "@/lib/actions/profile";

type Prefs = Record<string, boolean>;

const KINDS: { key: string; label: string; desc: string }[] = [
  {
    key: "meeting_scheduled",
    label: "Meeting scheduled",
    desc: "When a new meeting is created or generated for you.",
  },
  {
    key: "meeting_starts_soon",
    label: "Meeting starts soon",
    desc: "10 minutes before a scheduled meeting.",
  },
  {
    key: "meeting_postponed",
    label: "Meeting postponed",
    desc: "When a meeting is rescheduled (manual or auto).",
  },
  {
    key: "meeting_cancelled",
    label: "Meeting cancelled",
    desc: "When a meeting is cancelled.",
  },
  {
    key: "async_prompts_pending",
    label: "Async prompts pending",
    desc: "Reminders that you have prompts to answer.",
  },
  {
    key: "poll_created",
    label: "Poll created",
    desc: "When a new poll opens.",
  },
  {
    key: "poll_revealed",
    label: "Poll revealed",
    desc: "When results become visible on polls you answered.",
  },
];

export function EmailPrefsForm({
  displayName,
  avatarUrl,
  emailPrefs,
}: {
  displayName: string;
  avatarUrl: string | null;
  emailPrefs: Prefs;
}) {
  const router = useRouter();
  const [prefs, setPrefs] = useState<Prefs>({ ...emailPrefs });
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function toggle(k: string) {
    setSaved(false);
    setPrefs((p) => ({ ...p, [k]: p[k] === false ? true : false }));
  }

  function save() {
    setErr(null);
    setSaved(false);
    start(async () => {
      const res = await updateProfile({
        display_name: displayName,
        avatar_url: avatarUrl,
        email_prefs: prefs,
      });
      if (!res.ok) {
        setErr(res.error.message);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <ul className="divide-y divide-[var(--surface-raised-shadow)] rounded-lg border border-[var(--surface-raised-shadow)] bg-surface-raised">
        {KINDS.map((k) => {
          const enabled = prefs[k.key] !== false;
          return (
            <li
              key={k.key}
              className="flex items-start justify-between gap-4 p-3"
            >
              <div>
                <div className="text-sm font-medium text-ink">{k.label}</div>
                <div className="text-xs text-ink-soft">{k.desc}</div>
              </div>
              <button
                type="button"
                onClick={() => toggle(k.key)}
                className={
                  "relative h-7 w-12 shrink-0 rounded-[6px] border border-[var(--surface-raised-shadow)] shadow-[-2px_2px_0_0_var(--surface-raised-shadow)] transition-colors duration-fast ease-soft " +
                  (enabled ? "bg-primary" : "bg-surface")
                }
                aria-pressed={enabled}
                aria-label={`Toggle ${k.label}`}
              >
                <span
                  className={
                    "absolute top-1/2 left-0 h-5 w-5 -translate-y-1/2 rounded-full border border-[var(--surface-raised-shadow)] bg-surface-raised transition-transform duration-fast ease-soft " +
                    (enabled ? "translate-x-[22px]" : "translate-x-[2px]")
                  }
                />
              </button>
            </li>
          );
        })}
      </ul>
      {err && <p className="text-sm text-red-500">{err}</p>}
      {saved && <p className="text-sm text-green-600">Preferences saved.</p>}
      <Button onClick={save} disabled={pending}>
        {pending ? "Saving…" : "Save preferences"}
      </Button>
    </div>
  );
}
