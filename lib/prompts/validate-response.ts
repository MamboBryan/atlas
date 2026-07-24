type Prompt = {
  response_type:
    "text" | "single_choice" | "multi_choice" | "yes_no" | "rating";
  options?: { id: string; label?: string }[];
  rating_min?: number | null;
  rating_max?: number | null;
};

export type ValidationResult = { ok: true } | { ok: false; error: string };

export function validateResponse(p: Prompt, r: unknown): ValidationResult {
  const ids = new Set(p.options?.map((o) => o.id) ?? []);
  switch (p.response_type) {
    case "text": {
      const t = (r as { text?: unknown })?.text;
      if (typeof t !== "string" || t.length === 0 || t.length > 2000)
        return { ok: false, error: "text must be 1..2000 chars" };
      return { ok: true };
    }
    case "single_choice":
    case "yes_no": {
      const id = (r as { option_id?: unknown })?.option_id;
      if (typeof id !== "string" || !ids.has(id))
        return { ok: false, error: "option_id invalid" };
      return { ok: true };
    }
    case "multi_choice": {
      const arr = (r as { option_ids?: unknown })?.option_ids;
      if (
        !Array.isArray(arr) ||
        arr.length === 0 ||
        arr.some((x) => typeof x !== "string" || !ids.has(x))
      )
        return { ok: false, error: "option_ids invalid" };
      return { ok: true };
    }
    case "rating": {
      const v = (r as { value?: unknown })?.value;
      if (
        typeof v !== "number" ||
        !Number.isInteger(v) ||
        v < (p.rating_min ?? 1) ||
        v > (p.rating_max ?? 5)
      )
        return { ok: false, error: "value out of range" };
      return { ok: true };
    }
  }
}
