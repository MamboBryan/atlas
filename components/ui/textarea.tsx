import * as React from "react";
import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      data-slot="textarea"
      className={cn(
        "min-h-24 w-full rounded-md border-thin border-ink bg-surface-raised px-3 py-2 text-sm text-ink",
        "placeholder:text-ink-soft",
        "focus:outline-none focus:ring-[3px] focus:ring-primary focus:ring-offset-2 focus:ring-offset-surface",
        "disabled:opacity-50",
        "aria-invalid:border-danger",
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";

export { Textarea };
