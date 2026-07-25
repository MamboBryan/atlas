import * as React from "react";
import { cn } from "@/lib/utils";

function Card({
  className,
  size = "default",
  interactive = false,
  ...props
}: React.ComponentProps<"div"> & {
  size?: "default" | "sm";
  interactive?: boolean;
}) {
  return (
    <div
      data-slot="card"
      data-size={size}
      className={cn(
        "group/card flex flex-col overflow-hidden",
        "rounded-lg bg-surface-raised text-ink",
        "border border-[var(--surface-raised-shadow)]",
        "shadow-[-3px_3px_0_0_var(--surface-raised-shadow)]",
        "gap-6 py-8 data-[size=sm]:gap-4 data-[size=sm]:py-6",
        "has-[[data-slot=card-footer]]:pb-0",
        interactive &&
          "transition-all duration-fast ease-soft hover:-translate-x-[1px] hover:translate-y-[1px] hover:shadow-[-2px_2px_0_0_var(--surface-raised-shadow)] cursor-pointer",
        className,
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "grid auto-rows-min items-start gap-1",
        "px-8 group-data-[size=sm]/card:px-6",
        "has-[[data-slot=card-action]]:grid-cols-[1fr_auto]",
        className,
      )}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn(
        "font-display text-lg font-extrabold leading-snug",
        "group-data-[size=sm]/card:text-base",
        className,
      )}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-sm text-ink-soft", className)}
      {...props}
    />
  );
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn("col-start-2 row-span-2 row-start-1 self-start justify-self-end", className)}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-8 group-data-[size=sm]/card:px-6", className)}
      {...props}
    />
  );
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "flex items-center border-t border-ink/10 p-8 group-data-[size=sm]/card:p-6",
        className,
      )}
      {...props}
    />
  );
}

export { Card, CardHeader, CardFooter, CardTitle, CardAction, CardDescription, CardContent };
