import type { Molecule } from "types";
import { BondType } from "types";
import { findSubstituents } from "../substituent-naming";

/**
 * Get priority locants for chain orientation comparison
 * Returns [unsaturationLocants, substituentLocants, heteroLocants]
 */
export function getPriorityLocants(
  molecule: Molecule,
  chain: number[],
): [number[], number[], number[]] {
  const unsaturationLocants = getUnsaturationPositions(chain, molecule);
  const substituentLocants = findSubstituents(molecule, chain)
    .map((s) => parseInt(s.position))
    .sort((a, b) => a - b);
  const heteroLocants = getHeteroPositions(chain, molecule).sort(
    (a, b) => a - b,
  );
  return [unsaturationLocants, substituentLocants, heteroLocants];
}

/**
 * Get positions of functional groups (C=O, C-OH, etc.) in a chain
 * Returns 1-indexed positions
 */
export function getFunctionalGroupPositions(
  chain: number[],
  molecule: Molecule,
): number[] {
  const positions: number[] = [];
  for (let i = 0; i < chain.length; i++) {
    const atomIdx = chain[i]!;
    const atom = molecule.atoms[atomIdx];
    if (!atom || atom.symbol !== "C") continue;

    let hasDoubleO = false;
    let hasSingleOwithH = false;
    let hasSingleO = false;
    let hasNitrogen = false;

    for (const b of molecule.bonds) {
      if (b.atom1 !== atomIdx && b.atom2 !== atomIdx) continue;
      const neigh = b.atom1 === atomIdx ? b.atom2 : b.atom1;
      const nat = molecule.atoms[neigh];
      if (!nat) continue;
      if (nat.symbol === "O") {
        if (b.type === BondType.DOUBLE) hasDoubleO = true;
        if (b.type === BondType.SINGLE) {
          hasSingleO = true;
          const oHydrogens = nat.hydrogens || 0;
          if (oHydrogens > 0) hasSingleOwithH = true;
        }
      }
      if (nat.symbol === "N") {
        hasNitrogen = true;
      }
    }

    // Detect functional groups in priority order:
    // 1. Carboxylic acids (C=O with -OH or -O)
    // 2. Amides (C=O with -N)
    // 3. Ketones (C=O without -OH, -O, or -N)
    // 4. Alcohols (C-OH without C=O)
    if (hasDoubleO && (hasSingleOwithH || hasSingleO || hasNitrogen)) {
      // Carboxylic acid or amide - highest priority
      positions.push(i + 1);
    } else if (hasDoubleO) {
      // Ketone - second priority
      positions.push(i + 1);
    } else if (hasSingleOwithH) {
      // Alcohol - third priority
      positions.push(i + 1);
    }
  }
  return positions;
}

/**
 * Get positions of heteroatoms (non-carbon) in a chain
 * Returns 1-indexed positions
 */
export function getHeteroPositions(
  chain: number[],
  molecule: Molecule,
): number[] {
  const positions: number[] = [];
  for (let i = 0; i < chain.length; i++) {
    const atom = molecule.atoms[chain[i]!];
    if (atom && atom.symbol !== "C") positions.push(i + 1);
  }
  return positions;
}

/**
 * Get positions of unsaturated bonds (double/triple) in a chain
 * Returns 1-indexed bond positions (bond between atom i and i+1 is position i+1)
 */
export function getUnsaturationPositions(
  chain: number[],
  molecule: Molecule,
): number[] {
  const positions: number[] = [];
  for (let i = 0; i < chain.length - 1; i++) {
    const bond = molecule.bonds.find(
      (b) =>
        (b.atom1 === chain[i] && b.atom2 === chain[i + 1]) ||
        (b.atom1 === chain[i + 1] && b.atom2 === chain[i]),
    );
    if (
      bond &&
      (bond.type === BondType.DOUBLE || bond.type === BondType.TRIPLE)
    ) {
      positions.push(i + 1);
    }
  }
  return positions;
}

/**
 * Renumber priority locants for reverse chain orientation
 * Returns renumbered [unsaturationLocants, substituentLocants, heteroLocants]
 */
export function renumberPriorityLocants(
  locants: [number[], number[], number[]],
  chainLength: number,
): [number[], number[], number[]] {
  const [unsaturation, substituents, hetero] = locants;
  // Unsaturation positions are bond-locants (1..chainLength-1). Reverse mapping uses chainLength - p.
  const renumberedUnsaturation = unsaturation
    .map((p) => chainLength - p)
    .sort((a, b) => a - b);
  // Substituent and hetero atom locants are atom positions (1..chainLength). Reverse mapping uses chainLength - p + 1.
  const renumberedSubstituents = substituents
    .map((p) => chainLength - p + 1)
    .sort((a, b) => a - b);
  const renumberedHetero = hetero
    .map((p) => chainLength - p + 1)
    .sort((a, b) => a - b);
  return [renumberedUnsaturation, renumberedSubstituents, renumberedHetero];
}

/**
 * Renumber unsaturation locants to get the lowest possible values
 * Compares forward vs. reversed numbering and returns the lexicographically lower set
 */
export function renumberUnsaturationToLowest(
  positions: number[],
  chainLength: number,
): number[] {
  if (positions.length === 0) return positions;
  const original = positions.slice().sort((a, b) => a - b);
  const reversed = original.map((p) => chainLength - p).sort((a, b) => a - b);

  // Choose the lexicographically lowest full vector (not just the first locant)
  // Helper: compare two locant arrays lexicographically
  function isBetterLocants(a: number[], b: number[]): boolean {
    const maxLen = Math.max(a.length, b.length);
    for (let i = 0; i < maxLen; i++) {
      const ai = a[i] ?? Number.POSITIVE_INFINITY;
      const bi = b[i] ?? Number.POSITIVE_INFINITY;
      if (ai !== bi) return ai < bi;
    }
    return false;
  }

  return isBetterLocants(reversed, original) ? reversed : original;
}
