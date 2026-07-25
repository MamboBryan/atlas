import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type = "text", ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      data-slot="input"
      className={cn(
        "h-12 w-full rounded-md border-thin border-ink bg-surface-raised px-3 text-sm text-ink",
        "placeholder:text-ink-soft",
        "focus:outline-none focus:ring-[3px] focus:ring-primary focus:ring-offset-2 focus:ring-offset-surface",
        "disabled:opacity-50",
        "aria-invalid:border-danger",
        "file:font-medium file:text-ink",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export { Input };
