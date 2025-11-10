import type { Molecule } from "types";
import {
  getSimpleMultiplier,
  getSimpleMultiplierWithVowel,
  getComplexMultiplier,
} from "../../opsin-adapter";
import type { OPSINService } from "../../opsin-service";
import { getSharedOPSINService } from "../../opsin-service";

/**
 * Get multiplicative prefix for a given count
 * @param count - Number of identical groups
 * @param useComplex - If true, use bis/tris for complex substituents
 * @param opsinService - OPSIN service instance (optional, uses shared service if not provided)
 * @param nextChar - Optional next character for vowel elision (e.g., 'a' in 'methyl')
 * @returns The multiplicative prefix (e.g., "di", "tri", "tetra", "bis", "tris")
 */
export function getMultiplicativePrefix(
  count: number,
  useComplex = false,
  opsinService?: OPSINService,
  nextChar?: string,
): string {
  const service = opsinService ?? getSharedOPSINService();
  if (useComplex) {
    return getComplexMultiplier(count, service);
  }
  return nextChar
    ? getSimpleMultiplierWithVowel(count, nextChar, service)
    : getSimpleMultiplier(count, service);
}

/**
 * Find the atom that connects a substituent to the main chain.
 * This is the atom that has a bond to both the substituent and the main chain.
 *
 * @param molecule - The molecule
 * @param rootAtomIdx - Index of the substituent root atom (e.g., phosphorus)
 * @param mainChainAtoms - Set of atom indices that are part of the main chain
 * @returns Index of the attachment atom, or undefined if not found
 */
export function findAttachmentPoint(
  molecule: Molecule,
  rootAtomIdx: number,
  mainChainAtoms: Set<number>,
): number | undefined {
  const rootAtom = molecule.atoms[rootAtomIdx];
  if (!rootAtom) return undefined;

  // BFS to find the atom that connects to main chain
  const visited = new Set<number>([rootAtomIdx]);
  const queue: number[] = [rootAtomIdx];

  while (queue.length > 0) {
    const currentIdx = queue.shift();
    if (currentIdx === undefined) continue;

    const currentAtom = molecule.atoms[currentIdx];
    if (!currentAtom) continue;

    // Find all neighbors
    for (const bond of molecule.bonds) {
      let neighborIdx: number | null = null;

      if (bond.atom1 === currentAtom.id) {
        neighborIdx = molecule.atoms.findIndex((a) => a.id === bond.atom2);
      } else if (bond.atom2 === currentAtom.id) {
        neighborIdx = molecule.atoms.findIndex((a) => a.id === bond.atom1);
      }

      if (neighborIdx !== null && neighborIdx !== -1) {
        // If this neighbor is in the main chain, current atom is the attachment point
        if (mainChainAtoms.has(neighborIdx)) {
          return currentIdx;
        }

        // Otherwise, continue BFS
        if (!visited.has(neighborIdx)) {
          visited.add(neighborIdx);
          queue.push(neighborIdx);
        }
      }
    }
  }

  return undefined;
}

/**
 * Collect all atoms that are part of a substituent, starting from a root atom (e.g., sulfur)
 * and traversing outward while excluding main chain atoms and optionally an attachment point.
 *
 * @param molecule - The molecule
 * @param sulfurIdx - Index of the sulfur atom
 * @param mainChainAtoms - Set of atom indices that are part of the main chain (to exclude)
 * @param excludeAttachmentPoint - Optional atom index to exclude (e.g., the atom connecting to main chain)
 * @returns Set of atom indices that make up the complete substituent
 */
