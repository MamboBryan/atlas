import { Badge } from "@/components/ui/badge";

const VARIANT = {
  draft: "scheduled",
  open: "open",
  closed: "revealed",
} as const;

export function StatusBadge({
  status,
}: {
  status: "draft" | "open" | "closed";
}) {
  return (
    <Badge variant={VARIANT[status]} size="lg">
      {status}
    </Badge>
  );
}
