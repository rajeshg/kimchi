import type { Molecule } from 'types';
import { analyzeRings } from '../ring-analysis';

/**
 * Detects and names aromatic ring substituents (phenyl, naphthyl, etc).
 * Handles both simple aromatic rings and substituted aromatic rings.
 */

export interface AromaticSubstituent {
  type: 'aromatic-ring';
  baseName: string; // e.g., "phenyl", "naphthyl"
  attachmentAtom: number; // Atom index where the ring attaches to the main chain
  ringAtoms: Set<number>; // All atoms in the aromatic ring system
  substituentsOnRing: Array<{ position: number; name: string }>; // e.g., [{position: 4, name: "isobutyl"}]
}

/**
 * Check if an atom is part of an aromatic ring.
 */
function isAromaticRing(atomIdx: number, molecule: Molecule): boolean {
  const atom = molecule.atoms[atomIdx];
  if (!atom || !atom.aromatic) return false;
  
  // Check if it's part of a ring
  const ringInfo = analyzeRings(molecule);
  return ringInfo.getRingsContainingAtom(atomIdx).length > 0;
}

/**
 * Get all atoms in the aromatic ring system connected to the given atom.
 * Uses DFS to traverse the aromatic ring structure.
 */
function getAromaticRingSystem(
  startAtom: number,
  molecule: Molecule,
  visited: Set<number> = new Set()
): Set<number> {
  if (visited.has(startAtom) || !isAromaticRing(startAtom, molecule)) {
    return visited;
  }
  
  visited.add(startAtom);
  
  // Find neighbors connected through aromatic bonds
  const neighbors = getNeighbors(startAtom, molecule);
  for (const neighbor of neighbors) {
    if (!visited.has(neighbor) && isAromaticRing(neighbor, molecule)) {
      getAromaticRingSystem(neighbor, molecule, visited);
    }
  }
  
  return visited;
}

/**
 * Determine the name of an aromatic ring system.
 * For now, handles simple benzene rings (phenyl) and fused systems.
 */
function getAromaticRingName(ringAtoms: Set<number>): string {
  const size = ringAtoms.size;
  
  // Common aromatic ring names
  if (size === 6) return 'phenyl';
  if (size === 10) return 'naphthyl'; // naphthalene
  if (size === 14) return 'anthracenyl'; // anthracene or similar
  
  // Generic fallback
  return `aromatic-C${size}`;
}

/**
 * Find aromatic substituents on the main chain.
 * Returns information about aromatic rings attached to the chain.
 */
export function findAromaticSubstituents(
  mainChainAtoms: Set<number>,
  molecule: Molecule
): AromaticSubstituent[] {
  const substituents: AromaticSubstituent[] = [];
  const processedRings = new Set<string>();
  
  // For each atom in the main chain
  for (const chainAtom of mainChainAtoms) {
    const neighbors = getNeighbors(chainAtom, molecule);
    
    for (const neighbor of neighbors) {
      // Skip if neighbor is in the main chain
      if (mainChainAtoms.has(neighbor)) continue;
      
      // Check if neighbor is an aromatic ring
      if (isAromaticRing(neighbor, molecule)) {
        // Get the full aromatic ring system
        const ringAtoms = getAromaticRingSystem(neighbor, molecule);
        const ringKey = Array.from(ringAtoms).sort().join(',');
        
        // Skip if we've already processed this ring
        if (processedRings.has(ringKey)) continue;
        processedRings.add(ringKey);
        
        // Get the base name of the aromatic system
        const baseName = getAromaticRingName(ringAtoms);
        
        // Find substituents on the aromatic ring
        const ringSubstituents = findSubstituentsOnAromaticRing(
          ringAtoms,
          molecule,
          chainAtom
        );
        
        substituents.push({
          type: 'aromatic-ring',
          baseName,
          attachmentAtom: chainAtom,
          ringAtoms,
          substituentsOnRing: ringSubstituents,
        });
      }
    }
  }
  
  return substituents;
}

/**
 * Order ring atoms in a circular traversal starting from startAtom.
 * Returns an ordered array following the ring bond connections.
 */
function orderRingAtoms(ringAtoms: Set<number>, molecule: Molecule, startAtom?: number): number[] {
  const ordered: number[] = [];
  const visited = new Set<number>();
  
  // If not specified, start from the first atom in the set
  let current = startAtom ?? Math.min(...Array.from(ringAtoms));
  
  if (!ringAtoms.has(current)) return Array.from(ringAtoms);
  
  ordered.push(current);
  visited.add(current);
  let previous = -1;
  
  // Traverse the ring by following bonds
  while (ordered.length < ringAtoms.size) {
    const neighbors = getNeighbors(current, molecule);
    let found = false;
    
    for (const neighbor of neighbors) {
      // Skip if not in ring or already visited (except the previous node in chain)
      if (!ringAtoms.has(neighbor) || (visited.has(neighbor) && neighbor !== ordered[ordered.length - 2])) {
        continue;
      }
      
      // If we've visited this before and it's not the start, skip
      if (visited.has(neighbor) && neighbor !== ordered[0]) continue;
      
      // If we're back to the start and we've visited all atoms, we're done
      if (neighbor === ordered[0] && ordered.length === ringAtoms.size) {
        found = true;
        break;
      }
      
      // Don't go back to the previous atom in the chain (except when closing the ring)
      if (neighbor === previous) continue;
      
      // Move to the next atom
      if (!visited.has(neighbor)) {
        previous = current;
        current = neighbor;
        ordered.push(current);
        visited.add(current);
        found = true;
        break;
      }
    }
    
    if (!found) break;
  }
  
  return ordered;
}

