import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { requireUser } from "@/lib/auth/require";

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
    <Link
      href={href as never}
      className="block rounded-lg border p-4 hover:bg-muted transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium truncate">{p.question}</div>
          <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-2">
            <span>{p.response_type.replace("_", " ")}</span>
            <span>·</span>
            <span>{p.anonymity}</span>
          </div>
        </div>
        <div className="shrink-0 flex flex-wrap gap-1.5 justify-end">
          {mine && <Badge variant="outline">Yours</Badge>}
          {!mine && answered && <Badge variant="outline">Answered</Badge>}
          {p.is_revealed ? (
            <Badge variant="secondary">Revealed</Badge>
          ) : p.is_open ? (
            <Badge>Open</Badge>
          ) : (
            <Badge variant="outline">Closed</Badge>
          )}
        </div>
      </div>
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
          <Link href={"/polls/new" as never} className={buttonVariants()}>
            New poll
          </Link>
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
