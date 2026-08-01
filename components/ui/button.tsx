import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  [
    "group/button inline-flex shrink-0 items-center justify-center gap-2",
    "font-display font-extrabold whitespace-nowrap select-none",
    "rounded-md",
    "transition-all duration-fast ease-soft",
    "hover:-translate-x-[3px] hover:translate-y-[3px] hover:brightness-95",
    "active:-translate-x-[6px] active:translate-y-[6px] active:brightness-90",
    "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
    "disabled:bg-[var(--btn-disabled)] disabled:text-ink-soft disabled:border-transparent disabled:shadow-[-6px_6px_0_0_var(--btn-disabled-shadow)] disabled:translate-x-0 disabled:translate-y-0 disabled:brightness-100 disabled:pointer-events-none",
    "[&_svg]:size-4 [&_svg]:shrink-0",
  ].join(" "),
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-ink shadow-[-6px_6px_0_0_var(--primary-shadow)] hover:shadow-[-3px_3px_0_0_var(--primary-shadow)] active:shadow-none",
        accent:
          "bg-accent text-accent-ink shadow-[-6px_6px_0_0_var(--accent-shadow)] hover:shadow-[-3px_3px_0_0_var(--accent-shadow)] active:shadow-none",
        outline:
          "bg-surface-raised text-ink border-[0.1px] border-[var(--surface-raised-shadow)] shadow-[-6px_6px_0_0_var(--surface-raised-shadow)] hover:shadow-[-3px_3px_0_0_var(--surface-raised-shadow)] active:shadow-none",
        secondary:
          "bg-surface-raised text-ink border-[0.1px] border-[var(--surface-raised-shadow)] shadow-[-6px_6px_0_0_var(--surface-raised-shadow)] hover:shadow-[-3px_3px_0_0_var(--surface-raised-shadow)] active:shadow-none",
        ghost:
          "bg-transparent text-ink shadow-none hover:translate-x-0 hover:translate-y-0 hover:bg-ink/5 hover:shadow-none active:translate-x-0 active:translate-y-0 active:shadow-none",
        destructive:
          "bg-danger text-danger-ink shadow-[-6px_6px_0_0_var(--danger-shadow)] hover:shadow-[-3px_3px_0_0_var(--danger-shadow)] active:shadow-none",
        "destructive-outline":
          "bg-surface-raised text-danger-text border-[0.1px] border-[var(--danger-shadow)] shadow-[-6px_6px_0_0_var(--danger-shadow)] hover:shadow-[-3px_3px_0_0_var(--danger-shadow)] active:shadow-none",
        link: "bg-transparent text-primary shadow-none underline-offset-4 hover:underline hover:translate-x-0 hover:translate-y-0 hover:shadow-none active:translate-x-0 active:translate-y-0 active:shadow-none",
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
  nativeButton,
  render,
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      nativeButton={nativeButton ?? render === undefined}
      render={render}
      {...props}
    />
  );
}

export { Button, buttonVariants };
