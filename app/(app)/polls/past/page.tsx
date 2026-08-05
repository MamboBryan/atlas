import { PollsHeader } from "@/app/(app)/polls/_ui/polls-header";
import { PollsList } from "@/app/(app)/polls/_ui/polls-list";
import { PastPollsList } from "@/app/(app)/polls/_ui/past-polls-list";
import { DetailWithRail } from "@/components/app/detail-with-rail";

export default async function PastPollsPage() {
  return (
    <DetailWithRail
      rail={
        <div className="space-y-4">
          <h2 className="font-display text-xl font-extrabold text-ink">
            Past polls
          </h2>
          <PastPollsList />
        </div>
      }
    >
      <div className="space-y-8">
        <PollsHeader pastActive />
        <PollsList />
        <section className="md:hidden pt-4 border-t border-ink/15 space-y-3">
          <h2 className="font-display text-xl font-extrabold text-ink">
            Past polls
          </h2>
          <PastPollsList />
        </section>
      </div>
    </DetailWithRail>
  );
}
