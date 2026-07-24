import { cn } from "@/lib/utils";

export function BouncingDots({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn("inline-flex items-center gap-1", className)}
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="inline-block size-1.5 rounded-full bg-current animate-dot-bounce"
          style={{ animationDelay: `${i * 160}ms` }}
        />
      ))}
    </span>
  );
}
