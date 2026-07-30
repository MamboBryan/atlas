/** Catmull-Rom smoothing → cubic-bezier SVG path string through the given points. */
export function smoothPath(points: [number, number][]): string {
  if (points.length === 0) return "";
  const f = (n: number) => n.toFixed(1);
  if (points.length === 1) return `M ${f(points[0][0])},${f(points[0][1])}`;
  let d = `M ${f(points[0][0])},${f(points[0][1])}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
    const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
    const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
    const cp2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${f(cp1x)},${f(cp1y)} ${f(cp2x)},${f(cp2y)} ${f(p2[0])},${f(p2[1])}`;
  }
  return d;
}
