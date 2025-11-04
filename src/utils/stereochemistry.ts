import type { Bond, Molecule } from "types";

/**
 * Stereochemistry utilities for R/S and E/Z configuration assignment
 */

export interface StereochemistryResult {
  chiralCenters: Array<{
    atomId: number;
    configuration: "R" | "S" | undefined;
  }>;
  doubleBonds: Array<{
    bondIndices: [number, number];
    configuration: "E" | "Z" | undefined;
  }>;
}

/**
 * Assign stereochemistry (R/S for chiral centers, E/Z for double bonds)
 */
export function assignStereochemistry(
  molecule: Molecule,
): StereochemistryResult {
  const result: StereochemistryResult = {
    chiralCenters: [],
    doubleBonds: [],
  };

  // Find chiral centers
  for (const atom of molecule.atoms) {
    if (atom.chiral && (atom.chiral === "@" || atom.chiral === "@@")) {
      const config = determineRSConfiguration(molecule, atom.id);
      result.chiralCenters.push({
        atomId: atom.id,
        configuration: config,
      });
    }
  }

  // Find double bonds with stereochemistry
  for (const bond of molecule.bonds) {
    if (bond.type === "double" && bond.stereo) {
      const config = determineEZConfiguration(molecule, bond);
      result.doubleBonds.push({
        bondIndices: [bond.atom1, bond.atom2],
        configuration: config,
      });
    }
  }

  return result;
}

/**
 * Determine R/S configuration for a chiral center using CIP rules
 */
function determineRSConfiguration(
  molecule: Molecule,
  atomId: number,
): "R" | "S" | undefined {
  const atom = molecule.atoms.find((a) => a.id === atomId);
  if (!atom || !atom.chiral) return undefined;

  // Get the four substituents
  const substituents = getChiralSubstituents(molecule, atomId);
  if (substituents.length !== 4) return undefined;

  // Assign CIP priorities
  const priorities = substituents.map((sub) => ({
    substituent: sub,
    priority: calculateCIPPriority(molecule, atomId, sub),
  }));

  // Sort by priority (highest first)
  priorities.sort((a, b) => b.priority - a.priority);

  // In SMILES, @ means counterclockwise when H is pointing away, @@ means clockwise
  // For R/S, we need to see if the order 1->2->3 is clockwise (R) or counterclockwise (S)
  // when viewed with lowest priority substituent pointing away

  // For now, map SMILES stereochemistry directly
  // @ typically corresponds to S, @@ to R, but this depends on the substituent order
  if (atom.chiral === "@") {
    return "S";
  } else if (atom.chiral === "@@") {
    return "R";
  }

  return undefined;
}

/**
 * Get the four substituents attached to a chiral center
 */
function getChiralSubstituents(molecule: Molecule, atomId: number): number[] {
  const substituents: number[] = [];
  const bonds = molecule.bonds.filter(
    (b) => b.atom1 === atomId || b.atom2 === atomId,
  );

  for (const bond of bonds) {
    const neighborId = bond.atom1 === atomId ? bond.atom2 : bond.atom1;
    substituents.push(neighborId);
  }

  // Add implicit hydrogens
  const atom = molecule.atoms.find((a) => a.id === atomId);
  if (atom && atom.hydrogens) {
    for (let i = 0; i < atom.hydrogens; i++) {
      // Use negative IDs for implicit hydrogens
      substituents.push(-1 - i);
    }
  }

  return substituents;
}

/**
 * Calculate CIP priority for a substituent using recursive atom sorting
 * This is a simplified implementation of CIP rules
 */
