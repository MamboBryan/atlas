import Link from "next/link";
import type { Route } from "next";
import { NotificationsBell } from "@/components/app/notifications-bell";

const items: { href: Route; label: string }[] = [
  { href: "/" as Route, label: "Home" },
  { href: "/roster" as Route, label: "Roster" },
  { href: "/meetings" as Route, label: "Meetings" },
  { href: "/series" as Route, label: "Series" },
  { href: "/polls" as Route, label: "Polls" },
  { href: "/notifications" as Route, label: "Notifications" },
  { href: "/settings" as Route, label: "Settings" },
];

export function Nav({ userId }: { userId: string }) {
  return (
    <nav className="border-r p-4 space-y-1">
      <div className="flex items-center justify-between px-2 py-1">
        <span className="font-semibold">Atlas</span>
        <NotificationsBell userId={userId} />
      </div>
      {items.map((i) => (
        <Link
          key={i.href}
          href={i.href}
          className="block px-2 py-1 rounded hover:bg-muted"
        >
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
