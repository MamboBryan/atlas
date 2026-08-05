import { PollsHeader } from "@/app/(app)/polls/_ui/polls-header";
import { PollsList } from "@/app/(app)/polls/_ui/polls-list";
import { PastPollsList } from "@/app/(app)/polls/_ui/past-polls-list";
import { DetailWithRail } from "@/components/app/detail-with-rail";

export default async function PollsPage() {
  return (
    <DetailWithRail
      rail={
        <div className="space-y-4">
          <h2 className="font-display text-xl font-extrabold text-ink">
            Completed Polls
          </h2>
          <PastPollsList />
        </div>
      }
    >
      <div className="space-y-8">
        <PollsHeader />
        <PollsList />
      </div>
    </DetailWithRail>
  );
}
