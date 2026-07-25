"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const INTERACTIVE_SELECTOR =
  'a, button, input, textarea, select, label, [role="dialog"], [role="menu"], [role="menuitem"], [role="listbox"], [data-slot="sheet-content"], [data-slot="sheet-trigger"], [data-slot="sheet-backdrop"], [data-slot="popover-content"], [data-slot="popover-trigger"]';

export function ClearSelectionOnClick({ href = "/polls" }: { href?: string }) {
  const router = useRouter();
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented) return;
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest(INTERACTIVE_SELECTOR)) return;
      router.push(href as never);
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [router, href]);
  return null;
}
