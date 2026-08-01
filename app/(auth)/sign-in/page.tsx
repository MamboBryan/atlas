"use client";
import { useEffect, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Mail02Icon, CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AtlasLogo } from "@/components/atlas-logo";

const MEETING_QUIPS = [
  "You're on mute. (You've been for 20 minutes.)",
  "Let's circle back — we're already going in circles.",
  "This could've been an email. The email could've been a wave.",
  "'Quick sync' — a prophecy that never comes true.",
  "It's called a stand-up because sitting felt too committal.",
  "Meeting minutes: the longest hour, transcribed.",
  "Round of intros? Great, my name deserves an encore.",
  "Hard stop at the hour. (Narrator: it was not.)",
  "Meetings are like guac — always more than you ordered.",
  "Put a pin in it. The board is now a hedgehog.",
  "One-on-ones: the meeting where you're always outnumbered.",
  "'Any questions?' [silence] [Slack promptly explodes]",
  "Let's take this offline — into another meeting.",
  "Time zones: love language of no one.",
  "The retro went well. Retrospectively.",
  "Working session. Nobody works. Team-building!",
  "Icebreaker: what's your favorite thing about not being here?",
  "Deck: 47 slides. Time: 15 minutes. Physics: broken.",
  "Sorry, you cut out. Also, I was napping.",
  "'Let's brainstorm.' The brain is stormy. The storm is confused.",
  "Stand-ups: standing optional, up aspirational.",
  "'Table this for now.' The table is full.",
  "'Ping me' — please don't.",
  "This meeting is a marathon and a sprint and a limp.",
  "Great meeting today, everyone! (It ended.)",
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SignIn() {
  const supabase = createSupabaseBrowserClient();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [quipIndex, setQuipIndex] = useState<number | null>(null);

  useEffect(() => {
    setQuipIndex(Math.floor(Math.random() * MEETING_QUIPS.length));
  }, []);

  const isValidEmail = EMAIL_RE.test(email);

  async function magic() {
    if (!isValidEmail) return;
    await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    });
    setSent(true);
  }

  function reset() {
    setSent(false);
  }

  return (
    <div className="min-h-screen grid md:grid-cols-2 bg-surface">
      <aside
        aria-hidden="true"
        className={`hidden md:flex items-center justify-center p-16 transition-colors duration-300 ${
          sent ? "bg-success" : "bg-accent"
        }`}
      >
        <p
          className={`font-display text-5xl font-extrabold leading-tight max-w-md transition-opacity duration-300 ${
            quipIndex === null ? "opacity-0" : "opacity-100"
          } ${sent ? "text-success-ink" : "text-accent-ink"}`}
        >
          {sent
            ? "You're one click away. Check your inbox!"
            : MEETING_QUIPS[quipIndex ?? 0]}
        </p>
      </aside>

      <main className="flex flex-col justify-center px-6 py-12 md:px-16">
        <div className="w-full max-w-md mx-auto space-y-8">
          <div className="flex items-center gap-3">
            <AtlasLogo className="h-10 w-10 text-accent" />
            <span className="font-display text-3xl font-extrabold text-ink">
              Atlas
            </span>
          </div>

          {sent ? (
            <>
              <div className="space-y-2">
                <h1 className="font-display text-3xl font-extrabold text-ink">
                  Link sent successfully
                </h1>
                <p className="text-sm text-ink-soft">
                  We&apos;ve sent you the link to{" "}
                  <span className="font-semibold text-ink">{email}</span>,
                  please click to continue login process.
                </p>
              </div>

              <div
                role="status"
                className="flex items-center gap-3 rounded-md border-thin border-success bg-success/15 p-4 text-sm text-ink"
              >
                <HugeiconsIcon
                  icon={CheckmarkCircle02Icon}
                  className="shrink-0 text-success"
                  size={22}
                  strokeWidth={2.2}
                />
                <span className="font-medium">
                  Magic link on its way — check your email inbox.
                </span>
              </div>

              <Button
                variant="outline"
                size="lg"
                className="w-full h-14"
                onClick={reset}
              >
                Change email address
              </Button>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <h1 className="font-display text-3xl font-extrabold text-ink">
                  Welcome to home base
                </h1>
                <p className="text-sm text-ink-soft">
                  Enter your email address to receive a magic link to login
                </p>
              </div>

              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  magic();
                }}
              >
                <div className="relative">
                  <HugeiconsIcon
                    icon={Mail02Icon}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft"
                    size={20}
                    strokeWidth={2}
                  />
                  <Input
                    type="email"
                    name="email"
                    placeholder="you@team.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoFocus
                    required
                    aria-label="Email address"
                    className="h-14 border-chunk pl-11 focus:ring-0 focus:ring-offset-0 focus:border-primary"
                  />
                </div>
                <Button
                  type="submit"
                  variant="default"
                  size="lg"
                  className="w-full h-14"
                  disabled={!isValidEmail}
                >
                  Send magic link
                </Button>
              </form>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
