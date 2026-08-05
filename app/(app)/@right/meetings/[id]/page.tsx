import { MeetingRail } from "@/components/meetings/meeting-rail";

export default async function MeetingRight({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <MeetingRail id={id} />;
}
