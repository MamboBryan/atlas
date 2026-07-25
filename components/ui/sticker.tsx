"use client";

import { cn } from "@/lib/utils";
import { stickerRegistry } from "./sticker-svgs";

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
  const StickerSVG = stickerRegistry[name];
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block text-ink", sizeMap[size], className)}
      style={{ transform: rotate ? `rotate(${rotate}deg)` : undefined }}
    >
      <StickerSVG width="100%" height="100%" />
    </span>
  );
}
