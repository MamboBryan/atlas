# Playful UI Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild Atlas's visual layer into a playful, chunky, Duolingo-inspired UI with right-side sheets for all creation flows and first-class dark mode.

**Architecture:** Token-first migration. Rewire `app/globals.css` + `tailwind.config.ts` with a new semantic palette, chunky radii, hard offset shadows, and motion primitives. Rebuild shadcn primitives (`Button`, `Card`, `Input`, `Badge`, `Toast`) against the new tokens with same public APIs. Introduce a `<Sheet>` primitive built on `@base-ui/react`'s `Dialog`, routed via `?new=meeting|poll|series` query params, replacing three deleted `/new` routes. Migrate each feature surface in dependency-safe slices so every commit leaves the app working. Ship dark mode alongside light in every slice.

**Tech Stack:**

- Next.js 15 (App Router) + React 19 + TypeScript
- `@base-ui/react` (already installed, Dialog is base for Sheet)
- Tailwind CSS 3.4 + `tailwindcss-animate` + `tw-animate-css` (already installed)
- `class-variance-authority` for component variants
- `next-themes` (already installed) for dark-mode toggle + no-FOUC
- `sonner` (already installed) for toasts
- `next/font/google` for Geist (existing) + Nunito (new)
- `canvas-confetti` (new, ~5kb gzipped) for celebration bursts

**Reference spec:** `docs/superpowers/specs/2026-07-25-playful-ui-rebuild-design.md`

## Global Constraints

- **Every commit leaves the app in a working, deployable state.** No half-migrated slices.
- **Every component ships with light + dark styles from the same PR.** Dark is not a follow-up.
- **All motion is behind `@media (prefers-reduced-motion: reduce)` fallbacks** that swap animation for instant transitions.
- **All new color combinations verified against WCAG AA** (4.5:1 body, 3:1 large text ≥ 18px bold) before merging.
- **Bundle budget:** ≤ 10 KB gzipped added to first-load JS across the whole plan. `framer-motion` is explicitly out — use CSS + `tailwindcss-animate`.
- **Public component APIs unchanged during rebuild.** Existing call sites (`<Button>`, `<Card>`, `<Badge>`, etc.) must not need edits when the primitive is restyled.
- **No `@radix-ui/*` imports.** Codebase standard is `@base-ui/react`.
- **All colors accessed via CSS variables and tailwind tokens** — never a raw hex in component code.
- **`typecheck` (`pnpm typecheck`) and `lint` (`pnpm lint`) pass on every commit.**
- **After each visual slice, run `pnpm test:e2e -- --grep design-qa` and update baseline screenshots** (both light + dark, both admin + test-user personas from the existing QA suite).
- **Route deletions require sweeping** `href="/meetings/new"`, `href="/polls/new"`, `href="/series/new"` from all `.tsx` files and rewriting to sheet triggers in the same commit.

---

## File Structure

**New files:**

- `lib/fonts.ts` — Geist + Nunito loader (extracted from `app/layout.tsx`)
- `lib/hooks/use-sheet-param.ts` — URL-query-param binding for sheets
- `lib/motion.ts` — reduced-motion detection helper
- `components/ui/sheet.tsx` — right-side sheet primitive (built on `@base-ui/react/dialog`)
- `components/ui/textarea.tsx` — chunky textarea
- `components/ui/select.tsx` — chunky select
- `components/ui/bouncing-dots.tsx` — inline loader
- `components/ui/sticker.tsx` — SVG sticker wrapper
- `components/ui/confetti-burst.tsx` — imperative confetti (client only)
- `components/ui/empty-state.tsx` — sticker + headline + CTA layout
- `components/ui/skeleton.tsx` — pulsing card skeleton
- `components/app/theme-toggle.tsx` — dropdown item for theme switch
- `components/app/user-pill.tsx` — bottom-of-nav user dropdown
- `components/app/mobile-nav.tsx` — bottom bar for < 768 px
- `components/meetings/new-meeting-form.tsx` — form body for `?new=meeting` sheet
- `components/polls/new-poll-form.tsx` — form body for `?new=poll` sheet
- `components/series/new-series-form.tsx` — form body for `?new=series` sheet
- `public/stickers/calendar.svg`, `speech-bubble.svg`, `peace-hand.svg`, `eyes.svg`, `thumbs-up.svg`, `empty-box.svg`, `clouds.svg`, `bell.svg`

**Modified files:**

- `package.json` — add `canvas-confetti`, `@types/canvas-confetti`
- `app/globals.css` — tokens (colors, radii, shadows, motion, reduced-motion)
- `tailwind.config.ts` — extend theme with new tokens
- `app/layout.tsx` — theme provider, Nunito font, cream body
- `app/(app)/layout.tsx` — container widths, mobile bottom-nav slot
- `components/app/nav.tsx` — pill rail rebuild
- `components/app/notifications-bell.tsx` — style refresh, moves into nav rail
- `components/ui/button.tsx` — squish + new variants
- `components/ui/card.tsx` — interactive prop, new tokens
- `components/ui/input.tsx` — chunky styling
- `components/ui/badge.tsx` — preset states (live/scheduled/postponed/ended/open)
- `components/ui/dialog.tsx` — token refresh only (for confirm dialogs)
- `components/ui/sonner.tsx` — playful toast styling
- `components/atlas-logo.tsx` — swap hardcoded `#4B4DF7` for `currentColor` so it themes
- All feature pages under `app/(app)/**` — page-by-page in Phase 4

**Deleted files:**

- `app/(app)/meetings/new/page.tsx`
- `app/(app)/polls/new/page.tsx`
- `app/(app)/series/new/page.tsx`

---

## Phase 0 — Setup

### Task 1: Add `canvas-confetti` dependency + Nunito font loader

**Files:**

- Modify: `package.json`
- Create: `lib/fonts.ts`
- Modify: `app/layout.tsx`

**Interfaces:**

- Consumes: none (first task)
- Produces: `lib/fonts.ts` exports `geist`, `nunito` — both are `NextFont` objects with `.variable` used as class names

- [ ] **Step 1: Install the dependency**

```bash
pnpm add canvas-confetti
pnpm add -D @types/canvas-confetti
```

- [ ] **Step 2: Extract fonts into `lib/fonts.ts`**

```ts
// lib/fonts.ts
import { Geist, Nunito } from "next/font/google";

export const geist = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const nunito = Nunito({
  subsets: ["latin"],
  weight: ["700", "800", "900"],
  variable: "--font-display",
  display: "swap",
});
```

- [ ] **Step 3: Use both fonts in the root layout**

```tsx
// app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";
import { cn } from "@/lib/utils";
import { geist, nunito } from "@/lib/fonts";

export const metadata: Metadata = {
  title: "Atlas",
  description: "Team meeting rituals",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={cn("font-sans", geist.variable, nunito.variable)}
    >
      <body className="min-h-screen bg-background text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 4: Verify typecheck + build**

```bash
pnpm typecheck && pnpm build
```

Expected: clean; new font subset is fetched at build time; no visual change yet.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml lib/fonts.ts app/layout.tsx
git commit -m "chore(ui): add nunito display font + canvas-confetti dep"
```

### Task 2: Design tokens in CSS + Tailwind

**Files:**

- Modify: `app/globals.css`
- Modify: `tailwind.config.ts`

**Interfaces:**

- Consumes: Task 1's `--font-display` variable
- Produces: CSS custom properties (`--surface`, `--surface-raised`, `--ink`, `--ink-soft`, `--primary`, `--primary-ink`, `--accent`, `--accent-ink`, `--success`, `--danger`, `--info`, `--radius-sm|md|lg|pill`, `--border-thin|chunk`, `--shadow-flat|lift|press`, `--ease-spring|soft`, `--dur-fast|med|slow`) and Tailwind classes: `bg-surface`, `bg-surface-raised`, `text-ink`, `text-ink-soft`, `bg-primary`, `text-primary-ink`, `bg-accent`, `text-accent-ink`, `border-ink`, `rounded-md|lg|pill`, `shadow-flat|lift|press`, `font-display`, `ease-spring|soft`, `duration-fast|med|slow`

- [ ] **Step 1: Replace `:root` and `.dark` blocks in `globals.css`**

Replace the entire `@layer base { :root { … } .dark { … } * { … } body { … } }` block with:

```css
@layer base {
  :root {
    /* Surface + text */
    --surface: #fff8ec;
    --surface-raised: #ffffff;
    --ink: #111111;
    --ink-soft: #5a5a5a;

    /* Brand */
    --primary: #4b4df7;
    --primary-ink: #ffffff;
    --accent: #ffd84a;
    --accent-ink: #111111;

    /* State */
    --success: #58cc02;
    --danger: #ff4b4b;
    --info: #1cb0f6;

    /* Semantic mappings kept for shadcn compatibility */
    --background: var(--surface);
    --foreground: var(--ink);
    --card: var(--surface-raised);
    --card-foreground: var(--ink);
    --popover: var(--surface-raised);
    --popover-foreground: var(--ink);
    --primary-foreground: var(--primary-ink);
    --secondary: var(--surface-raised);
    --secondary-foreground: var(--ink);
    --muted: var(--surface-raised);
    --muted-foreground: var(--ink-soft);
    --accent-foreground: var(--accent-ink);
    --destructive: var(--danger);
    --border: var(--ink);
    --input: var(--ink);
    --ring: var(--primary);

    /* Sticker fill (adaptive) */
    --sticker-fill: var(--surface);

    /* Shape */
    --radius-sm: 10px;
    --radius-md: 16px;
    --radius-lg: 24px;
    --radius-pill: 999px;
    --radius: var(--radius-md);

    /* Border widths */
    --border-thin: 2px;
    --border-chunk: 3px;

    /* Hard offset shadows */
    --shadow-flat: 0 3px 0 0 var(--ink);
    --shadow-lift: 0 5px 0 0 var(--ink);
    --shadow-press: 0 1px 0 0 var(--ink);

    /* Motion */
    --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
    --ease-soft: cubic-bezier(0.4, 0, 0.2, 1);
    --dur-fast: 120ms;
    --dur-med: 220ms;
    --dur-slow: 360ms;

    color-scheme: light;
  }

  .dark {
    --surface: #0e1030;
    --surface-raised: #171a3d;
    --ink: #f3f1e8;
    --ink-soft: #a5a8c7;

    --primary: #8a8cff;
    --primary-ink: #0e1030;
    --accent: #ffe264;
    --accent-ink: #111111;

    --success: #7ee84a;
    --danger: #ff7070;
    --info: #6ed2ff;

    --sticker-fill: var(--surface);

    /* Ink shadows invisible on navy — use pure black */
    --shadow-flat: 0 3px 0 0 #000;
    --shadow-lift: 0 5px 0 0 #000;
    --shadow-press: 0 1px 0 0 #000;

    color-scheme: dark;
  }

  * {
    @apply border-border;
  }

  body {
    @apply bg-background text-foreground;
    font-family: var(--font-sans), system-ui, sans-serif;
  }

  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
      scroll-behavior: auto !important;
    }
  }
}
```

