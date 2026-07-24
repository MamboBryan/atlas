import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/require";
import { Nav } from "@/components/app/nav";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let userId: string;
  try {
    const { user } = await requireUser();
    userId = user.id;
  } catch {
    redirect("/sign-in");
  }
  return (
    <div className="grid grid-cols-[220px_1fr] min-h-screen">
      <Nav userId={userId} />
      <main className="p-6">{children}</main>
    </div>
  );
}
