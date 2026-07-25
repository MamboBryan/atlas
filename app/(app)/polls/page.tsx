import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardDescription, CardAction } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/require";
import { NewPollTrigger } from "@/app/(app)/polls/_ui/new-poll-trigger";

type PromptRow = {
  id: string;
  question: string;
  response_type: string;
  anonymity: string;
  is_open: boolean;
  is_revealed: boolean;
  owner_user_id: string;
  created_by: string;
  created_at: string;
};

function pollStatusBadge(p: PromptRow) {
  if (p.is_revealed) return <Badge variant="secondary">Revealed</Badge>;
  if (p.is_open) return <Badge variant="default">Open</Badge>;
  return <Badge variant="outline">Closed</Badge>;
}

function PromptRowCard({
  p,
  href,
  mine,
  answered,
}: {
  p: PromptRow;
  href: string;
  mine: boolean;
  answered: boolean;
}) {
  return (
    <Link href={href as never} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-lg">
      <Card interactive size="sm">
        <CardHeader>
          <CardTitle className="text-base leading-snug line-clamp-2">
            {p.question}
          </CardTitle>
          <CardDescription>
            {p.response_type.replace(/_/g, " ")} · {p.anonymity.replace(/_/g, " ")}
          </CardDescription>
          <CardAction>
            <div className="flex flex-wrap gap-1.5 justify-end">
              {mine && <Badge variant="outline">Yours</Badge>}
              {!mine && answered && <Badge variant="outline">Answered</Badge>}
              {pollStatusBadge(p)}
            </div>
          </CardAction>
        </CardHeader>
      </Card>
    </Link>
  );
}

export default async function PollsPage() {
  const { user, supabase } = await requireUser();

  const { data: all } = await supabase
    .from("prompts")
    .select(
      "id,question,response_type,anonymity,is_open,is_revealed,owner_user_id,created_by,created_at",
    )
    .order("created_at", { ascending: false });

  const { data: myParticipation } = await supabase
    .from("participation")
    .select("prompt_id")
    .eq("user_id", user.id);
  const answered = new Set(
    (myParticipation ?? []).map((r) => r.prompt_id as string),
  );

  const polls = (all ?? []) as PromptRow[];
  const needsMe = polls.filter(
    (p) =>
      p.is_open &&
      !p.is_revealed &&
      p.owner_user_id !== user.id &&
      !answered.has(p.id),
  );

  return (
    <div className="space-y-8 max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Polls</h1>
        <div className="flex items-center gap-2">
          <Link
            href={"/polls/past" as never}
            className={buttonVariants({ variant: "outline" })}
          >
            Past
          </Link>
          <NewPollTrigger />
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Needs your response ({needsMe.length})
        </h2>
        {needsMe.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing waiting on you.
          </p>
        ) : (
          <div className="space-y-2">
            {needsMe.map((p) => (
              <PromptRowCard
                key={p.id}
                p={p}
                href={`/polls/${p.id}`}
                mine={p.owner_user_id === user.id}
                answered={answered.has(p.id)}
              />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          All polls ({polls.length})
        </h2>
        {polls.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No polls yet. Create the first one.
          </p>
        ) : (
          <div className="space-y-2">
            {polls.map((p) => (
              <PromptRowCard
                key={p.id}
                p={p}
                href={`/polls/${p.id}`}
                mine={p.owner_user_id === user.id}
                answered={answered.has(p.id)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
