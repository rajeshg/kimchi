import type { Molecule } from 'types';
import { BondType } from 'types';
import { getChainFunctionalGroupPriority } from './functional-group-detector';
import { analyzeRings } from '../ring-analysis';

/**
 * Chain selection logic for IUPAC naming.
 *
 * Selection rules (in order of precedence):
 * 1. Chain containing the principal functional group (highest priority)
 * 2. Longest chain by carbon count
 * 3. Longest chain by total atom count
 * 4. Best numbering by locant positions
 * 5. First found (arbitrary)
 */

export interface ChainSelectionResult {
   chain: number[];
   reason: string;
 }
 
/**
 * Find chains starting from functional group carbons.
 * For molecules with carboxylic acids, aldehydes, etc., build chains starting from the functional group.
 * These chains can pass through aromatic rings.
 */
function findChainsFromFunctionalGroups(molecule: Molecule): number[][] {
   const chains: number[][] = [];
   
   // Find carbons with functional groups
   for (let i = 0; i < molecule.atoms.length; i++) {
     const atom = molecule.atoms[i];
     if (!atom || atom.symbol !== 'C') continue;
     
     const bonds = molecule.bonds.filter(b => b.atom1 === i || b.atom2 === i);
     
     // Check for carboxylic acid (C=O bond to oxygen)
     const hasCarboxyl = bonds.some(b => {
       const neighbor = molecule.atoms[b.atom1 === i ? b.atom2 : b.atom1];
       return neighbor?.symbol === 'O' && b.type === BondType.DOUBLE;
     });
     
     if (hasCarboxyl) {
       // Found carboxylic acid carbon, build chain from it
       const visited = new Set<number>();
       const chain: number[] = [];
       dfsChainFromFunctionalGroup(i, molecule, visited, chain, chains);
     }
   }
   
   // Remove duplicates and sub-chains
   const uniqueChains = new Map<string, number[]>();
   for (const chain of chains) {
     const key = [...chain].sort((a, b) => a - b).join(',');
     const existing = uniqueChains.get(key);
     if (!existing || chain.length > existing.length) {
       uniqueChains.set(key, chain);
     }
   }
   
   return Array.from(uniqueChains.values()).sort((a, b) => b.length - a.length);
 }
 
/**
 * DFS to find longest chain from a functional group carbon.
 * Only extends through saturated (non-aromatic) carbons.
 */
function dfsChainFromFunctionalGroup(
   atom: number,
   molecule: Molecule,
   visited: Set<number>,
   currentChain: number[],
   allChains: number[][]
 ): void {
   visited.add(atom);
   currentChain.push(atom);
   
   // Record this chain
   if (currentChain.length >= 2) {
     allChains.push([...currentChain]);
   }
   
   // Try extending through saturated carbon neighbors only
   const neighbors = getNeighbors(atom, molecule);
   let extended = false;
   
   for (const neighbor of neighbors) {
     const neighborAtom = molecule.atoms[neighbor];
     // Extend only if it's a non-aromatic carbon and not yet visited
     if (!visited.has(neighbor) && neighborAtom?.symbol === 'C' && !neighborAtom.aromatic) {
       extended = true;
       dfsChainFromFunctionalGroup(neighbor, molecule, visited, currentChain, allChains);
     }
   }
   
   // If no extension possible, this is a terminal chain
   if (!extended && currentChain.length >= 1) {
     allChains.push([...currentChain]);
   }
   
   // Backtrack
   currentChain.pop();
   visited.delete(atom);
 }

/**
 * Select the principal (main) chain from a molecule.
 * Returns the longest chain that should be used as the parent in IUPAC naming.
 */