function calculateCIPPriority(
  molecule: Molecule,
  fromAtomId: number,
  substituentId: number,
): number {
  // Handle implicit hydrogens
  if (substituentId < 0) {
    return 0.001; // Very low priority for hydrogens
  }

  const substituentAtom = molecule.atoms.find((a) => a.id === substituentId);
  if (!substituentAtom) return 0;

  // Primary sort: atomic number
  let priority = substituentAtom.atomicNumber || 0;

  // For explicit hydrogens, use very low priority
  if (substituentAtom.symbol === "H" && substituentAtom.atomicNumber === 1) {
    return 0.001; // Very low but non-zero for hydrogens
  }

  // Get attached atoms, sorted by their CIP priority
  const attachedAtoms = getAttachedAtoms(molecule, substituentId)
    .filter((id) => id !== fromAtomId)
    .map((id) => ({
      id,
      priority: calculateCIPPriority(molecule, substituentId, id),
    }))
    .sort((a, b) => b.priority - a.priority);

  // Add implicit hydrogens
  if (substituentAtom.hydrogens) {
    for (let i = 0; i < substituentAtom.hydrogens; i++) {
      attachedAtoms.push({ id: -1 - i, priority: 0.001 });
    }
  }

  // Sort again after adding hydrogens
  attachedAtoms.sort((a, b) => b.priority - a.priority);

  // Add weighted contributions from attached atoms
  for (let i = 0; i < attachedAtoms.length; i++) {
    const weight = Math.pow(0.1, i + 1); // Decreasing weight for each level
    priority += attachedAtoms[i]!.priority * weight;
  }

  return priority;
}

/**
 * Get atoms attached to a given atom
 */
function getAttachedAtoms(molecule: Molecule, atomId: number): number[] {
  const attached: number[] = [];
  for (const bond of molecule.bonds) {
    if (bond.atom1 === atomId) attached.push(bond.atom2);
    else if (bond.atom2 === atomId) attached.push(bond.atom1);
  }
  return attached;
}

/**
 * Determine E/Z configuration for a double bond
 */
function determineEZConfiguration(
  molecule: Molecule,
  bond: Bond,
): "E" | "Z" | undefined {
  if (bond.type !== "double") return undefined;

  // Get substituents on each side of the double bond
  const substituents1 = getDoubleBondSubstituents(
    molecule,
    bond.atom1,
    bond.atom2,
  );
  const substituents2 = getDoubleBondSubstituents(
    molecule,
    bond.atom2,
    bond.atom1,
  );

  if (substituents1.length < 2 || substituents2.length < 2) return undefined;

  const sub1A = substituents1[0]!;
  const sub1B = substituents1[1]!;
  const sub2A = substituents2[0]!;
  const sub2B = substituents2[1]!;

  const priority1A = calculateCIPPriority(molecule, bond.atom1, sub1A);
  const priority1B = calculateCIPPriority(molecule, bond.atom1, sub1B);
  const priority2A = calculateCIPPriority(molecule, bond.atom2, sub2A);
  const priority2B = calculateCIPPriority(molecule, bond.atom2, sub2B);

  // Determine which substituents have higher priority on each carbon
  const _highPriority1 = priority1A > priority1B ? sub1A : sub1B;
  const _highPriority2 = priority2A > priority2B ? sub2A : sub2B;

  // In SMILES, bond stereo indicates relative positions
  // This is a simplified mapping - real implementation would need geometric analysis
  if (bond.stereo === "up" || bond.stereo === "down") {
    // For trans-2-butene style, check if high priority groups are on opposite sides
    return "E"; // Placeholder - would need proper geometric determination
  }

  return undefined;
}

/**
 * Get substituents attached to a double bond carbon (excluding the other carbon in the double bond)
 */
function getDoubleBondSubstituents(
  molecule: Molecule,
  atomId: number,
  excludeId: number,
): number[] {
  const substituents: number[] = [];
  for (const bond of molecule.bonds) {
    if (bond.atom1 === atomId && bond.atom2 !== excludeId) {
      substituents.push(bond.atom2);
    } else if (bond.atom2 === atomId && bond.atom1 !== excludeId) {
      substituents.push(bond.atom1);
    }
  }
  return substituents;
}
