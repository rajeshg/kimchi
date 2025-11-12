import type { Molecule } from "types";
import type { OPSINService } from "../../../opsin-service";
import { getChainNameFromOPSIN } from "../../../opsin-adapter";

/**
 * Name a carbon substituent attached via C=N double bond (ylidene nomenclature)
 * Example: (CH3)2C=N → "propan-2-ylidene"
 */
export function nameYlideneSubstituent(
  molecule: Molecule,
  carbonId: number,
  nitrogenId: number,
  parentAtomIds: Set<number>,
  opsinService: OPSINService,
): string {
  // Safety checks
  if (!molecule || !molecule.bonds || !molecule.atoms) {
    if (process.env.VERBOSE) {
      console.log("[nameYlideneSubstituent] Invalid molecule structure");
    }
    return "ylideneamino";
  }

  // Collect all atoms in the substituent (carbon + its neighbors, excluding nitrogen)
  const substituentAtoms = new Set<number>();
  const toVisit: number[] = [carbonId];
  const visited = new Set<number>();

  while (toVisit.length > 0) {
    const currentId = toVisit.pop()!;
    if (visited.has(currentId)) continue;
    visited.add(currentId);

    // Don't include parent atoms or the nitrogen
    if (parentAtomIds.has(currentId) || currentId === nitrogenId) continue;

    substituentAtoms.add(currentId);

    // Find neighbors
    for (const bond of molecule.bonds) {
      let neighborId: number | undefined;
      if (bond.atom1 === currentId) neighborId = bond.atom2;
      else if (bond.atom2 === currentId) neighborId = bond.atom1;

      if (neighborId !== undefined && !visited.has(neighborId)) {
        toVisit.push(neighborId);
      }
    }
  }

  // Count carbons in the substituent
  const substituentAtomsArray = Array.from(substituentAtoms);
  const carbonCount = substituentAtomsArray.filter(
    (id) => molecule.atoms[id]?.symbol === "C",
  ).length;

  if (carbonCount === 0) {
    return "ylideneamino"; // Edge case: no carbons
  }

  // Build the ylidene name
  // For simple cases without branching or specific locants, use chain name + "ylidene"
  // Example: C1 with 2 methyls = propan-2-ylidene
  const chainName = getChainNameFromOPSIN(carbonCount, opsinService);

  // Determine locant (position of the double bond in the carbon chain)
  // For now, assume simple case where double bond is at position 2 for propane (2 methyls on C)
  // TODO: Implement proper chain traversal and locant determination
  let locant = "";
  if (carbonCount === 3) {
    locant = "-2-"; // propan-2-ylidene
  } else if (carbonCount > 3) {
    locant = "-2-"; // Default to position 2 for now
  }

  return `${chainName}${locant}ylidene`;
}
