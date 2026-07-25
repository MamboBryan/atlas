import { PollsHeader } from "@/app/(app)/polls/_ui/polls-header";
import { PollsList } from "@/app/(app)/polls/_ui/polls-list";
import { PastPollsList } from "@/app/(app)/polls/_ui/past-polls-list";

export default async function PastPollsPage() {
  return (
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
  );
}
