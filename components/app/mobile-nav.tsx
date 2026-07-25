"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import {
  HomeIcon,
  CalendarDaysIcon,
  MessageSquareIcon,
  UsersIcon,
  MoreHorizontalIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/" as Route, label: "Home", Icon: HomeIcon },
  { href: "/meetings" as Route, label: "Meetings", Icon: CalendarDaysIcon },
  { href: "/polls" as Route, label: "Polls", Icon: MessageSquareIcon },
  { href: "/roster" as Route, label: "Roster", Icon: UsersIcon },
  { href: "/settings" as Route, label: "More", Icon: MoreHorizontalIcon },
];

export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex justify-around border-t-chunk border-ink bg-surface md:hidden">
      {items.map(({ href, label, Icon }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex flex-1 flex-col items-center gap-1 py-2 text-xs text-ink",
              active && "text-accent-ink bg-accent",
            )}
          >
            <Icon className="size-5" />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
