// Small cache and helpers for regular polygon ring templates

const cache = new Map<string, { x: number; y: number }[]>();

export function polygonRadius(n: number, sideLength: number): number {
  if (n <= 2) return 0;
  return sideLength / (2 * Math.sin(Math.PI / n));
}

export function regularPolygonVertices(n: number, sideLength: number): { x: number; y: number }[] {
  const key = `${n}:${sideLength.toFixed(8)}`;
  const cached = cache.get(key);
  if (cached) return cached.map(p => ({ x: p.x, y: p.y }));

  const R = polygonRadius(n, sideLength);
  const verts: { x: number; y: number }[] = [];
  // start angle 0 so first vertex at (R,0); caller can rotate as needed
  for (let i = 0; i < n; i++) {
    const theta = (2 * Math.PI * i) / n;
    verts.push({ x: Math.cos(theta) * R, y: Math.sin(theta) * R });
  }

  cache.set(key, verts.map(p => ({ x: p.x, y: p.y })));
  return verts;
}

export function clearRingTemplateCache() {
  cache.clear();
}
