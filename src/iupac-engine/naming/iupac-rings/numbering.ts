import type { Molecule } from "types";
import { buildPerimeterFromRings } from "./utils";
import type { FusedSystem } from "./utils";
import {
  findMatchingFusionTemplate,
  parseFusionTemplate,
} from "./fusion-templates";

/**
 * Get numbering function using OPSIN-style templates
 */
export function getTemplateBasedNumberingFunction(
  baseName: string,
): (atomIdx: number, fusedSystem: FusedSystem, molecule: Molecule) => string {
  return (atomIdx, fusedSystem, molecule) => {
    // First, try generic template matching
    const template = findMatchingFusionTemplate(fusedSystem, molecule);
    if (template) {
      const parsed = parseFusionTemplate(template);
      if (parsed) {
        let perimeter = buildPerimeterFromRings(fusedSystem);
        // For indole, ensure N is at position 7 (locant 1)
        if (baseName === "indole") {
          const nIdx = perimeter.findIndex(
            (idx) => molecule.atoms[idx]?.symbol === "N",
          );
          if (nIdx !== -1) {
            // Rotate so that N is at position 7
            const targetPos = 7;
            const shift =
              (nIdx - targetPos + perimeter.length) % perimeter.length;
            perimeter = perimeter
              .slice(shift)
              .concat(perimeter.slice(0, shift));
          }
        }
        const pos = perimeter.indexOf(atomIdx);
        if (pos !== -1 && pos < parsed.template.labels.length) {
          return parsed.template.labels[pos] || (pos + 1).toString();
        }
      }
    }

    // Then try specific builders
    if (baseName && baseName.includes("naphthalene")) {
      const template = buildNaphthaleneTemplate(
        fusedSystem as FusedSystem,
        molecule,
      );
      if (template && template[atomIdx] !== undefined)
        return template[atomIdx].toString();
    }
    if (baseName && baseName.includes("anthracene")) {
      const template = buildAnthraceneTemplate(
        fusedSystem as FusedSystem,
        molecule,
      );
      if (template && template[atomIdx] !== undefined)
        return template[atomIdx].toString();
    }

    // Fallback to perimeter-based numbering
    const allAtoms = Array.from(new Set(fusedSystem.rings.flat())) as number[];
    const perimeter = buildPerimeterFromRings(fusedSystem);
    const pos = perimeter.indexOf(atomIdx);
    if (pos !== -1) return (pos + 1).toString();
    return (allAtoms.indexOf(atomIdx) + 1).toString();
  };
}

export function getNumberingFunction(
  baseName: string,
): (atomIdx: number, fusedSystem: FusedSystem, molecule: Molecule) => string {
  // Try template-based numbering first
  const templateFn = getTemplateBasedNumberingFunction(baseName);
  // For now, always use template-based if available, else fallback
  return templateFn;
}

export function numberNaphthalene(
  atomIdx: number,
  fusedSystem: FusedSystem,
  molecule: Molecule,
): string {
  // Use the template for canonical numbering
  const template = buildNaphthaleneTemplate(fusedSystem, molecule);
  if (template && template[atomIdx] !== undefined)
    return template[atomIdx].toString();
  // Fallback
  const allAtoms = Array.from(new Set(fusedSystem.rings.flat())) as number[];
  const perimeter = buildPerimeterFromRings(fusedSystem);
  const pos = perimeter.indexOf(atomIdx);
  if (pos !== -1) return (pos + 1).toString();
  return (allAtoms.indexOf(atomIdx) + 1).toString();
}

export function numberAnthracene(
  atomIdx: number,
  fusedSystem: FusedSystem,
  molecule: Molecule,
): string {
  // Use the template for canonical numbering
  const template = buildAnthraceneTemplate(fusedSystem, molecule);
  if (template && template[atomIdx] !== undefined)
    return template[atomIdx].toString();
  // Fallback to perimeter
  const allAtoms = Array.from(new Set(fusedSystem.rings.flat()));
  const perimeter = buildPerimeterFromRings(fusedSystem);
  const pos = perimeter.indexOf(atomIdx);
  if (pos !== -1) return (pos + 1).toString();
  return (allAtoms.indexOf(atomIdx) + 1).toString();
}

