import Link from "next/link";
import { RandomPickCard } from "@/components/tools/random-pick-card";

export default function ToolsPickPage() {
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
      <h1 className="text-2xl font-semibold">Pick someone</h1>
      <p className="text-sm text-muted-foreground">
        Picks a random active roster member who&apos;s available today.
      </p>
      <RandomPickCard />
    </div>
  );
}
