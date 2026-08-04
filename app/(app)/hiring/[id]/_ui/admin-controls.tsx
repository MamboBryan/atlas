"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  connectSheetAction, previewMappingAction, refreshEvaluationAction,
  setPanelAction, openEvaluationAction, closeEvaluationAction, reopenEvaluationAction,
} from "@/lib/actions/evaluation";
import { MappingDialog } from "@/app/(app)/hiring/[id]/_ui/mapping-dialog";

type Ev = {
  id: string; status: "draft" | "open" | "closed";
  sheet_id: string | null; mapping_confirmed: boolean; last_synced_at: string | null;
};
type Detected = { emailColumn: string; nameColumn: string | null; timestampColumn: string | null; questionColumns: string[] };

export function AdminControls({
  evaluation, roster = [], panel = [],
}: {
  evaluation: Ev; roster?: { id: string; display_name: string }[]; panel?: string[];
}) {
  const [sheetId, setSheetId] = useState(evaluation.sheet_id ?? "");
  const [tab, setTab] = useState("");
  const [detected, setDetected] = useState<{ d: Detected; headers: string[] } | null>(null);
  const [msg, setMsg] = useState("");
  const [selected, setSelected] = useState<string[]>(panel);
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = (fn: () => Promise<{ ok: boolean; error?: { message: string } }>) =>
    start(async () => { const r = await fn(); setMsg(r.ok ? "Done." : `Error: ${r.error?.message}`); router.refresh(); });

  return (
    <section className="rounded-lg border border-ink/15 p-4 space-y-4">
      <h2 className="font-medium">Admin</h2>

      <div className="flex flex-wrap items-end gap-2">
        <label className="text-sm">Spreadsheet ID
          <input value={sheetId} onChange={(e) => setSheetId(e.target.value)}
            className="mt-1 block rounded border border-ink/15 px-2 py-1" />
        </label>
        <label className="text-sm">Tab (optional)
          <input value={tab} onChange={(e) => setTab(e.target.value)}
            className="mt-1 block rounded border border-ink/15 px-2 py-1" />
        </label>
        <button className="rounded border border-ink/15 px-3 py-1.5 text-sm"
          onClick={() => run(() => connectSheetAction({ evaluationId: evaluation.id, sheetId, sheetTab: tab || null }))}>
          Connect sheet
        </button>
        <button className="rounded border border-ink/15 px-3 py-1.5 text-sm" disabled={!evaluation.sheet_id}
          onClick={() => start(async () => {
            const r = await previewMappingAction({ evaluationId: evaluation.id });
            if (r.ok) setDetected({ d: r.data.detected, headers: r.data.sampleHeaders });
            else setMsg(`Error: ${r.error.message}`);
          })}>
          Detect columns
        </button>
      </div>

      {detected && (
        <MappingDialog evaluationId={evaluation.id} detected={detected.d}
          headers={detected.headers} onClose={() => setDetected(null)} />
      )}

      <fieldset className="text-sm">
        <legend className="font-medium">Panel</legend>
        <div className="mt-1 flex flex-wrap gap-3">
          {roster.map((p) => (
            <label key={p.id} className="flex items-center gap-1">
              <input type="checkbox" checked={selected.includes(p.id)}
                onChange={(e) => setSelected((s) => e.target.checked ? [...s, p.id] : s.filter((x) => x !== p.id))} />
              {p.display_name}
            </label>
          ))}
        </div>
        <button className="mt-2 rounded border border-ink/15 px-3 py-1.5"
          onClick={() => run(() => setPanelAction({ evaluationId: evaluation.id, profileIds: selected }))}>
          Save panel
        </button>
      </fieldset>

      <div className="flex flex-wrap gap-2">
        <button className="rounded border border-ink/15 px-3 py-1.5 text-sm" disabled={!evaluation.mapping_confirmed}
          onClick={() => run(() => refreshEvaluationAction({ evaluationId: evaluation.id }))}>
          Refresh {evaluation.last_synced_at ? `(synced ${new Date(evaluation.last_synced_at).toLocaleString()})` : ""}
        </button>
        {evaluation.status === "draft" && (
          <button className="rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground"
            onClick={() => run(() => openEvaluationAction({ evaluationId: evaluation.id }))}>Open</button>
        )}
        {evaluation.status === "open" && (
          <button className="rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground"
            onClick={() => run(() => closeEvaluationAction({ evaluationId: evaluation.id }))}>Close</button>
        )}
        {evaluation.status === "closed" && (
          <button className="rounded border border-ink/15 px-3 py-1.5 text-sm"
            onClick={() => run(() => reopenEvaluationAction({ evaluationId: evaluation.id }))}>Reopen</button>
        )}
      </div>
      {msg && <p className="text-sm text-ink/60">{msg}</p>}
    </section>
  );
}
