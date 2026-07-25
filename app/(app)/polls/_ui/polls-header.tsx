import Link from "next/link";
import { Button } from "@/components/ui/button";
import { NewPollTrigger } from "@/app/(app)/polls/_ui/new-poll-trigger";

export function PollsHeader({ pastActive = false }: { pastActive?: boolean }) {
  return (
    <header className="flex items-start justify-between gap-4">
      <div>
        <h1 className="font-display text-3xl font-extrabold text-ink">Polls</h1>
        <p className="text-sm text-ink-soft">
          Snap decisions your team is thinking through.
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button
          variant={pastActive ? "default" : "outline"}
          render={<Link href={"/polls/past" as never} />}
        >
          Past
        </Button>
        <NewPollTrigger />
      </div>
    </header>
  );
}
