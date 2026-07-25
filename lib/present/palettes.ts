export type Palette = {
  key: string;
  bg: string;
  ink: string;
  accent: string;
  accentInk: string;
};

export const stagePalettes: readonly Palette[] = [
  { key: "electric", bg: "#E5006A", ink: "#FFFFFF", accent: "#FFE84D", accentInk: "#111111" },
  { key: "sunburst", bg: "#FF7A1A", ink: "#1A0A00", accent: "#E5006A", accentInk: "#FFFFFF" },
  { key: "aqua",     bg: "#007A82", ink: "#FFFFFF", accent: "#C6FF3D", accentInk: "#0B1F1A" },
  { key: "grape",    bg: "#6B21A8", ink: "#FFFFFF", accent: "#FFE84D", accentInk: "#111111" },
  { key: "fire",     bg: "#DC2626", ink: "#FFF6E5", accent: "#FFE84D", accentInk: "#111111" },
  { key: "meadow",   bg: "#A3E635", ink: "#0B1F1A", accent: "#0B1F1A", accentInk: "#A3E635" },
];

export const standbyPalette: Palette = {
  key: "standby",
  bg: "#FFF8EC",
  ink: "#111111",
  accent: "#FFD84A",
  accentInk: "#111111",
};

export const curtainPalette: Palette = {
  key: "curtain",
  bg: "linear-gradient(135deg,#E5006A 0%,#FF7A1A 60%,#FFE84D 100%)",
  ink: "#1A0A00",
  accent: "#111111",
  accentInk: "#FFE84D",
};

export function paletteForOrdinal(ordinal: number): Palette {
  const n = stagePalettes.length;
  const idx = ((((ordinal - 1) % n) + n) % n);
  return stagePalettes[idx];
}