export function selectPrincipalChain(molecule: Molecule): ChainSelectionResult {
   // For molecules with functional groups, try to build chains starting from the functional group
   const fgChains = findChainsFromFunctionalGroups(molecule);
   if (fgChains.length > 0) {
     return selectBestChain(fgChains, molecule, 'From functional group');
   }

   // Otherwise find acyclic chains normally
   const acyclicChains = findAllAcyclicChains(molecule);

   if (acyclicChains.length === 0) {
     return { chain: [], reason: 'No acyclic chains found' };
   }

   if (acyclicChains.length === 1) {
     return { chain: acyclicChains[0]!, reason: 'Only one chain found' };
   }

   return selectBestChain(acyclicChains, molecule, '');
 }

/**
 * Select the best chain from a list of candidate chains.
 */
function selectBestChain(chains: number[][], molecule: Molecule, prefix: string): ChainSelectionResult {
   if (chains.length === 0) {
     return { chain: [], reason: 'No chains found' };
   }

   if (chains.length === 1) {
     return { chain: chains[0]!, reason: prefix || 'Only one chain found' };
   }

   // Rule 1: Prefer chain with highest priority functional group
   const fgPriorities = chains.map(chain => getChainFunctionalGroupPriority(chain, molecule));
   const maxFgPriority = Math.max(...fgPriorities);

   if (maxFgPriority > 0) {
     const chainWithFg = chains.filter((_, idx) => fgPriorities[idx] === maxFgPriority);
     if (chainWithFg.length === 1) {
       return { chain: chainWithFg[0]!, reason: prefix || 'Has principal functional group' };
     }
     // If multiple chains with same FG priority, continue with just those
     chains = chainWithFg;
   }

   // Rule 2: Longest chain by carbon count
   const carbonCounts = chains.map(chain => countCarbons(chain, molecule));
   const maxCarbons = Math.max(...carbonCounts);
   const longestByC = chains.filter((_, idx) => carbonCounts[idx] === maxCarbons);

   if (longestByC.length === 1) {
     return { chain: longestByC[0]!, reason: prefix || `Longest chain: ${maxCarbons} carbons` };
   }

   // Rule 3: Longest chain by total atom count
   const atomCounts = longestByC.map(chain => chain.length);
   const maxAtoms = Math.max(...atomCounts);
   const longestByAtoms = longestByC.filter((_, idx) => atomCounts[idx] === maxAtoms);

   if (longestByAtoms.length === 1) {
     return { chain: longestByAtoms[0]!, reason: prefix || `Longest chain: ${maxAtoms} atoms` };
   }

   // Rule 4: Best numbering (most locants at lowest positions)
   let bestChain = longestByAtoms[0]!;
   let bestLocants = getSubstituentLocants(bestChain, molecule);

   for (let i = 1; i < longestByAtoms.length; i++) {
     const chain = longestByAtoms[i]!;
     const locants = getSubstituentLocants(chain, molecule);
     if (isLowerLocants(locants, bestLocants)) {
       bestChain = chain;
       bestLocants = locants;
     }
   }

   return { chain: bestChain, reason: prefix || 'Best numbering and locants' };
 }

/**
 * Find all acyclic chains in a molecule.
 * An acyclic chain is a path through the graph where we don't revisit atoms.
 * For molecules with functional groups, chains can pass through aromatic rings,
 * which then become substituents on the main chain.
 * 
 * IUPAC rule: The main chain must consist of CARBON ATOMS ONLY.
 * Heteroatoms (O, N, etc.) are included as functional groups, not as chain atoms.
 */
