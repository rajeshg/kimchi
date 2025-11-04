import type { Molecule } from "types";
import { BondType } from "types";
import { findHeteroatomsInRing } from "./utils";

export function isRingAromatic(ring: number[], molecule: Molecule): boolean {
  const ringAtoms = ring
    .map((idx) => molecule.atoms[idx])
    .filter((a): a is (typeof molecule.atoms)[0] => a !== undefined);
  if (ringAtoms.length === 0) return false;

  // Robust aromaticity predicate:
  // - count aromatic-like bonds (BondType.AROMATIC or BondType.DOUBLE)
  // - count aromatic-marked atoms
  // - use a conservative threshold: require a majority of aromatic-like bonds
  //   AND a high fraction of atoms flagged aromatic OR a strong double-bond signal
  let aromaticLikeBondCount = 0;
  let aromaticBondCount = 0;
  let doubleBondCount = 0;
  let singleBondCount = 0;

  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    const bond = molecule.bonds.find(
      (bb) =>
        (bb.atom1 === a && bb.atom2 === b) ||
        (bb.atom1 === b && bb.atom2 === a),
    );
    if (!bond) continue;
    if (bond.type === BondType.AROMATIC) {
      aromaticBondCount++;
      aromaticLikeBondCount++;
    } else if (bond.type === BondType.DOUBLE) {
      doubleBondCount++;
      aromaticLikeBondCount++;
    } else if (bond.type === BondType.SINGLE) {
      singleBondCount++;
    } else {
      // other bond types treated as non-aromatic-like
      singleBondCount++;
    }
  }

  const aromaticAtomCount = ringAtoms.filter(
    (atom) => atom.aromatic === true,
  ).length;
  const atomAromaticFraction = aromaticAtomCount / ring.length;

  if (process.env.VERBOSE) {
    try {
      console.log("[VERBOSE] isRingAromatic:", {
        ringLength: ring.length,
        aromaticBondCount,
        doubleBondCount,
        aromaticLikeBondCount,
        singleBondCount,
        aromaticAtomCount,
        atomAromaticFraction,
      });
    } catch (_e) {}
  }

  // Conservative rules:
  // - Require at least ceil(n/2) aromatic-like bonds (double or aromatic) AND
  //   atom aromatic fraction >= 0.6
  // - OR if many bonds are explicitly aromatic (BondType.AROMATIC) require atom fraction >= 0.5
  // - Otherwise mark non-aromatic.
  const minAromaticLike = Math.ceil(ring.length / 2);
  if (aromaticLikeBondCount >= minAromaticLike && atomAromaticFraction >= 0.6)
    return true;
  if (aromaticBondCount >= minAromaticLike && atomAromaticFraction >= 0.5)
    return true;

  return false;
}

