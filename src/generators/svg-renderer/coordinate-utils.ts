import type { AtomCoordinates } from './types';

export function normalizeCoordinates(rawCoords: Array<[number, number]> | AtomCoordinates[]): AtomCoordinates[] {
  return rawCoords.map(c => Array.isArray(c) ? { x: c[0], y: c[1] } : c);
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

import { regularPolygonVertices } from './ring-template-cache';

export function regularizeRingCoordinates(
  coords: AtomCoordinates[],
  ringAtomIds: number[],
  atomIdToIndex: Map<number, number>
): void {
  const n = ringAtomIds.length;
  if (n < 3 || n > 8) return;

  const indices: number[] = [];
  for (const aid of ringAtomIds) {
    const idx = atomIdToIndex.get(aid as number);
    if (typeof idx !== 'number') return;
    indices.push(idx);
  }
  if (indices.length !== ringAtomIds.length) return;

  // compute centroid and average bond length
  let cx = 0, cy = 0;
  for (const idx of indices) {
    const c = coords[idx];
    if (!c) return;
    cx += c.x; cy += c.y;
  }
  cx /= indices.length; cy /= indices.length;

  // compute average edge length to scale template
  let avgEdge = 0;
  for (let i = 0; i < indices.length; i++) {
    const ia = indices[i];
    const ib = indices[(i + 1) % indices.length];
    if (ia === undefined || ib === undefined) return;
    const a = coords[ia];
    const b = coords[ib];
    if (!a || !b) return;
    const dx = b.x - a.x; const dy = b.y - a.y;
    avgEdge += Math.sqrt(dx * dx + dy * dy);
  }
  avgEdge /= indices.length;
  if (!isFinite(avgEdge) || avgEdge < 1e-6) return;

  const template = regularPolygonVertices(n, avgEdge);

  // compute rotation to align template to current orientation (guarded)
  let rotate = 0;
  if (indices.length >= 2 && template.length >= 2) {
    const aIdx = indices[0] as number;
    const bIdx = indices[1] as number;
    const aCoord = coords[aIdx];
    const bCoord = coords[bIdx];
    if (aCoord && bCoord) {
      const currentVec = { x: bCoord.x - aCoord.x, y: bCoord.y - aCoord.y };
      const t0 = template[0];
      const t1 = template[1];
      if (t0 && t1) {
        const templateVec = { x: t1.x - t0.x, y: t1.y - t0.y };
        const curAngle = Math.atan2(currentVec.y, currentVec.x);
        const tempAngle = Math.atan2(templateVec.y, templateVec.x);
        rotate = curAngle - tempAngle;
      }
    }
  }

  // apply rotated & translated template to coordinates
  for (let i = 0; i < indices.length; i++) {
    const idx = indices[i];
    if (idx === undefined) continue;
    const t = template[i % template.length];
    if (!t) continue;
    const rx = Math.cos(rotate) * t.x - Math.sin(rotate) * t.y;
    const ry = Math.sin(rotate) * t.x + Math.cos(rotate) * t.y;
    coords[idx] = { x: cx + rx, y: cy + ry };
  }
}

function unwrapAngles(angles: number[]): number[] {
  if (angles.length === 0) return [];
  const unwrapped = angles.slice();
  for (let i = 1; i < unwrapped.length; i++) {
    const prev = unwrapped[i - 1];
    if (typeof prev !== 'number') continue;
    let curr = unwrapped[i];
    if (typeof curr !== 'number') continue;
    while (curr - prev > Math.PI) curr -= Math.PI * 2;
    while (curr - prev < -Math.PI) curr += Math.PI * 2;
    unwrapped[i] = curr;
  }
  return unwrapped;
}


function regularizeRingToPolygon(
  coords: AtomCoordinates[],
  atomIndices: number[],
  centerX: number,
  centerY: number
): { targets: Map<number, { x: number; y: number }>; radius: number } | null {
  const n = atomIndices.length;
  if (n < 5 || n > 6) return null;
  const angles: number[] = [];
  let radiusSum = 0;
  for (const idx of atomIndices) {
    if (idx === undefined) return null;
    const c = coords[idx];
    if (!c) return null;
    angles.push(Math.atan2(c.y - centerY, c.x - centerX));
    radiusSum += Math.hypot(c.x - centerX, c.y - centerY);
  }
  const unwrapped = unwrapAngles(angles);
  const step = (Math.PI * 2) / n;
  let area = 0;
  for (let i = 0; i < n; i++) {
    const idxA = atomIndices[i];
    const idxB = atomIndices[(i + 1) % n];
    if (idxA === undefined || idxB === undefined) return null;
    const c1 = coords[idxA];
    const c2 = coords[idxB];
    if (!c1 || !c2) return null;
    area += c1.x * c2.y - c2.x * c1.y;
  }
  const dir = area >= 0 ? 1 : -1;
  let base = 0;
  for (let i = 0; i < n; i++) {
    const val = unwrapped[i];
    if (typeof val !== 'number') return null;
    base += val - dir * step * i;
  }
  base /= n;
  const radius = radiusSum / n;
  if (!isFinite(radius) || radius < 1e-6) return null;
  const targets = new Map<number, { x: number; y: number }>();
  for (let i = 0; i < n; i++) {
    const idx = atomIndices[i];
    if (idx === undefined) continue;
    const theta = base + dir * step * i;
    targets.set(idx, {
      x: centerX + Math.cos(theta) * radius,
      y: centerY + Math.sin(theta) * radius
    });
  }
  return { targets, radius };
}


export function regularizeFusedRingClusters(
  coords: AtomCoordinates[],
  clusters: number[][],
  rings: readonly (readonly number[])[],
  atomIdToIndex: Map<number, number>
): void {
  for (const cluster of clusters) {
    const accum = new Map<number, { x: number; y: number; count: number }>();
    for (const rid of cluster) {
      const ring = rings[rid];
      if (!ring) continue;
      const atomIndices: number[] = [];
      let cx = 0;
      let cy = 0;
      for (const atomId of ring) {
        const idx = atomIdToIndex.get(atomId as number);
        if (typeof idx !== 'number') { cx = NaN; break; }
        const coord = coords[idx];
        if (!coord) { cx = NaN; break; }
        atomIndices.push(idx);
        cx += coord.x;
        cy += coord.y;
      }
      if (!isFinite(cx) || atomIndices.length !== ring.length) continue;
      const n = atomIndices.length;
      if (n < 5 || n > 6) continue;
      cx /= n;
      cy /= n;
      const regularized = regularizeRingToPolygon(coords, atomIndices, cx, cy);
      if (!regularized) continue;
      for (const [idx, target] of regularized.targets.entries()) {
        const prev = accum.get(idx);
        if (prev) {
          accum.set(idx, { x: prev.x + target.x, y: prev.y + target.y, count: prev.count + 1 });
        } else {
          accum.set(idx, { x: target.x, y: target.y, count: 1 });
        }
      }
    }
    for (const [idx, entry] of accum.entries()) {
      if (entry.count > 0) {
        coords[idx] = { x: entry.x / entry.count, y: entry.y / entry.count };
      }
    }
  }
}

// Multi-pass / constrained snapping of bond angles to preserve fused ring geometry.
export function snapBondAngles(
  coords: AtomCoordinates[],
  molecule: import('types').Molecule,
  allowedAnglesDeg: number[] = [30, 45, 60, 90, 120, 180],
  passes: number = 3,
  // optional set of ring indices that belong to fused ring systems which
  // should not be regularized per-ring (they will be handled as fused
  // clusters by the caller).
  fusedRingIds?: Set<number>
): void {
  const allowedRad = allowedAnglesDeg.map(d => (d * Math.PI) / 180);

  const atomIdToIndex = new Map<number, number>();
  molecule.atoms.forEach((a, i) => atomIdToIndex.set(a.id, i));

  const atomInRing: boolean[] = new Array(molecule.atoms.length).fill(false);
  const bondInSameRing = new Set<number>();

  if (molecule.ringInfo && molecule.ringInfo.rings) {
    for (const ring of molecule.ringInfo.rings) {
      const ids = Array.from(ring);
      for (const aid of ids) {
        const idx = atomIdToIndex.get(aid as number);
        if (typeof idx === 'number') atomInRing[idx] = true;
      }
      for (let i = 0; i < ids.length; ++i) {
        const a1 = ids[i];
        const a2 = ids[(i + 1) % ids.length];
        const bIdx = molecule.bonds.findIndex(b => (b.atom1 === a1 && b.atom2 === a2) || (b.atom1 === a2 && b.atom2 === a1));
        if (bIdx >= 0) bondInSameRing.add(bIdx);
      }
    }
  }

  function nearestAllowed(angle: number): number {
    let best = allowedRad[0] ?? 0;
    let bestDiff = Number.POSITIVE_INFINITY;
    for (const aRad of allowedRad) {
      const candidateBases = [aRad, (aRad + Math.PI) % (Math.PI * 2)];
      for (const base of candidateBases) {
        const diff = Math.abs(Math.atan2(Math.sin(angle - base), Math.cos(angle - base)));
        if (diff < bestDiff) {
          bestDiff = diff;
          best = base;
        }
      }
    }
    return best;
  }

  const baseAlphas = [0.6, 0.3, 0.15, 0.08, 0.04];

  for (let pass = 0; pass < passes; pass++) {
    const baseAlpha = baseAlphas[pass] ?? 0.04;
    for (let bondIndex = 0; bondIndex < molecule.bonds.length; bondIndex++) {
      const bond = molecule.bonds[bondIndex];
      if (!bond) continue;
      if (bondInSameRing.has(bondIndex)) continue;

      const idxA = atomIdToIndex.get(bond.atom1 as number) ?? -1;
      const idxB = atomIdToIndex.get(bond.atom2 as number) ?? -1;
      if (idxA < 0 || idxB < 0) continue;
      const a = coords[idxA];
      const b = coords[idxB];
      if (!a || !b) continue;

      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len < 1e-6) continue;

      let angle = Math.atan2(dy, dx);
      if (angle < 0) angle += Math.PI * 2;

      const targetAngle = nearestAllowed(angle);
      const targetX = a.x + Math.cos(targetAngle) * len;
      const targetY = a.y + Math.sin(targetAngle) * len;

      let moveFactor = baseAlpha;
      if (atomInRing[idxA] || atomInRing[idxB]) moveFactor *= 0.25;

      coords[idxB] = { x: b.x + (targetX - b.x) * moveFactor, y: b.y + (targetY - b.y) * moveFactor };
    }
  }

  if (molecule.ringInfo && molecule.ringInfo.rings) {
    for (let rid = 0; rid < molecule.ringInfo.rings.length; ++rid) {
      if (fusedRingIds && fusedRingIds.has(rid)) continue;
      const ring = molecule.ringInfo.rings[rid];
      if (!ring) continue;
      const ids = Array.from(ring);
      if (ids.length === 5 || ids.length === 6) {
        regularizeRingCoordinates(coords, ids, atomIdToIndex);
      }
    }
  }
}

