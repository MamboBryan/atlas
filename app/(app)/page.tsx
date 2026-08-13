import { requireUser } from "@/lib/auth/require";
import { MetricPanel } from "@/components/thamani/metric-panel";
import { getMetricSeries } from "@/lib/thamani/read";
import { ACCOUNTS_NEW } from "@/lib/thamani/metrics/accounts";
import { DEVICES_NEW } from "@/lib/thamani/metrics/devices";
import { DetailWithRail } from "@/components/app/detail-with-rail";
import { HomeRail } from "@/components/app/home-rail";

export default async function HomePage() {
  const { supabase } = await requireUser();

  const metricsNow = new Date();
  const metricsYear = metricsNow.getUTCFullYear();
  const [accounts, devices] = await Promise.all([
    getMetricSeries(supabase, ACCOUNTS_NEW, metricsNow, metricsYear),
    getMetricSeries(supabase, DEVICES_NEW, metricsNow, metricsYear),
  ]);

  return (
    <DetailWithRail rail={<HomeRail />}>
      <div className="space-y-8">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-extrabold text-ink">
              Thamani
            </h1>
            <p className="text-sm text-ink-soft">Product growth at a glance.</p>
          </div>
        </header>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <MetricPanel
            title="New accounts"
            series={accounts}
            year={metricsYear}
          />
          <MetricPanel title="New devices" series={devices} year={metricsYear} />
        </div>
      </div>
    </DetailWithRail>
  );
}
