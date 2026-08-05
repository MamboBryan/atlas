import { getLeaderboardAction } from "@/lib/actions/game";
import { DetailWithRail } from "@/components/app/detail-with-rail";

export const dynamic = "force-dynamic";

export default async function LeaderboardPage() {
  const res = await getLeaderboardAction();
  if (!res.ok) {
    return (
      <DetailWithRail>
        <main className="mx-auto max-w-2xl p-6">
          <h1 className="text-2xl font-bold">Leaderboard</h1>
          <p className="text-sm text-muted-foreground">
            Couldn&apos;t load: {res.error.message}
          </p>
        </main>
      </DetailWithRail>
    );
  }
  const rows = res.data;
  return (
    <DetailWithRail>
      <main className="mx-auto max-w-2xl p-6 space-y-4">
        <header>
          <h1 className="text-2xl font-bold">Leaderboard</h1>
          <p className="text-sm text-muted-foreground">
            All-time points across pre-meeting games.
          </p>
        </header>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No games played yet. Play a round before your next meeting.
          </p>
        ) : (
          <ol className="space-y-1">
            {rows.map((r, i) => (
              <li
                key={r.player_id}
                className="flex items-center justify-between rounded-md border px-3 py-2"
              >
                <span>
                  <span className="tabular-nums">{i + 1}.</span>{" "}
                  {r.display_name}
                </span>
                <span className="tabular-nums">
                  <strong>{r.total_points}</strong>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {r.rounds_played} rounds
                  </span>
                </span>
              </li>
            ))}
          </ol>
        )}
      </main>
    </DetailWithRail>
  );
}
