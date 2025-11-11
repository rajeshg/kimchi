import type { Molecule } from "types";
import { matchSMARTS } from "src/matchers/smarts-matcher";
import { isRingAromatic } from "./aromatic-naming";
import { findHeteroatomsInRing } from "./utils";

export function identifyPolycyclicPattern(
  rings: number[][],
  molecule: Molecule,
): string | null {
  // For complex polycyclic systems (SSSR rank ≥ 4), skip simple aromatic
  // heterocycle naming (indole, benzofuran, etc.) and allow von Baeyer
  // bridged nomenclature to handle them. Only apply aromatic heterocycle
  // naming for simpler bicyclic and tricyclic systems.
  const allRingAtoms = new Set<number>();
  for (const ring of rings)
    for (const atomIdx of ring) allRingAtoms.add(atomIdx);

  let ringBonds = 0;
  for (const bond of molecule.bonds) {
    if (allRingAtoms.has(bond.atom1) && allRingAtoms.has(bond.atom2)) {
      ringBonds++;
    }
  }
  const sssrRank = ringBonds - allRingAtoms.size + 1;

  // Skip aromatic heterocycle naming for complex polycyclic systems
  if (sssrRank >= 4) {
    return null;
  }

  // Be tolerant to imperfect aromatic flags from ring perception:
  // consider a ring aromatic if our strict isRingAromatic says so, or if
  // a large fraction of atoms in the ring have atom.aromatic === true.
  const perRingAromatic = rings.map((r) => {
    const strict = isRingAromatic(r, molecule);
    if (strict) return true;
    // fall back: count aromatic atoms
    const aroCount = r.filter(
      (idx) => molecule.atoms[idx]?.aromatic === true,
    ).length;
    return aroCount >= Math.floor(r.length / 2);
  });
  const _allRingsAromatic = perRingAromatic.every(Boolean);
  const ringCount = rings.length;
  const ringSizes = rings.map((r) => r.length).sort((a, b) => a - b);
  const ringAtoms = Array.from(allRingAtoms)
    .map((idx) => molecule.atoms[idx])
    .filter((a): a is (typeof molecule.atoms)[0] => a !== undefined);
  const heteroAtoms = findHeteroatomsInRing(Array.from(allRingAtoms), molecule);

  // Quick SMARTS-based detection for common fused heterocycles (robust to ring decomposition differences)
  try {
    // Try several SMARTS variants to be robust to aromatic flags / parser differences
    const indoleSmarts = [
      "c1ccc2c(c1)[nH]c2",
      "c1ccc2[nH]cc2c1",
      "c1ccc2[n]cc2c1",
      "n1cc2ccccc2c1",
    ];
    const benzofuranSmarts = [
      "c1ccc2oc(c1)c2",
      "c1ccc2[o]c(c1)c2",
      "o1ccc2ccccc2c1",
    ];
    const benzothioSmarts = [
      "c1ccc2sc(c1)c2",
      "c1ccc2[s]c(c1)c2",
      "s1ccc2ccccc2c1",
    ];
    if (
      indoleSmarts.some((s) => {
        try {
          return matchSMARTS(s, molecule).success;
        } catch {
          return false;
        }
      })
    )
      return "indole";
    if (
      benzofuranSmarts.some((s) => {
        try {
          return matchSMARTS(s, molecule).success;
        } catch {
          return false;
        }
      })
    )
      return "benzofuran";
    if (
      benzothioSmarts.some((s) => {
        try {
          return matchSMARTS(s, molecule).success;
        } catch {
          return false;
        }
      })
    )
      return "benzothiophene";
  } catch {
    // ignore SMARTS errors and continue with structural heuristics
  }

  // Check for heterocyclic fused systems first (regardless of aromaticity)
  // Heuristic: detect indole-like fused 5+6 systems even if ring decomposition is noisy
  for (let atomIdx = 0; atomIdx < molecule.atoms.length; atomIdx++) {
    const atom = molecule.atoms[atomIdx];
    if (!atom) continue;
    if (atom.symbol === "N") {
      // neighbors
      const neighbors = molecule.bonds.reduce((acc: number[], b) => {
        if (b.atom1 === atomIdx) acc.push(b.atom2);
        else if (b.atom2 === atomIdx) acc.push(b.atom1);
        return acc;
      }, []);
      if (
        neighbors.length === 2 &&
        neighbors.every((n) => molecule.atoms[n]?.symbol === "C")
      ) {
        // look for rings that include N or its neighbors
        const ringsWithN = rings.filter((r) => r.includes(atomIdx));
        const ringsWithNeighbors = rings.filter((r) =>
          r.some((a) => neighbors.includes(a)),
        );
        if (ringsWithN.length > 0 && ringsWithNeighbors.length > 0) {
          const sizes = [
            ...new Set(
              ringsWithN.concat(ringsWithNeighbors).map((r) => r.length),
            ),
          ];
          if (sizes.includes(5) && sizes.includes(6)) return "indole";
          // fallback: decomposition sometimes yields 4+7 for a 5+6 system
          if (sizes.includes(4) && sizes.includes(7)) return "indole";
        }
      }
    }

    // Additional heuristic: even when decomposition yields two six-membered rings,
    // we may still have an indole if there exists a 5-membered cycle around an N
    // when walking between its two carbon neighbours. Try reconstructing a 5-cycle.
    if (molecule.atoms.some((a) => a.symbol === "N")) {
      for (let atomIdx2 = 0; atomIdx2 < molecule.atoms.length; atomIdx2++) {
        const atom2 = molecule.atoms[atomIdx2];
        if (!atom2 || atom2.symbol !== "N") continue;
        const neighbors2 = molecule.bonds
          .reduce((acc: number[], b) => {
            if (b.atom1 === atomIdx2) acc.push(b.atom2);
            else if (b.atom2 === atomIdx2) acc.push(b.atom1);
            return acc;
          }, [])
          .filter((n) => molecule.atoms[n]?.symbol === "C");
        if (neighbors2.length === 2) {
          const a = neighbors2[0]!,
            b = neighbors2[1]!;
          // BFS shortest path excluding the N atom
          const q: number[][] = [[a]];
          const seen = new Set<number>([a, atomIdx2]);
          while (q.length) {
            const p = q.shift()!;
            const node = p[p.length - 1]!;
            if (node === b && p.length === 4) return "indole";
            for (const bo of molecule.bonds) {
              const nbr =
                bo.atom1 === node
                  ? bo.atom2
                  : bo.atom2 === node
                    ? bo.atom1
                    : -1;
              if (nbr >= 0 && !seen.has(nbr)) {
                seen.add(nbr);
                q.push(p.concat([nbr]));
              }
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
      const nIdx = r1.find((idx) => molecule.atoms[idx]?.symbol === "N");
      if (nIdx === undefined) continue;
      for (const r2 of rings) {
        if (r2 === r1) continue;
        const shared = r1.filter((a) => r2.includes(a));
        // if the two rings share two atoms and one of them is aromatic carbon-rich,
        // it's likely an indole-like 5+6 fusion even if sizes got distorted
        if (shared.length >= 2) {
          const r1HasN = r1.some((idx) => molecule.atoms[idx]?.symbol === "N");
          const r2Carbons = r2.filter(
            (idx) => molecule.atoms[idx]?.symbol === "C",
          ).length;
          if (r1HasN && r2Carbons >= 5) return "indole";
        }
      }
    }
  }

  if (ringCount === 2 && ringSizes.includes(5) && ringSizes.includes(6)) {
    const nCount = heteroAtoms.filter((a) => a.symbol === "N").length;
    const oCount = heteroAtoms.filter((a) => a.symbol === "O").length;
    const sCount = heteroAtoms.filter((a) => a.symbol === "S").length;

    if (nCount === 1 && oCount === 0 && sCount === 0) {
      // Check if N is in 5-membered ring
      const fiveRing = rings.find((r) => r.length === 5);
      if (
        fiveRing &&
        fiveRing.some((idx) => molecule.atoms[idx]?.symbol === "N")
      ) {
        return "indole";
      }
    }
    if (oCount === 1 && nCount === 0 && sCount === 0) {
      const fiveRing = rings.find((r) => r.length === 5);
      if (
        fiveRing &&
        fiveRing.some((idx) => molecule.atoms[idx]?.symbol === "O")
      ) {
        return "benzofuran";
      }
    }
    if (sCount === 1 && nCount === 0 && oCount === 0) {
      const fiveRing = rings.find((r) => r.length === 5);
      if (
        fiveRing &&
        fiveRing.some((idx) => molecule.atoms[idx]?.symbol === "S")
      ) {
        return "benzothiophene";
      }
    }
  }

  // Only check aromatic polycyclic systems if not heterocyclic
  // but allow a tolerant match when most rings look aromatic
  const aromaticRingCount = perRingAromatic.filter(Boolean).length;
  if (aromaticRingCount === 0) return null;

  if (
    ringCount === 2 &&
    ringSizes.every((s) => s === 6) &&
    heteroAtoms.length === 0
  ) {
    // Distinguish fused naphthalene (rings share atoms) from biphenyl
    const r1 = rings[0]!;
    const r2 = rings[1]!;
    const shared = r1.filter((idx) => r2.includes(idx));
    if (shared.length === 0) {
      // Disjoint aromatic rings connected by a single bond -> biphenyl
      // require both rings to be clearly aromatic for biphenyl label
      if (perRingAromatic[0] && perRingAromatic[1]) return "biphenyl";
      return null;
    }
    // If at least one ring is aromatic (tolerant), declare naphthalene
    if (perRingAromatic[0] || perRingAromatic[1]) return "naphthalene";
    return null;
  }
  if (
    ringCount === 3 &&
    ringSizes.every((s) => s === 6) &&
    heteroAtoms.length === 0
  ) {
    const sharedAtoms = rings.map((ring: number[], i: number) => {
      if (i === rings.length - 1) return [] as number[];
      return ring.filter((idx: number) => (rings[i + 1] ?? []).includes(idx));
    });
    // If at least two rings are aromatic (tolerant) and adjacency matches linear pattern
    if (aromaticRingCount >= 2 && sharedAtoms.every((arr) => arr.length === 2))
      return "anthracene";
    // If most ring atoms are aromatic and counts match phenanthrene-like topology
    if (aromaticRingCount >= 2) return "phenanthrene";
    return null;
  }
  // Fallback: some decompositions produce non-6 rings for phenanthrene-like structures.
  if (ringCount === 3 && heteroAtoms.length === 0) {
    const totalRingAtomCount = Array.from(new Set(rings.flat())).length;
    // Phenanthrene has 14 carbons in the fused ring system; allow tolerant aromatic check
    const aromaticAtomCount = ringAtoms.filter(
      (a) => a.aromatic === true,
    ).length;
    if (
      totalRingAtomCount === 14 &&
      aromaticAtomCount >= Math.floor(ringAtoms.length * 0.7)
    )
      return "phenanthrene";
  }
  if (
    ringCount === 2 &&
    ringSizes.includes(5) &&
    ringSizes.includes(7) &&
    heteroAtoms.length === 0
  )
    return "azulene";
  if (
    ringCount === 4 &&
    ringSizes.every((size) => size === 6) &&
    heteroAtoms.length === 0
  )
    return "pyrene";

  // Conservative fallback: sometimes SSSR returns non-6 ring sizes for linear/angled
  // three-ring systems (anthracene/phenanthrene). If the fused region contains
  // ~14 distinct carbon atoms and the majority are aromatic, try to map to
  // anthracene/phenanthrene by adjacency topology.
  if (ringCount === 3 && heteroAtoms.length === 0) {
    const distinctAtomCount = Array.from(new Set(rings.flat())).length;
    const aromaticAtomCount = ringAtoms.filter(
      (a) => a.aromatic === true,
    ).length;
    if (
      distinctAtomCount >= 12 &&
      distinctAtomCount <= 16 &&
      aromaticAtomCount >= Math.floor(ringAtoms.length * 0.6)
    ) {
      // Build adjacency: rings adjacent if they share >=2 atoms
      const edges: [number, number][] = [];
      for (let i = 0; i < rings.length; i++) {
        for (let j = i + 1; j < rings.length; j++) {
          const shared = rings[i]!.filter((x) => rings[j]!.includes(x)).length;
          if (shared >= 2) edges.push([i, j]);
        }
      }
      if (edges.length === 2) {
        const deg = [0, 0, 0];
        edges.forEach(([a, b]) => {
          deg[a] = (deg[a] ?? 0) + 1;
          deg[b] = (deg[b] ?? 0) + 1;
        });
        if (deg[0] === 1 && deg[1] === 2 && deg[2] === 1) return "anthracene";
        return "phenanthrene";
      }
    }
  }

  return null;
}

export function identifyAdvancedFusedPattern(
  rings: number[][],
  molecule: Molecule,
): string | null {
  const allRingAtoms = new Set<number>();
  for (const ring of rings)
    for (const atomIdx of ring) allRingAtoms.add(atomIdx);
  const ringAtoms = Array.from(allRingAtoms)
    .map((idx) => molecule.atoms[idx])
    .filter((a): a is (typeof molecule.atoms)[0] => a !== undefined);
  const _heteroAtoms = findHeteroatomsInRing(
    Array.from(allRingAtoms),
    molecule,
  );
  const ringCount = rings.length;
  const ringSizes = rings.map((r) => r.length).sort((a, b) => a - b);

  // Check if rings are truly fused (share atoms) vs just connected
  const areRingsFused =
    rings.length >= 2 &&
    rings.some((r1, i) =>
      rings.slice(i + 1).some((r2) => r1.some((atom) => r2.includes(atom))),
    );

  // Heuristic: try to reconstruct a 5-membered cycle around an N atom even if
  // decomposition produced noisy ring sizes. This helps detect indole when
  // ring finder returned 6+4 or other artifacts.
  // ONLY apply this heuristic if rings are actually fused (not just connected)
  if (areRingsFused) {
    for (let atomIdx = 0; atomIdx < molecule.atoms.length; atomIdx++) {
      const atom = molecule.atoms[atomIdx];
      if (!atom || atom.symbol !== "N") continue;
      const neighbors = molecule.bonds
        .reduce((acc: number[], b) => {
          if (b.atom1 === atomIdx) acc.push(b.atom2);
          else if (b.atom2 === atomIdx) acc.push(b.atom1);
          return acc;
        }, [])
        .filter((n) => molecule.atoms[n]?.symbol === "C");
      if (neighbors.length !== 2) continue;
      const a = neighbors[0]!,
        b = neighbors[1]!;
      // BFS shortest path excluding the N atom
      const q: number[][] = [[a]];
      const seen = new Set<number>([a, atomIdx]);
      while (q.length) {
        const p = q.shift()!;
        const node = p[p.length - 1]!;
        if (node === b && p.length === 4) return "indole";
        for (const bo of molecule.bonds) {
          const nbr =
            bo.atom1 === node ? bo.atom2 : bo.atom2 === node ? bo.atom1 : -1;
          if (nbr >= 0 && !seen.has(nbr)) {
            seen.add(nbr);
            q.push(p.concat([nbr]));
          }
        }
      }
    }
  }
  // Only apply these heuristics if rings are actually fused (share atoms)
  if (
    areRingsFused &&
    ringCount === 2 &&
    ringSizes.includes(5) &&
    ringSizes.includes(6)
  ) {
    // More deterministic detection: locate 5- and 6-member rings explicitly
    const fiveRing = rings.find((r: number[]) => r.length === 5);
    const sixRing = rings.find((r: number[]) => r.length === 6);
    if (fiveRing) {
      const nIdx = fiveRing.find(
        (idx: number) => molecule.atoms[idx]?.symbol === "N",
      );
      const oIdx = fiveRing.find(
        (idx: number) => molecule.atoms[idx]?.symbol === "O",
      );
      const sIdx = fiveRing.find(
        (idx: number) => molecule.atoms[idx]?.symbol === "S",
      );
      if (nIdx !== undefined) return "indole";
      if (oIdx !== undefined) return "benzofuran";
      if (sIdx !== undefined) return "benzothiophene";
    }
    // If the heteroatom is in the six-membered ring, prefer quinoline/isoquinoline
    // but prefer indole if any small ring (<=5) contains the nitrogen - this
    // avoids misclassifying noisy decompositions (where a 5-member ring was
    // split into 6 or 4+7 fragments) as quinolines when the N is actually in
    // the smaller heterocycle.
    if (sixRing) {
      const nIdx6 = sixRing.find(
        (idx: number) => molecule.atoms[idx]?.symbol === "N",
      );
      const smallRingWithN = rings.find(
        (r: number[]) =>
          r.length <= 5 && r.some((idx) => molecule.atoms[idx]?.symbol === "N"),
      );
      if (smallRingWithN) return "indole";
      if (nIdx6 !== undefined) return "quinoline";
    }
    // Additional check: if there's a 5-membered ring with N, prefer indole
    if (fiveRing && fiveRing.some((idx) => molecule.atoms[idx]?.symbol === "N"))
      return "indole";
  }
  if (ringCount === 2 && ringSizes.includes(5) && ringSizes.includes(6)) {
    const nCount = ringAtoms.filter((a) => a.symbol === "N").length;
    if (nCount === 2) return "imidazopyridine";
  }
  return null;
}
