"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function useSheetParam(name: string, value: string) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const open = params.get(name) === value;

  const setOpen = useCallback(
    (next: boolean) => {
      const query = new URLSearchParams(params.toString());
      if (next) query.set(name, value);
      else query.delete(name);
      const qs = query.toString();
      router.replace((qs ? `${pathname}?${qs}` : pathname) as never, {
        scroll: false,
      });
    },
    [router, pathname, params, name, value],
  );

  return useMemo(() => ({ open, setOpen }), [open, setOpen]);
}
