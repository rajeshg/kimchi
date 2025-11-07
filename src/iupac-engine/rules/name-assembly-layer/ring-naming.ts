import type { ParentStructure, FunctionalGroup } from "../../types";

/**
 * Ring Naming Functions
 *
 * Functions for building IUPAC names for ring structures (monocyclic, polycyclic, heterocyclic).
 *
 * Reference: IUPAC Blue Book P-22 (Monocyclic), P-23 (Fused rings), P-25 (Heterocyclic)
 */

/**
 * Build IUPAC name for ring parent structures
 *
 * Handles monocyclic and polycyclic ring systems (carbocycles and heterocycles).
 * Respects parent structure names already set by the parent structure identification phase.
 *
 * Reference: IUPAC Blue Book P-22 (Monocyclic rings), P-23 (Fused rings), P-25 (Heterocyclic)
 *
 * @param parentStructure - Parent structure containing ring information
 * @param _functionalGroups - Functional groups (unused, substituents handled by buildSubstitutiveName)
 * @returns Base ring name (without substituents)
 */
export function buildRingName(
  parentStructure: ParentStructure,
  _functionalGroups: FunctionalGroup[],
): string {
  const ring = parentStructure.ring;
  if (!ring) {
    return parentStructure.name || "unknown-ring";
  }

  // PRIORITY ORDER: Use name from parent structure identification phase if already set
  // This respects IUPAC P-22 (monocyclic) naming which handles heterocycles
  // The parent structure name was set by generateRingName() which properly identifies
  // heterocycles like pyridine, furan, thiophene, etc.
  //
  // NOTE: We return the BASE NAME only (without substituents) because buildSubstitutiveName()
  // will handle all substituent assembly with proper bis/tris vs di/tri logic.
  if (
    parentStructure.name &&
    parentStructure.name !== "unknown" &&
    parentStructure.name !== "unknown-ring"
  ) {
    return parentStructure.name;
  }

  // FALLBACK: Generic ring naming for carbocycles without specific names
  // This is simplified - real implementation would use comprehensive ring naming
  const ringNames: { [key: number]: string } = {
    3: "cyclopropane",
    4: "cyclobutane",
    5: "cyclopentane",
    6: "cyclohexane",
    7: "cycloheptane",
    8: "cyclooctane",
  };

  const size = ring.size || (ring.atoms ? ring.atoms.length : 0);
  const baseName = ringNames[size] || `cyclo${size - 1}ane`;

  // NOTE: StructuralSubstituents will be handled by buildSubstitutiveName() with proper bis/tris logic
  // Check for aromatic naming
  if (ring.type === "aromatic" && size === 6) {
    return "benzene";
  }

  return baseName;
}

/**
 * Build IUPAC name for heteroatom hydride parent structures
 *
 * Handles parent hydrides like silane, borane, phosphane, etc.
 *
 * Reference: IUPAC Blue Book P-21 (Hydrides of main group elements)
 *
 * @param parentStructure - Parent structure containing heteroatom information
 * @param _functionalGroups - Functional groups (unused, substituents handled by buildSubstitutiveName)
 * @returns Heteroatom hydride name
 */
export function buildHeteroatomName(
  parentStructure: ParentStructure,
  _functionalGroups: FunctionalGroup[],
): string {
  const heteroatom = parentStructure.heteroatom;
  if (!heteroatom) {
    return parentStructure.name || "unknown-heteroatom";
  }

  // For simple heteroatom hydrides, just return the parent hydride name
  // StructuralSubstituents would be handled by prefix addition in substitutive nomenclature
  return parentStructure.name || "unknown-heteroatom";
}