export function computeLayoutQuality(
  coords: AtomCoordinates[],
  molecule: import('types').Molecule,
  atomsToShow: Set<number>,
  fontSize: number,
  bondLineWidth: number,
  allowedAnglesDeg: number[] = [30, 45, 60, 90, 120, 180]
) {
  const allowedRad = allowedAnglesDeg.map(d => (d * Math.PI) / 180);
  const atomIdToIndex = new Map<number, number>();
  molecule.atoms.forEach((a, i) => atomIdToIndex.set(a.id, i));

  const angleWeight = 1.0;
  const lengthWeight = 0.5;
  const atomOverlapWeight = 2.0;
  const labelOverlapWeight = 1.5;

  let anglePenalty = 0;
  let lengthPenalty = 0;
  let atomOverlapPenalty = 0;
  let labelOverlapPenalty = 0;

  const bondLens: number[] = [];
  for (const bond of molecule.bonds) {
    const idxA = atomIdToIndex.get(bond.atom1 as number) ?? -1;
    const idxB = atomIdToIndex.get(bond.atom2 as number) ?? -1;
    if (idxA < 0 || idxB < 0) continue;
    const a = coords[idxA];
    const b = coords[idxB];
    if (!a || !b) continue;
    const dx = b.x - a.x; const dy = b.y - a.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    bondLens.push(len);

    let angle = Math.atan2(dy, dx);
    if (angle < 0) angle += Math.PI * 2;
    let bestDiff = Number.POSITIVE_INFINITY;
    for (const aRad of allowedRad) {
      for (const base of [aRad, (aRad + Math.PI) % (Math.PI * 2)]) {
        const diff = Math.abs(Math.atan2(Math.sin(angle - base), Math.cos(angle - base)));
        if (diff < bestDiff) bestDiff = diff;
      }
    }
    anglePenalty += bestDiff * bestDiff;
  }

  if (bondLens.length > 0) {
    const mean = bondLens.reduce((s, v) => s + v, 0) / bondLens.length;
    let varSum = 0;
    for (const l of bondLens) {
      const rel = (l - mean) / (mean || 1);
      varSum += rel * rel;
    }
    lengthPenalty = varSum / bondLens.length;
  }

  const minAtomDist = Math.max(4, fontSize * 0.4);
  for (let i = 0; i < molecule.atoms.length; i++) {
    for (let j = i + 1; j < molecule.atoms.length; j++) {
      const ci = coords[i]; const cj = coords[j];
      if (!ci || !cj) continue;
      const dx = ci.x - cj.x; const dy = ci.y - cj.y; const d = Math.sqrt(dx * dx + dy * dy);
      if (d < minAtomDist) {
        const diff = (minAtomDist - d);
        atomOverlapPenalty += diff * diff;
      }
    }
  }

  const minLabelDist = Math.max(fontSize * 0.6, (bondLens.length > 0 ? (bondLens.reduce((s, v) => s + v, 0) / bondLens.length) * 0.2 : fontSize));
  const shown: number[] = [];
  for (const n of atomsToShow) {
    if (typeof n === 'number' && n >= 0 && n < coords.length) shown.push(n as number);
  }
  for (let i = 0; i < shown.length; i++) {
    for (let j = i + 1; j < shown.length; j++) {
      const ai = shown[i];
      const aj = shown[j];
      if (ai === undefined || aj === undefined) continue;
      const ci = coords[ai]; const cj = coords[aj];
      if (!ci || !cj) continue;
      const dx = ci.x - cj.x; const dy = ci.y - cj.y; const d = Math.sqrt(dx * dx + dy * dy);
      if (d < minLabelDist) {
        const diff = (minLabelDist - d);
        labelOverlapPenalty += diff * diff;
      }
    }
  }

  const total = angleWeight * anglePenalty + lengthWeight * lengthPenalty + atomOverlapWeight * atomOverlapPenalty + labelOverlapWeight * labelOverlapPenalty;

  return {
    total,
    components: {
      angle: anglePenalty,
      length: lengthPenalty,
      atomOverlap: atomOverlapPenalty,
      labelOverlap: labelOverlapPenalty
    }
  };
}

