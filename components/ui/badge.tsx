import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  [
    "inline-flex items-center justify-center gap-1.5 whitespace-nowrap",
    "rounded-pill border-thin border-ink px-2.5 py-0.5 text-xs font-semibold",
    "transition-colors",
  ].join(" "),
  {
    variants: {
      variant: {
        default:     "bg-surface-raised text-ink",
        secondary:   "bg-surface-raised text-ink",
        destructive: "bg-danger text-white",
        outline:     "bg-transparent text-ink",
        ghost:       "border-transparent bg-transparent text-ink",
        link:        "border-transparent bg-transparent text-primary underline-offset-4 hover:underline",
        live:        "bg-success text-white",
        scheduled:   "bg-surface text-ink",
        postponed:   "bg-accent text-accent-ink",
        ended:       "bg-surface-raised text-ink-soft",
        open:        "bg-primary text-primary-ink",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

function Badge({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      { className: cn(badgeVariants({ variant }), className) },
      props,
    ),
    render,
    state: { slot: "badge", variant },
  });
}

/** Live badge with pulsing dot. */
function LiveBadge() {
  return (
    <Badge variant="live">
      <span className="size-1.5 rounded-full bg-white animate-pulse-dot" />
      Live
    </Badge>
  );
}

export { Badge, badgeVariants, LiveBadge };