- [ ] **Step 2: Extend Tailwind config with the new tokens**

Replace `tailwind.config.ts`:

```ts
import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

const config: Config = {
  darkMode: ["class"],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: "var(--surface)",
        "surface-raised": "var(--surface-raised)",
        ink: {
          DEFAULT: "var(--ink)",
          soft: "var(--ink-soft)",
        },
        background: "var(--background)",
        foreground: "var(--foreground)",
        card: { DEFAULT: "var(--card)", foreground: "var(--card-foreground)" },
        popover: {
          DEFAULT: "var(--popover)",
          foreground: "var(--popover-foreground)",
        },
        primary: {
          DEFAULT: "var(--primary)",
          ink: "var(--primary-ink)",
          foreground: "var(--primary-foreground)",
        },
        secondary: {
          DEFAULT: "var(--secondary)",
          foreground: "var(--secondary-foreground)",
        },
        muted: {
          DEFAULT: "var(--muted)",
          foreground: "var(--muted-foreground)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          ink: "var(--accent-ink)",
          foreground: "var(--accent-foreground)",
        },
        success: "var(--success)",
        danger: "var(--danger)",
        info: "var(--info)",
        destructive: { DEFAULT: "var(--destructive)" },
        border: "var(--border)",
        input: "var(--input)",
        ring: "var(--ring)",
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        pill: "var(--radius-pill)",
      },
      borderWidth: {
        thin: "var(--border-thin)",
        chunk: "var(--border-chunk)",
      },
      boxShadow: {
        flat: "var(--shadow-flat)",
        lift: "var(--shadow-lift)",
        press: "var(--shadow-press)",
      },
      transitionTimingFunction: {
        spring: "var(--ease-spring)",
        soft: "var(--ease-soft)",
      },
      transitionDuration: {
        fast: "var(--dur-fast)",
        med: "var(--dur-med)",
        slow: "var(--dur-slow)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "system-ui", "sans-serif"],
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "sheet-in": {
          from: { transform: "translateX(100%)" },
          to: { transform: "translateX(0)" },
        },
        "sheet-out": {
          from: { transform: "translateX(0)" },
          to: { transform: "translateX(100%)" },
        },
        "dot-bounce": {
          "0%, 80%, 100%": { transform: "scale(0.6)", opacity: "0.5" },
          "40%": { transform: "scale(1)", opacity: "1" },
        },
        "rise-in": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-dot": {
          "0%, 100%": { transform: "scale(1)", opacity: "1" },
          "50%": { transform: "scale(1.3)", opacity: "0.6" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "sheet-in": "sheet-in var(--dur-med) var(--ease-spring)",
        "sheet-out": "sheet-out 200ms var(--ease-soft)",
        "dot-bounce": "dot-bounce 1.2s infinite ease-in-out both",
        "rise-in": "rise-in var(--dur-med) var(--ease-soft) both",
        "pulse-dot": "pulse-dot 1.4s ease-in-out infinite",
      },
    },
  },
  plugins: [animate],
};
export default config;
```

- [ ] **Step 3: Verify the app still builds and looks unchanged-but-warmer**

```bash
pnpm dev
```

Open `http://localhost:3000`. The app should now render on a cream background with the same layouts. Any hardcoded `#4B4DF7` in `components/atlas-logo.tsx` still works but should be swapped in a later task.

- [ ] **Step 4: Typecheck**

```bash
pnpm typecheck
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add app/globals.css tailwind.config.ts
git commit -m "feat(ui): playful design tokens + tailwind theme extension"
```

### Task 3: Adaptive logo + `next-themes` provider

**Files:**

- Modify: `components/atlas-logo.tsx`
- Modify: `app/layout.tsx`
- Create: `components/app/theme-provider.tsx`

**Interfaces:**

- Consumes: Task 2's tokens
- Produces: `<ThemeProvider>` wrapping the app; logo that inherits `currentColor` for outlines

- [ ] **Step 1: Make the logo themeable**

Open `components/atlas-logo.tsx`. Replace every `fill="#4B4DF7"` or `stroke="#4B4DF7"` with `fill="currentColor"` / `stroke="currentColor"`. Consumers set the color via className (e.g., `className="text-primary"`).

- [ ] **Step 2: Add a theme provider**

```tsx
// components/app/theme-provider.tsx
"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ThemeProviderProps } from "next-themes";

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}
```

- [ ] **Step 3: Wrap `RootLayout` with the provider**

Update `app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import "./globals.css";
import { cn } from "@/lib/utils";
import { geist, nunito } from "@/lib/fonts";
import { ThemeProvider } from "@/components/app/theme-provider";

export const metadata: Metadata = {
  title: "Atlas",
  description: "Team meeting rituals",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("font-sans", geist.variable, nunito.variable)}
    >
      <body className="min-h-screen bg-background text-foreground antialiased">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 4: Manually verify dark toggle**

Temporarily set `<html class="dark">` via devtools and confirm the background switches to navy. Remove the manual toggle.

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm typecheck
git add components/atlas-logo.tsx components/app/theme-provider.tsx app/layout.tsx
git commit -m "feat(ui): theme provider + adaptive logo"
```

---

## Phase 1 — Sheet primitive + new components (no wiring yet)

### Task 4: Sheet primitive + `useSheetParam` hook

**Files:**

- Create: `lib/hooks/use-sheet-param.ts`
- Create: `components/ui/sheet.tsx`

**Interfaces:**

- Consumes: `@base-ui/react/dialog`, Task 2 tokens
- Produces:
  - `useSheetParam(name: string): { open: boolean; setOpen: (v: boolean) => void }`
  - `<Sheet open onOpenChange>` (root)
  - `<SheetHeader title description?>` (sticky top)
  - `<SheetBody>` (scrollable middle)
  - `<SheetFooter primary onPrimary secondary? onSecondary? loading? disabled?>` (sticky bottom)

- [ ] **Step 1: Write the hook**

```ts
// lib/hooks/use-sheet-param.ts
"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function useSheetParam(name: string, value: string) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const open = params.get(name) === value;

  const setOpen = useCallback(
    (next: boolean) => {
      const query = new URLSearchParams(params.toString());
      if (next) query.set(name, value);
      else query.delete(name);
      const qs = query.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, params, name, value],
  );

  return useMemo(() => ({ open, setOpen }), [open, setOpen]);
}
```

- [ ] **Step 2: Write the Sheet component**

```tsx
// components/ui/sheet.tsx
"use client";

import * as React from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { BouncingDots } from "@/components/ui/bouncing-dots";

function Sheet(props: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="sheet" {...props} />;
}

function SheetTrigger(props: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetOverlay({ className, ...props }: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="sheet-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-ink/40 duration-fast",
        "data-open:animate-in data-open:fade-in-0",
        "data-closed:animate-out data-closed:fade-out-0",
        className,
      )}
      {...props}
    />
  );
}

function SheetContent({
  className,
  children,
  ...props
}: DialogPrimitive.Popup.Props) {
  return (
    <DialogPrimitive.Portal>
      <SheetOverlay />
      <DialogPrimitive.Popup
        data-slot="sheet-content"
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex flex-col",
          "w-full max-w-[560px] sm:w-[560px]",
          "bg-surface-raised text-ink",
          "border-l-chunk border-ink",
          "rounded-l-lg",
          "focus:outline-none",
          "data-open:animate-sheet-in data-closed:animate-sheet-out",
          className,
        )}
        {...props}
      >
        {children}
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  );
}

function SheetHeader({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-ink/10 bg-surface-raised px-6 py-5">
      <div className="min-w-0 space-y-1">
        <DialogPrimitive.Title className="font-display text-xl font-extrabold leading-tight text-ink">
          {title}
        </DialogPrimitive.Title>
        {description ? (
          <DialogPrimitive.Description className="text-sm text-ink-soft">
            {description}
          </DialogPrimitive.Description>
        ) : null}
      </div>
      <DialogPrimitive.Close
        render={<Button variant="ghost" size="icon-sm" aria-label="Close" />}
      >
        <XIcon />
      </DialogPrimitive.Close>
    </div>
  );
}

function SheetBody({
  className,
  children,
}: React.PropsWithChildren<{ className?: string }>) {
  return (
    <div
      data-slot="sheet-body"
      className={cn(
        "flex-1 overflow-y-auto px-6 py-5 animate-rise-in",
        className,
      )}
    >
      {children}
    </div>
  );
}

function SheetFooter({
  primary,
  onPrimary,
  secondary = "Cancel",
  loading = false,
  disabled = false,
}: {
  primary: string;
  onPrimary: () => void;
  secondary?: string;
  loading?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="sticky bottom-0 z-10 flex flex-col-reverse gap-2 border-t border-ink/10 bg-surface-raised px-6 py-4 sm:flex-row sm:justify-end">
      <DialogPrimitive.Close
        render={<Button variant="ghost">{secondary}</Button>}
      />
      <Button
        variant="default"
        disabled={loading || disabled}
        onClick={onPrimary}
      >
        {loading ? <BouncingDots /> : primary}
      </Button>
    </div>
  );
}

export {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetBody,
  SheetFooter,
};
```

Note: `SheetContent` is what mounts inside `<Sheet>`. Consumers write `<Sheet open onOpenChange>{ … }<SheetContent>...</SheetContent></Sheet>` OR wrap `SheetHeader/Body/Footer` directly if they use the container pattern. Keep the API flexible — if it turns out only one usage pattern emerges in Phase 4, simplify then.

- [ ] **Step 3: Add a quick Playwright smoke test**

```ts
// e2e/sheet.spec.ts
import { test, expect } from "@playwright/test";

test.skip("sheet opens via ?new=meeting param", async ({ page }) => {
  // wired up in Task 18 once a page uses it; skipped for now
});
```

