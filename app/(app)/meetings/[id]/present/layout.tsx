export const dynamic = "force-dynamic";

export default function PresentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black text-white overflow-hidden">
      {children}
    </div>
  );
}
