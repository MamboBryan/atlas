import { Badge } from "@/components/ui/badge";
import { PollRespondForm } from "@/components/polls/poll-respond-form";
import { ParticipationCounter } from "@/components/prompts/participation-counter";
import { PromptOwnerControls } from "@/components/prompts/prompt-owner-controls";
import { RevealView } from "@/components/prompts/reveal-view";
import { requireUser } from "@/lib/auth/require";

type PromptRow = {
  id: string;
  question: string;
  response_type:
    "text" | "single_choice" | "multi_choice" | "yes_no" | "rating";
  options: { id: string; label: string }[] | null;
  rating_min: number | null;
  rating_max: number | null;
  anonymity: "attributed" | "hard_anonymous";
  timing: "async" | "live";
  is_open: boolean;
  is_revealed: boolean;
  owner_user_id: string;
  created_by: string;
};

function StatusBadge({ p }: { p: PromptRow }) {
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

export async function PollDetailPanel({ pollId }: { pollId: string }) {
  const { user, supabase } = await requireUser();

  const { data: prompt } = await supabase
    .from("prompts")
    .select(
      "id,question,response_type,options,rating_min,rating_max,anonymity,timing,is_open,is_revealed,owner_user_id,created_by",
    )
    .eq("id", pollId)
    .single<PromptRow>();

  if (!prompt) {
    return (
      <p className="text-sm text-ink-soft">This poll isn&apos;t available.</p>
    );
  }

  const [{ data: creator }, { data: me }] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name")
      .eq("id", prompt.created_by)
      .single<{ display_name: string }>(),
    supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single<{ role: string }>(),
  ]);

  const { data: myResp } = await supabase
    .from("participation")
    .select("prompt_id")
    .eq("prompt_id", pollId)
    .eq("user_id", user.id)
    .maybeSingle();

  const isOwner = prompt.owner_user_id === user.id;
  const isTeamAdmin = me?.role === "admin";
  const canManage = isOwner || isTeamAdmin;
  const alreadyResponded = !!myResp;

  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-display text-xl font-extrabold text-ink leading-snug">
            {prompt.question}
          </h2>
          <StatusBadge p={prompt} />
        </div>
        <p className="text-sm text-ink-soft flex flex-wrap gap-x-3 gap-y-0.5">
          <span>{prompt.response_type.replace(/_/g, " ")}</span>
          <span aria-hidden>·</span>
          <span>{prompt.anonymity.replace(/_/g, " ")}</span>
          <span aria-hidden>·</span>
          <span>by {creator?.display_name ?? "Unknown"}</span>
        </p>
      </header>

      {canManage && !prompt.is_revealed && (
        <PromptOwnerControls promptId={prompt.id} isOpen={prompt.is_open} />
      )}

      <hr className="border-t border-ink/15" />

      {!prompt.is_revealed && <ParticipationCounter promptId={prompt.id} />}

      {prompt.is_revealed ? (
        <RevealView
          prompt={{
            id: prompt.id,
            response_type: prompt.response_type,
            options: prompt.options ?? undefined,
            rating_min: prompt.rating_min,
            rating_max: prompt.rating_max,
            anonymity: prompt.anonymity,
          }}
        />
      ) : prompt.is_open ? (
        <PollRespondForm
          prompt={{
            id: prompt.id,
            response_type: prompt.response_type,
            options: prompt.options ?? undefined,
            rating_min: prompt.rating_min,
            rating_max: prompt.rating_max,
            anonymity: prompt.anonymity,
          }}
          alreadyResponded={alreadyResponded}
        />
      ) : (
        <p className="rounded-lg border border-ink/20 bg-surface-raised p-4 text-sm text-ink-soft">
          This poll is closed and hasn&apos;t been revealed yet.
        </p>
      )}
    </div>
  );
}
