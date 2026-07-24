import Link from "next/link";
import { ShuffleRunner } from "@/components/tools/shuffle-runner";

export default async function ToolsShufflePage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = await searchParams;
  return (
    <div className="max-w-2xl space-y-6">
      <div className="text-sm">
        <Link
          href={"/" as never}
          className="text-muted-foreground hover:underline"
        >
          ← Home
        </Link>
      </div>
      <h1 className="text-2xl font-semibold">Shuffle roster</h1>
      <ShuffleRunner sessionId={id ?? null} />
    </div>
  );
}
