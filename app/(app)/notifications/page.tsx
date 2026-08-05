import { requireUser } from "@/lib/auth/require";
import { NotificationsFeed } from "@/components/app/notifications-feed";
import { DetailWithRail } from "@/components/app/detail-with-rail";

type SearchParams = { [k: string]: string | string[] | undefined };

const PAGE_SIZE = 50;

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { user, supabase } = await requireUser();
  const params = await searchParams;
  const pageParam = Array.isArray(params.page) ? params.page[0] : params.page;
  const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data, count } = await supabase
    .from("notifications")
    .select("id,kind,title,body,link,read_at,created_at", { count: "exact" })
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .range(from, to);

  const total = count ?? 0;
  const hasNext = to + 1 < total;
  const hasPrev = page > 1;

  return (
    <DetailWithRail>
      <div className="space-y-4 max-w-2xl">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Notifications</h1>
        </div>
        <NotificationsFeed
          items={data ?? []}
          page={page}
          hasNext={hasNext}
          hasPrev={hasPrev}
        />
      </div>
    </DetailWithRail>
  );
}
