import type { Molecule, Atom } from "types";

/**
 * Determines if an atom should be excluded from the parent chain based on
 * functional group classification.
 */
export function shouldExcludeAtomFromChain(
  atom: Atom,
  fgName: string,
  fgType: string,
): boolean {
  const symbol = atom.symbol;
  const lowerName = fgName.toLowerCase();

  // Pattern-based exclusion rules (ordered by specificity)
  // More specific patterns first to prevent false matches

  // Thiocyanates: exclude entire S-C≡N group
  if (
    lowerName.includes("thiocyanate") ||
    lowerName.includes("thiocyano") ||
    fgType === "SC#N"
  ) {
    return true; // Exclude all atoms in thiocyanate group
  }

  // Amines: include N in parent chain (special case)
  if (lowerName.includes("amine") || lowerName === "amino") {
    return false; // Don't exclude - N is part of parent chain
  }

  // Carbonyl-containing groups: exclude O, keep C
  if (
    lowerName.includes("ketone") ||
    lowerName.includes("aldehyde") ||
    lowerName.includes("carboxylic") ||
    lowerName.includes("acid") ||
    lowerName.includes("ester") ||
    lowerName.includes("oate") ||
    lowerName.includes("amide") ||
    lowerName === "carbonyl"
  ) {
    return symbol === "O" || (lowerName.includes("amide") && symbol === "N");
  }

  // Hydroxyl groups: exclude O, keep C
  if (lowerName.includes("alcohol") || lowerName === "ol") {
    return symbol === "O";
  }

  // Ethers: exclude O only
  if (lowerName.includes("ether") || lowerName === "oxy") {
    return symbol === "O";
  }

  // Nitriles: exclude N, keep C
  if (lowerName.includes("nitrile") || lowerName === "cyano") {
    return symbol === "N";
  }

  // Default: exclude all heteroatoms (non-carbon)
  return symbol !== "C";
}

/**
 * Count the number of functional groups directly attached to chain atoms.
 * This helps prefer chains where functional groups are directly accessible,
 * rather than buried in alkyl substituents.
 */
export function countDirectFunctionalGroupAttachments(
  chain: number[],
  molecule: Molecule,
  functionalGroups: Array<{ name: string; type: string; atoms?: number[] }>,
): number {
  let count = 0;
  const chainSet = new Set(chain);

  // Look for functional groups that are directly bonded to chain atoms
  for (const fg of functionalGroups) {
    if (!fg.atoms || fg.atoms.length === 0) continue;

    // For sulfonyl/sulfinyl groups, check if sulfur is bonded to chain
    if (fg.name === "sulfonyl" || fg.name === "sulfinyl") {
      const sulfurIdx = fg.atoms[0]; // Sulfur is the first atom in the functional group
      if (sulfurIdx === undefined) continue;

      const sulfurAtom = molecule.atoms[sulfurIdx];
      if (!sulfurAtom) continue;

      // Check bonds from sulfur to see if any connect to chain atoms
      for (const bond of molecule.bonds) {
        const otherAtomIdx =
          bond.atom1 === sulfurIdx
            ? bond.atom2
            : bond.atom2 === sulfurIdx
              ? bond.atom1
              : null;

        if (otherAtomIdx !== null && chainSet.has(otherAtomIdx)) {
          // Sulfur is directly bonded to a chain atom
          count++;
          break; // Count this FG once
        }
      }
    }

    // For thiocyanate groups (S-C≡N), check if sulfur is bonded to chain
    if (fg.name === "thiocyanate" && fg.atoms.length >= 1) {
      const sulfurIdx = fg.atoms[0]; // Sulfur is the first atom in thiocyanate (S-C≡N)
      if (sulfurIdx === undefined) continue;

      const sulfurAtom = molecule.atoms[sulfurIdx];
      if (!sulfurAtom) continue;

      // Check bonds from sulfur to see if any connect to chain atoms
      for (const bond of molecule.bonds) {
        const otherAtomIdx =
          bond.atom1 === sulfurIdx
            ? bond.atom2
            : bond.atom2 === sulfurIdx
              ? bond.atom1
              : null;

        if (otherAtomIdx !== null && chainSet.has(otherAtomIdx)) {
          // Sulfur is directly bonded to a chain atom
          count++;
          break; // Count this FG once
        }
      }
    }
  }

  return count;
}

/**
 * Check if chain is a pure hydrocarbon (all carbon atoms).
 */
export function isHydrocarbonChain(
  chain: number[],
  molecule: Molecule,
): boolean {
  return chain.every(
    (idx) => molecule.atoms[idx] && molecule.atoms[idx].symbol === "C",
  );
}

/**
 * Check if chain contains halogen atoms (F, Cl, Br, I).
 * Halogens should never be part of the parent chain.
 */
export function containsHalogen(chain: number[], molecule: Molecule): boolean {
  return chain.some((idx) => {
    const symbol = molecule.atoms[idx]?.symbol;
    return (
      symbol === "F" || symbol === "Cl" || symbol === "Br" || symbol === "I"
    );
  });
}

/**
 * Check if any detected functional group requires heteroatom chains.
 * Only amines and certain heteroatom parents need heteroatoms in the parent chain.
 */
export function requiresHeteroatomChains(
  functionalGroups: Array<{ name: string; type: string; atoms?: number[] }>,
): boolean {
  for (const fg of functionalGroups) {
    const lowerName = fg.name.toLowerCase();
    // Amines need nitrogen in the parent chain (e.g., "ethanamine")
    if (lowerName.includes("amine")) {
      return true;
    }
    // Add other cases here if needed (e.g., phosphines, arsines, etc.)
  }
  return false;
}

/**
 * Validate that a chain is valid (connected path of atoms).
 */
export function isValidChain(chain: number[], molecule: Molecule): boolean {
  if (chain.length < 1) return false;
  if (chain.length === 1) return true;

  for (let i = 0; i < chain.length - 1; i++) {
    const a1 = chain[i]!;
    const a2 = chain[i + 1]!;
    const bonded = molecule.bonds.some(
      (b) =>
        (b.atom1 === a1 && b.atom2 === a2) ||
        (b.atom1 === a2 && b.atom2 === a1),
    );
    if (!bonded) return false;
  }
  return true;
}
