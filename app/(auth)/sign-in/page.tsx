"use client";
import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { AtlasLogo } from "@/components/atlas-logo";
import { Sticker } from "@/components/ui/sticker";

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
    <div className="relative min-h-screen bg-surface overflow-hidden">
      <Sticker name="clouds" size="xl" className="absolute top-0 left-0" />
      <Sticker name="clouds" size="xl" rotate={12} className="absolute top-4 right-0" />
      <main className="relative mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 px-6">
        <AtlasLogo className="h-20 w-20 text-primary" />
        <div className="text-center space-y-1">
          <h1 className="font-display text-4xl font-extrabold text-ink">Welcome to Atlas</h1>
          <p className="text-sm text-ink-soft">Team meeting rituals, made playful.</p>
        </div>
        <Card className="w-full">
          <CardContent className="space-y-4 pt-6">
            <div className="space-y-3">
              <label className="block space-y-1">
                <span className="text-sm font-medium text-ink">Email</span>
                <Input
                  type="email"
                  name="email"
                  placeholder="you@team.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoFocus
                  required
                />
              </label>
              <Button variant="default" size="lg" className="w-full" onClick={magic}>
                {sent ? "Check your email" : "Send magic link"}
              </Button>
              <Button variant="outline" size="lg" className="w-full" onClick={google}>
                Continue with Google
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