export function numberPhenanthrene(
  atomIdx: number,
  fusedSystem: FusedSystem,
  _molecule: Molecule,
): string {
  const allAtoms = Array.from(new Set(fusedSystem.rings.flat()));
  const perimeter = buildPerimeterFromRings(fusedSystem);
  const pos = perimeter.indexOf(atomIdx);
  if (pos !== -1) return (pos + 1).toString();
  return (allAtoms.indexOf(atomIdx) + 1).toString();
}

export function numberIndole(
  atomIdx: number,
  fusedSystem: FusedSystem,
  molecule: Molecule,
): string {
  // Build a canonical indole numbering mapping based on the five- and six-member rings.
  const rings: number[][] = fusedSystem.rings || [];
  // Helper: find shortest path between two atoms avoiding an optional exclude set
  const findShortestPath = (
    start: number,
    end: number,
    exclude = new Set<number>(),
  ): number[] | null => {
    const q: number[][] = [[start]];
    const seen = new Set<number>([start, ...Array.from(exclude)]);
    while (q.length) {
      const path = q.shift()!;
      const node = path[path.length - 1]!;
      if (node === end) return path;
      for (const b of molecule.bonds) {
        const nbr =
          b.atom1 === node ? b.atom2 : b.atom2 === node ? b.atom1 : -1;
        if (nbr >= 0 && !seen.has(nbr)) {
          seen.add(nbr);
          q.push(path.concat([nbr]));
        }
      }
    }
    return null;
  };
  // Prefer a small ring (<=5) that contains N
  let fiveMemberedRing = rings.find(
    (r: number[]) =>
      r.length <= 5 && r.some((idx) => molecule.atoms[idx]?.symbol === "N"),
  );
  const sixRing = rings.find(
    (r: number[]) => r !== fiveMemberedRing && r.length >= 6,
  );
  // If we couldn't find an explicit 5-membered ring (decomposition noisy), try to reconstruct
  // a 5-member cycle around N by finding a shortest path between the two carbon neighbours
  // of N that yields a 5-member cycle.
  if (!fiveMemberedRing) {
    // find N atom index
    const _nIdx =
      rings.flat().find((idx) => molecule.atoms[idx]?.symbol === "N") ?? null;
    // alternatively, search whole molecule for N in fused system atoms
    const possibleNs: number[] = [];
    for (const r of rings)
      for (const idx of r)
        if (molecule.atoms[idx]?.symbol === "N") possibleNs.push(idx);
    const chosenN = possibleNs[0];
    if (chosenN !== undefined) {
      // find carbon neighbors of chosenN
      const neighbors = molecule.bonds
        .reduce((acc: number[], b) => {
          if (b.atom1 === chosenN) acc.push(b.atom2);
          else if (b.atom2 === chosenN) acc.push(b.atom1);
          return acc;
        }, [])
        .filter((n) => molecule.atoms[n]?.symbol === "C");
      if (neighbors.length === 2) {
        const a = neighbors[0]!,
          b = neighbors[1]!;
        const path = findShortestPath(a, b, new Set([chosenN]));
        if (path && path.length === 4) {
          // path includes neighbors[0] .. neighbors[1] (4 nodes), add N to make 5
          fiveMemberedRing = [chosenN, ...path];
        }
      }
    }
  }
  if (fiveMemberedRing) {
    const nIdx = fiveMemberedRing.find(
      (idx: number) => molecule.atoms[idx]?.symbol === "N",
    );
    if (nIdx === undefined) return (atomIdx + 1).toString();
    // Ordered array as provided by ring finder.
    const five = fiveMemberedRing.slice();
    const len5 = five.length;
    const idxNPos = five.indexOf(nIdx);
    const idxA = (idxNPos + 1) % len5; // forward neighbor
    const idxB = (idxNPos - 1 + len5) % len5; // backward neighbor
    const neighF = five[idxA];
    const neighB = five[idxB];
    // determine which neighbor is closer to the six-ring fusion (shared atom)
    let shared: number[] = [];
    if (sixRing) shared = five.filter((a) => sixRing.includes(a));
    // choose direction that encounters a shared atom sooner
    const distToSharedF = (() => {
      for (let d = 1; d < len5; d++) {
        const cand = five[(idxNPos + d) % len5]!;
        if (shared.includes(cand)) return d;
      }
      return Infinity;
    })();
    const distToSharedB = (() => {
      for (let d = 1; d < len5; d++) {
        const cand = five[(idxNPos - d + len5) % len5]!;
        if (shared.includes(cand)) return d;
      }
      return Infinity;
    })();
    const forwardIsTowardShared = distToSharedF <= distToSharedB;
    const c2 = forwardIsTowardShared ? neighF : neighB; // position 2
    const c3 = forwardIsTowardShared
      ? five[(idxA + 1) % len5]!
      : five[(idxB - 1 + len5) % len5]!; // position 3

    // Now build benzene positions (4..7) from sixRing ordering between the shared atoms.
    const locantMap: Record<number, number> = {};
    locantMap[nIdx] = 1;
    if (c2 !== undefined) locantMap[c2] = 2;
    if (c3 !== undefined) locantMap[c3] = 3;

    if (sixRing && shared.length >= 2) {
      // find the shared atom that follows c3 when walking from N in chosen direction
      const sharedSet = new Set(shared);
      let sharedAfterC3: number | null = null;
      // walk forward from N to find the shared that comes after c3
      for (let d = 1; d < len5; d++) {
        const idx =
          five[(idxNPos + (forwardIsTowardShared ? d : -d) + len5) % len5]!;
        if (sharedSet.has(idx)) {
          sharedAfterC3 = idx;
          break;
        }
      }
      const otherShared = shared.find((s) => s !== sharedAfterC3) ?? shared[0];
      // order the six-ring starting at sharedAfterC3 and traverse to otherShared
      const six = sixRing.slice();
      const startIdx = six.indexOf(sharedAfterC3!);
      if (startIdx >= 0) {
        const seq: number[] = [];
        const len6 = six.length;
        for (let i = 1; i < len6; i++) {
          // collect atoms after sharedAfterC3 up to otherShared (exclude the sharedAfterC3 itself)
          const idx = six[(startIdx + i) % len6]!;
          if (idx === otherShared) break;
          seq.push(idx);
        }
        // seq should contain 4 atoms (the benzene carbons between the shared atoms)
        for (let i = 0; i < seq.length && i < 4; i++) {
          const sidx = seq[i];
          if (sidx !== undefined) locantMap[sidx] = 4 + i; // positions 4..7
        }
      }
    }

    if (locantMap[atomIdx] !== undefined) return locantMap[atomIdx].toString();
    // fallback: if atom is one of the shared atoms, map them to 3a/7a style -> approximate
    if (shared.length >= 2) {
      if (shared.includes(atomIdx)) {
        // map first shared to 3a (approx as 3) and second to 7a (approx as 7)
        if (atomIdx === shared[0]) return "3";
        return "7";
      }
    }
  }
  return (atomIdx + 1).toString();
}

