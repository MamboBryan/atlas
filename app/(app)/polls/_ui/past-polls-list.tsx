import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireUser } from "@/lib/auth/require";

type PromptRow = {
  id: string;
  question: string;
  response_type: string;
  anonymity: string;
  revealed_at: string | null;
};

function fmt(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export async function PastPollsList() {
  const { supabase } = await requireUser();

  const { data: rows } = await supabase
    .from("prompts")
    .select("id,question,response_type,anonymity,revealed_at")
    .eq("is_revealed", true)
    .is("meeting_id", null)
    .order("revealed_at", { ascending: false });

  const polls = (rows ?? []) as PromptRow[];

  if (polls.length === 0) {
    return (
      <EmptyState
        sticker="empty-box"
        headline="No past polls yet"
        body="Polls appear here once they're revealed."
      />
    );
  }

  return (
    <div className="space-y-2">
      {polls.map((p) => (
        <Link
          key={p.id}
          href={`/polls/${p.id}` as never}
          className="block focus-visible:outline-none"
        >
          <Card interactive size="sm">
            <CardHeader>
              <CardTitle className="line-clamp-2">{p.question}</CardTitle>
              <CardDescription>
                {p.response_type.replace(/_/g, " ")} ·{" "}
                {p.anonymity.replace(/_/g, " ")}
                {p.revealed_at && ` · revealed ${fmt(p.revealed_at)}`}
              </CardDescription>
              <CardAction>
                <Badge variant="revealed" size="lg">
                  Revealed
                </Badge>
              </CardAction>
            </CardHeader>
          </Card>
        </Link>
      ))}
    </div>
  );
}
