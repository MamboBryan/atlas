import { ShuffleStage } from "@/components/tools/shuffle-stage";
import { DetailWithRail } from "@/components/app/detail-with-rail";

export default async function ToolsShufflePage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = await searchParams;
  return (
    <DetailWithRail>
      <ShuffleStage sessionId={id ?? null} />
    </DetailWithRail>
  );
}
