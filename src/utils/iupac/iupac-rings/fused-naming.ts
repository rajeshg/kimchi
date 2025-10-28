import type { Molecule } from 'types';
import { matchSMARTS } from 'src/matchers/smarts-matcher';
import { isRingAromatic } from './aromatic-naming';
import { findHeteroatomsInRing, buildPerimeterFromRings } from './utils';

export function identifyPolycyclicPattern(rings: number[][], molecule: Molecule): string | null {
  const allRingsAromatic = rings.every(r => isRingAromatic(r, molecule));
  const ringCount = rings.length;
  const ringSizes = rings.map(r => r.length).sort((a, b) => a - b);
  const allRingAtoms = new Set<number>();
  for (const ring of rings) for (const atomIdx of ring) allRingAtoms.add(atomIdx);
  const ringAtoms = Array.from(allRingAtoms).map(idx => molecule.atoms[idx]).filter((a): a is typeof molecule.atoms[0] => a !== undefined);
  const heteroAtoms = findHeteroatomsInRing(Array.from(allRingAtoms), molecule);

  // Quick SMARTS-based detection for common fused heterocycles (robust to ring decomposition differences)
  try {
    // Try several SMARTS variants to be robust to aromatic flags / parser differences
    const indoleSmarts = ['c1ccc2c(c1)[nH]c2', 'c1ccc2[nH]cc2c1', 'c1ccc2[n]cc2c1', 'n1cc2ccccc2c1'];
    const benzofuranSmarts = ['c1ccc2oc(c1)c2', 'c1ccc2[o]c(c1)c2', 'o1ccc2ccccc2c1'];
    const benzothioSmarts = ['c1ccc2sc(c1)c2', 'c1ccc2[s]c(c1)c2', 's1ccc2ccccc2c1'];
    if (indoleSmarts.some(s => { try { return matchSMARTS(s, molecule).success; } catch { return false; } })) return 'indole';
    if (benzofuranSmarts.some(s => { try { return matchSMARTS(s, molecule).success; } catch { return false; } })) return 'benzofuran';
    if (benzothioSmarts.some(s => { try { return matchSMARTS(s, molecule).success; } catch { return false; } })) return 'benzothiophene';
  } catch {
    // ignore SMARTS errors and continue with structural heuristics
  }

  // Check for heterocyclic fused systems first (regardless of aromaticity)
  // Heuristic: detect indole-like fused 5+6 systems even if ring decomposition is noisy
  for (let atomIdx = 0; atomIdx < molecule.atoms.length; atomIdx++) {
    const atom = molecule.atoms[atomIdx];
    if (!atom) continue;
    if (atom.symbol === 'N') {
      // neighbors
      const neighbors = molecule.bonds.reduce((acc: number[], b) => {
        if (b.atom1 === atomIdx) acc.push(b.atom2);
        else if (b.atom2 === atomIdx) acc.push(b.atom1);
        return acc;
      }, []);
      if (neighbors.length === 2 && neighbors.every(n => molecule.atoms[n]?.symbol === 'C')) {
        // look for rings that include N or its neighbors
        const ringsWithN = rings.filter(r => r.includes(atomIdx));
        const ringsWithNeighbors = rings.filter(r => r.some(a => neighbors.includes(a)));
        if (ringsWithN.length > 0 && ringsWithNeighbors.length > 0) {
          const sizes = [...new Set(ringsWithN.concat(ringsWithNeighbors).map(r => r.length))];
          if (sizes.includes(5) && sizes.includes(6)) return 'indole';
          // fallback: decomposition sometimes yields 4+7 for a 5+6 system
          if (sizes.includes(4) && sizes.includes(7)) return 'indole';
        }
      }
    }

    // Additional heuristic: even when decomposition yields two six-membered rings,
    // we may still have an indole if there exists a 5-membered cycle around an N
    // when walking between its two carbon neighbours. Try reconstructing a 5-cycle.
    if (molecule.atoms.some(a => a.symbol === 'N')) {
      for (let atomIdx2 = 0; atomIdx2 < molecule.atoms.length; atomIdx2++) {
        const atom2 = molecule.atoms[atomIdx2];
        if (!atom2 || atom2.symbol !== 'N') continue;
        const neighbors2 = molecule.bonds.reduce((acc: number[], b) => {
          if (b.atom1 === atomIdx2) acc.push(b.atom2);
          else if (b.atom2 === atomIdx2) acc.push(b.atom1);
          return acc;
        }, []).filter(n => molecule.atoms[n]?.symbol === 'C');
        if (neighbors2.length === 2) {
          const a = neighbors2[0]!, b = neighbors2[1]!;
          // BFS shortest path excluding the N atom
          const q: number[][] = [[a]];
          const seen = new Set<number>([a, atomIdx2]);
          while (q.length) {
            const p = q.shift()!;
            const node = p[p.length-1]!;
            if (node === b && p.length === 4) return 'indole';
            for (const bo of molecule.bonds) {
              const nbr = bo.atom1 === node ? bo.atom2 : (bo.atom2 === node ? bo.atom1 : -1);
              if (nbr >= 0 && !seen.has(nbr)) { seen.add(nbr); q.push(p.concat([nbr])); }
            }
          }
        }
      }
    }

    // Additional structural heuristic: if decomposition produced odd ring sizes
    // (like 4+7) but we can find a 5-membered cycle containing an N by checking
    // for a ring-like neighborhood (N connected to two carbons that are part of
    // a shared larger ring), prefer indole. This helps when ring decomposition
    // split a 5-member ring.
    for (const r1 of rings) {
      const nIdx = r1.find(idx => molecule.atoms[idx]?.symbol === 'N');
      if (nIdx === undefined) continue;
      for (const r2 of rings) {
        if (r2 === r1) continue;
        const shared = r1.filter(a => r2.includes(a));
        // if the two rings share two atoms and one of them is aromatic carbon-rich,
        // it's likely an indole-like 5+6 fusion even if sizes got distorted
        if (shared.length >= 2) {
          const r1HasN = r1.some(idx => molecule.atoms[idx]?.symbol === 'N');
          const r2Carbons = r2.filter(idx => molecule.atoms[idx]?.symbol === 'C').length;
          if (r1HasN && r2Carbons >= 5) return 'indole';
        }
      }
    }
  }

  if (ringCount === 2 && ringSizes.includes(5) && ringSizes.includes(6)) {
    const nCount = heteroAtoms.filter(a => a.symbol === 'N').length;
    const oCount = heteroAtoms.filter(a => a.symbol === 'O').length;
    const sCount = heteroAtoms.filter(a => a.symbol === 'S').length;

    if (nCount === 1 && oCount === 0 && sCount === 0) {
      // Check if N is in 5-membered ring
      const fiveRing = rings.find(r => r.length === 5);
      if (fiveRing && fiveRing.some(idx => molecule.atoms[idx]?.symbol === 'N')) {
        return 'indole';
      }
    }
    if (oCount === 1 && nCount === 0 && sCount === 0) {
      const fiveRing = rings.find(r => r.length === 5);
      if (fiveRing && fiveRing.some(idx => molecule.atoms[idx]?.symbol === 'O')) {
        return 'benzofuran';
      }
    }
    if (sCount === 1 && nCount === 0 && oCount === 0) {
      const fiveRing = rings.find(r => r.length === 5);
      if (fiveRing && fiveRing.some(idx => molecule.atoms[idx]?.symbol === 'S')) {
        return 'benzothiophene';
      }
    }
  }

  // Only check aromatic polycyclic systems if not heterocyclic
  if (!allRingsAromatic) return null;

  if (ringCount === 2 && ringSizes.every(s => s === 6) && heteroAtoms.length === 0) {
    // Distinguish fused naphthalene (rings share atoms) from biphenyl
    const r1 = rings[0]!;
    const r2 = rings[1]!;
    const shared = r1.filter(idx => r2.includes(idx));
    if (shared.length === 0) {
      // Disjoint aromatic rings connected by a single bond -> biphenyl
      return 'biphenyl';
    }
    return 'naphthalene';
  }
  if (ringCount === 3 && ringSizes.every(s => s === 6) && heteroAtoms.length === 0) {
    const sharedAtoms = rings.map((ring: number[], i: number) => {
      if (i === rings.length - 1) return [] as number[];
      return ring.filter((idx: number) => (rings[i + 1] ?? []).includes(idx));
    });
    if (sharedAtoms.every(arr => arr.length === 2)) return 'anthracene';
    else return 'phenanthrene';
  }
  // Fallback: some decompositions produce non-6 rings for phenanthrene-like structures.
  if (ringCount === 3 && heteroAtoms.length === 0) {
    const totalRingAtomCount = Array.from(new Set(rings.flat())).length;
    // Phenanthrene has 14 carbons in the fused ring system
    if (totalRingAtomCount === 14 && ringAtoms.every(a => a.symbol === 'C' && a.aromatic === true)) return 'phenanthrene';
  }
  if (ringCount === 2 && ringSizes.includes(5) && ringSizes.includes(7) && heteroAtoms.length === 0) return 'azulene';
  if (ringCount === 4 && ringSizes.every(size => size === 6) && heteroAtoms.length === 0) return 'pyrene';

  return null;
}

