import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/require";

type UnavailableRow = {
  id: string;
  starts_on: string;
  ends_on: string;
  note: string | null;
  user_id: string;
  profiles: { display_name: string } | null;
};

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export default async function HomeRight() {
  const { supabase } = await requireUser();

  const todayIso = new Date().toISOString().slice(0, 10);

  const { data } = await supabase
    .from("unavailability_windows")
    .select("id,starts_on,ends_on,note,user_id,profiles(display_name)")
    .lte("starts_on", todayIso)
    .gte("ends_on", todayIso)
    .order("ends_on", { ascending: true });

  const unavailable = (data ?? []) as unknown as UnavailableRow[];

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="font-display text-sm font-bold uppercase tracking-wide text-ink-soft">
          Picker
        </h2>
        <div className="flex flex-col gap-3">
          <Button variant="accent" render={<Link href="/tools/pick" />}>
            Pick someone
          </Button>
          <Button variant="outline" render={<Link href="/tools/shuffle" />}>
            Shuffle users
          </Button>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-sm font-bold uppercase tracking-wide text-ink-soft">
          Unavailable
        </h2>
        {unavailable.length === 0 ? (
          <Card size="sm">
            <CardContent className="!py-4 text-center text-sm text-ink-soft">
              Everyone&apos;s available today.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {unavailable.map((u) => (
              <Card key={u.id} size="sm">
                <CardContent className="!py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-ink">
                      {u.profiles?.display_name ?? "Unknown"}
                    </div>
                    {u.note && (
                      <div className="truncate text-xs text-ink-soft">
                        {u.note}
                      </div>
                    )}
                  </div>
                  <div className="shrink-0 text-xs text-ink-soft">
                    {fmt(u.starts_on)} → {fmt(u.ends_on)}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
