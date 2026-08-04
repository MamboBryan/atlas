import Link from "next/link";
import type { Route } from "next";
import { listEvaluations } from "@/lib/evaluation/queries";
import { isCurrentUserAdmin } from "@/lib/auth/is-admin";
import { CreateEvaluation } from "@/app/(app)/hiring/_ui/create-evaluation";
import { StatusBadge } from "@/app/(app)/hiring/_ui/status-badge";

export default async function HiringPage() {
  const [evals, admin] = await Promise.all([listEvaluations(), isCurrentUserAdmin()]);
  return (
    <div className="space-y-8">
      <header className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold">Hiring</h1>
        {admin && <CreateEvaluation />}
      </header>
      <ul className="space-y-2">
        {evals.map((e) => (
          <li key={e.id}>
            <Link href={`/hiring/${e.id}` as Route}
              className="flex items-center justify-between rounded-lg border border-ink/10 p-4 hover:bg-surface">
              <span className="font-medium">{e.name}</span>
              <StatusBadge status={e.status} />
            </Link>
          </li>
        ))}
        {evals.length === 0 && <li className="text-ink/60">No evaluations yet.</li>}
      </ul>
    </div>
  );
}
