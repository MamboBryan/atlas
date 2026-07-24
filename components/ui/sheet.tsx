"use client";

import * as React from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { BouncingDots } from "@/components/ui/bouncing-dots";

function Sheet(props: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="sheet" {...props} />;
}

function SheetTrigger(props: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetOverlay({ className, ...props }: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="sheet-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-ink/40 duration-fast",
        "data-open:animate-in data-open:fade-in-0",
        "data-closed:animate-out data-closed:fade-out-0",
        className,
      )}
      {...props}
    />
  );
}

function SheetContent({
  className,
  children,
  ...props
}: DialogPrimitive.Popup.Props) {
  return (
    <DialogPrimitive.Portal>
      <SheetOverlay />
      <DialogPrimitive.Popup
        data-slot="sheet-content"
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex flex-col",
          "w-full max-w-[560px] sm:w-[560px]",
          "bg-surface-raised text-ink",
          "border-l-chunk border-ink",
          "rounded-l-lg",
          "focus:outline-none",
          "data-open:animate-sheet-in data-closed:animate-sheet-out",
          className,
        )}
        {...props}
      >
        {children}
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  );
}

function SheetHeader({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-ink/10 bg-surface-raised px-6 py-5">
      <div className="min-w-0 space-y-1">
        <DialogPrimitive.Title className="font-display text-xl font-extrabold leading-tight text-ink">
          {title}
        </DialogPrimitive.Title>
        {description ? (
          <DialogPrimitive.Description className="text-sm text-ink-soft">
            {description}
          </DialogPrimitive.Description>
        ) : null}
      </div>
      <DialogPrimitive.Close
        render={
          <Button variant="ghost" size="icon-sm" aria-label="Close" />
        }
      >
        <XIcon />
      </DialogPrimitive.Close>
    </div>
  );
}

function SheetBody({
  className,
  children,
}: React.PropsWithChildren<{ className?: string }>) {
  return (
    <div
      data-slot="sheet-body"
      className={cn("flex-1 overflow-y-auto px-6 py-5 animate-rise-in", className)}
    >
      {children}
    </div>
  );
}

function SheetFooter({
  primary,
  onPrimary,
  secondary = "Cancel",
  loading = false,
  disabled = false,
}: {
  primary: string;
  onPrimary: () => void;
  secondary?: string;
  loading?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="sticky bottom-0 z-10 flex flex-col-reverse gap-2 border-t border-ink/10 bg-surface-raised px-6 py-4 sm:flex-row sm:justify-end">
      <DialogPrimitive.Close render={<Button variant="ghost">{secondary}</Button>} />
      <Button variant="default" disabled={loading || disabled} onClick={onPrimary}>
        {loading ? <BouncingDots /> : primary}
      </Button>
    </div>
  );
}

export {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetBody,
  SheetFooter,
};