export function numberBenzofuran(
  atomIdx: number,
  fusedSystem: FusedSystem,
  molecule: Molecule,
): string {
  const five = fusedSystem.rings.find((r: number[]) => r.length === 5);
  if (five) {
    const oIdx = five.find(
      (idx: number) => molecule.atoms[idx]?.symbol === "O",
    );
    if (oIdx !== undefined) return oIdx === atomIdx ? "1" : "2";
  }
  return (atomIdx + 1).toString();
}

export function numberBenzothiophene(
  atomIdx: number,
  fusedSystem: FusedSystem,
  molecule: Molecule,
): string {
  const five = fusedSystem.rings.find((r: number[]) => r.length === 5);
  if (five) {
    const sIdx = five.find(
      (idx: number) => molecule.atoms[idx]?.symbol === "S",
    );
    if (sIdx !== undefined) return "1";
  }
  return (atomIdx + 1).toString();
}

export function numberQuinoline(
  atomIdx: number,
  fusedSystem: FusedSystem,
  molecule: Molecule,
): string {
  const six = fusedSystem.rings.find((r: number[]) => r.length === 6);
  if (six) {
    const nIdx = six.find((idx: number) => molecule.atoms[idx]?.symbol === "N");
    if (nIdx !== undefined) return nIdx === atomIdx ? "1" : "2";
  }
  return (atomIdx + 1).toString();
}

