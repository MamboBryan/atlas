import { createSupabaseServerClient } from "@/lib/supabase/server";

type Prompt = {
  id: string;
  response_type:
    "text" | "single_choice" | "multi_choice" | "yes_no" | "rating";
  options?: { id: string; label: string }[] | null;
  rating_min?: number | null;
  rating_max?: number | null;
};

type ResponseRow = {
  user_id: string;
  response: Record<string, unknown>;
  profiles: { display_name: string } | null;
};

function Bar({
  label,
  count,
  max,
}: {
  label: string;
  count: number;
  max: number;
}) {
  const pct = max === 0 ? 0 : Math.round((count / max) * 100);
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="text-muted-foreground">{count}</span>
      </div>
      <div className="h-2 rounded bg-muted overflow-hidden">
        <div
          className="h-full bg-primary transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export async function RevealView({ prompt }: { prompt: Prompt }) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("responses_attributed")
    .select("user_id,response,profiles(display_name)")
    .eq("prompt_id", prompt.id)
    .order("created_at");

  const rows = (data ?? []) as unknown as ResponseRow[];

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border p-4 text-sm text-muted-foreground">
        Revealed with no responses.
      </div>
    );
  }

  if (prompt.response_type === "text") {
    return (
      <div className="space-y-3">
        {rows.map((r) => (
          <div key={r.user_id} className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground mb-1">
              {r.profiles?.display_name ?? "Unknown"}
            </div>
            <div className="whitespace-pre-wrap text-sm">
              {String(r.response.text ?? "")}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (
    prompt.response_type === "single_choice" ||
    prompt.response_type === "yes_no"
  ) {
    const counts = new Map<string, number>();
    for (const r of rows) {
      const id = String(r.response.option_id ?? "");
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    const max = Math.max(...Array.from(counts.values()), 0);
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          {(prompt.options ?? []).map((o) => (
            <Bar
              key={o.id}
              label={o.label}
              count={counts.get(o.id) ?? 0}
              max={max}
            />
          ))}
        </div>
        <div className="space-y-1 text-sm">
          {rows.map((r) => {
            const id = String(r.response.option_id ?? "");
            const label =
              (prompt.options ?? []).find((o) => o.id === id)?.label ?? id;
            return (
              <div
                key={r.user_id}
                className="flex justify-between border-b py-1"
              >
                <span>{r.profiles?.display_name ?? "Unknown"}</span>
                <span className="text-muted-foreground">{label}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (prompt.response_type === "multi_choice") {
    const counts = new Map<string, number>();
    for (const r of rows) {
      const ids = Array.isArray(r.response.option_ids)
        ? (r.response.option_ids as string[])
        : [];
      for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    const max = Math.max(...Array.from(counts.values()), 0);
    return (
      <div className="space-y-2">
        {(prompt.options ?? []).map((o) => (
          <Bar
            key={o.id}
            label={o.label}
            count={counts.get(o.id) ?? 0}
            max={max}
          />
        ))}
      </div>
    );
  }

  // rating
  const values: number[] = rows
    .map((r) => Number(r.response.value))
    .filter((v) => Number.isFinite(v));
  const mean =
    values.length === 0
      ? 0
      : Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) /
        10;
  const min = prompt.rating_min ?? 1;
  const max = prompt.rating_max ?? 5;
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  const barMax = Math.max(...Array.from(counts.values()), 0);
  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground">
        Mean: <span className="font-medium text-foreground">{mean}</span> ·{" "}
        {values.length} responses
      </div>
      <div className="space-y-2">
        {Array.from({ length: max - min + 1 }, (_, i) => min + i).map((v) => (
          <Bar
            key={v}
            label={String(v)}
            count={counts.get(v) ?? 0}
            max={barMax}
          />
        ))}
      </div>
    </div>
  );
}
