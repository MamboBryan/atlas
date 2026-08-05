import { PollsHeader } from "@/app/(app)/polls/_ui/polls-header";
import { PollsList } from "@/app/(app)/polls/_ui/polls-list";
import { PollDetailPanel } from "@/components/polls/poll-detail-panel";
import { ClearSelectionOnClick } from "@/app/(app)/polls/_ui/clear-selection-on-click";
import { DetailWithRail } from "@/components/app/detail-with-rail";

export default async function PollDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <DetailWithRail rail={<PollDetailPanel pollId={id} />}>
      <div className="space-y-8">
        <ClearSelectionOnClick />
        <PollsHeader />
        <PollsList activeId={id} />
        <section className="md:hidden pt-4 border-t border-ink/15">
          <PollDetailPanel pollId={id} />
        </section>
      </div>
    </DetailWithRail>
  );
}
