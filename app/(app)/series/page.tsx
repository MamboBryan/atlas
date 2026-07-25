import Link from "next/link";
import { requireUser } from "@/lib/auth/require";
import { Card, CardHeader, CardTitle, CardDescription, CardAction } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { NewSeriesTrigger } from "./_ui/new-series-trigger";

type SeriesRow = {
  id: string;
  name: string;
  description: string | null;
  timezone: string;
  rrule: string | null;
  rotation_order: string[];
  owner_user_id: string;
};

type ProfileRow = {
  id: string;
  display_name: string;
  role: "member" | "admin";
};

function cadenceLabel(rrule: string | null): string {
  if (!rrule) return "custom";
  const upper = rrule.toUpperCase();
  if (upper.includes("FREQ=WEEKLY")) return "weekly";
  if (upper.includes("FREQ=DAILY")) return "daily";
  if (upper.includes("FREQ=MONTHLY")) return "monthly";
  return "custom";
}

function SeriesCard({ s, ownerName }: { s: SeriesRow; ownerName: string }) {
  const rotationCount = Array.isArray(s.rotation_order)
    ? s.rotation_order.length
    : 0;
  return (
    <Link href={`/series/${s.id}` as never} className="block no-underline">
      <Card interactive size="sm">
        <CardHeader>
          <CardTitle className="truncate">{s.name}</CardTitle>
          <CardDescription>
            {s.timezone}
            {" · "}
            {rotationCount} in rotation
            {" · "}
            owner {ownerName}
            {s.description ? ` · ${s.description.slice(0, 60)}${s.description.length > 60 ? "…" : ""}` : ""}
          </CardDescription>
          <CardAction>
            <Badge variant="secondary">{cadenceLabel(s.rrule)}</Badge>
          </CardAction>
        </CardHeader>
      </Card>
    </Link>
  );
}

export default async function SeriesListPage() {
  const { user, supabase } = await requireUser();

  const [{ data: rows }, { data: me }, { data: rosterRows }] =
    await Promise.all([
      supabase
        .from("meeting_series")
        .select("id,name,description,timezone,rrule,rotation_order,owner_user_id")
        .order("name", { ascending: true }),
      supabase.from("profiles").select("role").eq("id", user.id).single(),
      supabase
        .from("profiles")
        .select("id,display_name")
        .eq("is_active", true)
        .order("display_name", { ascending: true }),
    ]);

  const series = (rows ?? []) as SeriesRow[];
  const isAdmin = me?.role === "admin";
  const roster = (rosterRows ?? []) as { id: string; display_name: string }[];

  const ownerIds = Array.from(new Set(series.map((s) => s.owner_user_id)));
  const { data: owners } = ownerIds.length
    ? await supabase
        .from("profiles")
        .select("id,display_name")
        .in("id", ownerIds)
    : { data: [] };
  const nameById = new Map(
    ((owners ?? []) as { id: string; display_name: string }[]).map((r) => [
      r.id,
      r.display_name,
    ]),
  );

  const viewerTz =
    Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";

  return (
    <div className="space-y-8 max-w-3xl">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-extrabold text-ink">
            Series
          </h1>
          <p className="text-sm text-ink-soft">
            Recurring meeting rituals for your team.
          </p>
        </div>
        {isAdmin && (
          <div className="shrink-0">
            <NewSeriesTrigger roster={roster} defaultTimezone={viewerTz} />
          </div>
        )}
      </header>

      {series.length === 0 ? (
        <p className="text-sm text-ink-soft">
          {isAdmin
            ? "No series yet. Create one to auto-generate recurring meetings."
            : "No series yet."}
        </p>
      ) : (
        <div className="space-y-2">
          {series.map((s) => (
            <SeriesCard
              key={s.id}
              s={s}
              ownerName={nameById.get(s.owner_user_id) ?? "?"}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export type { ProfileRow };
