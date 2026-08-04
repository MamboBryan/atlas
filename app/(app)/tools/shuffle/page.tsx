import { ShuffleStage } from "@/components/tools/shuffle-stage";

export default async function ToolsShufflePage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = await searchParams;
  return <ShuffleStage sessionId={id ?? null} />;
}
