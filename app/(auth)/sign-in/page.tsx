"use client";
import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AtlasLogo } from "@/components/atlas-logo";

export default function SignIn() {
  const supabase = createSupabaseBrowserClient();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  async function magic() {
    if (!email) return;
    await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    });
    setSent(true);
  }

  async function google() {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${location.origin}/auth/callback` },
    });
  }

  return (
    <main className="min-h-screen grid place-items-center p-8">
      <div className="w-full max-w-sm space-y-4">
        <div className="flex flex-col items-center gap-3 pb-2">
          <AtlasLogo className="h-16 w-16" />
          <h1 className="text-2xl font-semibold">Sign in to Atlas</h1>
        </div>
        <Input
          type="email"
          placeholder="you@team.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Button className="w-full" onClick={magic}>
          {sent ? "Check your email" : "Send magic link"}
        </Button>
        <Button variant="secondary" className="w-full" onClick={google}>
          Continue with Google
        </Button>
      </div>
    </main>
  );
}