/**
 * Determines the position (1-4) based on aromatic ring numbering.
 * Chooses the direction around the ring that gives the lowest locants for substituents.
 */
function findSubstituentsOnAromaticRing(
  ringAtoms: Set<number>,
  molecule: Molecule,
  mainChainAttachmentAtom: number
): Array<{ position: number; name: string }> {
  const substituents: Array<{ position: number; name: string }> = [];
  
  // Find the ring atom that attaches to the main chain
  const attachmentAtom = Array.from(ringAtoms).find(atom => {
    const neighbors = getNeighbors(atom, molecule);
    return neighbors.includes(mainChainAttachmentAtom);
  });
  
  if (!attachmentAtom) return [];
  
  // Order the ring atoms starting from the attachment point
  const ringArray = orderRingAtoms(ringAtoms, molecule, attachmentAtom);
  
  // Try both directions and pick the one with lower locants
  const forwardSubstituents = getSubstituentPositions(ringArray, ringAtoms, molecule, 0);
  const reverseSubstituents = getSubstituentPositions(ringArray.reverse(), ringAtoms, molecule, 0);
  
  // Choose direction with lowest sum of positions
  const forwardSum = forwardSubstituents.reduce((sum, s) => sum + s.position, 0);
  const reverseSum = reverseSubstituents.reduce((sum, s) => sum + s.position, 0);
  
  return forwardSum <= reverseSum ? forwardSubstituents : reverseSubstituents;
}

/**
 * Get substituent positions for a given ring ordering.
 */
function getSubstituentPositions(
  ringArray: number[],
  ringAtoms: Set<number>,
  molecule: Molecule,
  attachmentIndex: number
): Array<{ position: number; name: string }> {
  const substituents: Array<{ position: number; name: string }> = [];
  
  for (let i = 0; i < ringArray.length; i++) {
    const ringAtom = ringArray[i]!;
    const positionInRing = i === attachmentIndex ? 1 : i + 1;
    
    // Skip position 1 (that's the attachment point)
    if (i === attachmentIndex) continue;
    
    // Find substituents on this ring atom
    const neighbors = getNeighbors(ringAtom, molecule);
    for (const neighbor of neighbors) {
      // Skip if neighbor is another ring atom
      if (ringAtoms.has(neighbor)) continue;
      
      // Identify the substituent
      const substName = getSubstituentNameForAromaticRing(neighbor, molecule);
      if (substName) {
        substituents.push({
          position: positionInRing,
          name: substName,
        });
      }
    }
  }
  
  return substituents;
}

/**
 * Get the name of a substituent on an aromatic ring.
 */
function getSubstituentNameForAromaticRing(atomIdx: number, molecule: Molecule): string {
  const atom = molecule.atoms[atomIdx];
  if (!atom) return '';
  
  // Hydroxy group
  if (atom.symbol === 'O' && atom.hydrogens! > 0) {
    return 'hydroxy';
  }
  
  // Halogens
  if (atom.symbol === 'F') return 'fluoro';
  if (atom.symbol === 'Cl') return 'chloro';
  if (atom.symbol === 'Br') return 'bromo';
  if (atom.symbol === 'I') return 'iodo';
  
  // Alkyl groups (count carbon branch)
  if (atom.symbol === 'C' && !atom.aromatic) {
    return getAlkylBranchName(atomIdx, molecule);
  }
  
  // Amino group
  if (atom.symbol === 'N' && atom.hydrogens! > 0) {
    return 'amino';
  }
  
  return '';
}

/**
 * Count the length of a carbon branch attached to an aromatic ring.
 */
function countAromaticBranchLength(atomIdx: number, molecule: Molecule): number {
  const visited = new Set<number>();
  return dfsCountAromaticBranch(atomIdx, molecule, visited);
}

function dfsCountAromaticBranch(
  atomIdx: number,
  molecule: Molecule,
  visited: Set<number>
): number {
  if (visited.has(atomIdx)) return 0;
  if (molecule.atoms[atomIdx]?.symbol !== 'C') return 0;
  if (molecule.atoms[atomIdx]?.aromatic) return 0; // Don't extend through aromatic atoms
  
  visited.add(atomIdx);
  let maxLength = 1;
  
  const neighbors = getNeighbors(atomIdx, molecule);
  for (const neighbor of neighbors) {
    if (!visited.has(neighbor) && molecule.atoms[neighbor]?.symbol === 'C' && !molecule.atoms[neighbor]?.aromatic) {
      maxLength = Math.max(maxLength, 1 + dfsCountAromaticBranch(neighbor, molecule, visited));
    }
  }
  
  return maxLength;
}

