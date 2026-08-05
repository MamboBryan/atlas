# Thamani Metrics Supabase Sync — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the Thamani `accounts_new` metric pipeline off the fragile Vercel cron onto a Supabase-native pg_cron + Edge Function that runs every 10 minutes, and make it a reusable blueprint for future Thamani aggregations.

**Architecture:** pg_cron (atlas DB) → `net.http_post` → Edge Function `sync-thamani-metrics` (atlas project) → reads Thamani `accounts.created_at`, buckets by period via a `MetricDef[]` registry, upserts into atlas `public.thamani_metrics`. The dashboard reads `thamani_metrics` unchanged.

**Tech Stack:** Supabase Edge Functions (Deno/TypeScript), pg_cron + pg_net + Vault (Postgres), `@supabase/supabase-js` (esm.sh in Deno, npm in Next), Next.js 15, vitest, Deno test.

**Spec:** `docs/superpowers/specs/2026-08-04-thamani-metrics-supabase-cron-design.md`

## Global Constraints

- Commit messages: NO `Co-Authored-By` trailer, NO Claude-branding lines. Describe the change only.
- Supabase CLI is always invoked via `pnpm supabase …` (aliased to `supabase --workdir db/supabase`).
- Metric output must stay **byte-identical** to today's `bucketAccounts`: metric_key `accounts_new`, UTC period math, Monday-start weeks, one row per `(grain, period_start)`, current + previous-period buckets, daily rows Jan 1→today.
- The Edge Function's copied `_shared/types.ts` and `_shared/periods.ts` must remain byte-identical to `lib/thamani/{types,periods}.ts` (only import extensions differ: Deno copies use explicit `.ts`).
- Thamani service-role key is NEVER pasted into chat, code, or committed files. It is set only as a Supabase Edge Function secret by the operator.
- Upsert conflict target is always `metric_key,grain,period_start`.
- atlas prod Supabase project ref is required for Task 4 (provisioning). If unavailable, Task 4 is delivered as copy-paste commands for the operator.

---

### Task 1: Surface read errors in the dashboard read layer

The dashboard read helpers swallow query errors (`const { data } = await …`), so a broken pipeline renders as silent zeros. Make failures observable. This is the defect that hid the current outage.

**Files:**

- Modify: `lib/thamani/read.ts` (functions `getAccountsMonthly`, `getAccountsSnapshot`, `getAccountsDaily`)
- Test: `tests/thamani/read.test.ts`

**Interfaces:**

- Consumes: `MinimalClient` (existing), `MetricRow` (existing).
- Produces: same function signatures; behavior change is that a query `error` is logged via `console.error` before falling back to empty.

- [ ] **Step 1: Write the failing test**

Add to `tests/thamani/read.test.ts`:

```ts
import { getAccountsSnapshot } from "@/lib/thamani/read";
import { vi } from "vitest";

describe("getAccountsSnapshot error surfacing", () => {
  it("logs when the query returns an error", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const client = {
      from: () => ({
        select: () => ({
          eq: () => Promise.resolve({ data: null, error: { message: "boom" } }),
        }),
      }),
    } as unknown as import("@/lib/thamani/read").MinimalClient;

    await getAccountsSnapshot(client, new Date("2026-07-30T18:05:00Z"));
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining("thamani_metrics read failed"),
      "boom",
    );
    spy.mockRestore();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/thamani/read.test.ts`
Expected: FAIL — `console.error` not called (error currently ignored).

- [ ] **Step 3: Implement error surfacing**

In `lib/thamani/read.ts`, change each of the three query helpers from destructuring only `data` to also capturing and logging `error`. Example for `getAccountsSnapshot`:

```ts
export async function getAccountsSnapshot(
  supabase: MinimalClient,
  now: Date,
): Promise<{ current: CurrentValues; previous: CurrentValues }> {
  const { data, error } = await supabase
    .from("thamani_metrics")
    .select("metric_key,grain,period_start,value")
    .eq("metric_key", ACCOUNTS_NEW);
  if (error) {
    console.error("thamani_metrics read failed:", error.message);
  }
  const rows = (data ?? []) as MetricRow[];
  return { current: pickCurrent(rows, now), previous: pickPrevious(rows, now) };
}
```

