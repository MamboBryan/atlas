import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  [
    "inline-flex items-center justify-center gap-1.5 whitespace-nowrap",
    "transition-colors",
  ].join(" "),
  {
    variants: {
      variant: {
        default: "bg-surface-raised text-ink",
        secondary: "bg-surface-raised text-ink",
        destructive: "bg-danger text-danger-ink",
        outline: "bg-transparent text-ink",
        ghost: "border-transparent bg-transparent text-ink",
        link: "border-transparent bg-transparent text-primary underline-offset-4 hover:underline",
        live: "bg-success text-success-ink",
        scheduled: "bg-surface text-ink",
        postponed: "bg-accent text-accent-ink",
        ended: "bg-surface-raised text-ink-soft",
        open: "bg-accent text-accent-ink",
        revealed: "bg-success text-success-ink",
      },
      size: {
        sm: "rounded-pill border-thin border-ink px-2.5 py-0.5 text-xs font-semibold",
        lg: "rounded-md border-[3px] border-ink px-3 py-1 text-sm font-extrabold shadow-[0_2px_0_0_var(--ink)]",
      },
    },
    defaultVariants: { variant: "default", size: "sm" },
  },
);

function Badge({
  className,
  variant = "default",
  size = "sm",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      { className: cn(badgeVariants({ variant, size }), className) },
      props,
    ),
    render,
    state: { slot: "badge", variant },
  });
}

/** Live badge with pulsing dot. */
function LiveBadge({ size = "sm" }: { size?: "sm" | "lg" }) {
  return (
    <Badge variant="live" size={size}>
      <span className="size-1.5 rounded-full bg-success-ink animate-pulse-dot" />
      Live
    </Badge>
  );
}

export { Badge, badgeVariants, LiveBadge };
