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
    <div className="min-h-screen bg-surface md:grid md:grid-cols-[240px_1fr]">
      <Nav userId={userId!} displayName={displayName} />
      <main className="mx-auto w-full max-w-5xl px-4 pb-24 pt-6 md:px-6 md:pb-10 md:pt-8">
        {children}
      </main>
      <MobileNav />
    </div>
  );
}
