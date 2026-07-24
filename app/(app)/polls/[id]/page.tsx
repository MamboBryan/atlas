import { notFound } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/require";
import { ResponseInput } from "@/components/prompts/response-input";
import { ParticipationCounter } from "@/components/prompts/participation-counter";
import { PromptOwnerControls } from "@/components/prompts/prompt-owner-controls";
import { RevealView } from "@/components/prompts/reveal-view";

export default async function PollDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user, supabase } = await requireUser();

  const { data: prompt } = await supabase
    .from("prompts")
    .select(
      "id,question,response_type,options,rating_min,rating_max,anonymity,timing,is_open,is_revealed,owner_user_id,created_by,created_at,revealed_at",
    )
    .eq("id", id)
    .single();

  if (!prompt) notFound();

  const [{ data: creator }, { data: owner }, { data: me }] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name")
      .eq("id", prompt.created_by)
      .single(),
    supabase
      .from("profiles")
      .select("display_name")
      .eq("id", prompt.owner_user_id)
      .single(),
    supabase.from("profiles").select("role").eq("id", user.id).single(),
  ]);

  const { data: myResp } = await supabase
    .from("participation")
    .select("prompt_id")
    .eq("prompt_id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  const isOwner = prompt.owner_user_id === user.id;
  const isTeamAdmin = me?.role === "admin";
  const canManage = isOwner || isTeamAdmin;
  const alreadyResponded = !!myResp;

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-2 text-sm">
        <Link
          href={"/polls" as never}
          className="text-muted-foreground hover:underline"
        >
          ← Polls
        </Link>
      </div>

      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-2xl font-semibold">{prompt.question}</h1>
          <div className="shrink-0 flex gap-1.5">
            {prompt.is_revealed ? (
              <Badge variant="secondary">Revealed</Badge>
            ) : prompt.is_open ? (
              <Badge>Open</Badge>
            ) : (
              <Badge variant="outline">Closed</Badge>
            )}
          </div>
        </div>
        <div className="text-sm text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
          <span>Type: {prompt.response_type.replace("_", " ")}</span>
          <span>Anonymity: {prompt.anonymity}</span>
          <span>Created by {creator?.display_name ?? "Unknown"}</span>
          {prompt.owner_user_id !== prompt.created_by && (
            <span>Owned by {owner?.display_name ?? "Unknown"}</span>
          )}
        </div>
      </div>

      {!prompt.is_revealed && <ParticipationCounter promptId={prompt.id} />}

      {prompt.is_revealed ? (
        <RevealView
          prompt={{
            id: prompt.id,
            response_type: prompt.response_type,
            options: prompt.options as
              { id: string; label: string }[] | null | undefined,
            rating_min: prompt.rating_min,
            rating_max: prompt.rating_max,
          }}
        />
      ) : prompt.is_open ? (
        <ResponseInput
          prompt={{
            id: prompt.id,
            response_type: prompt.response_type,
            options: prompt.options as
              { id: string; label: string }[] | null | undefined,
            rating_min: prompt.rating_min,
            rating_max: prompt.rating_max,
          }}
          alreadyResponded={alreadyResponded}
        />
      ) : (
        <div className="rounded-lg border p-4 text-sm text-muted-foreground">
          This poll is closed and hasn&apos;t been revealed yet.
        </div>
      )}

      {canManage && !prompt.is_revealed && (
        <div className="pt-4 border-t">
          <div className="text-sm font-medium mb-2">Owner controls</div>
          <PromptOwnerControls promptId={prompt.id} isOpen={prompt.is_open} />
        </div>
      )}

      {canManage && prompt.is_revealed && (
        <div className="pt-4 border-t">
          <Link
            href={"/polls" as never}
            className={buttonVariants({ variant: "outline" })}
          >
            Back to polls
          </Link>
        </div>
      )}
    </div>
  );
}
