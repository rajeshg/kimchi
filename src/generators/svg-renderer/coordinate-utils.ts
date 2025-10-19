import type { AtomCoordinates } from './types';

export function normalizeCoordinates(rawCoords: Array<[number, number]> | AtomCoordinates[]): AtomCoordinates[] {
  return rawCoords.map(c => 
    Array.isArray(c) ? { x: c[0], y: c[1] } : c
  );
}

export function createCoordinateTransforms(
  coords: AtomCoordinates[],
  width: number,
  height: number,
  padding: number,
  useRDKitStyle: boolean
): [(x: number) => number, (y: number) => number] {
  const xs = coords.map(c => c.x);
  const ys = coords.map(c => c.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  
  if (useRDKitStyle) {
    let xRange = maxX - minX;
    let yRange = maxY - minY;
    
    if (xRange < 1.0e-4) xRange = 1.0;
    if (yRange < 1.0e-4) yRange = 1.0;
    
    const rdkitPadding = 0.05;
    const drawWidth = width * (1 - 2 * rdkitPadding);
    const drawHeight = height * (1 - 2 * rdkitPadding);
    
    const minDim = Math.min(drawWidth, drawHeight);
    const scale = minDim * 0.75 / Math.max(xRange, yRange);
    
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    
    const tx = (x: number) => width / 2 + (x - centerX) * scale;
    const ty = (y: number) => height / 2 - (y - centerY) * scale;
    return [tx, ty];
  } else {
    const scale = Math.min(
      (width - 2 * padding) / (maxX - minX || 1),
      (height - 2 * padding) / (maxY - minY || 1)
    );
    const offsetX = padding - minX * scale + (width - (maxX - minX) * scale) / 2;
    const offsetY = padding - minY * scale + (height - (maxY - minY) * scale) / 2;

    const tx = (x: number) => x * scale + offsetX;
    const ty = (y: number) => y * scale + offsetY;
    return [tx, ty];
  }
}

export function regularizeRingCoordinates(
  coords: AtomCoordinates[],
  ringAtomIds: number[],
  atomIdToIndex: Map<number, number>
): void {
  if (ringAtomIds.length < 5 || ringAtomIds.length > 6) return;
  
  const indices: number[] = [];
  for (const aid of ringAtomIds) {
    const idx = atomIdToIndex.get(aid as number);
    if (typeof idx !== 'number') return;
    indices.push(idx);
  }
  if (indices.length !== ringAtomIds.length) return;
  
  let cx = 0, cy = 0;
  for (const idx of indices) {
    const c = coords[idx];
    if (!c) return;
    cx += c.x;
    cy += c.y;
  }
  cx /= indices.length;
  cy /= indices.length;
  
  let avgR = 0;
  const angles: number[] = [];
  for (const idx of indices) {
    const c = coords[idx];
    if (!c) return;
    const vx = c.x - cx;
    const vy = c.y - cy;
    avgR += Math.sqrt(vx * vx + vy * vy);
    angles.push(Math.atan2(vy, vx));
  }
  avgR /= indices.length;
  
  const baseAngle: number = angles.length > 0 ? angles[0]! : 0;
  for (let i = 0; i < indices.length; ++i) {
    const idx: number | undefined = indices[i];
    if (typeof idx !== 'number') continue;
    const theta = baseAngle + (2 * Math.PI * i) / indices.length;
    coords[idx] = { x: cx + Math.cos(theta) * avgR, y: cy + Math.sin(theta) * avgR };
  }
}