export function identifyAdvancedFusedPattern(rings: number[][], molecule: Molecule): string | null {
  const allRingAtoms = new Set<number>();
  for (const ring of rings) for (const atomIdx of ring) allRingAtoms.add(atomIdx);
  const ringAtoms = Array.from(allRingAtoms).map(idx => molecule.atoms[idx]).filter((a): a is typeof molecule.atoms[0] => a !== undefined);
  const heteroAtoms = findHeteroatomsInRing(Array.from(allRingAtoms), molecule);
  const ringCount = rings.length;
  const ringSizes = rings.map(r => r.length).sort((a, b) => a - b);
  // Heuristic: try to reconstruct a 5-membered cycle around an N atom even if
  // decomposition produced noisy ring sizes. This helps detect indole when
  // ring finder returned 6+4 or other artifacts.
  for (let atomIdx = 0; atomIdx < molecule.atoms.length; atomIdx++) {
    const atom = molecule.atoms[atomIdx];
    if (!atom || atom.symbol !== 'N') continue;
    const neighbors = molecule.bonds.reduce((acc: number[], b) => {
      if (b.atom1 === atomIdx) acc.push(b.atom2);
      else if (b.atom2 === atomIdx) acc.push(b.atom1);
      return acc;
    }, []).filter(n => molecule.atoms[n]?.symbol === 'C');
    if (neighbors.length !== 2) continue;
    const a = neighbors[0]!, b = neighbors[1]!;
    // BFS shortest path excluding the N atom
    const q: number[][] = [[a]];
    const seen = new Set<number>([a, atomIdx]);
    while (q.length) {
      const p = q.shift()!;
      const node = p[p.length-1]!;
      if (node === b && p.length === 4) return 'indole';
      for (const bo of molecule.bonds) {
        const nbr = bo.atom1 === node ? bo.atom2 : (bo.atom2 === node ? bo.atom1 : -1);
        if (nbr >= 0 && !seen.has(nbr)) { seen.add(nbr); q.push(p.concat([nbr])); }
      }
    }
  }
  if (ringCount === 2 && ringSizes.includes(5) && ringSizes.includes(6)) {
    // More deterministic detection: locate 5- and 6-member rings explicitly
    const fiveRing = rings.find((r: number[]) => r.length === 5);
    const sixRing = rings.find((r: number[]) => r.length === 6);
    if (fiveRing) {
      const nIdx = fiveRing.find((idx: number) => molecule.atoms[idx]?.symbol === 'N');
      const oIdx = fiveRing.find((idx: number) => molecule.atoms[idx]?.symbol === 'O');
      const sIdx = fiveRing.find((idx: number) => molecule.atoms[idx]?.symbol === 'S');
      if (nIdx !== undefined) return 'indole';
      if (oIdx !== undefined) return 'benzofuran';
      if (sIdx !== undefined) return 'benzothiophene';
    }
    // If the heteroatom is in the six-membered ring, prefer quinoline/isoquinoline
    // but prefer indole if any small ring (<=5) contains the nitrogen - this
    // avoids misclassifying noisy decompositions (where a 5-member ring was
    // split into 6 or 4+7 fragments) as quinolines when the N is actually in
    // the smaller heterocycle.
    if (sixRing) {
      const nIdx6 = sixRing.find((idx: number) => molecule.atoms[idx]?.symbol === 'N');
      const smallRingWithN = rings.find((r: number[]) => r.length <= 5 && r.some(idx => molecule.atoms[idx]?.symbol === 'N'));
      if (smallRingWithN) return 'indole';
      if (nIdx6 !== undefined) return 'quinoline';
    }
    // Additional check: if there's a 5-membered ring with N, prefer indole
    if (fiveRing && fiveRing.some(idx => molecule.atoms[idx]?.symbol === 'N')) return 'indole';
  }
  if (ringCount === 2 && ringSizes.includes(5) && ringSizes.includes(6)) {
    const nCount = ringAtoms.filter(a => a.symbol === 'N').length;
    if (nCount === 2) return 'imidazopyridine';
  }
  return null;
}

