import { expect, test } from "vitest";
import {
  paletteForOrdinal,
  stagePalettes,
  standbyPalette,
  curtainPalette,
} from "@/lib/present/palettes";

test("stagePalettes has 6 entries with unique keys", () => {
  expect(stagePalettes).toHaveLength(6);
  const keys = new Set(stagePalettes.map((p) => p.key));
  expect(keys.size).toBe(6);
});

test("paletteForOrdinal wraps at 6", () => {
  expect(paletteForOrdinal(1).key).toBe(stagePalettes[0].key);
  expect(paletteForOrdinal(6).key).toBe(stagePalettes[5].key);
  expect(paletteForOrdinal(7).key).toBe(stagePalettes[0].key);
  expect(paletteForOrdinal(12).key).toBe(stagePalettes[5].key);
  expect(paletteForOrdinal(13).key).toBe(stagePalettes[0].key);
});

test("paletteForOrdinal handles zero and negative gracefully", () => {
  expect(paletteForOrdinal(0).key).toBe(stagePalettes[5].key);
  expect(paletteForOrdinal(-1).key).toBe(stagePalettes[4].key);
});

test("standbyPalette and curtainPalette are distinct from stagePalettes", () => {
  const stageKeys = new Set(stagePalettes.map((p) => p.key));
  expect(stageKeys.has(standbyPalette.key)).toBe(false);
  expect(stageKeys.has(curtainPalette.key)).toBe(false);
});
