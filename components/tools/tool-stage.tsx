"use client";

import { useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { Palette } from "@/lib/present/palettes";

/**
 * Full-screen colorful stage for the standalone pick / shuffle tools.
 *
 * Mirrors the meeting present-mode look: a `fixed inset-0` overlay painted with
 * a palette background, a header / centered body / footer layout, and a circular
 * ✕ close button (top-right) in the neo-brutalist actions style. Closes on Esc
 * and on click.
 */
export function ToolStage({
  palette,
  eyebrow,
  footer,
  children,
  onClose,
}: {
  palette: Palette;
  /** Small uppercase label shown top-left (e.g. the tool name). */
  eyebrow?: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
  onClose?: () => void;
}) {
  const router = useRouter();

  const close = useCallback(() => {
    if (onClose) {
      onClose();
      return;
    }
    // Prefer going back; fall back to home if there's no history entry.
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push("/" as never);
    }
  }, [onClose, router]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col overflow-hidden p-8 sm:p-10"
      style={{ background: palette.bg, color: palette.ink }}
    >
      <div className="flex items-start justify-between">
        <span className="text-xs font-extrabold uppercase tracking-widest opacity-90">
          {eyebrow}
        </span>
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          className="inline-flex h-11 w-11 items-center justify-center rounded-full border-2 text-xl font-black shadow-[3px_3px_0_rgba(0,0,0,0.6)] transition-transform hover:-translate-y-0.5 active:translate-x-0.5 active:translate-y-0.5 active:shadow-[1px_1px_0_rgba(0,0,0,0.6)]"
          style={{
            background: palette.accent,
            color: palette.accentInk,
            borderColor: palette.accentInk,
          }}
        >
          ✕
        </button>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-6">
        {children}
      </div>

      {footer && (
        <footer className="flex items-end justify-center">{footer}</footer>
      )}
    </div>
  );
}