Apply the same `const { data, error } = …; if (error) console.error("thamani_metrics read failed:", error.message);` pattern to `getAccountsMonthly` and `getAccountsDaily`.

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm vitest run tests/thamani/read.test.ts`
Expected: PASS (all read tests green).

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/thamani/read.ts tests/thamani/read.test.ts
git commit -m "fix(thamani): surface thamani_metrics read errors instead of silent zeros"
```

---

### Task 2: Scaffold Edge Function + copy pure logic + generalized bucketCounts (Deno-tested)

Create the function skeleton and its self-contained pure logic. This task ends with a green Deno test proving the copied period math and `bucketCounts` match the app.

**Files:**

- Create (via CLI scaffold, then edit): `db/supabase/supabase/functions/sync-thamani-metrics/index.ts` (placeholder for now)
- Create: `db/supabase/supabase/functions/sync-thamani-metrics/_shared/types.ts`
- Create: `db/supabase/supabase/functions/sync-thamani-metrics/_shared/periods.ts`
- Create: `db/supabase/supabase/functions/sync-thamani-metrics/_shared/aggregate.ts`
- Create: `db/supabase/supabase/functions/sync-thamani-metrics/aggregate_test.ts`

**Interfaces:**

- Produces: `bucketCounts(metricKey: string, values: string[], now: Date): MetricRow[]` in `_shared/aggregate.ts`; `MetricRow`/`Grain` in `_shared/types.ts`; the period functions in `_shared/periods.ts` (same signatures as `lib/thamani/periods.ts`).

- [ ] **Step 1: Ensure Deno is installed**

Run: `deno --version || brew install deno`
Expected: `deno --version` prints a version (Deno ≥ 1.40).

- [ ] **Step 2: Scaffold the function**

Run: `pnpm supabase functions new sync-thamani-metrics`
Expected: creates `db/supabase/supabase/functions/sync-thamani-metrics/index.ts`. Confirm the path with `ls db/supabase/supabase/functions/sync-thamani-metrics/`. (If the CLI places it elsewhere, use that actual path for all subsequent files and update this plan's paths accordingly.)

- [ ] **Step 3: Copy `types.ts` verbatim**

Create `_shared/types.ts` with the exact contents of `lib/thamani/types.ts`:

```ts
export type Grain = "day" | "week" | "month" | "quarter" | "year";

export type MetricRow = {
  metric_key: string;
  grain: Grain;
  period_start: string; // YYYY-MM-DD, first day of the period (UTC)
  value: number;
};
```

- [ ] **Step 4: Copy `periods.ts` with `.ts` import extension**

Create `_shared/periods.ts` as an exact copy of `lib/thamani/periods.ts`, changing only the first import line to Deno's explicit-extension form:

```ts
import type { Grain } from "./types.ts";
```

Everything else (functions `periodStart`, `periodEndMs`, `computeSet`, `previousPeriodStart`, `comparisonSet`, and the private `iso`) is copied unchanged.

- [ ] **Step 5: Write `aggregate.ts` (generalized bucketAccounts)**

Create `_shared/aggregate.ts`:

```ts
import { computeSet, comparisonSet, periodEndMs } from "./periods.ts";
import type { MetricRow } from "./types.ts";

/**
 * Bucket a list of ISO timestamps into per-period counts, tagged with `metricKey`.
 * Generalized from the app's bucketAccounts: covers the current period set plus the
 * previous-period comparison buckets, de-duplicated by (grain, period_start).
 */
export function bucketCounts(
  metricKey: string,
  values: string[],
  now: Date,
): MetricRow[] {
  const times = values
    .map((c) => Date.parse(c))
    .filter((t) => !Number.isNaN(t));

  const seen = new Set<string>();
  const periods = [...computeSet(now), ...comparisonSet(now)].filter((p) => {
    const key = `${p.grain}|${p.period_start}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return periods.map(({ grain, period_start }) => {
    const startMs = Date.parse(`${period_start}T00:00:00Z`);
    const endMs = periodEndMs(grain, period_start);
    const value = times.filter((t) => t >= startMs && t < endMs).length;
    return { metric_key: metricKey, grain, period_start, value };
  });
}
```

- [ ] **Step 6: Write the failing Deno test**

Create `aggregate_test.ts` (mirrors `tests/thamani/accounts.test.ts` + key `periods.test.ts` assertions):

```ts
import { assertEquals } from "jsr:@std/assert@1";
import { bucketCounts } from "./_shared/aggregate.ts";
import { periodStart } from "./_shared/periods.ts";

