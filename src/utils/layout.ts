/**
 * Layout utilities for 2D molecular coordinate generation.
 * Provides standalone layout functionality compatible with Indigo's layout function.
 */

import type { Molecule, Atom, Bond } from "types";
import { generateCoordinates } from "src/generators/coordinate-generator";

/**
 * Extended atom interface with 2D coordinates.
 */
export interface AtomWithCoords extends Atom {
  readonly x: number;
  readonly y: number;
}

/**
 * Molecule with 2D coordinates assigned to all atoms.
 */
export interface LayoutedMolecule {
  readonly atoms: readonly AtomWithCoords[];
  readonly bonds: readonly Bond[];
  readonly rings?: readonly (readonly number[])[];
}

/**
 * Layout options for coordinate generation.
 */
export interface LayoutOptions {
  bondLength?: number;
  resolveOverlapsEnabled?: boolean;
  overlapResolutionIterations?: number;
  optimizeOrientation?: boolean;
}

/**
 * Generate 2D coordinates for a molecule using the rigid unit architecture.
 * This provides the same functionality as Indigo's layout function.
 *
 * @param molecule - Input molecule without coordinates
 * @param options - Layout options
 * @returns Molecule with 2D coordinates assigned to all atoms
 */
export function layoutMolecule(molecule: Molecule, options: LayoutOptions = {}): LayoutedMolecule {
  // Generate coordinates using the existing algorithm
  const coords = generateCoordinates(molecule, {
    bondLength: options.bondLength ?? 40,
    resolveOverlapsEnabled: options.resolveOverlapsEnabled ?? true,
    overlapResolutionIterations: options.overlapResolutionIterations,
    optimizeOrientation: options.optimizeOrientation ?? true,
  });

  // Create new atoms with coordinates
  const atomsWithCoords: AtomWithCoords[] = molecule.atoms.map((atom) => {
    const coord = coords[atom.id];
    return {
      ...atom,
      x: coord?.x ?? 0,
      y: coord?.y ?? 0,
    };
  });

  return {
    atoms: atomsWithCoords,
    bonds: molecule.bonds,
    rings: molecule.rings,
  };
}
