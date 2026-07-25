import * as React from "react";
import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      data-slot="textarea"
      className={cn(
        "min-h-24 w-full rounded-md border-[3px] border-solid border-ink bg-surface-raised px-3 py-2 text-sm text-ink shadow-flat transition-all",
        "placeholder:text-ink-soft",
        "focus:outline-none focus:shadow-lift focus:-translate-y-[1px]",
        "disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none disabled:translate-y-0",
        "aria-invalid:border-danger",
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";

export { Textarea };
