import type { ReactNode } from "react";

// Main-column chrome, copied verbatim from the old app-layout <main> so pages
// look identical after the @right retirement. The sticky-header [&_header] rules
// are the recent leak fix — keep them exact.
const MAIN_CLASSES =
  "w-full bg-surface-raised px-4 pb-24 pt-6 md:px-8 md:pb-10 md:pt-0 md:h-screen md:overflow-y-auto " +
  "md:[&_header]:sticky md:[&_header]:-top-px md:[&_header]:z-10 md:[&_header]:bg-surface-raised " +
  "[&_header]:border-b-[0.5px] [&_header]:border-ink/80 [&_header]:pb-6 md:[&_header]:pt-8 " +
  "[&_header]:-mx-4 [&_header]:px-4 md:[&_header]:-mx-8 md:[&_header]:px-8";

export function DetailWithRail({
  children,
  rail,
}: {
  children: ReactNode;
  rail?: ReactNode;
}) {
  if (!rail) return <main className={MAIN_CLASSES}>{children}</main>;
  return (
    <div className="md:grid md:h-screen md:grid-cols-[7fr_3fr] md:overflow-hidden">
      <main className={MAIN_CLASSES}>{children}</main>
      <aside className="hidden md:flex md:flex-col md:h-screen md:overflow-y-auto px-6 pt-8 pb-10">
        {rail}
      </aside>
    </div>
  );
}
