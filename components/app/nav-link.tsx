"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function NavLink({
  href,
  label,
  Icon,
}: {
  href: Route;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
}) {
  const pathname = usePathname();
  const active =
    pathname === href ||
    (href !== "/" && pathname.startsWith(href + "/"));
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2 rounded-md px-3 py-2 text-sm text-ink transition-all duration-fast",
        active
          ? "border-chunk border-ink bg-accent text-accent-ink shadow-flat"
          : "border-chunk border-transparent hover:-translate-y-[1px] hover:bg-surface-raised hover:shadow-flat hover:border-ink",
      )}
    >
      <Icon className="size-4" />
      <span>{label}</span>
    </Link>
  );
}
