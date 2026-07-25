import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function HomeRight() {
  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="font-display text-sm font-bold uppercase tracking-wide text-ink-soft">
          Quick tools
        </h2>
        <div className="flex flex-col gap-3">
          <Button variant="accent" render={<Link href="/tools/pick" />}>
            Pick someone
          </Button>
          <Button variant="outline" render={<Link href="/tools/shuffle" />}>
            Shuffle roster
          </Button>
        </div>
      </section>
    </div>
  );
}
