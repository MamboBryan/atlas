"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  connectSheetAction, previewMappingAction, refreshEvaluationAction,
  setPanelAction, openEvaluationAction, closeEvaluationAction, reopenEvaluationAction,
  addEvaluationOwnerAction, removeEvaluationOwnerAction, setEvaluationFieldAction,
} from "@/lib/actions/evaluation";
import { parseCsv } from "@/lib/sheets/csv";
import { detectMapping } from "@/lib/sheets/parse";
import { MappingDialog } from "@/app/(app)/hiring/[id]/_ui/mapping-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

type Ev = {
  id: string; status: "draft" | "open" | "closed";
  sheet_id: string | null; mapping_confirmed: boolean; last_synced_at: string | null;
};
type Detected = { emailColumn: string; nameColumn: string | null; timestampColumn: string | null; questionColumns: string[] };
type Field = { id: string; prompt: string; position: number; is_active: boolean; is_hidden: boolean };

export function AdminControls({
  evaluation, roster = [], panel = [], owners = [], createdBy = null, fields = [],
}: {
  evaluation: Ev; roster?: { id: string; display_name: string }[]; panel?: string[];
  owners?: { id: string; display_name: string }[]; createdBy?: string | null;
  fields?: Field[];
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
  const [activeTab, setActiveTab] = useState<"manage" | "fields">("manage");

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
    <div className="flex h-full min-h-0 flex-col gap-4">
      {/* Segmented tabs (pinned) */}
      <div className="flex shrink-0 gap-1 rounded-md border-chunk border-ink bg-surface-raised p-1">
        {(["manage", "fields"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setActiveTab(t)}
            className={
              "flex-1 rounded-sm px-3 py-1.5 text-sm font-semibold capitalize transition-all duration-fast " +
              (activeTab === t
                ? "bg-primary text-primary-ink shadow-[-2px_2px_0_0_var(--primary-shadow)]"
                : "text-ink-soft hover:text-ink")
            }
          >
            {t}
          </button>
        ))}
      </div>

      {/* Active tab body (scrolls). The negative-margin + padding gives the
          chunky left drop-shadows room so overflow-y's implied overflow-x
          clip doesn't slice them, while keeping content aligned with the
          pinned tabs and footer. */}
      <div className="-mx-1.5 min-h-0 flex-1 overflow-y-auto px-1.5 pb-1">
      {activeTab === "manage" ? (
      <div className="space-y-5">
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
      </div>
      ) : (
        <FieldsTab
          evaluationId={evaluation.id}
          fields={fields}
          locked={evaluation.status === "closed"}
          pending={pending}
          run={run}
        />
      )}
      </div>

      {/* Lifecycle actions — pinned at the bottom */}
      <div className="flex shrink-0 flex-col items-stretch gap-2 border-t border-divider pt-4">
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
      </div>
    </div>
  );
}

function FieldsTab({
  evaluationId, fields, locked, pending, run,
}: {
  evaluationId: string;
  fields: Field[];
  locked: boolean;
  pending: boolean;
  run: (fn: () => Promise<{ ok: boolean; error?: { message: string } }>) => void;
}) {
  if (fields.length === 0) {
    return (
      <p className="text-sm text-ink-soft">
        No fields yet. Connect a sheet or upload a CSV to import fields.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      <p className="text-xs text-ink-soft">
        Hidden fields aren&apos;t scored during evaluation but appear as context in results.
      </p>
      {locked && (
        <p className="text-xs font-semibold text-ink-soft">Fields lock after closing.</p>
      )}
      <ul className="space-y-2">
        {fields.map((f) => (
          <li
            key={f.id}
            className="flex items-center justify-between gap-3 rounded-md border-chunk border-ink bg-surface-raised px-3 py-2"
          >
            <span className="min-w-0 truncate text-sm font-medium text-ink">{f.prompt}</span>
            <span className="flex shrink-0 gap-1.5">
              <TogglePill
                label="Enabled"
                on={f.is_active}
                disabled={locked || pending}
                onClick={() => run(() => setEvaluationFieldAction({ evaluationId, questionId: f.id, isActive: !f.is_active }))}
              />
              <TogglePill
                label="Hidden"
                on={f.is_hidden}
                disabled={locked || pending || !f.is_active}
                onClick={() => run(() => setEvaluationFieldAction({ evaluationId, questionId: f.id, isHidden: !f.is_hidden }))}
              />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TogglePill({
  label, on, disabled, onClick,
}: { label: string; on: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={on}
      className={
        "rounded-md border-chunk px-2.5 py-1 text-xs font-semibold transition-all duration-fast disabled:cursor-not-allowed disabled:opacity-50 " +
        (on
          ? "bg-primary text-primary-ink border-primary shadow-[-2px_2px_0_0_var(--primary-shadow)]"
          : "bg-surface-raised text-ink-soft border-ink hover:text-ink")
      }
    >
      {label}
    </button>
  );
}
