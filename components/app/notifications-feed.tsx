"use client";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Sticker, type StickerName } from "@/components/ui/sticker";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import {
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/actions/notifications";

type NotificationRow = {
  id: string;
  kind: string;
  title: string;
  body: string;
  link: string;
  read_at: string | null;
  created_at: string;
};

function stickerForKind(kind: string): StickerName {
  if (kind.startsWith("meeting_")) return "calendar";
  if (kind.startsWith("poll_")) return "speech-bubble";
  if (kind.startsWith("reveal_")) return "eyes";
  return "bell";
}

export function NotificationsFeed({
  items,
  page,
  hasNext,
  hasPrev,
}: {
  items: NotificationRow[];
  page: number;
  hasNext: boolean;
  hasPrev: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function markAll() {
    start(async () => {
      await markAllNotificationsRead();
      router.refresh();
    });
  }

  function markOne(id: string) {
    start(async () => {
      await markNotificationRead(id);
      router.refresh();
    });
  }

  const anyUnread = items.some((n) => !n.read_at);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <Button
          size="sm"
          variant="outline"
          disabled={pending || !anyUnread}
          onClick={markAll}
        >
          Mark all read
        </Button>
      </div>

      {items.length === 0 ? (
        <EmptyState sticker="bell" headline="No notifications yet" />
      ) : (
        <ul className="space-y-2">
          {items.map((n) => (
            <li key={n.id}>
              <Card interactive className={n.read_at ? "" : "bg-muted/30"}>
                <CardContent className="flex items-start gap-3 py-3">
                  <Sticker name={stickerForKind(n.kind)} size="sm" />
                  <Link
                    href={n.link as Route}
                    onClick={() => !n.read_at && markOne(n.id)}
                    className="flex-1 space-y-1 min-w-0"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{n.title}</span>
                      {!n.read_at && (
                        <span className="ml-2 size-2 rounded-full bg-accent flex-shrink-0" />
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {n.body}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {new Date(n.created_at).toLocaleString()} · {n.kind}
                    </div>
                  </Link>
                  {!n.read_at && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => markOne(n.id)}
                    >
                      Mark read
                    </Button>
                  )}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center justify-between">
        {hasPrev ? (
          <Link
            href={{ query: { page: page - 1 } }}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            Previous
          </Link>
        ) : (
          <span
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "opacity-50 pointer-events-none",
            )}
          >
            Previous
          </span>
        )}
        {hasNext ? (
          <Link
            href={{ query: { page: page + 1 } }}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            Next
          </Link>
        ) : (
          <span
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "opacity-50 pointer-events-none",
            )}
          >
            Next
          </span>
        )}
      </div>
    </div>
  );
}
