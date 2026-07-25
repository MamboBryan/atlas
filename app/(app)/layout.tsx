import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/require";
import { Nav } from "@/components/app/nav";
import { MobileNav } from "@/components/app/mobile-nav";
import { RightSlot } from "@/components/app/right-slot";

export default async function AppLayout({
  children,
  right,
}: {
  children: React.ReactNode;
  right: React.ReactNode;
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
    <div className="min-h-screen bg-surface md:h-screen md:min-h-0 md:overflow-hidden md:grid md:grid-cols-[var(--nav-w,240px)_7fr_3fr] md:transition-[grid-template-columns] md:duration-med md:ease-soft">
      <Nav userId={userId!} displayName={displayName} />
      <main className="w-full bg-surface-raised px-4 pb-24 pt-6 md:px-8 md:pb-10 md:pt-0 md:h-screen md:overflow-y-auto md:[&_header]:sticky md:[&_header]:-top-px md:[&_header]:z-10 md:[&_header]:bg-surface-raised [&_header]:border-b-[0.5px] [&_header]:border-ink/80 [&_header]:pb-6 md:[&_header]:pt-8 [&_header]:-mx-4 [&_header]:px-4 md:[&_header]:-mx-8 md:[&_header]:px-8">
        {children}
      </main>
      <RightSlot>{right}</RightSlot>
      <MobileNav />
    </div>
  );
}
