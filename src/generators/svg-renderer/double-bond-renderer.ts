import type { Molecule, Bond } from 'types';
import type { AtomCoordinates } from './types';
import { svgLine } from './svg-primitives';

export function svgDoubleBond(
  x1: number, y1: number, x2: number, y2: number,
  color: string, width: number,
  bond: Bond, molecule: Molecule,
  atomIdToCoords: Map<number, AtomCoordinates>,
  bondClass?: string
): string {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  let perpX = -dy / len;
  let perpY = dx / len;
  const offset = width * 1.5;
  let outerOffset = offset;
  let innerOffset = offset;

  function isRegularPolygon(ringAtoms: number[], coords: Map<number, AtomCoordinates>): boolean {
    if (ringAtoms.length < 5 || ringAtoms.length > 7) return false;
    const dists: number[] = [];
    for (let i = 0; i < ringAtoms.length; ++i) {
      const idxA = ringAtoms[i];
      const idxB = ringAtoms[(i + 1) % ringAtoms.length];
      if (typeof idxA !== 'number' || typeof idxB !== 'number') return false;
      const a = coords.get(idxA);
      const b = coords.get(idxB);
      if (!a || !b) return false;
      dists.push(Math.hypot(a.x - b.x, a.y - b.y));
    }
    const avg = dists.reduce((a, b) => a + b, 0) / dists.length;
    return dists.every(d => Math.abs(d - avg) < avg * 0.12);
  }

  let usePolygonParallel = false;
  let ringAtoms: number[] | undefined = undefined;
  if (bond.isInRing && molecule.ringInfo) {
    const ringId = bond.ringIds?.[0];
    if (ringId !== undefined) {
      const ringArr = molecule.ringInfo.rings[ringId];
      if (ringArr) {
        ringAtoms = Array.from(ringArr);
        if (isRegularPolygon(ringAtoms, atomIdToCoords)) {
          usePolygonParallel = true;
        }
      }
    }
  }

  if (usePolygonParallel && ringAtoms) {
    const a1 = atomIdToCoords.get(bond.atom1);
    const a2 = atomIdToCoords.get(bond.atom2);
    if (a1 && a2) {
      let cx = 0, cy = 0;
      for (const atomId of ringAtoms) {
        const c = atomIdToCoords.get(atomId);
        if (c) { cx += c.x; cy += c.y; }
      }
      cx /= ringAtoms.length;
      cy /= ringAtoms.length;
      const mx = (a1.x + a2.x) / 2;
      const my = (a1.y + a2.y) / 2;
      let vx = cx - mx;
      let vy = cy - my;
      const vlen = Math.sqrt(vx * vx + vy * vy);
      if (vlen > 0) { vx /= vlen; vy /= vlen; }
  let line1X1 = x1;
  let line1Y1 = y1;
  let line1X2 = x2;
  let line1Y2 = y2;
  const innerOffset = offset * 0.9;
      let line2X1 = x1 + vx * innerOffset;
      let line2Y1 = y1 + vy * innerOffset;
      let line2X2 = x2 + vx * innerOffset;
      let line2Y2 = y2 + vy * innerOffset;
      const innerDx = line2X2 - line2X1;
      const innerDy = line2Y2 - line2Y1;
      const innerLen = Math.sqrt(innerDx * innerDx + innerDy * innerDy);
      const shortenAmount = innerLen * 0.11;
      line2X1 += innerDx / innerLen * shortenAmount;
      line2Y1 += innerDy / innerLen * shortenAmount;
      line2X2 -= innerDx / innerLen * shortenAmount;
      line2Y2 -= innerDy / innerLen * shortenAmount;
      return svgLine(line1X1, line1Y1, line1X2, line1Y2, color, width, bondClass) +
             svgLine(line2X1, line2Y1, line2X2, line2Y2, color, width, bondClass);
    }
  } else if (bond.isInRing && molecule.ringInfo) {
    outerOffset = offset * 1.0;
    innerOffset = offset * 0.55;
  }

  let line1X1 = x1 + perpX * outerOffset;
  let line1Y1 = y1 + perpY * outerOffset;
  let line1X2 = x2 + perpX * outerOffset;
  let line1Y2 = y2 + perpY * outerOffset;

  let line2X1 = x1 - perpX * innerOffset;
  let line2Y1 = y1 - perpY * innerOffset;
  let line2X2 = x2 - perpX * innerOffset;
  let line2Y2 = y2 - perpY * innerOffset;

  if (bond.isInRing && molecule.ringInfo) {
    const ringId = bond.ringIds?.[0];
    if (ringId !== undefined) {
      const ringAtoms = molecule.ringInfo.rings[ringId];
      if (ringAtoms) {
        let ringCenterX = 0;
        let ringCenterY = 0;
        for (const atomId of ringAtoms) {
          const coord = atomIdToCoords.get(atomId);
          if (coord) {
            ringCenterX += coord.x;
            ringCenterY += coord.y;
          }
        }
        ringCenterX /= ringAtoms.length;
        ringCenterY /= ringAtoms.length;

        const a1Coord = atomIdToCoords.get(bond.atom1);
        const a2Coord = atomIdToCoords.get(bond.atom2);

        if (!a1Coord || !a2Coord) return '';

        const rcx = ringCenterX - a1Coord.x;
        const rcy = ringCenterY - a1Coord.y;
        const crossProduct = dx * rcy - dy * rcx;
        if (crossProduct > 0) {
          [line1X1, line2X1] = [line2X1, line1X1];
          [line1Y1, line2Y1] = [line2Y1, line1Y1];
          [line1X2, line2X2] = [line2X2, line1X2];
          [line1Y2, line2Y2] = [line2Y2, line1Y2];
        }
        const innerDx = line2X2 - line2X1;
        const innerDy = line2Y2 - line2Y1;
        const innerLen = Math.sqrt(innerDx * innerDx + innerDy * innerDy);
        const shortenAmount = innerLen * 0.075;
        line2X1 += innerDx / innerLen * shortenAmount;
        line2Y1 += innerDy / innerLen * shortenAmount;
        line2X2 -= innerDx / innerLen * shortenAmount;
        line2Y2 -= innerDy / innerLen * shortenAmount;
      }
    }
  }

  return svgLine(line1X1, line1Y1, line1X2, line1Y2, color, width, bondClass) +
         svgLine(line2X1, line2Y1, line2X2, line2Y2, color, width, bondClass);
}

export function svgTripleBond(
  x1: number, y1: number, x2: number, y2: number,
  color: string, width: number, bondClass?: string
): string {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  const perpX = -dy / len;
  const perpY = dx / len;
  const offset = width * 2;
  
  const line1X1 = x1 + perpX * offset;
  const line1Y1 = y1 + perpY * offset;
  const line1X2 = x2 + perpX * offset;
  const line1Y2 = y2 + perpY * offset;
  
  const line2X1 = x1 - perpX * offset;
  const line2Y1 = y1 - perpY * offset;
  const line2X2 = x2 - perpX * offset;
  const line2Y2 = y2 - perpY * offset;
  
  return svgLine(line1X1, line1Y1, line1X2, line1Y2, color, width, bondClass) +
         svgLine(x1, y1, x2, y2, color, width, bondClass) +
         svgLine(line2X1, line2Y1, line2X2, line2Y2, color, width, bondClass);
}
