import { PollDetailPanel } from "@/components/polls/poll-detail-panel";

export default async function PollRight({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div key={id}>
      <PollDetailPanel pollId={id} />
    </div>
  );
}
