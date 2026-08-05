export const dynamic = "force-dynamic";

export default function EvaluateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-surface text-ink">
      {children}
    </div>
  );
}
