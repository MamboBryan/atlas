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
    // eslint-disable-next-line @next/next/no-img-element -- SVG stickers use currentColor; next/image does not support it
    <img
      src={`/stickers/${name}.svg`}
      alt=""
      aria-hidden="true"
      className={cn(sizeMap[size], "inline-block text-ink", className)}
      style={{ transform: rotate ? `rotate(${rotate}deg)` : undefined }}
    />
  );
}
