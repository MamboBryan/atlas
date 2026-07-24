import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/require";

type SeriesRow = {
  id: string;
  name: string;
  description: string | null;
  timezone: string;
  rotation_order: string[];
  owner_user_id: string;
};

type ProfileRow = {
  id: string;
  display_name: string;
  role: "member" | "admin";
};

export default async function SeriesListPage() {
  const { user, supabase } = await requireUser();

  const [{ data: rows }, { data: me }] = await Promise.all([
    supabase
      .from("meeting_series")
      .select(
        "id,name,description,timezone,rotation_order,owner_user_id",
      )
      .order("name", { ascending: true }),
    supabase.from("profiles").select("role").eq("id", user.id).single(),
  ]);

  const series = (rows ?? []) as SeriesRow[];
  const isAdmin = me?.role === "admin";

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

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Meeting series</h1>
        {isAdmin && (
          <Link href={"/series/new" as never} className={buttonVariants()}>
            New series
          </Link>
        )}
      </div>

      {series.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {isAdmin
            ? "No series yet. Create one to auto-generate recurring meetings."
            : "No series yet."}
        </p>
      ) : (
        <div className="space-y-2">
          {series.map((s) => (
            <Link
              key={s.id}
              href={`/series/${s.id}` as never}
              className="block rounded-lg border p-4 hover:bg-muted transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium truncate">{s.name}</div>
                  <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-2">
                    <span>{s.timezone}</span>
                    <span>·</span>
                    <span>
                      rotation of{" "}
                      {Array.isArray(s.rotation_order)
                        ? s.rotation_order.length
                        : 0}
                    </span>
                    <span>·</span>
                    <span>owner {nameById.get(s.owner_user_id) ?? "?"}</span>
                  </div>
                  {s.description && (
                    <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                      {s.description}
                    </p>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export type { ProfileRow };
