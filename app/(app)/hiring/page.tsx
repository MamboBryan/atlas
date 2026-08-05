import Link from "next/link";
import type { Route } from "next";
import { listEvaluations } from "@/lib/evaluation/queries";
import { isCurrentUserAdmin } from "@/lib/auth/is-admin";
import { CreateEvaluation } from "@/app/(app)/hiring/_ui/create-evaluation";
import { StatusBadge } from "@/app/(app)/hiring/_ui/status-badge";
import { Card, CardHeader, CardTitle, CardAction } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { DetailWithRail } from "@/components/app/detail-with-rail";

export default async function HiringPage() {
  const [evals, admin] = await Promise.all([listEvaluations(), isCurrentUserAdmin()]);
  return (
    <DetailWithRail>
      <div className="space-y-8">
        <header className="flex items-center justify-between">
          <h1 className="font-display text-3xl font-extrabold text-ink">Hiring</h1>
          {admin && <CreateEvaluation />}
        </header>

        {evals.length === 0 ? (
          <EmptyState
            headline="No evaluations yet"
            body="Create an evaluation to start reviewing candidates."
          />
        ) : (
          <div className="space-y-2">
            {evals.map((e) => (
              <Link
                key={e.id}
                href={`/hiring/${e.id}` as Route}
                className="block focus-visible:outline-none"
              >
                <Card interactive size="sm">
                  <CardHeader>
                    <CardTitle>{e.name}</CardTitle>
                    <CardAction>
                      <StatusBadge status={e.status} />
                    </CardAction>
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </DetailWithRail>
  );
}
