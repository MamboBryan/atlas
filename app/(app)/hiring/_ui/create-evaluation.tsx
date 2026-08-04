"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { createEvaluationAction } from "@/lib/actions/evaluation";

export function CreateEvaluation() {
  const [name, setName] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await createEvaluationAction({ name });
          if (res.ok) { setName(""); router.push(`/hiring/${res.data.id}` as Route); }
        });
      }}
      className="flex gap-2"
    >
      <input value={name} onChange={(e) => setName(e.target.value)}
        placeholder="Evaluation name" required
        className="rounded-md border border-ink/15 px-3 py-2 text-sm" />
      <button disabled={pending || !name} type="submit"
        className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
        {pending ? "Creating…" : "New evaluation"}
      </button>
    </form>
  );
}
