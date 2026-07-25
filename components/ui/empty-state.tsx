import Link from "next/link";
import type { Route } from "next";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import { Sticker, type StickerName } from "@/components/ui/sticker";

type HugeIcon = React.ComponentProps<typeof HugeiconsIcon>["icon"];

type Action = { label: string; onClick?: () => void; href?: Route };

export function EmptyState({
  sticker,
  icon,
  headline,
  body,
  action,
}: {
  sticker?: StickerName;
  icon?: HugeIcon;
  headline: string;
  body?: string;
  action?: Action;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-12 text-center">
      {icon ? (
        <HugeiconsIcon
          icon={icon}
          size={64}
          strokeWidth={1.5}
          className="text-ink-soft"
        />
      ) : sticker ? (
        <Sticker name={sticker} size="xl" rotate={-4} />
      ) : null}
      <div className="space-y-1">
        <p className="font-display text-xl font-extrabold text-ink">{headline}</p>
        {body ? <p className="text-sm text-ink-soft">{body}</p> : null}
      </div>
      {action ? (
        action.href ? (
          <Button render={<Link href={action.href} />} variant="default">
            {action.label}
          </Button>
        ) : (
          <Button variant="default" onClick={action.onClick}>
            {action.label}
          </Button>
        )
      ) : null}
    </div>
  );
}
