"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const tabs: { href: Route; label: string }[] = [
  { href: "/meetings" as Route, label: "Meetings" },
  { href: "/series" as Route, label: "Series" },
];

export function MeetingsTabs() {
  const pathname = usePathname();
  return (
    <div className="flex gap-6 border-b border-ink/10">
      {tabs.map((t) => {
        const active =
          pathname === t.href ||
          pathname.startsWith(t.href + "/");
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "relative py-3 text-sm font-semibold transition-colors",
              active ? "text-ink" : "text-ink-soft hover:text-ink",
            )}
          >
            {t.label}
            {active && (
              <span className="absolute inset-x-0 -bottom-px h-[3px] rounded-t-sm bg-accent" />
            )}
          </Link>
        );
      })}
    </div>
  );
}
