import { cn } from "@/lib/utils";

export function ProgressBar({
  value,
  max,
  className,
}: {
  value: number;
  max: number;
  className?: string;
}) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      className={cn(
        "h-2 w-full overflow-hidden rounded-pill bg-ink/10",
        className,
      )}
    >
      <div
        className="h-full rounded-pill bg-primary transition-[width] duration-med ease-soft"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
