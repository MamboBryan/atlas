import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/require";
import { Badge } from "@/components/ui/badge";

export default async function MemberPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase } = await requireUser();
  const { data } = await supabase
    .from("profiles")
    .select("id,display_name,email,avatar_url,role,is_active")
    .eq("id", id)
    .single();
  if (!data) notFound();
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4">
        {data.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={data.avatar_url}
            alt=""
            className="h-16 w-16 rounded-full object-cover"
          />
        ) : (
          <div className="h-16 w-16 rounded-full bg-muted grid place-items-center text-lg font-semibold">
            {data.display_name.charAt(0).toUpperCase()}
          </div>
        )}
        <div>
          <h1 className="text-2xl font-semibold">{data.display_name}</h1>
          <p className="text-sm text-muted-foreground">{data.email}</p>
        </div>
      </div>
      <div className="flex gap-2">
        <Badge variant={data.role === "admin" ? "default" : "secondary"}>
          {data.role}
        </Badge>
        {data.is_active ? (
          <Badge variant="secondary">active</Badge>
        ) : (
          <Badge variant="outline">inactive</Badge>
        )}
      </div>
    </div>
  );
}
