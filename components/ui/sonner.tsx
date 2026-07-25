"use client";
import { Toaster as Sonner } from "sonner";
import { useTheme } from "next-themes";

export function Toaster() {
  const { resolvedTheme } = useTheme();
  return (
    <Sonner
      theme={(resolvedTheme as "light" | "dark") ?? "light"}
      position="top-right"
      toastOptions={{
        classNames: {
          toast: "!rounded-md !border-thin !border-ink !shadow-flat !bg-surface-raised !text-ink !font-medium",
          success: "!bg-success !text-white !border-ink",
          error: "!bg-danger !text-white !border-ink",
        },
      }}
    />
  );
}
