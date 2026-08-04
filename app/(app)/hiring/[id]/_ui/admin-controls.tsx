"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  connectSheetAction, previewMappingAction, refreshEvaluationAction,
  setPanelAction, openEvaluationAction, closeEvaluationAction, reopenEvaluationAction,
} from "@/lib/actions/evaluation";
import { MappingDialog } from "@/app/(app)/hiring/[id]/_ui/mapping-dialog";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

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

  // Panel is "dirty" when the current selection differs (order-independent)
  // from the saved panel prop; disables Save until there's a real change.
  const panelDirty =
    selected.length !== panel.length || !selected.every((id) => panel.includes(id));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Admin</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-wrap items-end gap-3">
          <Label className="flex-col items-start gap-1">
            Spreadsheet ID
            <Input value={sheetId} onChange={(e) => setSheetId(e.target.value)} className="w-auto" />
          </Label>
          <Label className="flex-col items-start gap-1">
            Tab (optional)
            <Input value={tab} onChange={(e) => setTab(e.target.value)} className="w-auto" />
          </Label>
          <Button
            variant="outline"
            onClick={() => run(() => connectSheetAction({ evaluationId: evaluation.id, sheetId, sheetTab: tab || null }))}
          >
            Connect sheet
          </Button>
          <Button
            variant="outline"
            disabled={!evaluation.sheet_id}
            onClick={() => start(async () => {
              const r = await previewMappingAction({ evaluationId: evaluation.id });
              if (r.ok) setDetected({ d: r.data.detected, headers: r.data.sampleHeaders });
              else setMsg(`Error: ${r.error.message}`);
            })}
          >
            Detect columns
          </Button>
        </div>

        {detected && (
          <MappingDialog evaluationId={evaluation.id} detected={detected.d}
            headers={detected.headers} onClose={() => setDetected(null)} />
        )}

        <fieldset className="space-y-2 text-sm">
          <legend className="font-display font-extrabold text-ink">Panel</legend>
          <div className="flex flex-wrap gap-2">
            {roster.map((p) => {
              const isOn = selected.includes(p.id);
              return (
                <label
                  key={p.id}
                  className={
                    "flex items-center gap-2 rounded-md border-chunk px-3 py-2 cursor-pointer select-none transition-all duration-fast " +
                    (isOn
                      ? "bg-primary text-primary-ink border-primary shadow-[-3px_3px_0_0_var(--primary-shadow)]"
                      : "bg-surface-raised text-ink border-ink hover:bg-surface hover:-translate-y-[1px] hover:shadow-flat")
                  }
                >
                  <input
                    type="checkbox"
                    checked={isOn}
                    onChange={(e) => setSelected((s) => e.target.checked ? [...s, p.id] : s.filter((x) => x !== p.id))}
                    className="sr-only"
                  />
                  <span className="font-medium">{p.display_name}</span>
                </label>
              );
            })}
          </div>
          <Button
            variant="outline"
            disabled={pending || !panelDirty}
            onClick={() => run(() => setPanelAction({ evaluationId: evaluation.id, profileIds: selected }))}
          >
            Save panel
          </Button>
        </fieldset>
      </CardContent>
      <CardFooter className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          disabled={!evaluation.mapping_confirmed}
          onClick={() => run(() => refreshEvaluationAction({ evaluationId: evaluation.id }))}
        >
          Refresh {evaluation.last_synced_at ? `(synced ${new Date(evaluation.last_synced_at).toLocaleString()})` : ""}
        </Button>
        {evaluation.status === "draft" && (
          <Button onClick={() => run(() => openEvaluationAction({ evaluationId: evaluation.id }))}>Open</Button>
        )}
        {evaluation.status === "open" && (
          <Button onClick={() => run(() => closeEvaluationAction({ evaluationId: evaluation.id }))}>Close</Button>
        )}
        {evaluation.status === "closed" && (
          <Button variant="outline" onClick={() => run(() => reopenEvaluationAction({ evaluationId: evaluation.id }))}>Reopen</Button>
        )}
        {msg && <p className="text-sm text-ink-soft">{msg}</p>}
      </CardFooter>
    </Card>
  );
}