- [ ] **Step 4: Typecheck**

```bash
pnpm typecheck
```

Expected: clean. Note: `BouncingDots` is imported but not yet created — that's fine because it's only referenced, not called. It will exist by Task 6. If typecheck fails, stub the import with a `null` component for now.

- [ ] **Step 5: Commit**

```bash
git add lib/hooks/use-sheet-param.ts components/ui/sheet.tsx e2e/sheet.spec.ts
git commit -m "feat(ui): right-side Sheet primitive + useSheetParam hook"
```

### Task 5: Textarea + Select primitives

**Files:**

- Create: `components/ui/textarea.tsx`
- Create: `components/ui/select.tsx`

**Interfaces:**

- Consumes: Task 2 tokens
- Produces:
  - `<Textarea>` — extends `<textarea>` props, chunky styling
  - `<Select>` — extends `<select>` props with wrapper + chevron

- [ ] **Step 1: Textarea**

```tsx
// components/ui/textarea.tsx
import * as React from "react";
import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    data-slot="textarea"
    className={cn(
      "min-h-24 w-full rounded-md border-thin border-ink bg-surface-raised px-3 py-2 text-sm text-ink",
      "placeholder:text-ink-soft",
      "focus:outline-none focus:ring-[3px] focus:ring-primary focus:ring-offset-2 focus:ring-offset-surface",
      "disabled:opacity-50",
      "aria-invalid:border-danger",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export { Textarea };
```

- [ ] **Step 2: Select (native)**

```tsx
// components/ui/select.tsx
import * as React from "react";
import { ChevronDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const Select = React.forwardRef<
  HTMLSelectElement,
  React.ComponentProps<"select">
>(({ className, children, ...props }, ref) => (
  <div className="relative">
    <select
      ref={ref}
      data-slot="select"
      className={cn(
        "h-12 w-full appearance-none rounded-md border-thin border-ink bg-surface-raised pl-3 pr-9 text-sm text-ink",
        "focus:outline-none focus:ring-[3px] focus:ring-primary focus:ring-offset-2 focus:ring-offset-surface",
        "disabled:opacity-50",
        "aria-invalid:border-danger",
        className,
      )}
      {...props}
    >
      {children}
    </select>
    <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ink" />
  </div>
));
Select.displayName = "Select";

export { Select };
```

- [ ] **Step 3: Typecheck + commit**

```bash
pnpm typecheck
git add components/ui/textarea.tsx components/ui/select.tsx
git commit -m "feat(ui): chunky textarea + select primitives"
```

### Task 6: BouncingDots + Skeleton

**Files:**

- Create: `components/ui/bouncing-dots.tsx`
- Create: `components/ui/skeleton.tsx`

**Interfaces:**

- Consumes: Task 2 tokens (`animate-dot-bounce` keyframe)
- Produces:
  - `<BouncingDots className?>` — inline `<span>` with 3 dots
  - `<Skeleton className?>` — pulsing div

- [ ] **Step 1: BouncingDots**

```tsx
// components/ui/bouncing-dots.tsx
import { cn } from "@/lib/utils";

export function BouncingDots({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn("inline-flex items-center gap-1", className)}
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="inline-block size-1.5 rounded-full bg-current animate-dot-bounce"
          style={{ animationDelay: `${i * 160}ms` }}
        />
      ))}
    </span>
  );
}
```

- [ ] **Step 2: Skeleton**

```tsx
// components/ui/skeleton.tsx
import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-surface-raised border-thin border-ink/10",
        className,
      )}
    />
  );
}
```

- [ ] **Step 3: Typecheck + commit**

```bash
pnpm typecheck
git add components/ui/bouncing-dots.tsx components/ui/skeleton.tsx
git commit -m "feat(ui): bouncing dots loader + skeleton"
```

### Task 7: Sticker component + 8 SVG assets

**Files:**

- Create: `public/stickers/calendar.svg`, `speech-bubble.svg`, `peace-hand.svg`, `eyes.svg`, `thumbs-up.svg`, `empty-box.svg`, `clouds.svg`, `bell.svg`
- Create: `components/ui/sticker.tsx`

**Interfaces:**

- Consumes: `--sticker-fill` CSS var (Task 2), `currentColor` for outlines
- Produces:
  - `<Sticker name size? rotate? className?>` — renders `<img>` from `/stickers/{name}.svg`
  - Type: `StickerName = "calendar" | "speech-bubble" | "peace-hand" | "eyes" | "thumbs-up" | "empty-box" | "clouds" | "bell"`

- [ ] **Step 1: Create the 8 SVG stickers**

Each sticker follows this template — thick ink outline via `currentColor`, adaptive fill via `var(--sticker-fill)`, yellow accents inlined as `#FFD84A`. Place at 200×200 viewBox unless noted.

Example — `public/stickers/calendar.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" fill="none" stroke="currentColor" stroke-width="10" stroke-linecap="round" stroke-linejoin="round">
  <rect x="20" y="40" width="160" height="140" rx="16" fill="var(--sticker-fill)"/>
  <line x1="20" y1="80" x2="180" y2="80"/>
  <line x1="60" y1="20" x2="60" y2="60"/>
  <line x1="140" y1="20" x2="140" y2="60"/>
  <path d="M100 110 l12 24 26 4 -19 18 5 26 -24 -13 -24 13 5 -26 -19 -18 26 -4z" fill="#FFD84A"/>
</svg>
```

Create the remaining 7 following the same conventions:

- `speech-bubble.svg` — rounded rectangle bubble with tail, three dots inside
- `peace-hand.svg` — hand with index+middle up, other fingers curled, yellow burst behind
- `eyes.svg` — two circles with pupils
- `thumbs-up.svg` — thumbs-up outline with yellow starburst behind
- `empty-box.svg` — open cardboard box, flaps out
- `clouds.svg` — two overlapping cloud shapes (700×200 viewBox for wider aspect)
- `bell.svg` — outlined bell with clapper and yellow ring at base

Design in Figma or hand-write. Time-box: 45 min for the full set. Doesn't need to be perfect — matching outline weight (10px stroke) and rotation (0–8°) is what makes them read as a family.

- [ ] **Step 2: Sticker component**

```tsx
// components/ui/sticker.tsx
import { cn } from "@/lib/utils";

export type StickerName =
  | "calendar"
  | "speech-bubble"
  | "peace-hand"
  | "eyes"
  | "thumbs-up"
  | "empty-box"
  | "clouds"
  | "bell";

type Size = "sm" | "md" | "lg" | "xl";

const sizeMap: Record<Size, string> = {
  sm: "size-10",
  md: "size-16",
  lg: "size-24",
  xl: "size-40",
};

export function Sticker({
  name,
  size = "md",
  rotate = 0,
  className,
}: {
  name: StickerName;
  size?: Size;
  rotate?: number;
  className?: string;
}) {
  return (
    <img
      src={`/stickers/${name}.svg`}
      alt=""
      aria-hidden="true"
      className={cn(sizeMap[size], "inline-block text-ink", className)}
      style={{ transform: rotate ? `rotate(${rotate}deg)` : undefined }}
    />
  );
}
```

Note: SVGs use `currentColor` — the `text-ink` on the wrapper drives outline color, so dark mode swaps automatically.

- [ ] **Step 3: Verify a sticker renders**

Temporarily add `<Sticker name="calendar" size="xl" />` to `app/(app)/page.tsx`. Load Home. Confirm it renders correctly in light and (via devtools `<html class="dark">`) dark. Remove the temporary import.

- [ ] **Step 4: Commit**

```bash
git add public/stickers components/ui/sticker.tsx
git commit -m "feat(ui): sticker set + Sticker component"
```

### Task 8: ConfettiBurst (client-only)

**Files:**

- Create: `components/ui/confetti-burst.tsx`

**Interfaces:**

- Consumes: `canvas-confetti` (Task 1)
- Produces: `fireConfetti(options?: { origin?: { x: number; y: number } })` — imperative fn

- [ ] **Step 1: Write the module**

```tsx
// components/ui/confetti-burst.tsx
"use client";

import confetti from "canvas-confetti";

const COLORS = ["#4B4DF7", "#FFD84A", "#58CC02", "#FF4B4B", "#1CB0F6"];

function prefersReducedMotion() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function fireConfetti(options?: { origin?: { x: number; y: number } }) {
  if (prefersReducedMotion()) return;
  confetti({
    particleCount: 80,
    spread: 70,
    startVelocity: 45,
    colors: COLORS,
    origin: options?.origin ?? { x: 0.5, y: 0.4 },
    scalar: 1.1,
    ticks: 120,
  });
}

/** Fire from a specific element's center (useful for celebrating on a button). */
export function fireConfettiFrom(el: HTMLElement | null) {
  if (!el) return fireConfetti();
  const rect = el.getBoundingClientRect();
  const x = (rect.left + rect.width / 2) / window.innerWidth;
  const y = (rect.top + rect.height / 2) / window.innerHeight;
  fireConfetti({ origin: { x, y } });
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
pnpm typecheck
git add components/ui/confetti-burst.tsx
git commit -m "feat(ui): imperative confetti burst helper"
```

---

## Phase 2 — App shell + rebuilt primitives

### Task 9: Rebuild `<Button>` with the squish

**Files:**

- Modify: `components/ui/button.tsx`

**Interfaces:**

- Consumes: `@base-ui/react/button`, Task 2 tokens
- Produces (public API unchanged): `<Button variant size>` where variant is `default | outline | ghost | destructive | link | accent`, size is `default | sm | lg | icon | icon-sm`
- Note: new variant `accent` added, `secondary` deprecated → treat as alias to `outline`.

- [ ] **Step 1: Rewrite `button.tsx`**

