import Link from "next/link";
import { Button } from "@/components/ui/button";

type Props = {
  meetingId: string;
  status: "scheduled" | "live" | "ended" | "postponed" | "cancelled";
  isHost: boolean;
};

export function MeetingHeaderActions({ meetingId, status, isHost }: Props) {
  if (!isHost) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === "live" && (
        <Button
          variant="default"
          size="sm"
          render={<Link href={`/meetings/${meetingId}/present` as never} />}
        >
          Present →
        </Button>
      )}
    </div>
  );
}