/**
 * Get the alkyl group name recognizing branched structures.
 * Handles common patterns like isobutyl, sec-butyl, tert-butyl, etc.
 */
function getAlkylBranchName(atomIdx: number, molecule: Molecule): string {
  const neighbors = getNeighbors(atomIdx, molecule);
  
  // Count total carbons in this branch and classify
  const totalCarbons = countTotalCarbonsInBranch(atomIdx, molecule);
  const attachmentCarbon = molecule.atoms[atomIdx];
  if (!attachmentCarbon) return '';
  
  // Get the longest chain length from this attachment point
  const longestChain = countAromaticBranchLength(atomIdx, molecule);
  
  // Detect branching patterns
  // Count how many non-hydrogen neighbors this carbon has
  const nonHydrogenNeighbors = neighbors.filter(n => {
    const atom = molecule.atoms[n];
    return atom && atom.symbol !== 'H';
  }).length;
  
  // For isobutyl: (CH3)2CH-CH2-
  // The CH2 attachment point has 2 C neighbors (parent) + 1 C (the CH)
  // The CH has 2 C neighbors (CH2) + 2 methyls (so 3 C neighbors total)
  // Total carbons in branch = 4, longest chain = 3, attachment has 1 neighbor (not counting aromatic)
  
  if (longestChain === 3 && totalCarbons === 4) {
    // This could be isobutyl (3-methylpropyl)
    return 'isobutyl';
  }
  
  if (longestChain === 3 && totalCarbons === 3) {
    return 'propyl';
  }
  
  if (longestChain === 2 && totalCarbons === 3) {
    // This is isopropyl: (CH3)2CH-
    return 'isopropyl';
  }
  
  // For simple straight chains
  if (totalCarbons === longestChain) {
    return getAlkylName(totalCarbons);
  }
  
  // For other branched structures, use total carbon count
  return getAlkylName(totalCarbons);
}

/**
 * Count total number of carbons in a branch (not just the longest chain).
 */
function countTotalCarbonsInBranch(atomIdx: number, molecule: Molecule): number {
  const visited = new Set<number>();
  return dfsCountTotalCarbons(atomIdx, molecule, visited);
}

function dfsCountTotalCarbons(
  atomIdx: number,
  molecule: Molecule,
  visited: Set<number>
): number {
  if (visited.has(atomIdx)) return 0;
  
  const atom = molecule.atoms[atomIdx];
  if (!atom || atom.symbol !== 'C' || atom.aromatic) return 0;
  
  visited.add(atomIdx);
  let totalCarbons = 1;
  
  const neighbors = getNeighbors(atomIdx, molecule);
  for (const neighbor of neighbors) {
    if (!visited.has(neighbor)) {
      const neighborAtom = molecule.atoms[neighbor];
      if (neighborAtom?.symbol === 'C' && !neighborAtom.aromatic) {
        totalCarbons += dfsCountTotalCarbons(neighbor, molecule, visited);
      }
    }
  }
  
  return totalCarbons;
}

/**
 * Get the alkyl group name (methyl, ethyl, propyl, etc.).
 */
function getAlkylName(carbonCount: number): string {
  const names: Record<number, string> = {
    1: 'methyl',
    2: 'ethyl',
    3: 'propyl',
    4: 'butyl',
    5: 'pentyl',
    6: 'hexyl',
    7: 'heptyl',
    8: 'octyl',
    9: 'nonyl',
    10: 'decyl',
  };
  
  return names[carbonCount] ?? `C${carbonCount}alkyl`;
}

/**
 * Get neighboring atoms (connected by bonds).
 */
function getNeighbors(atomIdx: number, molecule: Molecule): number[] {
  const neighbors: number[] = [];
  for (const bond of molecule.bonds) {
    if (bond.atom1 === atomIdx) neighbors.push(bond.atom2);
    else if (bond.atom2 === atomIdx) neighbors.push(bond.atom1);
  }
  return neighbors;
}

/**
 * Format aromatic substituent name with position numbers.
 * Example: "4-isobutylphenyl"
 */
export function formatAromaticSubstituentName(substituent: AromaticSubstituent): string {
  if (substituent.substituentsOnRing.length === 0) {
    return substituent.baseName;
  }
  
  // Sort substituents by position
  const sorted = [...substituent.substituentsOnRing].sort((a, b) => a.position - b.position);
  
  // Build the prefix
  const prefixParts: string[] = [];
  for (const sub of sorted) {
    prefixParts.push(`${sub.position}-${sub.name}`);
  }
  
  // Wrap in parentheses when substituted to distinguish aromatic ring locants from main chain locants
  return `(${prefixParts.join('-')}${substituent.baseName})`;
}

export default findAromaticSubstituents;
