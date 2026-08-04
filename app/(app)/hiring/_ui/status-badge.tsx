export function StatusBadge({ status }: { status: "draft" | "open" | "closed" }) {
  // Uses theme tokens (ink / primary / success), not raw Tailwind palette colors.
  const map = {
    draft: "bg-ink/10 text-ink/70",
    open: "bg-primary/15 text-primary",
    closed: "bg-success/15 text-success-ink",
  } as const;
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${map[status]}`}>
      {status}
    </span>
  );
}
