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
    // Use specialized numbering functions for specific ring systems
    if (baseName === "quinoline" || baseName.includes("quinolin")) {
      return numberQuinoline(atomIdx, fusedSystem, molecule);
    }

    if (baseName === "indole" || baseName.includes("indol")) {
      return numberIndole(atomIdx, fusedSystem, molecule);
    }

    // Try generic template matching
    const template = findMatchingFusionTemplate(fusedSystem, molecule);
    if (template) {
      const parsed = parseFusionTemplate(template);
      if (parsed) {
        let perimeter = buildPerimeterFromRings(fusedSystem);

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

export function numberQuinoline(
  atomIdx: number,
  fusedSystem: FusedSystem,
  molecule: Molecule,
): string {
  const rings: number[][] = fusedSystem.rings || [];

  // Find the ring containing N (the nitrogen-containing 6-membered ring)
  const nRing = rings.find((r: number[]) =>
    r.some((idx) => molecule.atoms[idx]?.symbol === "N"),
  );

  if (!nRing) {
    return (atomIdx + 1).toString();
  }

  // Find N atom
  const nIdx = nRing.find((idx: number) => molecule.atoms[idx]?.symbol === "N");
  if (nIdx === undefined) {
    return (atomIdx + 1).toString();
  }

  // Find the benzene ring (the other 6-membered ring)
  const benzeneRing = rings.find((r: number[]) => r !== nRing && r.length >= 6);

  if (!benzeneRing) {
    return (atomIdx + 1).toString();
  }

  // Find shared atoms between the two rings (fusion points)
  const shared = nRing.filter((a) => benzeneRing.includes(a));

  if (shared.length !== 2) {
    return (atomIdx + 1).toString();
  }

  if (process.env.VERBOSE) {
    console.log("[numberQuinoline] N-ring:", nRing);
    console.log("[numberQuinoline] Benzene ring:", benzeneRing);
    console.log("[numberQuinoline] N index:", nIdx);
    console.log("[numberQuinoline] Shared atoms:", shared);
  }

  // Build the numbering map
  const locantMap: Record<number, number> = {};

  // Position 1 is N
  locantMap[nIdx] = 1;

  // Find N's neighbors in the ring
  const nNeighbors = molecule.bonds.reduce((acc: number[], b) => {
    if (b.atom1 === nIdx && nRing.includes(b.atom2)) acc.push(b.atom2);
    else if (b.atom2 === nIdx && nRing.includes(b.atom1)) acc.push(b.atom1);
    return acc;
  }, []);

  if (nNeighbors.length !== 2) {
    return (atomIdx + 1).toString();
  }

  if (process.env.VERBOSE) {
    console.log("[numberQuinoline] N neighbors:", nNeighbors);
  }

  // Determine which neighbor is position 2
  // Position 2 should be the one that IS a shared atom (fusion point)
  const [neighA, neighB] = nNeighbors;

  // Position 2 should be the neighbor that is NOT a shared atom
  // In quinoline numbering, we number the unique atoms (2, 3, 4) before hitting the fusion
  let pos2: number;

  if (!shared.includes(neighA!)) {
    pos2 = neighA!;
  } else if (!shared.includes(neighB!)) {
    pos2 = neighB!;
  } else {
    // Neither neighbor is shared - this shouldn't happen for quinoline
    // Fall back to choosing based on distance to shared atoms
    const distA = (() => {
      if (shared.includes(neighA!)) return 0;
      const visited = new Set<number>([nIdx]);
      let current = [neighA!];
      let dist = 1;
      while (current.length > 0 && dist < 10) {
        for (const c of current) {
          if (shared.includes(c)) return dist;
          visited.add(c);
        }
        const next: number[] = [];
        for (const c of current) {
          for (const b of molecule.bonds) {
            const nbr = b.atom1 === c ? b.atom2 : b.atom2 === c ? b.atom1 : -1;
            if (nbr >= 0 && nRing.includes(nbr) && !visited.has(nbr)) {
              next.push(nbr);
            }
          }
        }
        current = next;
        dist++;
      }
      return Infinity;
    })();

    const distB = (() => {
      if (shared.includes(neighB!)) return 0;
      const visited = new Set<number>([nIdx]);
      let current = [neighB!];
      let dist = 1;
      while (current.length > 0 && dist < 10) {
        for (const c of current) {
          if (shared.includes(c)) return dist;
          visited.add(c);
        }
        const next: number[] = [];
        for (const c of current) {
          for (const b of molecule.bonds) {
            const nbr = b.atom1 === c ? b.atom2 : b.atom2 === c ? b.atom1 : -1;
            if (nbr >= 0 && nRing.includes(nbr) && !visited.has(nbr)) {
              next.push(nbr);
            }
          }
        }
        current = next;
        dist++;
      }
      return Infinity;
    })();

    pos2 = distA <= distB ? neighA! : neighB!;
  }

  if (process.env.VERBOSE) {
    console.log("[numberQuinoline] Position 2:", pos2);
  }

  locantMap[pos2] = 2;

  // Walk the ring to assign positions 3, 4
  const visited = new Set<number>([nIdx, pos2]);
  let current = pos2;
  let position = 3;

  while (position <= 4) {
    // Find next atom in the ring
    const next = molecule.bonds.reduce((acc: number[], b) => {
      if (
        b.atom1 === current &&
        nRing.includes(b.atom2) &&
        !visited.has(b.atom2)
      ) {
        acc.push(b.atom2);
      } else if (
        b.atom2 === current &&
        nRing.includes(b.atom1) &&
        !visited.has(b.atom1)
      ) {
        acc.push(b.atom1);
      }
      return acc;
    }, [])[0];

    if (next === undefined) break;

    if (process.env.VERBOSE) {
      console.log(`[numberQuinoline] Position ${position}: atom ${next}`);
    }

    locantMap[next] = position;
    visited.add(next);
    current = next;
    position++;
  }

  // Now handle the benzene ring (positions 5, 6, 7, 8)
  // Find which shared atom comes after position 4
  const sharedAfter4 =
    shared.find((s) => locantMap[s] === undefined) ?? shared[0];
  const otherShared = shared.find((s) => s !== sharedAfter4) ?? shared[1];

  if (sharedAfter4 !== undefined && otherShared !== undefined) {
    // Assign 4a and 8a to shared atoms
    locantMap[sharedAfter4] = 4.5; // represents "4a"
    locantMap[otherShared] = 8.5; // represents "8a"

    if (process.env.VERBOSE) {
      console.log("[numberQuinoline] sharedAfter4 (4a):", sharedAfter4);
      console.log("[numberQuinoline] otherShared (8a):", otherShared);
    }

    // Walk the benzene ring from sharedAfter4 (4a) to otherShared (8a)
    // This ensures correct numbering direction: 5, 6, 7, 8
    const benzVisited = new Set<number>([sharedAfter4, otherShared]);
    let benzCurrent = sharedAfter4;
    let benzPos = 5;

    while (benzPos <= 8) {
      const next = molecule.bonds.reduce((acc: number[], b) => {
        if (
          b.atom1 === benzCurrent &&
          benzeneRing.includes(b.atom2) &&
          !benzVisited.has(b.atom2)
        ) {
          acc.push(b.atom2);
        } else if (
          b.atom2 === benzCurrent &&
          benzeneRing.includes(b.atom1) &&
          !benzVisited.has(b.atom1)
        ) {
          acc.push(b.atom1);
        }
        return acc;
      }, [])[0];

      if (next === undefined || next === otherShared) break;

      if (process.env.VERBOSE) {
        console.log(`[numberQuinoline] Position ${benzPos}: atom ${next}`);
      }

      locantMap[next] = benzPos;
      benzVisited.add(next);
      benzCurrent = next;
      benzPos++;
    }
  }

  // Return the locant for the requested atom
  if (locantMap[atomIdx] !== undefined) {
    const pos = locantMap[atomIdx];
    if (pos === 4.5) return "4a";
    if (pos === 8.5) return "8a";
    return pos.toString();
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
