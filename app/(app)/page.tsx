import { requireUser } from "@/lib/auth/require";
import { AccountsMetric } from "@/components/thamani/accounts-metric";
import {
  getAccountsSnapshot,
  getAccountsMonthly,
  getAccountsDaily,
} from "@/lib/thamani/read";

export default async function HomePage() {
  const { supabase } = await requireUser();

  const metricsNow = new Date();
  const metricsYear = metricsNow.getUTCFullYear();
  const [{ current, previous }, accountsMonthly, accountsDaily] =
    await Promise.all([
      getAccountsSnapshot(supabase, metricsNow),
      getAccountsMonthly(supabase, metricsYear),
      getAccountsDaily(supabase, metricsYear),
    ]);

  return (
    <div className="space-y-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-extrabold text-ink">
            Thamani
          </h1>
          <p className="text-sm text-ink-soft">Product growth at a glance.</p>
        </div>
      </header>

      <AccountsMetric
        current={current}
        previous={previous}
        monthly={accountsMonthly}
        daily={accountsDaily}
        year={metricsYear}
      />
    </div>
  );
}
