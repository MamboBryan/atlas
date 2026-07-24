import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="max-w-4xl space-y-6">
      <h1 className="text-2xl font-semibold">Atlas</h1>

      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Quick tools
        </h2>
        <div className="flex flex-wrap gap-3">
          <Link
            href={"/tools/pick" as never}
            className={buttonVariants({ variant: "default" })}
          >
            Pick someone
          </Link>
          <Link
            href={"/tools/shuffle" as never}
            className={buttonVariants({ variant: "outline" })}
          >
            Shuffle roster
          </Link>
        </div>
      </section>
    </main>
  );
}