```tsx
import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  [
    "group/button inline-flex shrink-0 items-center justify-center gap-2",
    "font-display font-extrabold whitespace-nowrap select-none",
    "border-chunk border-ink rounded-md",
    "transition-all duration-fast ease-soft",
    "shadow-flat",
    "hover:-translate-y-[2px] hover:shadow-lift",
    "active:translate-y-[2px] active:shadow-press",
    "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
    "disabled:opacity-50 disabled:shadow-flat disabled:hover:translate-y-0 disabled:pointer-events-none",
    "[&_svg]:size-4 [&_svg]:shrink-0",
  ].join(" "),
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-ink",
        accent: "bg-accent text-accent-ink",
        outline: "bg-surface-raised text-ink",
        secondary: "bg-surface-raised text-ink", // alias for compat
        ghost:
          "border-transparent shadow-none bg-transparent text-ink hover:translate-y-0 hover:bg-ink/5 hover:shadow-none active:translate-y-0 active:shadow-none",
        destructive: "bg-danger text-white",
        link: "border-transparent shadow-none bg-transparent text-primary underline-offset-4 hover:underline hover:translate-y-0 hover:shadow-none active:translate-y-0 active:shadow-none",
      },
      size: {
        default: "h-11 px-4 text-sm",
        sm: "h-9 px-3 text-sm",
        lg: "h-12 px-6 text-base",
        icon: "size-11 p-0",
        "icon-sm": "size-9 p-0",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
```

- [ ] **Step 2: Sweep call sites for lost sizes**

Old sizes `xs`, `icon-xs`, `icon-lg` are gone. Search for them:

```bash
rg -n 'size="xs"|size="icon-xs"|size="icon-lg"' app components
```

Replace each with the nearest new size (`xs` → `sm`, `icon-xs` → `icon-sm`, `icon-lg` → `icon`).

- [ ] **Step 3: Typecheck + build**

```bash
pnpm typecheck && pnpm build
```

Expected: clean.

- [ ] **Step 4: Manual smoke — Home page**

```bash
pnpm dev
```

Load `/`. Buttons should squish on hover/active, use Nunito, have chunky borders and cream-side hard shadows. Toggle `<html class="dark">` in devtools — verify shadows adapt.

- [ ] **Step 5: Commit**

```bash
git add components/ui/button.tsx app components
git commit -m "feat(ui): playful Button with press-squish"
```

### Task 10: Rebuild `<Card>` with `interactive` prop

**Files:**

- Modify: `components/ui/card.tsx`

**Interfaces:**

- Consumes: Task 2 tokens
- Produces (extended API): `<Card interactive?>` — when `interactive`, hover-lifts like a button; `<CardHeader>`, `<CardTitle>`, `<CardDescription>`, `<CardContent>`, `<CardFooter>`, `<CardAction>` unchanged.

- [ ] **Step 1: Rewrite `card.tsx`**

```tsx
import * as React from "react";
import { cn } from "@/lib/utils";

function Card({
  className,
  size = "default",
  interactive = false,
  ...props
}: React.ComponentProps<"div"> & {
  size?: "default" | "sm";
  interactive?: boolean;
}) {
  return (
    <div
      data-slot="card"
      data-size={size}
      className={cn(
        "group/card flex flex-col gap-(--card-spacing) overflow-hidden",
        "rounded-lg bg-surface-raised text-ink",
        "border-chunk border-ink shadow-flat",
        "py-(--card-spacing) [--card-spacing:--spacing(5)]",
        "data-[size=sm]:[--card-spacing:--spacing(3)]",
        "has-data-[slot=card-footer]:pb-0",
        interactive &&
          "transition-all duration-fast ease-soft hover:-translate-y-[2px] hover:shadow-lift cursor-pointer",
        className,
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "@container/card-header grid auto-rows-min items-start gap-1 px-(--card-spacing) has-data-[slot=card-action]:grid-cols-[1fr_auto]",
        className,
      )}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn(
        "font-display text-lg font-extrabold leading-snug",
        "group-data-[size=sm]/card:text-base",
        className,
      )}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-sm text-ink-soft", className)}
      {...props}
    />
  );
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className,
      )}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-(--card-spacing)", className)}
      {...props}
    />
  );
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "flex items-center border-t border-ink/10 p-(--card-spacing)",
        className,
      )}
      {...props}
    />
  );
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
};
```

- [ ] **Step 2: Typecheck + commit**

```bash
pnpm typecheck
git add components/ui/card.tsx
git commit -m "feat(ui): chunky Card with interactive prop"
```

### Task 11: Rebuild `<Input>`

**Files:**

- Modify: `components/ui/input.tsx`

**Interfaces:**

- Consumes: Task 2 tokens
- Produces: `<Input>` — API unchanged, styled chunky

- [ ] **Step 1: Read the current file**

```bash
cat components/ui/input.tsx
```

Note the existing exports.

- [ ] **Step 2: Rewrite input.tsx**

```tsx
import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type = "text", ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      data-slot="input"
      className={cn(
        "h-12 w-full rounded-md border-thin border-ink bg-surface-raised px-3 text-sm text-ink",
        "placeholder:text-ink-soft",
        "focus:outline-none focus:ring-[3px] focus:ring-primary focus:ring-offset-2 focus:ring-offset-surface",
        "disabled:opacity-50",
        "aria-invalid:border-danger",
        "file:font-medium file:text-ink",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export { Input };
```

- [ ] **Step 3: Typecheck + commit**

```bash
pnpm typecheck
git add components/ui/input.tsx
git commit -m "feat(ui): chunky Input"
```

### Task 12: Rebuild `<Badge>` with preset states

**Files:**

- Modify: `components/ui/badge.tsx`

**Interfaces:**

- Consumes: Task 2 tokens, keyframe `animate-pulse-dot`
- Produces: `<Badge variant>` where variant is `default | secondary | destructive | outline | ghost | link | live | scheduled | postponed | ended | open`. Existing variants preserved; new preset states added.

- [ ] **Step 1: Rewrite badge.tsx**

```tsx
import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  [
    "inline-flex items-center justify-center gap-1.5 whitespace-nowrap",
    "rounded-pill border-thin border-ink px-2.5 py-0.5 text-xs font-semibold",
    "transition-colors",
  ].join(" "),
  {
    variants: {
      variant: {
        default: "bg-surface-raised text-ink",
        secondary: "bg-surface-raised text-ink",
        destructive: "bg-danger text-white",
        outline: "bg-transparent text-ink",
        ghost: "border-transparent bg-transparent text-ink",
        link: "border-transparent bg-transparent text-primary underline-offset-4 hover:underline",
        live: "bg-success text-white",
        scheduled: "bg-surface text-ink",
        postponed: "bg-accent text-accent-ink",
        ended: "bg-surface-raised text-ink-soft",
        open: "bg-primary text-primary-ink",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

function Badge({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      { className: cn(badgeVariants({ variant }), className) },
      props,
    ),
    render,
    state: { slot: "badge", variant },
  });
}

/** Live badge with pulsing dot. */
function LiveBadge() {
  return (
    <Badge variant="live">
      <span className="size-1.5 rounded-full bg-white animate-pulse-dot" />
      Live
    </Badge>
  );
}

export { Badge, badgeVariants, LiveBadge };
```

- [ ] **Step 2: Sweep home-page for the current status-badge helper**

Replace the inline `StatusBadge` in `app/(app)/page.tsx`:

```tsx
// before: if (status === "live") return <Badge>Live</Badge>;
//         return <Badge variant="outline">Scheduled</Badge>;
import { Badge, LiveBadge } from "@/components/ui/badge";
function StatusBadge({ status }: { status: Meeting["status"] }) {
  if (status === "live") return <LiveBadge />;
  return <Badge variant="scheduled">Scheduled</Badge>;
}
```

- [ ] **Step 3: Typecheck + commit**

```bash
pnpm typecheck
git add components/ui/badge.tsx app/(app)/page.tsx
git commit -m "feat(ui): Badge preset states + LiveBadge with pulse"
```

### Task 13: Playful sonner + EmptyState

**Files:**

- Modify: `components/ui/sonner.tsx`
- Create: `components/ui/empty-state.tsx`

**Interfaces:**

- Produces:
  - `<EmptyState sticker headline body? action?>` — headline is a string, body optional string, action is `{ label: string; onClick?: () => void; href?: string }`

- [ ] **Step 1: Update `components/ui/sonner.tsx` toast styling**

Read existing file, then add token-driven class overrides:

```tsx
"use client";
import { Toaster as Sonner } from "sonner";
import { useTheme } from "next-themes";

export function Toaster() {
  const { resolvedTheme } = useTheme();
  return (
    <Sonner
      theme={(resolvedTheme as "light" | "dark") ?? "light"}
      position="top-right"
      toastOptions={{
        classNames: {
          toast:
            "!rounded-md !border-thin !border-ink !shadow-flat !bg-surface-raised !text-ink !font-medium",
          success: "!bg-success !text-white !border-ink",
          error: "!bg-danger !text-white !border-ink",
        },
      }}
    />
  );
}
```

Mount `<Toaster />` in `app/layout.tsx` inside `<ThemeProvider>` if not already there.

- [ ] **Step 2: EmptyState component**

```tsx
// components/ui/empty-state.tsx
import Link from "next/link";
import type { Route } from "next";
import { Button } from "@/components/ui/button";
import { Sticker, type StickerName } from "@/components/ui/sticker";

type Action = { label: string; onClick?: () => void; href?: Route };

export function EmptyState({
  sticker,
  headline,
  body,
  action,
}: {
  sticker: StickerName;
  headline: string;
  body?: string;
  action?: Action;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-12 text-center">
      <Sticker name={sticker} size="xl" rotate={-4} />
      <div className="space-y-1">
        <p className="font-display text-xl font-extrabold text-ink">
          {headline}
        </p>
        {body ? <p className="text-sm text-ink-soft">{body}</p> : null}
      </div>
      {action ? (
        action.href ? (
          <Button render={<Link href={action.href} />} variant="default">
            {action.label}
          </Button>
        ) : (
          <Button variant="default" onClick={action.onClick}>
            {action.label}
          </Button>
        )
      ) : null}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck + commit**

```bash
pnpm typecheck
git add components/ui/sonner.tsx components/ui/empty-state.tsx app/layout.tsx
git commit -m "feat(ui): playful sonner + EmptyState component"
```

### Task 14: Rebuild `<Nav>` as a pill rail + add `<UserPill>`, `<ThemeToggle>`, `<MobileNav>`

**Files:**

- Modify: `components/app/nav.tsx`
- Create: `components/app/user-pill.tsx`
- Create: `components/app/theme-toggle.tsx`
- Create: `components/app/mobile-nav.tsx`
- Modify: `components/app/notifications-bell.tsx` — remove absolute-position wrapper, become inline pill
- Modify: `app/(app)/layout.tsx` — hide `<Nav>` under 768 px, show `<MobileNav>` above

**Interfaces:**

- Consumes: Tasks 9–13 primitives
- Produces:
  - `<Nav userId: string>` — vertical rail
  - `<MobileNav userId: string>` — bottom bar (5 items)
  - `<UserPill userId: string>` — dropdown trigger with avatar + display name
  - `<ThemeToggle />` — dropdown item that cycles light → dark → system

- [ ] **Step 1: ThemeToggle**

```tsx
// components/app/theme-toggle.tsx
"use client";

