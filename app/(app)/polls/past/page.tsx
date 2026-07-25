import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
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
          className="text-ink-soft hover:underline"
        >
          ← Polls
        </Link>
      </div>
      <h1 className="font-display text-2xl font-extrabold text-ink">
        Past polls
      </h1>

      {polls.length === 0 ? (
        <EmptyState
          sticker="empty-box"
          headline="No past polls yet"
          body="Polls appear here once they've been revealed."
          action={{ label: "Back to polls", href: "/polls" as never }}
        />
      ) : (
        <div className="space-y-3">
          {polls.map((p) => (
            <Link key={p.id} href={`/polls/${p.id}` as never} className="block">
              <Card interactive>
                <CardContent className="flex items-start justify-between gap-3 py-0">
                  <div className="min-w-0">
                    <div className="font-display font-extrabold text-ink truncate">
                      {p.question}
                    </div>
                    <div className="text-xs text-ink-soft mt-1 flex flex-wrap gap-2">
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
                  <div className="shrink-0 pt-0.5">
                    <Badge variant="ended">Revealed</Badge>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
