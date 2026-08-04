import { assertEquals } from "jsr:@std/assert@1";
import { handler, timingSafeEqual } from "./index.ts";

Deno.test("timingSafeEqual: equal strings", () => {
  assertEquals(timingSafeEqual("abc", "abc"), true);
});

Deno.test("timingSafeEqual: different lengths", () => {
  assertEquals(timingSafeEqual("abc", "abcd"), false);
});

Deno.test("timingSafeEqual: same length, different content", () => {
  assertEquals(timingSafeEqual("abc", "abd"), false);
});

// These two tests exercise the pre-createClient auth branch only, so no
// network access is needed — but they do call Deno.env.set/get, which
// requires running with `--allow-env=SUPABASE_SERVICE_ROLE_KEY` (see the
// "test" task in deno.json).

Deno.test("handler: missing Authorization header → 401", async () => {
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-key");
  const res = await handler(new Request("http://x", { method: "POST" }));
  assertEquals(res.status, 401);
  assertEquals(await res.json(), { ok: false });
});

Deno.test("handler: wrong bearer → 401", async () => {
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-key");
  const res = await handler(
    new Request("http://x", {
      method: "POST",
      headers: { Authorization: "Bearer wrong" },
    }),
  );
  assertEquals(res.status, 401);
  assertEquals(await res.json(), { ok: false });
});
