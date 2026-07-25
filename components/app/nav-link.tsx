"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "@/lib/utils";

type HugeIcon = React.ComponentProps<typeof HugeiconsIcon>["icon"];

export function NavLink({
  href,
  label,
  icon,
  collapsed = false,
}: {
  href: Route;
  label: string;
  icon: HugeIcon;
  collapsed?: boolean;
}) {
  const pathname = usePathname();
  const active =
    pathname === href ||
    (href !== "/" && pathname.startsWith(href + "/"));
  return (
    <Link
      href={href}
      title={collapsed ? label : undefined}
      className={cn(
        "flex items-center gap-3 rounded-md border-[3px] border-solid border-ink bg-surface-raised px-3 py-3 text-sm text-ink shadow-flat transition-all duration-med overflow-hidden",
        collapsed && "justify-center gap-0",
        active
          ? "bg-accent text-accent-ink"
          : "hover:-translate-y-[1px] hover:shadow-lift",
      )}
    >
      <HugeiconsIcon icon={icon} size={22} strokeWidth={2} className="shrink-0" />
      <span
        className={cn(
          "truncate transition-opacity duration-fast",
          collapsed && "opacity-0 w-0",
        )}
      >
        {label}
      </span>
    </Link>
  );
}
