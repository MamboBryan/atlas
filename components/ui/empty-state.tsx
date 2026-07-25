import Link from "next/link";
import type { Route } from "next";
import { Button } from "@/components/ui/button";
import { Sticker, type StickerName } from "@/components/ui/sticker";

type Action = { label: string; onClick?: () => void; href?: Route };

export function EmptyState({
  sticker,
  headline,
  body,
  action,
}: {
  sticker: StickerName;
  headline: string;
  body?: string;
  action?: Action;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-12 text-center">
      <Sticker name={sticker} size="xl" rotate={-4} />
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
