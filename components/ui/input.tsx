import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type = "text", placeholder, ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      data-slot="input"
      // Fallback placeholder so :placeholder-shown works even when the caller omits one.
      placeholder={placeholder ?? " "}
      className={cn(
        // base — chunky outline card
        "h-12 w-full rounded-md border-[3px] border-solid border-ink bg-surface-raised px-3 text-sm text-ink shadow-flat transition-all",
        "placeholder:text-ink-soft",
        // focus (active editing)
        "focus:outline-none focus:shadow-lift focus:-translate-y-[1px]",
        // disabled
        "disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none disabled:translate-y-0",
        // invalid
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
