"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { MeetingRoomIcon, CalendarUserIcon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";

type HugeIcon = React.ComponentProps<typeof HugeiconsIcon>["icon"];

const tabs: { href: Route; label: string; icon: HugeIcon }[] = [
  { href: "/meetings" as Route, label: "Meetings", icon: MeetingRoomIcon },
  { href: "/series" as Route, label: "Series", icon: CalendarUserIcon },
];

export function MeetingsTabs() {
  const pathname = usePathname();
  return (
    <div className="flex flex-wrap gap-3">
      {tabs.map((t) => {
        const active = pathname === t.href || pathname.startsWith(t.href + "/");
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "flex items-center gap-3 rounded-md border-[3px] border-solid border-ink bg-surface-raised px-4 py-3 text-sm text-ink shadow-flat transition-all duration-med",
              active
                ? "bg-accent text-accent-ink"
                : "hover:-translate-y-[1px] hover:shadow-lift",
            )}
          >
            <HugeiconsIcon
              icon={t.icon}
              size={22}
              strokeWidth={2}
              className="shrink-0"
            />
            <span>{t.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
