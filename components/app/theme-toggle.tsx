"use client";

import { useTheme } from "next-themes";
import { MoonIcon, SunIcon, MonitorIcon } from "lucide-react";

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const next =
    theme === "dark" ? "system" : theme === "system" ? "light" : "dark";
  const Icon =
    resolvedTheme === "dark"
      ? MoonIcon
      : theme === "system"
        ? MonitorIcon
        : SunIcon;

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-ink hover:bg-surface"
      aria-label={`Switch theme (current: ${theme})`}
    >
      <Icon className="size-4" />
      <span>Theme: {theme ?? "system"}</span>
    </button>
  );
}