function findAllAcyclicChains(molecule: Molecule): number[][] {
    const ringInfo = analyzeRings(molecule);
    const ringAtoms = new Set<number>();
    const aliphaticAtoms = new Set<number>();
    
    // Classify atoms as aromatic or aliphatic
    // IMPORTANT: Only include CARBON atoms in the main chain
    for (let i = 0; i < molecule.atoms.length; i++) {
      const atom = molecule.atoms[i]!;
      // Main chain must be carbon atoms
      if (atom.symbol !== 'C') continue;
      
      if (ringInfo.getRingsContainingAtom(i).length > 0) {
        ringAtoms.add(i);
        if (!atom.aromatic) {
          aliphaticAtoms.add(i);
        }
      } else {
        aliphaticAtoms.add(i);
      }
    }

   const chains: number[][] = [];
   const visited = new Set<number>();

   // Strategy: Find chains that stay in aliphatic regions, but can pass through
   // aromatic rings if necessary to connect functional groups.
   
   // Start DFS from each aliphatic atom to find the longest paths
   for (let startAtom = 0; startAtom < molecule.atoms.length; startAtom++) {
     if (!aliphaticAtoms.has(startAtom)) continue;
     visited.clear();
     const chain: number[] = [];
     dfsMaxChain(startAtom, molecule, visited, chain, chains, aliphaticAtoms);
   }

   // Remove duplicates and sub-chains
   const uniqueChains = new Map<string, number[]>();
   for (const chain of chains) {
     const key = [...chain].sort((a, b) => a - b).join(',');
     const existing = uniqueChains.get(key);
     if (!existing || chain.length > existing.length) {
       uniqueChains.set(key, chain);
     }
   }

   // Sort by length descending
   return Array.from(uniqueChains.values()).sort((a, b) => b.length - a.length);
 }

/**
 * DFS to find the longest acyclic path from a starting atom.
 */
function dfsMaxChain(
   atom: number,
   molecule: Molecule,
   visited: Set<number>,
   currentChain: number[],
   allChains: number[][],
   aliphaticAtoms: Set<number>
 ): void {
   visited.add(atom);
   currentChain.push(atom);

   // Record this chain
   if (currentChain.length > 2) {
     allChains.push([...currentChain]);
   }

   // Try extending to neighbors
   const neighbors = getNeighbors(atom, molecule);
   let extended = false;

   for (const neighbor of neighbors) {
     // Only extend through aliphatic atoms (not aromatic ring atoms)
     if (!visited.has(neighbor) && aliphaticAtoms.has(neighbor)) {
       extended = true;
       dfsMaxChain(neighbor, molecule, visited, currentChain, allChains, aliphaticAtoms);
     }
   }

   // If no extension possible, this is a terminal chain
   // Include chains of length >= 1 to support single-carbon compounds like methanol
   if (!extended && currentChain.length >= 1) {
     allChains.push([...currentChain]);
   }

   // Backtrack
   currentChain.pop();
   visited.delete(atom);
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
 * Count carbon atoms in a chain.
 */
function countCarbons(chain: number[], molecule: Molecule): number {
  let count = 0;
  for (const atomIdx of chain) {
    if (molecule.atoms[atomIdx]?.symbol === 'C') count++;
  }
  return count;
}

/**
 * Get the positions of substituents on a chain (for numbering comparison).
 * Lower positions are better according to IUPAC rules.
 */
function getSubstituentLocants(chain: number[], molecule: Molecule): number[] {
  const locants: number[] = [];
  const chainSet = new Set(chain);

  // For each atom in the chain, check if it has substituents not in the chain
  for (let i = 0; i < chain.length; i++) {
    const atomIdx = chain[i]!;
    const neighbors = getNeighbors(atomIdx, molecule);

    for (const neighbor of neighbors) {
      if (!chainSet.has(neighbor)) {
        // Found a substituent at position i (0-indexed)
        locants.push(i + 1); // IUPAC uses 1-based numbering
        break; // Only count once per atom
      }
    }
  }

  return locants;
}

/**
 * Compare two sets of locants. Returns true if locants1 is "better" (lower) than locants2.
 */
function isLowerLocants(locants1: number[], locants2: number[]): boolean {
  const len = Math.min(locants1.length, locants2.length);
  for (let i = 0; i < len; i++) {
    if (locants1[i]! < locants2[i]!) return true;
    if (locants1[i]! > locants2[i]!) return false;
  }
  return locants1.length < locants2.length;
}

export default selectPrincipalChain;