export function numberIsoquinoline(
  atomIdx: number,
  fusedSystem: FusedSystem,
  molecule: Molecule,
): string {
  const six = fusedSystem.rings.find((r: number[]) => r.length === 6);
  if (six) {
    const nIdx = six.find((idx: number) => molecule.atoms[idx]?.symbol === "N");
    if (nIdx !== undefined) return nIdx === atomIdx ? "1" : "2";
  }
  return (atomIdx + 1).toString();
}

export function buildNaphthaleneTemplate(
  fusedSystem: FusedSystem,
  _molecule: Molecule,
): Record<number, number> | null {
  try {
    const perimeter = buildPerimeterFromRings(fusedSystem) as number[] | null;
    if (!perimeter || perimeter.length !== 10) return null;
    // find shared atoms (appear in both rings)
    const r0 = new Set((fusedSystem.rings && fusedSystem.rings[0]) || []);
    const r1 = new Set((fusedSystem.rings && fusedSystem.rings[1]) || []);
    const shared = [...r0].filter((x) => r1.has(x));
    if (shared.length !== 2) return null;
    // try both orientations and both directions
    for (const startShared of [shared[0], shared[1]]) {
      for (const reverse of [false, true]) {
        const perim = reverse ? perimeter.slice().reverse() : perimeter;
        const idx = perim.indexOf(startShared as number);
        if (idx === -1) continue;
        // rotation so startShared becomes locant 1
        const rot = perim.slice(idx).concat(perim.slice(0, idx));
        // check where the other shared lands
        const other = shared.find((s: number) => s !== startShared)! as number;
        const posOther = rot.indexOf(other as number);
        if (posOther === 7) {
          // build mapping: rot[i] -> i+1
          const map: Record<number, number> = {};
          for (let i = 0; i < rot.length; i++) {
            const atom = rot[i] as number | undefined;
            if (atom !== undefined) map[atom] = i + 1;
          }
          return map;
        }
      }
    }
    return null;
  } catch (_e) {
    return null;
  }
}

export function buildAnthraceneTemplate(
  fusedSystem: FusedSystem,
  _molecule: Molecule,
): Record<number, number> | null {
  try {
    const perimeter = buildPerimeterFromRings(fusedSystem) as number[] | null;
    if (!perimeter || perimeter.length !== 14) return null;
    // find the ring that is the middle ring (should be the ring whose atoms are shared with both others)
    const ringSets = (fusedSystem.rings || []).map((r: number[]) => new Set(r));
    // middle ring index is the one that shares atoms with both other rings
    let middleIdx = -1;
    for (let i = 0; i < ringSets.length; i++) {
      const s = ringSets[i] as Set<number>;
      const others = ringSets.filter(
        (_: Set<number>, j: number) => j !== i,
      ) as Set<number>[];
      const sharedWithAll = [...s].filter((a: number) =>
        others.every((o) => o.has(a)),
      );
      if (sharedWithAll.length >= 2) {
        middleIdx = i;
        break;
      }
    }
    if (middleIdx === -1) return null;
    const middle = (fusedSystem.rings && fusedSystem.rings[middleIdx]) || [];
    // find the two central atoms in the middle ring (not shared with outer rings)
    const outerAtoms = new Set<number>();
    for (let i = 0; i < ringSets.length; i++) {
      if (i !== middleIdx) {
        for (const a of ringSets[i]!) outerAtoms.add(a);
      }
    }
    const centralAtoms = middle.filter((a: number) => !outerAtoms.has(a));
    if (centralAtoms.length !== 2) return null;
    // attempt to find rotation where centralAtoms are at positions 9 and 10
    for (let start = 0; start < perimeter.length; start++) {
      const rot = perimeter.slice(start).concat(perimeter.slice(0, start));
      const a8 = rot[8] as number | undefined;
      const a9 = rot[9] as number | undefined;
      if (
        a8 !== undefined &&
        a9 !== undefined &&
        centralAtoms.includes(a8) &&
        centralAtoms.includes(a9)
      ) {
        const map: Record<number, number> = {};
        for (let i = 0; i < rot.length; i++) {
          const atom = rot[i] as number | undefined;
          if (atom !== undefined) map[atom] = i + 1;
        }
        return map;
      }
    }
    return null;
  } catch (_e) {
    return null;
  }
}
