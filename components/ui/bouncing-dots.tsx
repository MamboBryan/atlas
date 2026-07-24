// components/ui/bouncing-dots.tsx
export function BouncingDots({ className }: { className?: string }) {
  return (
    <span role="status" aria-label="Loading" className={className}>
      …
    </span>
  );
}
