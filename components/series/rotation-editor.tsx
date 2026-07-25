"use client";
import { Button } from "@/components/ui/button";

type RosterRow = { id: string; display_name: string };

export function RotationEditor({
  roster,
  value,
  onChange,
}: {
  roster: RosterRow[];
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const nameById = new Map(roster.map((r) => [r.id, r.display_name]));
  const inRotation = new Set(value);
  const available = roster.filter((r) => !inRotation.has(r.id));

  function add(id: string) {
    onChange([...value, id]);
  }
  function remove(idx: number) {
    onChange(value.filter((_, i) => i !== idx));
  }
  function move(idx: number, dir: -1 | 1) {
    const next = value.slice();
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    onChange(next);
  }

  return (
    <div className="space-y-3">
      <div className="rounded-md border">
        {value.length === 0 ? (
          <div className="p-3 text-sm text-muted-foreground">
            Add members below to build the rotation order.
          </div>
        ) : (
          <ol className="divide-y">
            {value.map((id, i) => (
              <li
                key={id}
                className="flex items-center justify-between gap-2 p-2 text-sm"
              >
                <span className="flex items-center gap-2">
                  <span className="w-6 text-muted-foreground tabular-nums">
                    {i + 1}.
                  </span>
                  {nameById.get(id) ?? id.slice(0, 8)}
                </span>
                <span className="flex gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                  >
                    ↑
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => move(i, 1)}
                    disabled={i === value.length - 1}
                  >
                    ↓
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => remove(i)}
                  >
                    Remove
                  </Button>
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>

      {available.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs uppercase text-muted-foreground tracking-wide">
            Add member
          </div>
          <div className="flex flex-wrap gap-1.5">
            {available.map((r) => (
              <Button
                key={r.id}
                type="button"
                size="sm"
                variant="outline"
                onClick={() => add(r.id)}
              >
                + {r.display_name}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
