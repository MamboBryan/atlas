"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Home01Icon,
  MeetingRoomIcon,
  UserGroupIcon,
  ChatFeedback01Icon,
  Notification01Icon,
  PanelLeftIcon,
  PanelRightIcon,
  UserCheck01Icon,
} from "@hugeicons/core-free-icons";
import { AtlasLogo } from "@/components/atlas-logo";
import { UserPill } from "@/components/app/user-pill";
import { NavLink } from "@/components/app/nav-link";
import { cn } from "@/lib/utils";

type HugeIcon = React.ComponentProps<typeof HugeiconsIcon>["icon"];

type NavItem = {
  href: Route;
  label: string;
  icon: HugeIcon;
  matchPaths?: string[];
};

const items: NavItem[] = [
  { href: "/" as Route, label: "Home", icon: Home01Icon },
  {
    href: "/meetings" as Route,
    label: "Meetings",
    icon: MeetingRoomIcon,
    matchPaths: ["/series"],
  },
  { href: "/roster" as Route, label: "Roster", icon: UserGroupIcon },
  { href: "/polls" as Route, label: "Polls", icon: ChatFeedback01Icon },
  { href: "/hiring" as Route, label: "Hiring", icon: UserCheck01Icon },
  {
    href: "/notifications" as Route,
    label: "Notifications",
    icon: Notification01Icon,
  },
];

const STORAGE_KEY = "atlas:nav-collapsed";

export function Nav({
  userId: _userId,
  displayName,
}: {
  userId: string;
  displayName: string;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "true") setCollapsed(true);
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    localStorage.setItem(STORAGE_KEY, String(collapsed));
    document.documentElement.style.setProperty(
      "--nav-w",
      collapsed ? "88px" : "240px",
    );
  }, [collapsed, mounted]);

  return (
    <nav className="hidden md:flex flex-col gap-2 bg-surface p-4 overflow-hidden">
      <Link
        href="/"
        className={cn(
          "flex items-center gap-2 px-2 py-3 overflow-hidden",
          collapsed && "justify-center gap-0 px-0",
        )}
        title="Home"
      >
        <AtlasLogo className="h-5 w-5 text-primary shrink-0" />
        <span
          className={cn(
            "font-display text-xl font-extrabold text-primary transition-opacity duration-fast",
            collapsed && "opacity-0 w-0",
          )}
        >
          Atlas
        </span>
      </Link>
      <div className="flex-1 w-full space-y-4">
        {items.map((i) => (
          <NavLink
            key={i.href}
            href={i.href}
            label={i.label}
            icon={i.icon}
            matchPaths={i.matchPaths}
            collapsed={collapsed}
          />
        ))}
      </div>
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className={cn(
          "flex items-center gap-3 rounded-md border-[3px] border-solid border-ink bg-surface-raised px-3 py-3 text-sm text-ink shadow-flat transition-all duration-med overflow-hidden hover:-translate-y-[1px] hover:shadow-lift",
          collapsed && "justify-center gap-0",
        )}
      >
        <HugeiconsIcon
          icon={collapsed ? PanelRightIcon : PanelLeftIcon}
          size={20}
          strokeWidth={2}
          className="shrink-0"
        />
        <span
          className={cn(
            "transition-opacity duration-fast",
            collapsed && "opacity-0 w-0",
          )}
        >
          Collapse
        </span>
      </button>
      <UserPill displayName={displayName} collapsed={collapsed} />
    </nav>
  );
}
