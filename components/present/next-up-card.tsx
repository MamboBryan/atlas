"use client";

export function NextUpCard({ name, color }: { name: string; color: string }) {
  return (
    <div
      className="absolute bottom-6 right-6 rounded-2xl border-[2.5px] bg-white/95 px-4 py-3 shadow-[4px_4px_0_rgba(0,0,0,0.8)]"
      style={{ borderColor: color, color: "#111" }}
    >
      <div className="text-[10px] uppercase tracking-widest font-extrabold opacity-70">
        Up next
      </div>
      <div className="text-base font-black leading-tight">{name}</div>
    </div>
  );
}
