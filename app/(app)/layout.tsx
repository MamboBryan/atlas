import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/require";
import { Nav } from "@/components/app/nav";
import { MobileNav } from "@/components/app/mobile-nav";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let userId: string;
  let displayName = "You";
  try {
    const { user, supabase } = await requireUser();
    userId = user.id;
    const { data } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .single();
    if (data?.display_name) displayName = data.display_name;
  } catch {
    redirect("/sign-in");
  }
  return (
    <div className="min-h-screen bg-surface md:h-screen md:min-h-0 md:overflow-hidden md:grid md:grid-cols-[var(--nav-w,240px)_1fr] md:transition-[grid-template-columns] md:duration-med md:ease-soft">
      <Nav userId={userId!} displayName={displayName} />
      {children}
      <MobileNav />
    </div>
  );
}
