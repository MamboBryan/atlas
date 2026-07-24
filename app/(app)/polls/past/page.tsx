import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { requireUser } from "@/lib/auth/require";

type PromptRow = {
  id: string;
  question: string;
  response_type: string;
  anonymity: string;
  revealed_at: string | null;
  created_at: string;
};

function fmt(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default async function PastPollsPage() {
  const { supabase } = await requireUser();

  const { data: rows } = await supabase
    .from("prompts")
    .select(
      "id,question,response_type,anonymity,revealed_at,created_at,is_revealed,meeting_id",
    )
    .eq("is_revealed", true)
    .is("meeting_id", null)
    .order("revealed_at", { ascending: false });

  const polls = (rows ?? []) as PromptRow[];

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-2 text-sm">
        <Link
          href={"/polls" as never}
          className="text-muted-foreground hover:underline"
        >
          ← Polls
        </Link>
      </div>
      <h1 className="text-2xl font-semibold">Past polls</h1>

      {polls.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No polls have been revealed yet.
        </p>
      ) : (
        <div className="space-y-2">
          {polls.map((p) => (
            <Link
              key={p.id}
              href={`/polls/${p.id}` as never}
              className="block rounded-lg border p-4 hover:bg-muted transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium truncate">{p.question}</div>
                  <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-2">
                    <span>{p.response_type.replace("_", " ")}</span>
                    <span>·</span>
                    <span>{p.anonymity}</span>
                    {p.revealed_at && (
                      <>
                        <span>·</span>
                        <span>revealed {fmt(p.revealed_at)}</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="shrink-0">
                  <Badge variant="secondary">Revealed</Badge>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
