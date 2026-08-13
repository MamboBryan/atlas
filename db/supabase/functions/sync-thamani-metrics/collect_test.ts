import { assertEquals } from "jsr:@std/assert@1";
import { collectRows } from "./_shared/collect.ts";
import type { MetricDef } from "./_shared/registry.ts";
import type { MetricRow } from "./_shared/types.ts";

const now = new Date("2026-07-30T18:05:00Z");
// deno-lint-ignore no-explicit-any
const noClient = null as any;

function ok(key: string, value: number): MetricDef {
  return {
    metric_key: key,
    compute: () =>
      Promise.resolve([
        {
          metric_key: key,
          grain: "day",
          period_start: "2026-07-30",
          value,
        } as MetricRow,
      ]),
  };
}

function boom(key: string, message: string): MetricDef {
  return {
    metric_key: key,
    compute: () => Promise.reject(new Error(message)),
  };
}

Deno.test("collectRows: all healthy → every row, no failures", async () => {
  const { rows, failed } = await collectRows(
    [ok("accounts_new", 3), ok("devices_new", 27)],
    noClient,
    now,
  );
  assertEquals(rows.length, 2);
  assertEquals(failed, []);
});

Deno.test(
  "collectRows: one metric throwing does not drop the healthy ones",
  async () => {
    const spy = console.error;
    console.error = () => {};
    try {
      const { rows, failed } = await collectRows(
        [ok("accounts_new", 3), boom("devices_new", "devices read failed")],
        noClient,
        now,
      );
      assertEquals(rows.length, 1);
      assertEquals(rows[0].metric_key, "accounts_new");
      assertEquals(failed, [
        { metric_key: "devices_new", error: "devices read failed" },
      ]);
    } finally {
      console.error = spy;
    }
  },
);

Deno.test(
  "collectRows: a failing metric contributes no zeroed rows",
  async () => {
    const spy = console.error;
    console.error = () => {};
    try {
      const { rows } = await collectRows(
        [ok("accounts_new", 3), boom("devices_new", "nope")],
        noClient,
        now,
      );
      assertEquals(
        rows.some((r) => r.metric_key === "devices_new"),
        false,
      );
    } finally {
      console.error = spy;
    }
  },
);

Deno.test(
  "collectRows: every metric failing → no rows, all reported",
  async () => {
    const spy = console.error;
    console.error = () => {};
    try {
      const { rows, failed } = await collectRows(
        [boom("accounts_new", "a"), boom("devices_new", "b")],
        noClient,
        now,
      );
      assertEquals(rows, []);
      assertEquals(
        failed.map((f) => f.metric_key),
        ["accounts_new", "devices_new"],
      );
    } finally {
      console.error = spy;
    }
  },
);

Deno.test("collectRows: non-Error throws are still reported", async () => {
  const spy = console.error;
  console.error = () => {};
  try {
    const { failed } = await collectRows(
      [{ metric_key: "odd", compute: () => Promise.reject("plain string") }],
      noClient,
      now,
    );
    assertEquals(failed, [{ metric_key: "odd", error: "plain string" }]);
  } finally {
    console.error = spy;
  }
});