const now = new Date("2026-07-30T18:05:00Z");
const createdAts = [
  "2026-01-10T09:00:00Z",
  "2026-07-15T09:00:00Z",
  "2026-07-30T08:00:00Z", // today
];

Deno.test("periodStart: Monday-start week", () => {
  assertEquals(
    periodStart(new Date("2026-08-02T10:00:00Z"), "week"),
    "2026-07-27",
  );
});

Deno.test("bucketCounts tags every row with the metric key", () => {
  const rows = bucketCounts("accounts_new", createdAts, now);
  assertEquals(
    rows.every((r) => r.metric_key === "accounts_new"),
    true,
  );
});

Deno.test(
  "bucketCounts: Jan month = 1, Jul month = 2, year = 3, today = 1",
  () => {
    const rows = bucketCounts("accounts_new", createdAts, now);
    const at = (grain: string, ps: string) =>
      rows.find((r) => r.grain === grain && r.period_start === ps)?.value;
    assertEquals(at("month", "2026-01-01"), 1);
    assertEquals(at("month", "2026-07-01"), 2);
    assertEquals(rows.find((r) => r.grain === "year")?.value, 3);
    assertEquals(at("day", "2026-07-30"), 1);
  },
);

Deno.test("bucketCounts: empty input → all-zero rows, unique keys", () => {
  const rows = bucketCounts("accounts_new", [], now);
  assertEquals(rows.length > 0, true);
  assertEquals(
    rows.every((r) => r.value === 0),
    true,
  );
  const keys = rows.map((r) => `${r.grain}|${r.period_start}`);
  assertEquals(new Set(keys).size, keys.length);
});

Deno.test("bucketCounts: includes previous-period buckets", () => {
  const rows = bucketCounts("accounts_new", [], now);
  assertEquals(
    rows.some((r) => r.grain === "month" && r.period_start === "2026-06-01"),
    true,
  );
  assertEquals(
    rows.some((r) => r.grain === "year" && r.period_start === "2025-01-01"),
    true,
  );
});
```

- [ ] **Step 7: Run the Deno test**

Run: `deno test db/supabase/supabase/functions/sync-thamani-metrics/aggregate_test.ts`
Expected: all tests PASS. (First run downloads `jsr:@std/assert`.)

- [ ] **Step 8: Commit**

```bash
git add db/supabase/supabase/functions/sync-thamani-metrics/
git commit -m "feat(thamani): sync-thamani-metrics function skeleton + bucketCounts (Deno-tested)"
```

---

### Task 3: Registry runner, pageAll, accounts_new metric, and the handler

Wire the metric registry, the Thamani reader, and the HTTP handler with bearer auth. This task ends with a local smoke run returning `{ ok: true, upserted: N }`.

**Files:**

- Create: `db/supabase/supabase/functions/sync-thamani-metrics/_shared/pageAll.ts`
- Create: `db/supabase/supabase/functions/sync-thamani-metrics/_shared/registry.ts`
- Create: `db/supabase/supabase/functions/sync-thamani-metrics/metrics/accounts_new.ts`
- Modify: `db/supabase/supabase/functions/sync-thamani-metrics/index.ts`
- Modify: `db/supabase/config.toml` (add `[functions.sync-thamani-metrics] verify_jwt = false`)

**Interfaces:**

- Consumes: `bucketCounts` (Task 2), `MetricRow` (Task 2).
- Produces:
  - `pageAll(client: SupabaseClient, table: string, column: string): Promise<string[]>`
  - `type MetricDef = { metric_key: string; compute: (thamani: SupabaseClient, now: Date) => Promise<MetricRow[]> }`
  - `const METRICS: MetricDef[]`

- [ ] **Step 1: Write `pageAll.ts`**

```ts
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Read every value of `column` from `table`, paginated. Returns the raw string
 * values (e.g. ISO timestamps). Non-null values only.
 */
