"use client";

import { usePathname } from "next/navigation";

export function RightSlot({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <aside
      key={pathname}
      className="hidden md:block md:h-screen md:overflow-y-auto px-6 pt-8 pb-10"
    >
      {children}
    </aside>
  );
}
