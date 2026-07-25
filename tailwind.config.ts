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
        popover: { DEFAULT: "var(--popover)", foreground: "var(--popover-foreground)" },
        primary: {
          DEFAULT: "var(--primary)",
          ink: "var(--primary-ink)",
          foreground: "var(--primary-foreground)",
        },
        secondary: { DEFAULT: "var(--secondary)", foreground: "var(--secondary-foreground)" },
        muted: { DEFAULT: "var(--muted)", foreground: "var(--muted-foreground)" },
        accent: {
          DEFAULT: "var(--accent)",
          ink: "var(--accent-ink)",
          foreground: "var(--accent-foreground)",
        },
        success: { DEFAULT: "var(--success)", ink: "var(--success-ink)" },
        danger:  { DEFAULT: "var(--danger)",  ink: "var(--danger-ink)", text: "var(--danger-text)" },
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
        block: "var(--shadow-block)",
        "block-sm": "var(--shadow-block-sm)",
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
        "accordion-down": { from: { height: "0" }, to: { height: "var(--radix-accordion-content-height)" } },
        "accordion-up":   { from: { height: "var(--radix-accordion-content-height)" }, to: { height: "0" } },
        "sheet-in":  { from: { transform: "translateX(100%)" }, to: { transform: "translateX(0)" } },
        "sheet-out": { from: { transform: "translateX(0)" }, to: { transform: "translateX(100%)" } },
        "dot-bounce": {
          "0%, 80%, 100%": { transform: "scale(0.6)", opacity: "0.5" },
          "40%": { transform: "scale(1)", opacity: "1" },
        },
        "rise-in": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
        "rise-out": {
          from: { opacity: "1", transform: "translateY(0)" },
          to:   { opacity: "0", transform: "translateY(8px)" },
        },
        "pulse-dot": {
          "0%, 100%": { transform: "scale(1)", opacity: "1" },
          "50%":      { transform: "scale(1.3)", opacity: "0.6" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "sheet-in":  "sheet-in var(--dur-med) var(--ease-spring)",
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