export function collectSubstituentAtoms(
  molecule: Molecule,
  sulfurIdx: number,
  mainChainAtoms: Set<number>,
  excludeAttachmentPoint?: number,
): Set<number> {
  const substituentAtoms = new Set<number>();
  const visited = new Set<number>();
  const queue: number[] = [sulfurIdx];

  // Add sulfur to the substituent
  substituentAtoms.add(sulfurIdx);
  visited.add(sulfurIdx);

  while (queue.length > 0) {
    const currentIdx = queue.shift();
    if (currentIdx === undefined) continue;

    const currentAtom = molecule.atoms[currentIdx];
    if (!currentAtom) continue;

    // Find all bonds connected to this atom
    for (const bond of molecule.bonds) {
      let neighborIdx: number | null = null;

      if (bond.atom1 === currentAtom.id) {
        neighborIdx = molecule.atoms.findIndex((a) => a.id === bond.atom2);
      } else if (bond.atom2 === currentAtom.id) {
        neighborIdx = molecule.atoms.findIndex((a) => a.id === bond.atom1);
      }

      if (neighborIdx !== null && neighborIdx !== -1) {
        // Skip if already visited
        if (visited.has(neighborIdx)) continue;

        // Skip if this atom is part of the main chain
        if (mainChainAtoms.has(neighborIdx)) continue;

        // Skip if this is the attachment point to exclude
        if (
          excludeAttachmentPoint !== undefined &&
          neighborIdx === excludeAttachmentPoint
        )
          continue;

        // Add to substituent and continue traversal
        substituentAtoms.add(neighborIdx);
        visited.add(neighborIdx);
        queue.push(neighborIdx);
      }
    }
  }

  if (process.env.VERBOSE) {
    console.log(
      `[collectSubstituentAtoms] rootIdx=${sulfurIdx}, excludeAttachmentPoint=${excludeAttachmentPoint}, collected ${substituentAtoms.size} atoms: ${Array.from(substituentAtoms).join(",")}`,
    );
  }

  return substituentAtoms;
}

/**
 * Collect all atoms connected to a starting atom within an allowed set
 */
export function collectConnectedAtomsInSet(
  molecule: Molecule,
  startIdx: number,
  excludeIdx: number,
  allowedAtoms: Set<number>,
): number[] {
  const collected = new Set<number>();
  const stack = [startIdx];

  while (stack.length > 0) {
    const current = stack.pop()!;
    if (collected.has(current) || current === excludeIdx) continue;
    if (!allowedAtoms.has(current)) continue;

    collected.add(current);

    for (const bond of molecule.bonds) {
      let next = -1;
      if (bond.atom1 === current) next = bond.atom2;
      else if (bond.atom2 === current) next = bond.atom1;

      if (
        next !== -1 &&
        next !== excludeIdx &&
        !collected.has(next) &&
        allowedAtoms.has(next)
      ) {
        stack.push(next);
      }
    }
  }

  return Array.from(collected);
}

/**
 * Group identical substituents and count them
 */
export function groupSubstituents(
  substituents: Array<{ position: number; name: string; sortKey: string }>,
): Map<string, number[]> {
  const groups = new Map<string, number[]>();

  for (const sub of substituents) {
    const positions = groups.get(sub.name) || [];
    positions.push(sub.position);
    groups.set(sub.name, positions);
  }

  return groups;
}

/**
 * Format substituent groups with multiplicative prefixes and locants
 * Returns strings like "2,4-dimethyl-3-ethyl"
 */
export function formatSubstituentGroups(
  groups: Map<string, number[]>,
  opsinService?: OPSINService,
): string {
  // Sort groups alphabetically by substituent name
  const sortedGroups = Array.from(groups.entries()).sort((a, b) =>
    a[0].localeCompare(b[0]),
  );

  const parts: string[] = [];

  for (const [name, positions] of sortedGroups) {
    const sortedPositions = positions.sort((a, b) => a - b);
    const locants = sortedPositions.join(",");
    const count = positions.length;

    let prefix = "";
    if (count > 1) {
      prefix = getSimpleMultiplierWithVowel(
        count,
        name.charAt(0),
        opsinService ?? getSharedOPSINService(),
      );
    }

    if (count === 1) {
      parts.push(`${locants}-${name}`);
    } else {
      parts.push(`${locants}-${prefix}${name}`);
    }
  }

  return parts.join("-");
}