export function computeLabelOffsets(
  svgCoords: Array<{ x: number; y: number }>,
  molecule: import('types').Molecule,
  atomsToShow: Set<number>,
  fontSize: number,
  bondLineWidth: number
): Map<number, { dx: number; dy: number }> {
  const offsets = new Map<number, { dx: number; dy: number }>();

  function bboxForLabel(idx: number, label: string) {
    const c = svgCoords[idx];
    if (!c) return { x: 0, y: 0, w: 0, h: 0 };
    const w = Math.max(8, label.length * fontSize * 0.6);
    const h = fontSize;
    return { x: c.x - w / 2, y: c.y - h / 2, w, h };
  }

  for (let i = 0; i < molecule.atoms.length; i++) offsets.set(i, { dx: 0, dy: 0 });

  const labels: { idx: number; label: string; box: { x: number; y: number; w: number; h: number } }[] = [];
  for (let i = 0; i < molecule.atoms.length; i++) {
    if (!atomsToShow.has(i)) continue;
    if (!svgCoords[i]) continue;
    const atom = molecule.atoms[i];
    if (!atom) continue;
    const label = atom.symbol;
    labels.push({ idx: i, label, box: bboxForLabel(i, label) });
  }

  const maxIter = 10;
  for (let iter = 0; iter < maxIter; iter++) {
    let moved = false;
    for (let a = 0; a < labels.length; a++) {
      for (let b = a + 1; b < labels.length; b++) {
        const A = labels[a];
        const B = labels[b];
        if (!A || !B) continue;
        const offA = offsets.get(A.idx);
        const offB = offsets.get(B.idx);
        if (!offA || !offB) continue;
        const ax = A.box.x + offA.dx;
        const ay = A.box.y + offA.dy;
        const bx = B.box.x + offB.dx;
        const by = B.box.y + offB.dy;
        if (ax < bx + B.box.w && ax + A.box.w > bx && ay < by + B.box.h && ay + A.box.h > by) {
          const acx = ax + A.box.w / 2;
          const acy = ay + A.box.h / 2;
          const bcx = bx + B.box.w / 2;
          const bcy = by + B.box.h / 2;
          let vx = bcx - acx;
          let vy = bcy - acy;
          const vlen = Math.sqrt(vx * vx + vy * vy) || 1;
          vx /= vlen; vy /= vlen;
          const push = Math.max(4, (A.box.w + B.box.w) / 8);
          offsets.set(B.idx, { dx: offB.dx + vx * push, dy: offB.dy + vy * push });
          moved = true;
        }
      }
    }
    if (!moved) break;
  }

  for (const L of labels) {
    const curr = offsets.get(L.idx) || { dx: 0, dy: 0 };
    const c = svgCoords[L.idx];
    if (!c) continue;

    const atomIdToIndex = new Map<number, number>();
    molecule.atoms.forEach((a, i) => atomIdToIndex.set(a.id, i));

    const lx = c.x + curr.dx;
    const ly = c.y + curr.dy;

    for (const bond of molecule.bonds) {
      const idxA = atomIdToIndex.get(bond.atom1 as number) ?? -1;
      const idxB = atomIdToIndex.get(bond.atom2 as number) ?? -1;
      if (idxA < 0 || idxB < 0) continue;
      const a = svgCoords[idxA];
      const b = svgCoords[idxB];
      if (!a || !b) continue;

      const vx = b.x - a.x;
      const vy = b.y - a.y;
      const segLen2 = vx * vx + vy * vy;
      if (segLen2 === 0) continue;
      const t = Math.max(0, Math.min(1, ((lx - a.x) * vx + (ly - a.y) * vy) / segLen2));
      const projX = a.x + vx * t;
      const projY = a.y + vy * t;
      const dx = lx - projX;
      const dy = ly - projY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const minDist = Math.max(fontSize * 0.6, bondLineWidth * 1.5);
      if (dist < minDist) {
        let px = dx / (dist || 1);
        let py = dy / (dist || 1);
        const push = (minDist - dist) + 4;
        const currOff = offsets.get(L.idx) || { dx: 0, dy: 0 };
        offsets.set(L.idx, { dx: currOff.dx + px * push, dy: currOff.dy + py * push });
      }
    }
  }

  return offsets;
}
