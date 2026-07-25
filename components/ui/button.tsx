import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  [
    "group/button inline-flex shrink-0 items-center justify-center gap-2",
    "font-display font-extrabold whitespace-nowrap select-none",
    "border-chunk border-ink rounded-md",
    "transition-all duration-fast ease-soft",
    "shadow-flat",
    "hover:-translate-y-[2px] hover:shadow-lift",
    "active:translate-y-[2px] active:shadow-press",
    "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
    "disabled:opacity-50 disabled:shadow-flat disabled:hover:translate-y-0 disabled:pointer-events-none",
    "[&_svg]:size-4 [&_svg]:shrink-0",
  ].join(" "),
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-ink",
        accent: "bg-accent text-accent-ink",
        outline: "bg-surface-raised text-ink",
        secondary: "bg-surface-raised text-ink", // alias for compat
        ghost:
          "border-transparent shadow-none bg-transparent text-ink hover:translate-y-0 hover:bg-ink/5 hover:shadow-none active:translate-y-0 active:shadow-none",
        destructive: "bg-danger text-danger-ink",
        link: "border-transparent shadow-none bg-transparent text-primary underline-offset-4 hover:underline hover:translate-y-0 hover:shadow-none active:translate-y-0 active:shadow-none",
      },
      size: {
        default: "h-11 px-4 text-sm",
        sm: "h-9 px-3 text-sm",
        lg: "h-12 px-6 text-base",
        icon: "size-11 p-0",
        "icon-sm": "size-9 p-0",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