export function generateAromaticRingName(
  ring: number[],
  molecule: Molecule,
): string {
  const ringSize = ring.length;
  const ringAtoms = ring
    .map((idx) => molecule.atoms[idx])
    .filter((a): a is (typeof molecule.atoms)[0] => a !== undefined);

  if (process.env.VERBOSE) {
    console.log("[VERBOSE] generateAromaticRingName called with ring:", ring);
    console.log(
      "[VERBOSE] Ring atom symbols:",
      ring.map((idx) => molecule.atoms[idx]?.symbol).join(","),
    );
  }

  if (ringSize === 6 && ringAtoms.every((atom) => atom.symbol === "C"))
    return "benzene";
  if (ringSize === 6) {
    const heteroAtoms = findHeteroatomsInRing(ring, molecule);

    if (process.env.VERBOSE) {
      console.log("[VERBOSE] Heteroatoms found:", heteroAtoms);
    }

    // Check for 2 nitrogen atoms FIRST (stored as single entry with count=2)
    const nitrogenEntry = heteroAtoms.find((a) => a.symbol === "N");
    if (nitrogenEntry && nitrogenEntry.count === 2) {
      // Distinguish pyrimidine (1,3-diazine) from pyrazine (1,4-diazine)
      // Find positions of nitrogen atoms within the ring
      const nitrogenIndices: number[] = [];
      for (let i = 0; i < ring.length; i++) {
        const atomIdx = ring[i];
        const atom =
          atomIdx !== undefined ? molecule.atoms[atomIdx] : undefined;
        if (atom && atom.symbol === "N") {
          nitrogenIndices.push(i);
        }
      }

      if (process.env.VERBOSE) {
        console.log("[VERBOSE] Nitrogen indices in ring:", nitrogenIndices);
      }

      if (nitrogenIndices.length === 2) {
        const diff = Math.abs(nitrogenIndices[0]! - nitrogenIndices[1]!);

        if (process.env.VERBOSE) {
          console.log("[VERBOSE] Position difference:", diff);
        }

        // For a 6-membered ring:
        // diff = 2 or 4 → adjacent positions → pyrimidine (1,3-diazine)
        // diff = 3 → opposite positions → pyrazine (1,4-diazine)
        if (diff === 2 || diff === 4) {
          if (process.env.VERBOSE)
            console.log("[VERBOSE] Returning: pyrimidine");
          return "pyrimidine";
        }
        if (diff === 3) {
          if (process.env.VERBOSE) console.log("[VERBOSE] Returning: pyrazine");
          return "pyrazine";
        }
      }
      return "pyrazine"; // default for 2 nitrogens
    }

    // Then check heteroatom cases by total count
    // Calculate total heteroatom counts
    const totalNitrogenCount = heteroAtoms
      .filter((a) => a.symbol === "N")
      .reduce((sum, a) => sum + a.count, 0);
    const totalOxygenCount = heteroAtoms
      .filter((a) => a.symbol === "O")
      .reduce((sum, a) => sum + a.count, 0);
    const totalSulfurCount = heteroAtoms
      .filter((a) => a.symbol === "S")
      .reduce((sum, a) => sum + a.count, 0);

    // Check for triazine and tetrazine first (3-4 nitrogens)
    if (totalNitrogenCount === 4) return "tetrazine";
    if (totalNitrogenCount === 3) return "triazine";

    // Check for single heteroatom cases
    if (heteroAtoms.length === 1) {
      const sym = heteroAtoms[0]!.symbol;
      const count = heteroAtoms[0]!.count;
      if (sym === "N" && count === 1) return "pyridine";
      if (sym === "O" && count === 1) return "pyran";
      if (sym === "S" && count === 1) return "thiopyran";
    }

    // Check for two different heteroatoms
    if (heteroAtoms.length === 2) {
      if (totalNitrogenCount === 1 && totalOxygenCount === 1) return "oxazine";
      if (totalNitrogenCount === 1 && totalSulfurCount === 1) return "thiazine";
    }

    // Check for mixed heteroatoms with multiple types
    if (heteroAtoms.length === 3) {
      if (totalNitrogenCount === 2 && totalOxygenCount === 1)
        return "triazinone";
    }
  }
  if (ringSize === 5) {
    const heteroAtoms = findHeteroatomsInRing(ring, molecule);
    const carbonCount = ringAtoms.filter((a) => a.symbol === "C").length;

    // Count total heteroatoms using their count property
    const nitrogenCount = heteroAtoms
      .filter((a) => a.symbol === "N")
      .reduce((sum, a) => sum + a.count, 0);
    const oxygenCount = heteroAtoms
      .filter((a) => a.symbol === "O")
      .reduce((sum, a) => sum + a.count, 0);
    const sulfurCount = heteroAtoms
      .filter((a) => a.symbol === "S")
      .reduce((sum, a) => sum + a.count, 0);

    // Check multi-nitrogen cases first
    if (nitrogenCount === 4) return "tetrazole";
    if (nitrogenCount === 3) return "triazole";
    if (nitrogenCount === 2 && carbonCount === 3) return "imidazole";
    if (nitrogenCount === 2 && oxygenCount === 1) return "isoxazole";

    // Check single heteroatom cases
    if (heteroAtoms.length === 1) {
      const sym = heteroAtoms[0]!.symbol;
      if (sym === "N") {
        if (heteroAtoms[0]!.count > 0) return "pyrrole";
        return "pyrrolidine";
      }
      if (sym === "O") return "furan";
      if (sym === "S") return "thiophene";
    }

    // Check mixed heteroatom cases
    if (nitrogenCount === 1 && oxygenCount === 1 && carbonCount === 3)
      return "oxazole";
    if (nitrogenCount === 1 && sulfurCount === 1 && carbonCount === 3)
      return "thiazole";
  }
  return `aromatic_C${ringSize}`;
}
