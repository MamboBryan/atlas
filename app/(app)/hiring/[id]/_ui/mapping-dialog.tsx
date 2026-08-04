"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirmMappingAction } from "@/lib/actions/evaluation";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

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
    <Card size="sm">
      <CardHeader>
        <CardTitle>Confirm column mapping</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Label className="flex-col items-start gap-1">
          Email column
          <Select value={emailColumn} onChange={(e) => setEmail(e.target.value)}>
            {headers.map((h) => <option key={h} value={h}>{h}</option>)}
          </Select>
        </Label>
        <Label className="flex-col items-start gap-1">
          Name column (optional)
          <Select value={nameColumn} onChange={(e) => setName(e.target.value)}>
            <option value="">— none —</option>
            {headers.map((h) => <option key={h} value={h}>{h}</option>)}
          </Select>
        </Label>
        <Label className="flex-col items-start gap-1">
          Timestamp column (optional)
          <Select value={timestampColumn} onChange={(e) => setTs(e.target.value)}>
            <option value="">— none —</option>
            {headers.map((h) => <option key={h} value={h}>{h}</option>)}
          </Select>
        </Label>
        <div className="text-sm text-ink-soft">
          Questions to be rated: {questionColumns.join(", ") || "(none)"}
        </div>
      </CardContent>
      <CardFooter className="flex gap-2">
        <Button
          disabled={pending || !emailColumn || questionColumns.length === 0}
          onClick={() => start(async () => {
            const res = await confirmMappingAction({
              evaluationId, emailColumn,
              nameColumn: nameColumn || null,
              timestampColumn: timestampColumn || null,
              questionColumns,
            });
            if (res.ok) { onClose(); router.refresh(); }
          })}
        >
          {pending ? "Importing…" : "Confirm & import"}
        </Button>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
      </CardFooter>
    </Card>
  );
}
