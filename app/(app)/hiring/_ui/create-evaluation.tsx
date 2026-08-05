"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { createEvaluationAction } from "@/lib/actions/evaluation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

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
          if (res.ok) {
            setName("");
            router.push(`/hiring/${res.data.id}` as Route);
          }
        });
      }}
      className="flex gap-2"
    >
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Evaluation name"
        required
        className="w-auto"
      />
      <Button disabled={pending || !name} type="submit">
        {pending ? "Creating…" : "New evaluation"}
      </Button>
    </form>
  );
}
