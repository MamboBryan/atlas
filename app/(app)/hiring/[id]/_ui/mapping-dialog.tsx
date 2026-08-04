"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirmMappingAction } from "@/lib/actions/evaluation";

type Detected = {
  emailColumn: string; nameColumn: string | null;
  timestampColumn: string | null; questionColumns: string[];
};

export function MappingDialog({
  evaluationId, detected, headers, onClose,
}: {
  evaluationId: string; detected: Detected; headers: string[]; onClose: () => void;
}) {
  const [emailColumn, setEmail] = useState(detected.emailColumn);
  const [nameColumn, setName] = useState<string>(detected.nameColumn ?? "");
  const [timestampColumn, setTs] = useState<string>(detected.timestampColumn ?? "");
  const [pending, start] = useTransition();
  const router = useRouter();

  const identity = new Set([emailColumn, nameColumn, timestampColumn].filter(Boolean));
  const questionColumns = headers.filter((h) => !identity.has(h));

  return (
    <div className="rounded-lg border border-ink/15 p-4 space-y-3">
      <h3 className="font-medium">Confirm column mapping</h3>
      <label className="block text-sm">Email column
        <select value={emailColumn} onChange={(e) => setEmail(e.target.value)}
          className="mt-1 block w-full rounded border border-ink/15 px-2 py-1">
          {headers.map((h) => <option key={h} value={h}>{h}</option>)}
        </select>
      </label>
      <label className="block text-sm">Name column (optional)
        <select value={nameColumn} onChange={(e) => setName(e.target.value)}
          className="mt-1 block w-full rounded border border-ink/15 px-2 py-1">
          <option value="">— none —</option>
          {headers.map((h) => <option key={h} value={h}>{h}</option>)}
        </select>
      </label>
      <label className="block text-sm">Timestamp column (optional)
        <select value={timestampColumn} onChange={(e) => setTs(e.target.value)}
          className="mt-1 block w-full rounded border border-ink/15 px-2 py-1">
          <option value="">— none —</option>
          {headers.map((h) => <option key={h} value={h}>{h}</option>)}
        </select>
      </label>
      <div className="text-sm text-ink/70">
        Questions to be rated: {questionColumns.join(", ") || "(none)"}
      </div>
      <div className="flex gap-2">
        <button disabled={pending || !emailColumn || questionColumns.length === 0}
          onClick={() => start(async () => {
            const res = await confirmMappingAction({
              evaluationId, emailColumn,
              nameColumn: nameColumn || null,
              timestampColumn: timestampColumn || null,
              questionColumns,
            });
            if (res.ok) { onClose(); router.refresh(); }
          })}
          className="rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50">
          {pending ? "Importing…" : "Confirm & import"}
        </button>
        <button onClick={onClose} className="rounded border border-ink/15 px-3 py-1.5 text-sm">Cancel</button>
      </div>
    </div>
  );
}
