import { PastPollsList } from "@/app/(app)/polls/_ui/past-polls-list";

export default async function PollsRight() {
  return (
    <div className="space-y-4">
      <h2 className="font-display text-xl font-extrabold text-ink">
        Completed Polls
      </h2>
      <PastPollsList />
    </div>
  );
}
