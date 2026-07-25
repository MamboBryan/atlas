"use client";

import Link from "next/link";
import type { ComponentType } from "react";
import type { Route } from "next";
import {
  HomeIcon,
  UsersIcon,
  CalendarDaysIcon,
  RepeatIcon,
  MessageSquareIcon,
  BellIcon,
  WrenchIcon,
} from "lucide-react";
import { AtlasLogo } from "@/components/atlas-logo";
import { NotificationsBell } from "@/components/app/notifications-bell";
import { UserPill } from "@/components/app/user-pill";
import { NavLink } from "@/components/app/nav-link";

type NavItem = {
  href: Route;
  label: string;
  Icon: ComponentType<{ className?: string }>;
};

const items: NavItem[] = [
  { href: "/" as Route, label: "Home", Icon: HomeIcon },
  { href: "/roster" as Route, label: "Roster", Icon: UsersIcon },
  { href: "/meetings" as Route, label: "Meetings", Icon: CalendarDaysIcon },
  { href: "/series" as Route, label: "Series", Icon: RepeatIcon },
  { href: "/polls" as Route, label: "Polls", Icon: MessageSquareIcon },
  { href: "/notifications" as Route, label: "Notifications", Icon: BellIcon },
  { href: "/tools/pick" as Route, label: "Tools", Icon: WrenchIcon },
];

export function Nav({
  userId,
  displayName,
}: {
  userId: string;
  displayName: string;
}) {
  return (
    <nav className="hidden md:flex flex-col gap-2 border-r-chunk border-ink bg-surface p-4">
      <Link href="/" className="flex items-center gap-2 px-2 py-3">
        <AtlasLogo className="h-8 w-8 text-accent" />
        <span className="font-display text-xl font-extrabold text-ink">
          Atlas
        </span>
      </Link>
      <div className="flex-1 space-y-1">
        {items.map((i) => (
          <NavLink key={i.href} href={i.href} label={i.label} Icon={i.Icon} />
        ))}
      </div>
      <NotificationsBell userId={userId} />
      <UserPill displayName={displayName} />
    </nav>
  );
}