export async function pageAll(
  client: SupabaseClient,
  table: string,
  column: string,
): Promise<string[]> {
  const pageSize = 1000;
  const out: string[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await client
      .from(table)
      .select(column)
      .range(from, from + pageSize - 1);
    if (error)
      throw new Error(
        `Thamani ${table}.${column} read failed: ${error.message}`,
      );
    const rows = (data ?? []) as Record<string, string | null>[];
    for (const r of rows) {
      const v = r[column];
      if (v) out.push(v);
    }
    if (rows.length < pageSize) break;
  }
  return out;
}
```

- [ ] **Step 2: Write `metrics/accounts_new.ts`**

```ts
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { pageAll } from "../_shared/pageAll.ts";
import { bucketCounts } from "../_shared/aggregate.ts";
import type { MetricRow } from "../_shared/types.ts";

export const accountsNew = {
  metric_key: "accounts_new",
  compute: async (thamani: SupabaseClient, now: Date): Promise<MetricRow[]> =>
    bucketCounts(
      "accounts_new",
      await pageAll(thamani, "accounts", "created_at"),
      now,
    ),
};
```

- [ ] **Step 3: Write `_shared/registry.ts`**

```ts
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { MetricRow } from "./types.ts";
import { accountsNew } from "../metrics/accounts_new.ts";

export type MetricDef = {
  metric_key: string;
  compute: (thamani: SupabaseClient, now: Date) => Promise<MetricRow[]>;
};

/** Every metric synced from Thamani prod. Add new metrics here. */
export const METRICS: MetricDef[] = [accountsNew];
```

- [ ] **Step 4: Write the handler `index.ts`**

```ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { METRICS } from "./_shared/registry.ts";

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