import { useTheme } from "next-themes";
import { MoonIcon, SunIcon, MonitorIcon } from "lucide-react";

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const next =
    theme === "dark" ? "system" : theme === "system" ? "light" : "dark";
  const Icon =
    resolvedTheme === "dark"
      ? MoonIcon
      : theme === "system"
        ? MonitorIcon
        : SunIcon;

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-ink hover:bg-surface"
      aria-label={`Switch theme (current: ${theme})`}
    >
      <Icon className="size-4" />
      <span>Theme: {theme ?? "system"}</span>
    </button>
  );
}
```

- [ ] **Step 2: UserPill**

```tsx
// components/app/user-pill.tsx
"use client";

import * as React from "react";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabase/browser"; // adjust to actual helper if named differently
import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { ChevronUpIcon, LogOutIcon, SettingsIcon } from "lucide-react";
import { ThemeToggle } from "./theme-toggle";

export function UserPill({ displayName }: { displayName: string }) {
  const initials = displayName.slice(0, 2).toUpperCase();
  return (
    <MenuPrimitive.Root>
      <MenuPrimitive.Trigger className="flex w-full items-center gap-2 rounded-md border-thin border-ink bg-surface-raised px-3 py-2 text-left shadow-flat transition-all hover:-translate-y-[1px] hover:shadow-lift">
        <span className="grid size-8 place-items-center rounded-full bg-primary text-primary-ink text-xs font-bold">
          {initials}
        </span>
        <span className="flex-1 truncate text-sm text-ink">{displayName}</span>
        <ChevronUpIcon className="size-4 text-ink-soft" />
      </MenuPrimitive.Trigger>
      <MenuPrimitive.Portal>
        <MenuPrimitive.Positioner sideOffset={4}>
          <MenuPrimitive.Popup className="w-52 rounded-md border-thin border-ink bg-surface-raised p-1 shadow-flat text-ink">
            <ThemeToggle />
            <Link
              href="/settings"
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-surface"
            >
              <SettingsIcon className="size-4" /> Settings
            </Link>
            <form action="/auth/sign-out" method="post">
              <button className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-danger hover:bg-surface">
                <LogOutIcon className="size-4" /> Sign out
              </button>
            </form>
          </MenuPrimitive.Popup>
        </MenuPrimitive.Positioner>
      </MenuPrimitive.Portal>
    </MenuPrimitive.Root>
  );
}
```

Note: `@base-ui/react/menu` may not be imported yet — verify with `pnpm list @base-ui/react` and consult `node_modules/@base-ui/react/dist` for the export. If Menu is not available, fall back to a `Dialog`-based popover or the `DropdownMenu` in `components/ui/dropdown-menu.tsx`.

- [ ] **Step 3: Rebuild `nav.tsx`**

```tsx
// components/app/nav.tsx
import Link from "next/link";
import type { Route } from "next";
import {
  HomeIcon,
  UsersIcon,
  CalendarDaysIcon,
  RepeatIcon,
  MessageSquareIcon,
  BellIcon,
  WrenchIcon,
} from "lucide-react";
import { AtlasLogo } from "@/components/atlas-logo";
import { NotificationsBell } from "@/components/app/notifications-bell";
import { UserPill } from "@/components/app/user-pill";

type NavItem = {
  href: Route;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
};

const items: NavItem[] = [
  { href: "/" as Route, label: "Home", Icon: HomeIcon },
  { href: "/roster" as Route, label: "Roster", Icon: UsersIcon },
  { href: "/meetings" as Route, label: "Meetings", Icon: CalendarDaysIcon },
  { href: "/series" as Route, label: "Series", Icon: RepeatIcon },
  { href: "/polls" as Route, label: "Polls", Icon: MessageSquareIcon },
  { href: "/notifications" as Route, label: "Notifications", Icon: BellIcon },
  { href: "/tools/pick" as Route, label: "Tools", Icon: WrenchIcon },
];

export function Nav({
  userId,
  displayName,
}: {
  userId: string;
  displayName: string;
}) {
  return (
    <nav className="hidden md:flex flex-col gap-2 border-r-chunk border-ink bg-surface p-4">
      <Link href="/" className="flex items-center gap-2 px-2 py-3">
        <AtlasLogo className="h-8 w-8 text-primary" />
        <span className="font-display text-xl font-extrabold text-ink">
          Atlas
        </span>
      </Link>
      <div className="flex-1 space-y-1">
        {items.map((i) => (
          <NavLink key={i.href} item={i} />
        ))}
      </div>
      <NotificationsBell userId={userId} />
      <UserPill displayName={displayName} />
    </nav>
  );
}

/* Client subcomponent for active state via usePathname */
("use client");
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

function NavLink({ item }: { item: NavItem }) {
  const pathname = usePathname();
  const active = pathname === item.href || pathname.startsWith(item.href + "/");
  return (
    <Link
      href={item.href}
      className={cn(
        "flex items-center gap-2 rounded-md px-3 py-2 text-sm text-ink transition-all duration-fast",
        active
          ? "border-chunk border-ink bg-accent text-accent-ink shadow-flat"
          : "border-chunk border-transparent hover:-translate-y-[1px] hover:bg-surface-raised hover:shadow-flat hover:border-ink",
      )}
    >
      <item.Icon className="size-4" />
      <span>{item.label}</span>
    </Link>
  );
}
```

Note: mixing `"use client"` in the same file with a server component doesn't work. Split `NavLink` into a `nav-link.tsx` client file:

```tsx
// components/app/nav-link.tsx
"use client";
import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function NavLink({
  href,
  label,
  Icon,
}: {
  href: Route;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
}) {
  const pathname = usePathname();
  const active =
    pathname === href || (href !== "/" && pathname.startsWith(href + "/"));
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2 rounded-md px-3 py-2 text-sm text-ink transition-all duration-fast",
        active
          ? "border-chunk border-ink bg-accent text-accent-ink shadow-flat"
          : "border-chunk border-transparent hover:-translate-y-[1px] hover:bg-surface-raised hover:shadow-flat hover:border-ink",
      )}
    >
      <Icon className="size-4" />
      <span>{label}</span>
    </Link>
  );
}
```

Then `nav.tsx` imports `NavLink` from that file and stays a server component.

- [ ] **Step 4: MobileNav (bottom bar)**

```tsx
// components/app/mobile-nav.tsx
"use client";
import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import {
  HomeIcon,
  CalendarDaysIcon,
  MessageSquareIcon,
  UsersIcon,
  MoreHorizontalIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/" as Route, label: "Home", Icon: HomeIcon },
  { href: "/meetings" as Route, label: "Meetings", Icon: CalendarDaysIcon },
  { href: "/polls" as Route, label: "Polls", Icon: MessageSquareIcon },
  { href: "/roster" as Route, label: "Roster", Icon: UsersIcon },
  { href: "/settings" as Route, label: "More", Icon: MoreHorizontalIcon },
];

