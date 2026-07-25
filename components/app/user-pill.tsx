"use client";

import * as React from "react";
import Link from "next/link";
import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { ChevronUpIcon, LogOutIcon, SettingsIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "./theme-toggle";

export function UserPill({
  displayName,
  collapsed = false,
}: {
  displayName: string;
  collapsed?: boolean;
}) {
  const initials = displayName.slice(0, 2).toUpperCase();
  return (
    <MenuPrimitive.Root>
      <MenuPrimitive.Trigger
        title={collapsed ? displayName : undefined}
        className={cn(
          "flex w-full items-center gap-3 rounded-md border-[3px] border-solid border-ink bg-surface-raised px-3 py-3 text-left shadow-flat transition-all duration-med hover:-translate-y-[1px] hover:shadow-lift",
          collapsed && "justify-center gap-0",
        )}
      >
        <span className="grid size-8 place-items-center rounded-full bg-primary text-primary-ink text-xs font-bold shrink-0">
          {initials}
        </span>
        {!collapsed && (
          <>
            <span className="flex-1 truncate text-sm text-ink">{displayName}</span>
            <ChevronUpIcon className="size-4 text-ink-soft" />
          </>
        )}
      </MenuPrimitive.Trigger>
      <MenuPrimitive.Portal>
        <MenuPrimitive.Positioner side="top" sideOffset={4}>
          <MenuPrimitive.Popup className="w-52 rounded-md border-thin border-ink bg-surface-raised p-1 shadow-flat text-ink z-50">
            <ThemeToggle />
            <Link
              href="/settings"
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-surface"
            >
              <SettingsIcon className="size-4" /> Settings
            </Link>
            <form action="/auth/sign-out" method="post">
              <button
                type="submit"
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-danger-text hover:bg-surface"
              >
                <LogOutIcon className="size-4" /> Sign out
              </button>
            </form>
          </MenuPrimitive.Popup>
        </MenuPrimitive.Positioner>
      </MenuPrimitive.Portal>
    </MenuPrimitive.Root>
  );
}