Deno.serve(async (req) => {
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const auth = req.headers.get("Authorization") ?? "";
  if (!timingSafeEqual(auth, `Bearer ${serviceKey}`)) {
    return Response.json({ ok: false }, { status: 401 });
  }

  try {
    const now = new Date();
    const thamani = createClient(
      Deno.env.get("THAMANI_SUPABASE_URL")!,
      Deno.env.get("THAMANI_SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const atlas = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const rows = (
      await Promise.all(METRICS.map((m) => m.compute(thamani, now)))
    ).flat();
    const { error } = await atlas.from("thamani_metrics").upsert(
      rows.map((r) => ({ ...r, computed_at: now.toISOString() })),
      { onConflict: "metric_key,grain,period_start" },
    );
    if (error)
      return Response.json(
        { ok: false, error: error.message },
        { status: 500 },
      );
    return Response.json({ ok: true, upserted: rows.length });
  } catch (e) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
});
```

- [ ] **Step 5: Verify JWT verification is disabled for this function**

The Task 2 scaffold already created the CLI-authoritative config at
`db/supabase/supabase/config.toml` with the function registered and
`verify_jwt = false`. Confirm it reads:

```toml
[functions.sync-thamani-metrics]
enabled = true
verify_jwt = false
import_map = "./functions/sync-thamani-metrics/deno.json"
entrypoint = "./functions/sync-thamani-metrics/index.ts"
```

Do NOT edit `db/supabase/config.toml` (that path is one level above where the CLI
looks and is ignored — leave it alone). If `verify_jwt` is anything but `false`, set
it to `false` here.

- [ ] **Step 6: Type-check the function with Deno (REQUIRED gate)**

Run from inside the function directory (deno.json resolves relative to CWD):

```bash
cd db/supabase/supabase/functions/sync-thamani-metrics && deno check index.ts && cd -
```

Expected: no type errors. (Downloads esm.sh types on first run.) This is the
authoritative correctness gate for this task. Also re-run the Deno tests from that
directory: `deno test` (expect the Task 2 suite still 5/5).

- [ ] **Step 7: Local smoke test (BEST-EFFORT — skip gracefully if the local stack/Docker is unavailable)**

The authoritative end-to-end verification runs against prod in Task 4. Attempt the
local smoke only if `pnpm supabase start` is already up or starts cleanly; if Docker
or the local stack is unavailable, SKIP this step and note it in the report — do not
block the task on it.

`supabase functions serve` auto-injects the LOCAL `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` (routed to the local stack), so the throwaway env file only needs the Thamani prod credentials. Create `db/supabase/supabase/functions/sync-thamani-metrics/.env.local` (confirm it is gitignored: `git check-ignore -v db/supabase/supabase/functions/sync-thamani-metrics/.env.local` should print a match) containing:

```
THAMANI_SUPABASE_URL=https://lxescgcuelttoxaacsib.supabase.co
THAMANI_SUPABASE_SERVICE_ROLE_KEY=<thamani prod service-role key>
```

Ensure the local stack is up (`pnpm supabase start`), then serve:

```bash
pnpm supabase functions serve sync-thamani-metrics \
  --env-file db/supabase/supabase/functions/sync-thamani-metrics/.env.local
```

In another shell, call WITHOUT a bearer (expect 401), then WITH the well-known local service-role key (printed by `pnpm supabase status` as `service_role key`):

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:54321/functions/v1/sync-thamani-metrics   # → 401
curl -s -X POST http://localhost:54321/functions/v1/sync-thamani-metrics \
  -H "Authorization: Bearer <LOCAL_SERVICE_ROLE_KEY_FROM_supabase_status>"                                    # → {"ok":true,"upserted":N}
```

Expected: 401 without bearer; `{"ok":true,"upserted":<N>}` (N > 0) with it. Verify rows landed via Studio (http://localhost:54323 → table editor → `thamani_metrics`), which should show day/week/month/quarter/year rows for `accounts_new`.

- [ ] **Step 8: Remove the throwaway env file and commit**

```bash
rm db/supabase/supabase/functions/sync-thamani-metrics/.env.local
git add db/supabase/supabase/functions/sync-thamani-metrics/ db/supabase/config.toml
git commit -m "feat(thamani): registry runner + accounts_new metric + bearer-auth handler"
```

---

### Task 4: Provision production (deploy, secrets, extensions, cron)

Bring the pipeline live in the atlas **prod** project. Requires the atlas prod project ref. Operator sets the Thamani secret (never pasted in chat). If the ref/access is unavailable to the agent, deliver these as copy-paste commands for the operator to run.

**Files:** none (infra operations). Reference: spec §2 provisioning SQL.

- [ ] **Step 1: Confirm the `thamani_metrics` table exists in atlas prod**

Via MCP `execute_sql` against the atlas prod ref (or dashboard):

```sql
select count(*) from information_schema.tables
where table_schema='public' and table_name='thamani_metrics';
```

Expected: `1`. If `0`, apply migration `0024_thamani_metrics.sql` to prod:
`pnpm supabase db push` (with the prod project linked) or run the migration's SQL via `execute_sql`.

- [ ] **Step 2: Deploy the function**

Run: `pnpm supabase functions deploy sync-thamani-metrics --project-ref <atlas-ref>`
Expected: deploy succeeds; function listed in `pnpm supabase functions list --project-ref <atlas-ref>`.

- [ ] **Step 3: Operator sets Thamani secrets**

Operator runs (values not shown in chat):

```bash
pnpm supabase secrets set --project-ref <atlas-ref> \
  THAMANI_SUPABASE_URL=https://lxescgcuelttoxaacsib.supabase.co \
  THAMANI_SUPABASE_SERVICE_ROLE_KEY=<thamani prod service-role key>
```

(`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are auto-injected — do not set them.)

- [ ] **Step 4: Manual invoke against prod**

```bash
curl -s -X POST https://<atlas-ref>.supabase.co/functions/v1/sync-thamani-metrics \
  -H "Authorization: Bearer <atlas prod service-role key>"
```

Expected: `{"ok":true,"upserted":<N>}`, N > 0. Then verify rows via `execute_sql`:

```sql
select grain, count(*), max(computed_at) from public.thamani_metrics group by grain order by 1;
```

- [ ] **Step 5: Enable extensions + schedule cron (prod)**

Via `execute_sql` against atlas prod (spec §2). Fill `<atlas-ref>` and store the service key in Vault:

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

select vault.create_secret(
  'https://<atlas-ref>.supabase.co/functions/v1/sync-thamani-metrics', 'sync_metrics_url');
select vault.create_secret('<atlas prod service-role key>', 'atlas_service_role_key');

select cron.schedule('sync-thamani-metrics', '*/10 * * * *', $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'sync_metrics_url'),
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'atlas_service_role_key')
    )
  );
$$);
```

- [ ] **Step 6: Verify the scheduled run**

Wait ~10 min, then via `execute_sql`:

```sql
select jobid, status, return_message, start_time
from cron.job_run_details
where command like '%sync-thamani-metrics%'
order by start_time desc limit 5;
```

Expected: a `succeeded` row. Confirm `max(computed_at)` in `thamani_metrics` advanced.

- [ ] **Step 7: Verify the dashboard**

Load `https://thamani-atlas.vercel.app` (authenticated) and confirm the accounts metric card shows non-zero values matching the prod counts.

- [ ] **Step 8: Record provisioning outcome**

No commit (infra). Note the confirmed prod state (table present, cron scheduled, first run succeeded) in the PR description.

---

### Task 5: Cutover — remove the Vercel cron and dead compute code

With Supabase live and verified, remove the old trigger and the now-unused Node compute path.

**Files:**

- Modify: `vercel.json` (remove the `thamani-metrics` cron entry)
- Delete: `app/api/cron/thamani-metrics/route.ts`
- Modify: `lib/thamani/metrics/accounts.ts` (remove `computeAccountsMetrics` + its `thamaniReadClient` import; keep `ACCOUNTS_NEW` and `bucketAccounts`)

**Interfaces:**

- `ACCOUNTS_NEW` and `bucketAccounts` remain exported (still imported by `read.ts` and `tests/thamani/accounts.test.ts`).

- [ ] **Step 1: Remove the Vercel cron entry**

Edit `vercel.json`, delete the object:

```json
{ "path": "/api/cron/thamani-metrics", "schedule": "0 7 * * *" }
```

(Leave the other four crons intact; fix trailing commas.)

- [ ] **Step 2: Delete the route**

Run: `git rm app/api/cron/thamani-metrics/route.ts`

- [ ] **Step 3: Trim `accounts.ts`**

Remove the `computeAccountsMetrics` function and the `import { thamaniReadClient } from "@/lib/supabase/thamani";` line. The file keeps:

```ts
import { computeSet, comparisonSet, periodEndMs } from "@/lib/thamani/periods";
import type { MetricRow } from "@/lib/thamani/types";

export const ACCOUNTS_NEW = "accounts_new";

export function bucketAccounts(createdAts: string[], now: Date): MetricRow[] {
  // …unchanged…
}
```

- [ ] **Step 4: Verify nothing else referenced the removed code**

Run: `grep -rn "computeAccountsMetrics\|api/cron/thamani-metrics" app lib tests`
Expected: no matches.

- [ ] **Step 5: Typecheck, lint, full test suite**

Run: `pnpm typecheck && pnpm lint && pnpm vitest run`
Expected: all pass (accounts.test.ts + read.test.ts still green).

- [ ] **Step 6: Commit**

```bash
git add vercel.json app/api/cron/thamani-metrics lib/thamani/metrics/accounts.ts
git commit -m "chore(thamani): retire Vercel metrics cron in favor of Supabase sync"
```

---

### Task 6: Author the reusable aggregation blueprint skill

Capture the repeatable recipe so future Thamani aggregations follow a known path.

**Files:**

- Create: `.claude/skills/thamani-metrics-aggregation/SKILL.md`

- [ ] **Step 1: Write the skill**

Create `.claude/skills/thamani-metrics-aggregation/SKILL.md`:

````markdown
---
name: thamani-metrics-aggregation
description: Use when adding a new pre-aggregated metric sourced from the Thamani production database into atlas's thamani_metrics table (e.g. new devices per period, active users, transaction counts). Covers the metric registry, the Supabase Edge Function + pg_cron pipeline, and verification. Triggers on "add a metric", "aggregate from Thamani", "new growth metric", or editing db/supabase/supabase/functions/sync-thamani-metrics.
---

# Thamani Metrics Aggregation Blueprint

Adds a new aggregation from **Thamani prod** into atlas `public.thamani_metrics`,
read by the growth dashboard. The pipeline is a `MetricDef[]` registry run every
10 minutes by pg_cron → Edge Function `sync-thamani-metrics`. Design rationale and
full context: `docs/superpowers/specs/2026-08-04-thamani-metrics-supabase-cron-design.md`.

## When NOT to use

- Metrics computed from atlas's OWN tables (meetings, prompts) — those can aggregate
  in-DB with plain SQL; no Edge Function needed.
- One-off analytics queries — this is for recurring, dashboard-backed metrics.

## Steps

1. **Name it.** Pick a `metric_key` (snake_case, e.g. `devices_new`) and decide what
   one row counts and at which grains (the standard set is day/week/month/quarter/year,
   current + previous period).

2. **Add the metric module** at
   `db/supabase/supabase/functions/sync-thamani-metrics/metrics/<key>.ts`.
   - Count-of-rows-by-timestamp (the common case):
     ```ts
     import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
     import { pageAll } from "../_shared/pageAll.ts";
     import { bucketCounts } from "../_shared/aggregate.ts";
     import type { MetricRow } from "../_shared/types.ts";

     export const devicesNew = {
       metric_key: "devices_new",
       compute: async (
         thamani: SupabaseClient,
         now: Date,
       ): Promise<MetricRow[]> =>
         bucketCounts(
           "devices_new",
           await pageAll(thamani, "devices", "created_at"),
           now,
         ),
     };
     ```
   - Sum / distinct / custom: write a bespoke `compute` using `pageAll` (or your own
     query) plus the helpers in `_shared/periods.ts` (`computeSet`, `comparisonSet`,
     `periodEndMs`). Return one `MetricRow` per `(grain, period_start)`, de-duplicated.

3. **Register it** in `_shared/registry.ts` — add to the `METRICS` array.

4. **Test it.** Add Deno assertions to `aggregate_test.ts` (mirror the accounts_new
   cases: a known input → expected per-grain counts, empty input → all-zero unique
   rows). Run `deno test db/supabase/supabase/functions/sync-thamani-metrics/`.

5. **Deploy.** `pnpm supabase functions deploy sync-thamani-metrics --project-ref <atlas-ref>`.
   No new cron or infra — the existing */10 job runs the whole registry.

6. **(If surfacing on the dashboard)** add a read in `lib/thamani/read.ts` filtered by
   the new `metric_key` (follow `getAccountsSnapshot`), then a UI component. Always
   capture and `console.error` the query `error` — never swallow it.

7. **Verify.** Manually invoke the function (bearer = atlas service_role key), assert
   `upserted` grew, check `cron.job_run_details` for a `succeeded` run, and confirm the
   new rows: `select * from thamani_metrics where metric_key = '<key>' limit 20`.

## Guardrails

- The function authorizes callers by comparing the bearer to `SUPABASE_SERVICE_ROLE_KEY`
  (deployed with `verify_jwt = false`). Don't add anon-key access.
- Thamani credentials live only as Edge Function secrets — never commit or paste them.
- Upsert conflict target is always `metric_key,grain,period_start`.
- `_shared/types.ts` and `_shared/periods.ts` are copies of `lib/thamani/{types,periods}.ts`;
  if you change period math, change BOTH and update both test suites.
````

- [ ] **Step 2: Sanity-check the skill file**

Run: `head -5 .claude/skills/thamani-metrics-aggregation/SKILL.md`
Expected: valid frontmatter (`name`, `description`).

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/thamani-metrics-aggregation/SKILL.md
git commit -m "docs(thamani): reusable aggregation blueprint skill"
```

---

## Notes for the executor

- **Task ordering:** Tasks 1–3 and 6 are independent of prod access and can proceed
  immediately. Task 4 needs the atlas prod project ref + the operator setting secrets.
  Task 5 must come AFTER Task 4 is verified (don't remove the Vercel cron until Supabase
  is confirmed writing rows).
- **If the CLI scaffolds the function to a different path** than
  `db/supabase/supabase/functions/`, use the actual path everywhere and note it.
- **Do not** set `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` as function secrets — they
  are auto-injected; setting them manually is rejected by the CLI.
