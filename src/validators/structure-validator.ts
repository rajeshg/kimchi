/**
 * Comprehensive structure validation for molecules.
 * Combines multiple validation checks into a single interface.
 */

import type { Molecule } from "types";
import { BondType } from "types";
import { getBondsForAtom } from "src/utils/bond-utils";

/**
 * Severity levels for validation issues.
 */
export enum ValidationSeverity {
  ERROR = "error",
  WARNING = "warning",
  INFO = "info",
}

/**
 * Individual validation result.
 */
export interface ValidationIssue {
  type: string;
  message: string;
  severity: ValidationSeverity;
  atoms?: number[];
  bonds?: Array<[number, number]>;
}

/**
 * Result of comprehensive structure validation.
 */
export interface ValidationResult {
  isValid: boolean;
  issues: ValidationIssue[];
}

/**
 * Basic valence checking.
 */
function checkValence(molecule: Molecule): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const atom of molecule.atoms) {
    const bonds = getBondsForAtom(molecule.bonds, atom.id);
    let valence = 0;

    for (const bond of bonds) {
      switch (bond.type) {
        case BondType.SINGLE:
          valence += 1;
          break;
        case BondType.DOUBLE:
          valence += 2;
          break;
        case BondType.TRIPLE:
          valence += 3;
          break;
        case BondType.AROMATIC:
          valence += 1.5;
          break;
      }
    }

    valence += atom.hydrogens;

    // Basic valence check for common elements
    let expectedMax: number;
    switch (atom.symbol) {
      case "H":
        expectedMax = 1;
        break;
      case "C":
        expectedMax = 4;
        break;
      case "N":
        expectedMax = 3;
        break;
      case "O":
        expectedMax = 2;
        break;
      case "F":
        expectedMax = 1;
        break;
      case "Cl":
        expectedMax = 1;
        break;
      default:
        continue; // Skip unknown elements
    }

    if (valence > expectedMax) {
      issues.push({
        type: "valence",
        message: `${atom.symbol} atom has valence ${valence}, exceeds maximum ${expectedMax}`,
        severity: ValidationSeverity.ERROR,
        atoms: [atom.id],
      });
    }
  }

  return issues;
}

/**
 * Basic aromaticity checking.
 */
function checkAromaticity(molecule: Molecule): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const ring of molecule.rings || []) {
    const ringAtoms = ring.map((id) => molecule.atoms.find((a) => a.id === id));
    const validAtoms = ringAtoms.filter((a) => a !== undefined) as typeof molecule.atoms;
    const hasAromatic = validAtoms.some((a) => a.aromatic);
    const allAromatic = validAtoms.every((a) => a.aromatic);

    if (hasAromatic && !allAromatic) {
      issues.push({
        type: "aromaticity",
        message: `Ring has mixed aromatic/non-aromatic atoms`,
        severity: ValidationSeverity.WARNING,
        atoms: [...ring],
      });
    }
  }

  return issues;
}

/**
 * Basic stereo checking.
 */
function checkStereo(molecule: Molecule): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const atom of molecule.atoms) {
    if (atom.chiral && atom.chiral !== "@" && atom.chiral !== "@@") {
      const bonds = getBondsForAtom(molecule.bonds, atom.id);
      if (bonds.length < 4) {
        issues.push({
          type: "stereo",
          message: `Chiral atom has only ${bonds.length} bonds, needs 4`,
          severity: ValidationSeverity.WARNING,
          atoms: [atom.id],
        });
      }
    }
  }

  return issues;
}

/**
 * Comprehensive structure validation combining multiple checks.
 * Similar to Indigo's check function.
 *
 * @param molecule - Molecule to validate
 * @returns Validation result with issues found
 */
export function checkStructure(molecule: Molecule): ValidationResult {
  const issues: ValidationIssue[] = [];

  // Valence validation
  issues.push(...checkValence(molecule));

  // Aromaticity validation
  issues.push(...checkAromaticity(molecule));

  // Stereo validation
  issues.push(...checkStereo(molecule));

  // Additional checks
  // Check for invalid elements
  const invalidElements = findInvalidElements(molecule);
  if (invalidElements.length > 0) {
    issues.push({
      type: "elements",
      message: `Found ${invalidElements.length} atoms with invalid elements`,
      severity: ValidationSeverity.ERROR,
      atoms: invalidElements,
    });
  }

  // Check for disconnected fragments
  const fragments = countConnectedComponents(molecule);
  if (fragments > 1) {
    issues.push({
      type: "connectivity",
      message: `Molecule has ${fragments} disconnected fragments`,
      severity: ValidationSeverity.INFO,
    });
  }

  return {
    isValid: issues.filter((i) => i.severity === ValidationSeverity.ERROR).length === 0,
    issues,
  };
}

/**
 * Find atoms with invalid elements.
 */
function findInvalidElements(molecule: Molecule): number[] {
  const invalid: number[] = [];
  for (const atom of molecule.atoms) {
    if (atom.atomicNumber < 1 || atom.atomicNumber > 118) {
      invalid.push(atom.id);
    }
  }
  return invalid;
}

/**
 * Count connected components in the molecule.
 */
function countConnectedComponents(molecule: Molecule): number {
  const visited = new Set<number>();
  let components = 0;

  for (const atom of molecule.atoms) {
    if (!visited.has(atom.id)) {
      components++;
      // DFS to mark all connected atoms
      const stack = [atom.id];
      while (stack.length > 0) {
        const current = stack.pop()!;
        if (!visited.has(current)) {
          visited.add(current);
          // Add neighbors
          for (const bond of molecule.bonds) {
            if (bond.atom1 === current && !visited.has(bond.atom2)) {
              stack.push(bond.atom2);
            } else if (bond.atom2 === current && !visited.has(bond.atom1)) {
              stack.push(bond.atom1);
            }
          }
        }
      }
    }
  }

  return components;
}
