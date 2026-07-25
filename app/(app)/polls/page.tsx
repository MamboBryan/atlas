import { PollsHeader } from "@/app/(app)/polls/_ui/polls-header";
import { PollsList } from "@/app/(app)/polls/_ui/polls-list";

export default async function PollsPage() {
  return (
    <div className="space-y-8">
      <PollsHeader />
      <PollsList />
    </div>
  );
}
