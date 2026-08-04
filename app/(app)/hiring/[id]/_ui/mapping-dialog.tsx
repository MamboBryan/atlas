"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirmMappingAction, importCsvAction } from "@/lib/actions/evaluation";
import type { DetectedMapping } from "@/lib/sheets/types";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

type Role = "email" | "name" | "timestamp" | "question" | "hidden";

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: "email", label: "Email" },
  { value: "name", label: "Name" },
  { value: "timestamp", label: "Timestamp" },
  { value: "question", label: "Question" },
  { value: "hidden", label: "Hidden" },
];

function initialRoles(detected: DetectedMapping, headers: string[]): Record<string, Role> {
  const roles: Record<string, Role> = {};
  for (const h of headers) roles[h] = "question";
  if (detected.emailColumn) roles[detected.emailColumn] = "email";
  if (detected.nameColumn) roles[detected.nameColumn] = "name";
  if (detected.timestampColumn) roles[detected.timestampColumn] = "timestamp";
  for (const h of detected.questionColumns) roles[h] = "question";
  return roles;
}

export function MappingDialog({
  evaluationId, detected, headers, csvText, onClose,
}: {
  evaluationId: string;
  detected: DetectedMapping;
  headers: string[];
  csvText?: string;
  onClose: () => void;
}) {
  const [roles, setRoles] = useState<Record<string, Role>>(() => initialRoles(detected, headers));
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const router = useRouter();

  const setRole = (header: string, role: Role) =>
    setRoles((r) => ({ ...r, [header]: role }));

  const emailColumn = headers.find((h) => roles[h] === "email") ?? null;
  const nameColumn = headers.find((h) => roles[h] === "name") ?? null;
  const timestampColumn = headers.find((h) => roles[h] === "timestamp") ?? null;
  const questionColumns = headers.filter((h) => roles[h] === "question");
  const hiddenColumns = headers.filter((h) => roles[h] === "hidden");
  const hideNames = nameColumn === null;

  const canConfirm = !!emailColumn && questionColumns.length > 0;

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Map columns</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          {headers.map((h) => (
            <div key={h} className="flex flex-col gap-1">
              <Label className="text-sm font-medium text-ink">{h}</Label>
              <Select value={roles[h]} onChange={(e) => setRole(h, e.target.value as Role)}>
                {ROLE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </Select>
            </div>
          ))}
        </div>

        {!emailColumn && (
          <p className="text-sm text-danger-text">Pick which column is the email.</p>
        )}
        {questionColumns.length === 0 && (
          <p className="text-sm text-danger-text">Pick at least one question column.</p>
        )}
        {hideNames && (
          <p className="text-sm text-ink-soft">
            Candidates will be shown as “Candidate 1, 2, 3…” (name hidden).
          </p>
        )}
        {error && <p className="text-sm text-danger-text">{error}</p>}
      </CardContent>
      <CardFooter className="flex gap-2">
        <Button
          disabled={pending || !canConfirm}
          onClick={() => start(async () => {
            setError("");
            const mapping = {
              evaluationId,
              emailColumn: emailColumn as string,
              nameColumn,
              timestampColumn,
              questionColumns,
              hiddenColumns,
              hideNames,
            };
            const res = csvText
              ? await importCsvAction({ ...mapping, csvText })
              : await confirmMappingAction(mapping);
            if (res.ok) { onClose(); router.refresh(); }
            else setError(res.error.message);
          })}
        >
          {pending ? "Importing…" : "Confirm & import"}
        </Button>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
      </CardFooter>
    </Card>
  );
}