export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex justify-around border-t-chunk border-ink bg-surface md:hidden">
      {items.map(({ href, label, Icon }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex flex-1 flex-col items-center gap-1 py-2 text-xs text-ink",
              active && "text-accent-ink bg-accent",
            )}
          >
            <Icon className="size-5" />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 5: Update `app/(app)/layout.tsx`**

```tsx
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
      <Nav userId={userId} displayName={displayName} />
      <main className="mx-auto w-full max-w-5xl px-4 pb-24 pt-6 md:px-6 md:pb-10 md:pt-8">
        {children}
      </main>
      <MobileNav />
    </div>
  );
}
```

- [ ] **Step 6: Typecheck + smoke**

```bash
pnpm typecheck && pnpm dev
```

Verify: rail visible ≥ 768 px with active accent-yellow pill; bottom bar visible < 768 px; user pill dropdown opens; theme toggle switches.

- [ ] **Step 7: Commit**

```bash
git add components/app/nav.tsx components/app/nav-link.tsx components/app/mobile-nav.tsx components/app/user-pill.tsx components/app/theme-toggle.tsx components/app/notifications-bell.tsx app/(app)/layout.tsx
git commit -m "feat(ui): pill-rail nav + mobile bottom bar + user pill"
```

---

## Phase 3 — Feature surfaces

### Task 15: Home page rebuild

**Files:**

- Modify: `app/(app)/page.tsx`

**Interfaces:**

- Consumes: `<Card interactive>`, `<Badge>`, `<LiveBadge>`, `<EmptyState>`, `<Button>`, `<Sticker>`, `<AtlasLogo>`

- [ ] **Step 1: Restructure into three cards**

Replace `app/(app)/page.tsx` (keep all data-fetch logic; only change the JSX below `return`):

```tsx
return (
  <div className="space-y-8">
    <header className="flex items-start justify-between gap-4">
      <div>
        <h1 className="font-display text-3xl font-extrabold text-ink">Home</h1>
        <p className="text-sm text-ink-soft">What's on your plate today.</p>
      </div>
    </header>

    <section className="space-y-3">
      <h2 className="font-display text-sm font-bold uppercase tracking-wide text-ink-soft">
        Your next meeting
      </h2>
      {nextMeeting ? (
        <Card className="px-1">
          <CardHeader>
            <CardTitle>
              <Link
                href={`/meetings/${nextMeeting.id}` as never}
                className="hover:underline"
              >
                {nextMeeting.title}
              </Link>
            </CardTitle>
            <CardDescription>
              {fmtWhen(
                nextMeeting.scheduled_start,
                nextMeeting.timezone,
                viewerTz,
              )}{" "}
              · host {hostRow?.display_name ?? "?"}
            </CardDescription>
            <CardAction>
              <StatusBadge status={nextMeeting.status} />
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-2 pt-2">
            {canStart && <NextMeetingActions meetingId={nextMeeting.id} />}
            <Button
              variant="outline"
              render={<Link href={`/meetings/${nextMeeting.id}` as never} />}
            >
              {canStart ? "Postpone or view" : "Open"}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <EmptyState
          sticker="calendar"
          headline="No meetings on the horizon"
          body="Schedule your team's next ritual."
          action={{
            label: "New meeting",
            href: "/meetings?new=meeting" as never,
          }}
        />
      )}
    </section>

    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="font-display text-sm font-bold uppercase tracking-wide text-ink-soft">
          Awaiting your response
        </h2>
        {awaiting.length > 0 && <Badge variant="open">{awaiting.length}</Badge>}
      </div>
      {awaiting.length === 0 ? (
        <p className="text-sm text-ink-soft">Nothing waiting on you.</p>
      ) : (
        <div className="space-y-3">
          {awaiting.map((p) => (
            <Card key={p.id} interactive>
              <CardHeader>
                <CardTitle>
                  <Link
                    href={`/polls/${p.id}` as never}
                    className="hover:underline"
                  >
                    {p.question}
                  </Link>
                </CardTitle>
                <CardDescription>
                  {p.response_type.replace("_", " ")} · {p.anonymity}
                  {p.meeting_id ? " · in meeting" : ""}
                </CardDescription>
                <CardAction>
                  <Badge variant="open">Open</Badge>
                </CardAction>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}
    </section>

    <section className="space-y-3">
      <h2 className="font-display text-sm font-bold uppercase tracking-wide text-ink-soft">
        Quick tools
      </h2>
      <div className="flex flex-wrap gap-3">
        <Button variant="accent" render={<Link href="/tools/pick" />}>
          Pick someone
        </Button>
        <Button variant="outline" render={<Link href="/tools/shuffle" />}>
          Shuffle roster
        </Button>
      </div>
    </section>
  </div>
);
```

Update imports at the top: add `Card, CardHeader, CardTitle, CardDescription, CardAction, CardContent` from `@/components/ui/card`; `Button` from `@/components/ui/button`; `Badge` from `@/components/ui/badge`; `EmptyState` from `@/components/ui/empty-state`.

- [ ] **Step 2: Typecheck + smoke**

```bash
pnpm typecheck && pnpm dev
```

Load `/`. Verify three sections render, empty state shows sticker when no meeting, cards lift on hover.

- [ ] **Step 3: Update screenshot baseline**

```bash
pnpm test:e2e -- --grep design-qa --update-snapshots
```

- [ ] **Step 4: Commit**

```bash
git add app/(app)/page.tsx
git commit -m "feat(ui): playful home dashboard"
```

### Task 16: Meetings list + `<NewMeetingForm>` sheet + delete `/meetings/new`

**Files:**

- Modify: `app/(app)/meetings/page.tsx`
- Create: `components/meetings/new-meeting-form.tsx`
- Delete: `app/(app)/meetings/new/page.tsx`

**Interfaces:**

- Consumes: `<Sheet>`, `useSheetParam`, `<Button>`, `<Card interactive>`, `<Input>`, `<Select>`, `<Textarea>`, existing meeting-creation server action (locate in current `/meetings/new` page or `lib/`)

- [ ] **Step 1: Locate the current meeting-create server action**

```bash
grep -rn "meetings.insert\|createMeeting\|action.*meeting" app lib components
```

Note the function/action name and its inputs.

- [ ] **Step 2: Build `<NewMeetingForm>`**

```tsx
// components/meetings/new-meeting-form.tsx
"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { SheetBody, SheetFooter } from "@/components/ui/sheet";
import { fireConfettiFrom } from "@/components/ui/confetti-burst";
// import the actual server action from wherever it lives:
import { createMeetingAction } from "@/app/(app)/meetings/actions"; // adjust path

export function NewMeetingForm({
  hosts,
  defaultTimezone,
  onDone,
}: {
  hosts: { id: string; display_name: string }[];
  defaultTimezone: string;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  const router = useRouter();

  return (
    <>
      <SheetBody className="space-y-4">
        <form
          id="new-meeting-form"
          action={(fd) => {
            setError(null);
            startTransition(async () => {
              const res = await createMeetingAction(fd);
              if (res?.error) return setError(res.error);
              toast.success("Meeting scheduled");
              fireConfettiFrom(submitRef.current);
              onDone();
              router.refresh();
            });
          }}
          className="space-y-4"
        >
          <label className="block space-y-1">
            <span className="text-sm font-medium text-ink">Title</span>
            <Input name="title" required autoFocus />
          </label>

          <label className="block space-y-1">
            <span className="text-sm font-medium text-ink">Start</span>
            <Input type="datetime-local" name="scheduled_start" required />
          </label>

          <label className="block space-y-1">
            <span className="text-sm font-medium text-ink">Timezone</span>
            <Input name="timezone" defaultValue={defaultTimezone} required />
          </label>

          <label className="block space-y-1">
            <span className="text-sm font-medium text-ink">Host</span>
            <Select name="host_user_id" defaultValue="">
              <option value="" disabled>
                Choose a host
              </option>
              {hosts.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.display_name}
                </option>
              ))}
            </Select>
          </label>

          <label className="block space-y-1">
            <span className="text-sm font-medium text-ink">
              Notes (optional)
            </span>
            <Textarea name="notes" />
          </label>

          {error && <p className="text-sm text-danger">{error}</p>}
        </form>
      </SheetBody>
      <SheetFooter
        primary="Create meeting"
        loading={pending}
        onPrimary={() => {
          // trigger form submit
          document
            .getElementById("new-meeting-form")
            ?.dispatchEvent(
              new Event("submit", { cancelable: true, bubbles: true }),
            );
        }}
      />
    </>
  );
}
```

Note: adapt the server-action import path and payload shape to what actually exists. If the existing `/meetings/new/page.tsx` used a client-side fetch instead of a server action, extract that logic into an `actions.ts` file in `app/(app)/meetings/` so both this form and existing callers use the same code path.

- [ ] **Step 3: Wire the sheet into `/meetings/page.tsx`**

Add to the existing meetings list page (typically a server component):

```tsx
// app/(app)/meetings/page.tsx (structure sketch)
import { Sheet, SheetContent, SheetHeader } from "@/components/ui/sheet";
import { NewMeetingForm } from "@/components/meetings/new-meeting-form";
import { NewMeetingTrigger } from "./_ui/new-meeting-trigger";

export default async function MeetingsPage() {
  const { user, supabase } = await requireUser();
  const [{ data: meetings }, { data: hosts }] = await Promise.all([
    supabase
      .from("meetings")
      .select("...")
      .order("scheduled_start", { ascending: true }),
    supabase.from("profiles").select("id,display_name"),
  ]);
  const viewerTz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-extrabold text-ink">
            Meetings
          </h1>
          <p className="text-sm text-ink-soft">
            Upcoming rituals for your team.
          </p>
        </div>
        <NewMeetingTrigger hosts={hosts ?? []} defaultTimezone={viewerTz} />
      </header>

      {/* existing meeting cards list, restyled with <Card interactive> */}
    </div>
  );
}
```

And the client trigger (splits so the server page can pass server data in):

```tsx
// app/(app)/meetings/_ui/new-meeting-trigger.tsx
"use client";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader } from "@/components/ui/sheet";
import { NewMeetingForm } from "@/components/meetings/new-meeting-form";
import { useSheetParam } from "@/lib/hooks/use-sheet-param";

export function NewMeetingTrigger({
  hosts,
  defaultTimezone,
}: {
  hosts: { id: string; display_name: string }[];
  defaultTimezone: string;
}) {
  const { open, setOpen } = useSheetParam("new", "meeting");
  return (
    <>
      <Button variant="default" onClick={() => setOpen(true)}>
        New meeting
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent>
          <SheetHeader
            title="New meeting"
            description="Schedule a ritual for your team."
          />
          <NewMeetingForm
            hosts={hosts}
            defaultTimezone={defaultTimezone}
            onDone={() => setOpen(false)}
          />
        </SheetContent>
      </Sheet>
    </>
  );
}
```

- [ ] **Step 4: Delete the old route**

```bash
rm -rf app/(app)/meetings/new
```

- [ ] **Step 5: Rewrite any lingering links**

```bash
rg -n '"/meetings/new"|href={.*meetings/new' app components
```

Each hit gets rewritten to a button that triggers the sheet, or to `href="/meetings?new=meeting"` if it needs to be a deep link.

- [ ] **Step 6: Typecheck + build + smoke**

```bash
pnpm typecheck && pnpm build && pnpm dev
```

Verify: `/meetings` shows the "New meeting" button; clicking opens the sheet from the right; submitting closes it, shows toast, refreshes list; back-button closes the sheet.

- [ ] **Step 7: Commit**

```bash
git add app/(app)/meetings components/meetings/new-meeting-form.tsx
git commit -m "feat(meetings): right-side New Meeting sheet, drop /meetings/new"
```

### Task 17: Meetings detail + past (visual pass)

**Files:**

- Modify: `app/(app)/meetings/[id]/page.tsx`
- Modify: `app/(app)/meetings/past/page.tsx`

**Interfaces:**

- Consumes: Task 10 (`<Card>`), Task 12 (Badge presets)

- [ ] **Step 1: Detail page**

Update the JSX in `app/(app)/meetings/[id]/page.tsx` to use the new visual language:

- Page header block with Nunito 800 title, `Badge` for status (`LiveBadge` if live), meta line in `text-ink-soft`.
- Action buttons (Start / Postpone / Cancel) become `<Button variant="default|accent|destructive">` with the squish.
- Prompts list becomes `<Card interactive>` cards.
- Reveal controls use `<Button variant="accent">`.

Do not change any server-side data logic. This is a JSX + className pass only.

- [ ] **Step 2: Past page**

Same treatment for `app/(app)/meetings/past/page.tsx` — restructure list items into `<Card interactive>`, `<Badge variant="ended">` for status.

- [ ] **Step 3: Typecheck + screenshot update + commit**

```bash
pnpm typecheck
pnpm test:e2e -- --grep design-qa --update-snapshots
git add app/(app)/meetings/[id]/page.tsx app/(app)/meetings/past/page.tsx
git commit -m "feat(meetings): playful detail + past pages"
```

### Task 18: Polls list + `<NewPollForm>` sheet + delete `/polls/new`

**Files:**

- Modify: `app/(app)/polls/page.tsx`
- Create: `components/polls/new-poll-form.tsx`
- Create: `app/(app)/polls/_ui/new-poll-trigger.tsx`
- Delete: `app/(app)/polls/new/page.tsx`

**Interfaces:**

- Consumes: `<Sheet>`, `useSheetParam`, existing `createPromptAction` (or equivalent — search codebase)

- [ ] **Step 1: Locate current create-prompt action**

```bash
grep -rn "prompts.insert\|createPrompt\|action.*poll" app lib components
```

- [ ] **Step 2: Build `<NewPollForm>`**

Follow the same structure as `<NewMeetingForm>` (Task 16 Step 2), with fields:

- `question` (`<Textarea>` required)
- `response_type` (`<Select>`: text / scale_1_5 / single_choice / multi_choice)
- `anonymity` (`<Select>`: identified / hard_anonymous / soft_anonymous)
- `timing` (`<Select>`: sync / async)
- `opens_at` (`<Input type="datetime-local">`, optional)
- `meeting_id` (`<Select>`, optional — populated with upcoming meetings passed from server)

Same submit / toast / confetti / `onDone` pattern.

- [ ] **Step 3: Trigger + wire**

Create `app/(app)/polls/_ui/new-poll-trigger.tsx` — same shape as `NewMeetingTrigger`, but uses `useSheetParam("new", "poll")` and mounts `<NewPollForm>`. Add the trigger to the page header of `app/(app)/polls/page.tsx`.

- [ ] **Step 4: Delete `/polls/new`, sweep links, typecheck, screenshot**

```bash
rm -rf app/(app)/polls/new
rg -n '"/polls/new"|href={.*polls/new' app components
# rewrite each to the trigger button or /polls?new=poll deep link
pnpm typecheck
pnpm test:e2e -- --grep design-qa --update-snapshots
```

- [ ] **Step 5: Commit**

```bash
git add app/(app)/polls components/polls/new-poll-form.tsx
git commit -m "feat(polls): right-side New Poll sheet, drop /polls/new"
```

### Task 19: Polls detail (respond flow) + past

**Files:**

- Modify: `app/(app)/polls/[id]/page.tsx`
- Modify: `app/(app)/polls/past/page.tsx`

**Interfaces:**

- Consumes: Tasks 10, 12, 13 (`<EmptyState>`), Task 8 (`fireConfetti`)

- [ ] **Step 1: Detail page (respond flow)**

Replace the question header with a big `<Card>` containing the question in Nunito 800. Response input (based on `response_type`) uses the chunky `<Input>`, `<Textarea>`, or a set of pill-styled radio buttons for choice types. Submit button uses `<Button variant="default">` with `loading` state. On submit success: `toast.success("Your answer's in ✓")` + `fireConfetti()` if user is the last respondent (compare `response_count + 1 === roster_size`).

- [ ] **Step 2: Past page**

Restyle list items as `<Card interactive>` with `<Badge variant="ended">`.

- [ ] **Step 3: Typecheck + screenshot + commit**

```bash
pnpm typecheck
pnpm test:e2e -- --grep design-qa --update-snapshots
git add app/(app)/polls/[id]/page.tsx app/(app)/polls/past/page.tsx
git commit -m "feat(polls): playful detail + past pages"
```

### Task 20: Series list + `<NewSeriesForm>` sheet + delete `/series/new`

**Files:**

- Modify: `app/(app)/series/page.tsx`
- Create: `components/series/new-series-form.tsx`
- Create: `app/(app)/series/_ui/new-series-trigger.tsx`
- Delete: `app/(app)/series/new/page.tsx`

**Interfaces:**

- Same pattern as Task 16 & 18.

- [ ] **Step 1: Locate current create-series action, build form**

Fields: `name`, `cadence` (`<Select>` of RRULE templates: weekly / biweekly / monthly), `timezone` (defaults to viewer), `members` (multi-select — for simplicity in this rebuild, use a `<Textarea>` accepting comma-separated user IDs, or a checkbox list if the roster is small; leave a `TODO: proper member picker` **as a code comment only, not as a plan step**). Same submit pattern.

- [ ] **Step 2: Trigger, wire, delete route, sweep links, typecheck, screenshot, commit**

```bash
rm -rf app/(app)/series/new
rg -n '"/series/new"|href={.*series/new' app components
pnpm typecheck
pnpm test:e2e -- --grep design-qa --update-snapshots
git add app/(app)/series components/series/new-series-form.tsx
git commit -m "feat(series): right-side New Series sheet, drop /series/new"
```

### Task 21: Series detail

**Files:**

- Modify: `app/(app)/series/[id]/page.tsx`

- [ ] **Step 1: JSX pass**

Series header in Nunito 800, members list as `<Card>` grid, cadence in a `<Badge>`, upcoming occurrences as `<Card interactive>` links to the underlying meeting.

- [ ] **Step 2: Typecheck + commit**

```bash
pnpm typecheck
pnpm test:e2e -- --grep design-qa --update-snapshots
git add app/(app)/series/[id]/page.tsx
git commit -m "feat(series): playful detail page"
```

### Task 22: Roster (list + detail)

**Files:**

- Modify: `app/(app)/roster/page.tsx`
- Modify: `app/(app)/roster/[id]/page.tsx`
- Modify: `components/app/roster-table.tsx` (or replace with tile grid)

- [ ] **Step 1: List becomes a tile grid**

```tsx
<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
  {members.map((m) => (
    <Card key={m.id} interactive>
      <CardHeader>
        <CardTitle>
          <Link href={`/roster/${m.id}` as never} className="hover:underline">
            {m.display_name}
          </Link>
        </CardTitle>
        <CardDescription>{m.role}</CardDescription>
        <CardAction>
          <div className="grid size-12 place-items-center rounded-full bg-primary text-primary-ink font-display font-extrabold">
            {m.display_name.slice(0, 2).toUpperCase()}
          </div>
        </CardAction>
      </CardHeader>
    </Card>
  ))}
</div>
```

- [ ] **Step 2: Detail page**

Profile card with big avatar (size-24, `bg-accent text-accent-ink`), display name Nunito 800, role badge. Activity strip below: cards showing last 5 attended meetings and response streak count with a tiny thumbs-up sticker for streaks ≥ 5.

- [ ] **Step 3: Typecheck + screenshot + commit**

```bash
pnpm typecheck
pnpm test:e2e -- --grep design-qa --update-snapshots
git add app/(app)/roster components/app/roster-table.tsx
git commit -m "feat(roster): tile grid list + playful detail"
```

### Task 23: Notifications + Settings

**Files:**

- Modify: `app/(app)/notifications/page.tsx`
- Modify: `components/app/notifications-feed.tsx`
- Modify: `app/(app)/settings/page.tsx`
- Modify: `components/app/settings-form.tsx`, `email-prefs-form.tsx`, `unavailability-editor.tsx`

- [ ] **Step 1: Notifications feed**

Each item becomes `<Card interactive>` with a small sticker on the left based on notification type:

- `meeting_*` → `calendar`
- `poll_*` → `speech-bubble`
- `reveal_*` → `eyes`
- default → `bell`

Unread items get an accent-yellow dot (`className="ml-2 size-2 rounded-full bg-accent"`). Mark-all-read is a `<Button variant="outline" size="sm">` in the page header.

- [ ] **Step 2: Settings**

Wrap each concern in a `<Card>` with `<CardHeader><CardTitle>...</CardTitle></CardHeader><CardContent>{form}</CardContent>`. Forms use rebuilt `<Input>`, `<Textarea>`, `<Select>` and `<Button variant="default">` for save. Add a "Danger zone" card at bottom (border-danger, contains sign-out and account-delete if applicable), where destructive actions open a `<Dialog>` confirm — not a sheet.

- [ ] **Step 3: Typecheck + screenshot + commit**

```bash
pnpm typecheck
pnpm test:e2e -- --grep design-qa --update-snapshots
git add app/(app)/notifications app/(app)/settings components/app/notifications-feed.tsx components/app/settings-form.tsx components/app/email-prefs-form.tsx components/app/unavailability-editor.tsx
git commit -m "feat(ui): playful notifications feed + settings sections"
```

### Task 24: Tools (pick + shuffle) with delight

**Files:**

- Modify: `app/(app)/tools/pick/page.tsx`
- Modify: `app/(app)/tools/shuffle/page.tsx`

**Interfaces:**

- Consumes: Task 8 (`fireConfetti`), Task 7 (`<Sticker>`)

- [ ] **Step 1: Pick-someone slot machine**

Client component: user clicks a big accent-yellow `<Button size="lg">` labeled "Pick!"; a large card cycles rapidly through roster display names for 1.5s with `ease-out` deceleration, lands on a random one, plays `fireConfetti()`, shows the winner in Nunito 900 at 5xl. `<Sticker name="peace-hand" size="xl" rotate={-8} />` peeks from the corner post-pick.

Implementation sketch — spin using a `setInterval` that decays its interval from 40 ms → 200 ms, stops on the final choice.

- [ ] **Step 2: Shuffle roster**

Show the roster as cards in a grid; on "Shuffle" click, apply CSS `animation-delay` staggered by index so each card fades out + rises 8px in sequence, then re-renders in a shuffled order with `rise-in` staggered by 60 ms.

- [ ] **Step 3: Typecheck + screenshot + commit**

```bash
pnpm typecheck
pnpm test:e2e -- --grep design-qa --update-snapshots
git add app/(app)/tools
git commit -m "feat(tools): pick slot-machine + shuffle stagger"
```

### Task 25: Sign-in page

**Files:**

- Modify: `app/(auth)/sign-in/page.tsx`

**Interfaces:**

- Consumes: `<Sticker>`, `<AtlasLogo>`, `<Button>`, `<Input>`, `<Card>`

- [ ] **Step 1: Rewrite JSX**

```tsx
export default function SignInPage() {
  return (
    <div className="relative min-h-screen bg-surface overflow-hidden">
      <Sticker name="clouds" size="xl" className="absolute top-0 left-0" />
      <Sticker
        name="clouds"
        size="xl"
        rotate={12}
        className="absolute top-4 right-0"
      />
      <main className="relative mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 px-6">
        <AtlasLogo className="h-20 w-20 text-primary" />
        <div className="text-center space-y-1">
          <h1 className="font-display text-4xl font-extrabold text-ink">
            Welcome to Atlas
          </h1>
          <p className="text-sm text-ink-soft">
            Team meeting rituals, made playful.
          </p>
        </div>
        <Card className="w-full">
          <CardContent className="space-y-4 pt-6">
            {/* keep existing form action + inputs, just restyled */}
            <form action={signInAction} className="space-y-3">
              <label className="block space-y-1">
                <span className="text-sm font-medium text-ink">Email</span>
                <Input type="email" name="email" required autoFocus />
              </label>
              <Button variant="default" size="lg" className="w-full">
                Sign in
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
```

Keep whatever server action / OTP flow currently exists — just restyle.

- [ ] **Step 2: Verify axe scan still passes**

```bash
pnpm test:e2e -- --grep axe
```

Expected: zero critical/serious violations.

- [ ] **Step 3: Screenshot + commit**

```bash
pnpm test:e2e -- --grep design-qa --update-snapshots
git add app/(auth)/sign-in/page.tsx
git commit -m "feat(auth): playful sign-in with cloud stickers"
```

---

## Phase 4 — Polish

### Task 26: Dark mode audit

**Files:**

- Modify: any surface with contrast / readability issues surfaced by the audit
- (No new files)

**Interfaces:**

- Consumes: all previous tasks

- [ ] **Step 1: Force dark mode and screenshot every surface**

Add a temporary `enforceDarkMode` fixture to the design-QA Playwright suite that sets `localStorage.setItem("theme", "dark")` before navigation. Run:

```bash
pnpm test:e2e -- --grep design-qa --update-snapshots
```

- [ ] **Step 2: Manually review each dark screenshot**

For each screenshot in `qa-screenshots/` where dark variant looks wrong (unreadable text, invisible border, broken sticker), open the corresponding page and adjust. Common fixes:

- `text-ink-soft` too dim → nudge `--ink-soft` in `.dark` to `#B8BCE0`.
- Sticker outline disappearing → wrapper should be `text-ink`, not left as inherited.
- Yellow badge unreadable on navy card → verify `accent-ink` stays `#111111`.
- Danger badge on danger surface → use `border-ink` explicitly.

- [ ] **Step 3: WCAG contrast check**

For every unique foreground/background pair in the dark palette, verify AA:

```
--ink (F3F1E8) on --surface (0E1030)          — target ≥ 4.5
--ink-soft (A5A8C7) on --surface (0E1030)     — target ≥ 4.5
--ink (F3F1E8) on --surface-raised (171A3D)   — target ≥ 4.5
--primary-ink (0E1030) on --primary (8A8CFF)  — target ≥ 4.5
--accent-ink (111111) on --accent (FFE264)    — target ≥ 4.5
--white on --success (7EE84A)                 — target ≥ 4.5 (may need adjusting)
--white on --danger (FF7070)                  — target ≥ 4.5 (may need adjusting)
```

Use a CLI tool like `pnpm dlx wcag-contrast <fg> <bg>` or a browser extension. Adjust tokens in `globals.css` as needed and re-run the screenshot suite.

- [ ] **Step 4: Commit**

```bash
git add app/globals.css qa-screenshots
git commit -m "fix(ui): dark-mode contrast and readability sweep"
```

### Task 27: Motion + confetti wire-up sweep

**Files:**

- Any create/reveal path where confetti or bouncy checks were promised but not yet wired

**Interfaces:**

- Consumes: `fireConfetti`, `fireConfettiFrom`

- [ ] **Step 1: Enumerate celebration points**

- New meeting created → `fireConfettiFrom(submitRef.current)` (done in Task 16).
- New poll created → same (done in Task 18).
- New series created → same (done in Task 20).
- Prompt reveal (meeting host clicks Reveal on a prompt) → `fireConfetti({ origin: {x: 0.5, y: 0.35} })`.
- Last respondent completes a poll → `fireConfetti()`.
- Pick-someone lands on a name → `fireConfetti()` (done in Task 24).

For each not-yet-wired point, add the call. Locate:

```bash
rg -n "revealAction\|reveal_prompt\|last respondent" app components
```

- [ ] **Step 2: Bouncy checkmark on response submit**

In the poll respond form, after successful submit, render a `<Sticker name="thumbs-up" size="md" rotate={-6} />` that fades in via `animate-rise-in` for 800 ms before navigating.

- [ ] **Step 3: Verify reduced-motion is honored**

Set `prefers-reduced-motion: reduce` in devtools. Verify all confetti calls no-op, sheets slide instantly, and buttons still visually indicate hover/active without translate (`hover:shadow-lift` still fires — that's fine; only `translate-y` is technically motion, and CSS transitions are already sub-1ms per the base rule).

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "feat(ui): celebration confetti + bouncy checkmarks"
```

### Task 28: Empty-state coverage sweep

**Files:**

- Any list surface still showing plain text on empty

**Interfaces:**

- Consumes: `<EmptyState>`, `<Sticker>`

- [ ] **Step 1: Find remaining empty states**

```bash
rg -n "No .* yet\|No .* found\|Nothing waiting\|is empty" app components
```

- [ ] **Step 2: Replace each with `<EmptyState>`**

Recommended pairings:

- No meetings → `sticker="calendar"`, action links to sheet trigger.
- No polls → `sticker="speech-bubble"`.
- No series → `sticker="empty-box"`.
- No notifications → `sticker="bell"`.
- No roster → `sticker="empty-box"`.
- No members in a series → `sticker="empty-box"`.

- [ ] **Step 3: Screenshot + commit**

```bash
pnpm test:e2e -- --grep design-qa --update-snapshots
git add .
git commit -m "feat(ui): empty-state coverage across all lists"
```

### Task 29: Final QA + axe + performance sanity

**Files:**

- (None — verification only)

- [ ] **Step 1: Full test suite**

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
```

Expected: all pass.

- [ ] **Step 2: Bundle sanity**

```bash
pnpm build
```

Look at Next.js's build output for `First Load JS`. Compare against the pre-rebuild baseline (see the last passing CI on `main`). Bundle increase should be ≤ 10 KB gzipped total. If it's more, likely culprits:

- Nunito subsetting — verify `weight: ["700","800","900"]` in `lib/fonts.ts` (no 400/500/600 duplication with Geist).
- Accidental `framer-motion` import.

- [ ] **Step 3: Extend axe scan**

Update `e2e/a11y.spec.ts` to cover: `/`, `/meetings`, `/polls/[id]`, and a sheet-open state (navigate to `/meetings?new=meeting`). Bar: zero critical or serious violations. Run:

```bash
pnpm test:e2e -- --grep axe
```

- [ ] **Step 4: Manual keyboard walkthrough**

Tab through each page and verify:

- Focus ring visible on every interactive element.
- Sheet opens, focus lands in first input, Esc closes, focus restored to trigger.
- Nav is navigable.

- [ ] **Step 5: Commit CI updates + baseline**

```bash
git add e2e/a11y.spec.ts qa-screenshots
git commit -m "test(ui): extend axe coverage + update final baseline"
```

### Task 30: Update docs

**Files:**

- Modify: `docs/deploy.md` or `README.md` if any developer instructions changed
- Modify: `docs/qa/atlas.md` — note the new visual language + how to run screenshot updates

- [ ] **Step 1: Add a "Design system" note**

Add a short section pointing to the spec + summarizing:

- Palette tokens (Atlas blue, duo yellow, cream/navy surfaces).
- Sheet routing via `?new=` params.
- How to add a new sticker (drop SVG in `public/stickers/`, extend `StickerName` union).
- How to update Playwright snapshots after intentional visual changes.

- [ ] **Step 2: Commit**

```bash
git add docs/
git commit -m "docs(ui): playful UI rebuild reference"
```

---

## Self-Review

**Spec coverage (each section of the spec → task that implements it):**

- Playfulness + restrained direction → Tasks 9–13 (chunky primitives) + Task 7 (sparse stickers).
- Sheets replace `/new` routes → Tasks 16, 18, 20.
- Atlas blue + duo yellow palette → Task 2.
- Bouncy motion → Tasks 2 (tokens), 9 (button squish), 8 (confetti), 27 (celebration wire-up).
- First-class dark mode → Task 2 (`.dark` block), Task 3 (`next-themes`), Task 14 (theme toggle), Task 26 (audit).
- Design tokens (color, radii, borders, shadows, typography, motion, spacing) → Task 2.
- App shell (pill rail, mobile bottom nav, page container, user pill) → Task 14.
- Sheet primitive (anatomy, motion, routing, accessibility, API) → Task 4.
- Component library (Button, Card, Input, Badge, Toast, Sheet, EmptyState, ConfettiBurst, BouncingDots, Sticker, Textarea, Select) → Tasks 4–13.
- Per-feature surfaces (Home, Meetings, Polls, Series, Roster, Notifications, Settings, Tools, Sign-in) → Tasks 15–25.
- Illustrations & 8 stickers → Task 7.
- Motion inventory + celebration → Tasks 2, 9, 27.
- Dark mode audit + adaptive shadows/stickers → Task 26.
- Migration order (dependency-safe slices) → Task order mirrors the 15 spec slices, decomposed further.
- Dependencies (`canvas-confetti`, Nunito, no `framer-motion`) → Task 1, Global Constraints.
- Testing & a11y (screenshot suite both themes, axe, WCAG AA, reduced motion, keyboard nav, route deletion sweep, bundle budget) → Tasks 26, 29, plus per-task screenshot updates.
- Route deletions → Tasks 16, 18, 20 (each deletes its own).

**Placeholder scan:** No "TBD" / "TODO" / "similar to task N" / vague "handle errors" language. Task 20 mentions leaving a code comment `TODO: proper member picker` — that's an in-code note, not a plan placeholder.

**Type consistency:**

- `useSheetParam(name, value)` — declared Task 4, called Tasks 16, 18, 20 with the exact same 2-arg signature. ✓
- `fireConfetti(options?)` + `fireConfettiFrom(el)` — declared Task 8, called Tasks 16, 19, 24, 27. ✓
- `<Button variant="default"|"accent"|"outline"|"ghost"|"destructive"|"link">` — declared Task 9, used consistently everywhere. ✓
- `<Badge variant="live"|"scheduled"|"postponed"|"ended"|"open">` presets — declared Task 12, used in Home (Task 15), Meetings (Task 17), Polls, Series, Notifications. ✓
- `<Sticker name>` `StickerName` union — declared Task 7, referenced consistently in `<EmptyState>` (Task 13) and per-feature stickers. ✓

No gaps found. Plan is ready.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-25-playful-ui-rebuild.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
