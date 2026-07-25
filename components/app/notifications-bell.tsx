"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import type { Route } from "next";
import { Bell } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { markNotificationRead } from "@/lib/actions/notifications";

type NotificationRow = {
  id: string;
  kind: string;
  title: string;
  body: string;
  link: string;
  read_at: string | null;
  created_at: string;
};

export function NotificationsBell({ userId }: { userId: string }) {
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [, startTransition] = useTransition();

  useEffect(() => {
    const s = createSupabaseBrowserClient();

    async function load() {
      const { data } = await s
        .from("notifications")
        .select("id,kind,title,body,link,read_at,created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(10);
      setItems((data ?? []) as NotificationRow[]);
    }
    load();

    const ch = s
      .channel(`notif:${userId}`)
      .on(
        "postgres_changes" as never,
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          load();
        },
      )
      .on(
        "postgres_changes" as never,
        {
          event: "UPDATE",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          load();
        },
      )
      .subscribe();
    return () => {
      s.removeChannel(ch);
    };
  }, [userId]);

  const unread = items.filter((n) => !n.read_at).length;

  function onClickItem(id: string) {
    startTransition(async () => {
      await markNotificationRead(id);
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className="relative w-full justify-start gap-2 px-3 py-2 text-sm text-ink hover:bg-surface-raised"
          >
            <span className="relative flex items-center">
              <Bell className="size-4" />
              {unread > 0 && (
                <span className="absolute -top-1 -right-1 bg-danger text-danger-ink text-[10px] leading-none rounded-full min-w-[14px] h-3.5 flex items-center justify-center px-1">
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </span>
            <span>Notifications</span>
          </Button>
        }
      />
      <DropdownMenuContent
        align="start"
        side="top"
        sideOffset={4}
        className="w-80 p-0"
      >
        <div className="px-3 py-2 border-b flex items-center justify-between">
          <span className="text-sm font-medium">Notifications</span>
          <Link
            href={"/notifications" as Route}
            className="text-xs text-muted-foreground hover:underline"
          >
            View all
          </Link>
        </div>
        {items.length === 0 ? (
          <EmptyState sticker="bell" headline="No notifications yet" />
        ) : (
          <ul className="max-h-96 overflow-y-auto">
            {items.map((n) => (
              <li key={n.id} className="border-b last:border-b-0">
                <Link
                  href={n.link as Route}
                  onClick={() => onClickItem(n.id)}
                  className={
                    "block px-3 py-2 hover:bg-muted " +
                    (n.read_at ? "" : "bg-muted/40")
                  }
                >
                  <div className="text-sm font-medium">{n.title}</div>
                  <div className="text-xs text-muted-foreground line-clamp-2">
                    {n.body}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {new Date(n.created_at).toLocaleString()}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
