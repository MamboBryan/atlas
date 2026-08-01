import * as React from "react";
import { ChevronDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const Select = React.forwardRef<
  HTMLSelectElement,
  React.ComponentProps<"select">
>(({ className, children, ...props }, ref) => (
  <div className="relative">
    <select
      ref={ref}
      data-slot="select"
      className={cn(
        "h-12 w-full appearance-none rounded-md border-thin border-ink bg-surface-raised pl-3 pr-9 text-sm text-ink",
        "focus:outline-none focus:ring-[3px] focus:ring-primary focus:ring-offset-2 focus:ring-offset-surface",
        "disabled:opacity-50",
        "aria-invalid:border-danger",
        className,
      )}
      {...props}
    >
      {children}
    </select>
    <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ink" />
  </div>
));
Select.displayName = "Select";

export { Select };
