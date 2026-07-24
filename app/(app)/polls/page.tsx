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

function PromptRowCard({ p, href }: { p: PromptRow; href: string }) {
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
        <div className="shrink-0 flex gap-1.5">
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

  const { data: mine } = await supabase
    .from("prompts")
    .select(
      "id,question,response_type,anonymity,is_open,is_revealed,owner_user_id,created_by,created_at",
    )
    .eq("owner_user_id", user.id)
    .order("created_at", { ascending: false });

  const { data: openAll } = await supabase
    .from("prompts")
    .select(
      "id,question,response_type,anonymity,is_open,is_revealed,owner_user_id,created_by,created_at",
    )
    .eq("is_open", true)
    .eq("is_revealed", false)
    .order("created_at", { ascending: false });

  const { data: myParticipation } = await supabase
    .from("participation")
    .select("prompt_id")
    .eq("user_id", user.id);
  const answered = new Set(
    (myParticipation ?? []).map((r) => r.prompt_id as string),
  );

  const openForMe = (openAll ?? []).filter((p) => !answered.has(p.id));

  return (
    <div className="space-y-8 max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Polls</h1>
        <Link href={"/polls/new" as never} className={buttonVariants()}>
          New poll
        </Link>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Open for me ({openForMe.length})
        </h2>
        {openForMe.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing waiting on you.
          </p>
        ) : (
          <div className="space-y-2">
            {openForMe.map((p) => (
              <PromptRowCard
                key={p.id}
                p={p as PromptRow}
                href={`/polls/${p.id}`}
              />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Mine ({(mine ?? []).length})
        </h2>
        {(mine ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">
            You haven&apos;t created any polls yet.
          </p>
        ) : (
          <div className="space-y-2">
            {(mine ?? []).map((p) => (
              <PromptRowCard
                key={p.id}
                p={p as PromptRow}
                href={`/polls/${p.id}`}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
