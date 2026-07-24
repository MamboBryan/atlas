import Link from "next/link";
import type { Route } from "next";

const items: { href: Route; label: string }[] = [
  { href: "/" as Route, label: "Home" },
  { href: "/roster" as Route, label: "Roster" },
  { href: "/meetings" as Route, label: "Meetings" },
  { href: "/series" as Route, label: "Series" },
  { href: "/polls" as Route, label: "Polls" },
  { href: "/notifications" as Route, label: "Notifications" },
  { href: "/settings" as Route, label: "Settings" },
];

export function Nav() {
  return (
    <nav className="border-r p-4 space-y-1">
      <div className="font-semibold px-2 py-1">Atlas</div>
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
