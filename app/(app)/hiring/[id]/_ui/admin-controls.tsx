"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  connectSheetAction, previewMappingAction, refreshEvaluationAction,
  setPanelAction, openEvaluationAction, closeEvaluationAction, reopenEvaluationAction,
  addEvaluationOwnerAction, removeEvaluationOwnerAction,
} from "@/lib/actions/evaluation";
import { parseCsv } from "@/lib/sheets/csv";
import { detectMapping } from "@/lib/sheets/parse";
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
  evaluation, roster = [], panel = [], owners = [], createdBy = null,
}: {
  evaluation: Ev; roster?: { id: string; display_name: string }[]; panel?: string[];
  owners?: { id: string; display_name: string }[]; createdBy?: string | null;
}) {
  const ownerIds = new Set(owners.map((o) => o.id));
  const [sheetId, setSheetId] = useState(evaluation.sheet_id ?? "");
  const [tab, setTab] = useState("");
  const [detected, setDetected] = useState<{ d: Detected; headers: string[]; csvText?: string } | null>(null);
  const [msg, setMsg] = useState("");
  const [selected, setSelected] = useState<string[]>(panel);
  const [pending, start] = useTransition();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCsvChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const text = await file.text();
    const grid = parseCsv(text);
    if (grid.headers.length === 0) { setMsg("Error: CSV appears empty"); return; }
    const d = detectMapping(grid);
    setDetected({ d, headers: grid.headers, csvText: text });
  };
  const run = (fn: () => Promise<{ ok: boolean; error?: { message: string } }>) =>
    start(async () => { const r = await fn(); setMsg(r.ok ? "Done." : `Error: ${r.error?.message}`); router.refresh(); });

  // Panel is "dirty" when the current selection differs (order-independent)
  // from the saved panel prop; disables Save until there's a real change.
  const panelDirty =
    selected.length !== panel.length || !selected.every((id) => panel.includes(id));

  return (
    <Card size="sm" className="gap-4">
      <CardHeader>
        <CardTitle>Manage evaluation</CardTitle>
      </CardHeader>

      {/* Configuration — sheet + panel */}
      <CardContent className="space-y-5">
        <div className="space-y-3">
          <p className="font-display text-sm font-extrabold text-ink">Sheet</p>
          <Label className="flex-col items-start gap-1">
            Spreadsheet ID
            <Input value={sheetId} onChange={(e) => setSheetId(e.target.value)} />
          </Label>
          <Label className="flex-col items-start gap-1">
            Tab (optional)
            <Input value={tab} onChange={(e) => setTab(e.target.value)} />
          </Label>
          <div className="flex flex-col gap-2">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => run(() => connectSheetAction({ evaluationId: evaluation.id, sheetId, sheetTab: tab || null }))}
            >
              Connect sheet
            </Button>
            <Button
              variant="outline"
              className="w-full"
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
          <div className="flex items-center gap-2">
            <div className="h-px flex-1 bg-ink/15" />
            <span className="text-xs text-ink-soft">or</span>
            <div className="h-px flex-1 bg-ink/15" />
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={handleCsvChange}
          />
          <Button
            variant="outline"
            className="w-full"
            onClick={() => fileInputRef.current?.click()}
          >
            Upload CSV
          </Button>
        </div>

        {detected && (
          <MappingDialog evaluationId={evaluation.id} detected={detected.d}
            headers={detected.headers} csvText={detected.csvText} onClose={() => setDetected(null)} />
        )}

        <div className="space-y-2">
          <p className="font-display text-sm font-extrabold text-ink">Panel</p>
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
            className="w-full"
            disabled={pending || !panelDirty}
            onClick={() => run(() => setPanelAction({ evaluationId: evaluation.id, profileIds: selected }))}
          >
            Save panel
          </Button>
        </div>

        <div className="space-y-2">
          <p className="font-display text-sm font-extrabold text-ink">Owners</p>
          <p className="text-xs text-ink-soft">
            Owners can manage and close this evaluation, and add or remove other
            owners. The creator is a permanent owner.
          </p>
          <div className="flex flex-wrap gap-2">
            {roster.map((p) => {
              const isOwner = ownerIds.has(p.id);
              const isCreator = p.id === createdBy;
              return (
                <button
                  key={p.id}
                  type="button"
                  disabled={pending || isCreator}
                  title={isCreator ? "The creator is a permanent owner" : undefined}
                  onClick={() => run(() => isOwner
                    ? removeEvaluationOwnerAction({ evaluationId: evaluation.id, profileId: p.id })
                    : addEvaluationOwnerAction({ evaluationId: evaluation.id, profileId: p.id }))}
                  className={
                    "flex items-center gap-2 rounded-md border-chunk px-3 py-2 select-none transition-all duration-fast disabled:cursor-not-allowed " +
                    (isOwner
                      ? "bg-primary text-primary-ink border-primary shadow-[-3px_3px_0_0_var(--primary-shadow)]"
                      : "bg-surface-raised text-ink border-ink hover:bg-surface hover:-translate-y-[1px] hover:shadow-flat")
                  }
                >
                  <span className="font-medium">{p.display_name}</span>
                  {isCreator && <span className="text-xs opacity-70">creator</span>}
                </button>
              );
            })}
          </div>
        </div>
      </CardContent>

      {/* Lifecycle actions — pinned at the bottom */}
      <CardFooter className="flex-col items-stretch gap-2">
        {evaluation.last_synced_at && (
          <p className="text-xs text-ink-soft">
            Last synced {new Date(evaluation.last_synced_at).toLocaleString()}
          </p>
        )}
        <Button
          variant="secondary"
          className="w-full"
          disabled={!evaluation.mapping_confirmed}
          onClick={() => run(() => refreshEvaluationAction({ evaluationId: evaluation.id }))}
        >
          Refresh
        </Button>
        {evaluation.status === "draft" && (
          <Button className="w-full" onClick={() => run(() => openEvaluationAction({ evaluationId: evaluation.id }))}>
            Open evaluation
          </Button>
        )}
        {evaluation.status === "open" && (
          <Button className="w-full" onClick={() => run(() => closeEvaluationAction({ evaluationId: evaluation.id }))}>
            Close evaluation
          </Button>
        )}
        {evaluation.status === "closed" && (
          <Button variant="outline" className="w-full" onClick={() => run(() => reopenEvaluationAction({ evaluationId: evaluation.id }))}>
            Reopen
          </Button>
        )}
        {msg && <p className="text-sm text-ink-soft">{msg}</p>}
      </CardFooter>
    </Card>
  );
}
