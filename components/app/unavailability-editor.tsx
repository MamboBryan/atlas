"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  clearUnavailability,
  setUnavailability,
} from "@/lib/actions/unavailability";

type Window = {
  id: string;
  starts_on: string;
  ends_on: string;
  note: string | null;
};

export function UnavailabilityEditor({ windows }: { windows: Window[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);

  function add() {
    setErr(null);
    start(async () => {
      const res = await setUnavailability({
        starts_on: startsOn,
        ends_on: endsOn,
        note: note || null,
      });
      if (!res.ok) {
        setErr(res.error.message);
        return;
      }
      setStartsOn("");
      setEndsOn("");
      setNote("");
      router.refresh();
    });
  }

  function remove(id: string) {
    start(async () => {
      await clearUnavailability(id);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-end">
        <div className="space-y-1">
          <Label htmlFor="s">Starts</Label>
          <Input
            id="s"
            type="date"
            value={startsOn}
            onChange={(e) => setStartsOn(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="e">Ends</Label>
          <Input
            id="e"
            type="date"
            value={endsOn}
            onChange={(e) => setEndsOn(e.target.value)}
          />
        </div>
        <div className="space-y-1 sm:col-span-1">
          <Label htmlFor="n">Note (optional)</Label>
          <Input
            id="n"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        <Button onClick={add} disabled={pending || !startsOn || !endsOn}>
          Add
        </Button>
      </div>
      {err && <p className="text-sm text-red-500">{err}</p>}

      <ul className="divide-y rounded border">
        {windows.length === 0 && (
          <li className="p-3 text-sm text-muted-foreground">
            No unavailability windows.
          </li>
        )}
        {windows.map((w) => (
          <li key={w.id} className="p-3 flex items-center justify-between">
            <div className="text-sm">
              <span className="font-medium">
                {w.starts_on} → {w.ends_on}
              </span>
              {w.note && (
                <span className="ml-2 text-muted-foreground">{w.note}</span>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => remove(w.id)}
              disabled={pending}
            >
              Remove
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
