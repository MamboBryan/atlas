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
  is_open: boolean;
  is_revealed: boolean;
};

function statusBadge(p: PromptRow) {
  if (p.is_revealed)
    return (
      <Badge variant="revealed" size="lg">
        Revealed
      </Badge>
    );
  if (p.is_open)
    return (
      <Badge variant="open" size="lg">
        Open
      </Badge>
    );
  return (
    <Badge variant="ended" size="lg">
      Closed
    </Badge>
  );
}

export async function PollsList({ activeId }: { activeId?: string }) {
  const { supabase } = await requireUser();

  const { data: rows } = await supabase
    .from("prompts")
    .select(
      "id,question,response_type,anonymity,is_open,is_revealed,created_at",
    )
    .is("meeting_id", null)
    .eq("is_revealed", false)
    .order("created_at", { ascending: false });

  const polls = (rows ?? []) as PromptRow[];

  if (polls.length === 0) {
    return (
      <EmptyState
        sticker="empty-box"
        headline="No polls yet"
        body="Create a poll to gather quick feedback from the team."
      />
    );
  }

  const hasSelection = !!activeId;

  return (
    <div className="space-y-2">
      {polls.map((p) => {
        const isActive = activeId === p.id;
        return (
          <Link
            key={p.id}
            href={`/polls/${p.id}` as never}
            className="block focus-visible:outline-none"
            aria-current={isActive ? "page" : undefined}
          >
            <Card
              interactive
              size="sm"
              className={
                isActive
                  ? "bg-accent text-accent-ink border-accent shadow-[-3px_3px_0_0_var(--accent-shadow)] hover:shadow-[-2px_2px_0_0_var(--accent-shadow)] [&_[data-slot=card-description]]:text-accent-ink/70"
                  : hasSelection
                    ? "opacity-70 saturate-75 transition-[filter,opacity] duration-fast hover:opacity-100 hover:saturate-100"
                    : undefined
              }
            >
              <CardHeader>
                <CardTitle className="line-clamp-2">{p.question}</CardTitle>
                <CardDescription>
                  {p.response_type.replace(/_/g, " ")} ·{" "}
                  {p.anonymity.replace(/_/g, " ")}
                </CardDescription>
                <CardAction>{statusBadge(p)}</CardAction>
              </CardHeader>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
