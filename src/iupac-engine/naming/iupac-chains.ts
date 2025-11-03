import type { Molecule } from 'types';
import { BondType } from 'types';
import { getAlkaneName, getGreekNumeral, getAlkaneBaseName, getAlkylName } from './iupac-helpers';
import type { Substituent, SubstituentInfo } from './iupac-types';
import { getSharedDetector } from '../opsin-functional-group-detector';

/**
 * Determines if an atom should be excluded from the parent chain based on functional group type
 * For ketones/aldehydes: exclude oxygen only, keep carbonyl carbon
 * For carboxylic acids: exclude oxygens only, keep COOH carbon
 * For alcohols: exclude oxygen only, keep carbon bearing OH
 * For amines: don't exclude any atoms (nitrogen is part of parent in amines)
 * For ethers/esters: exclude oxygen only
 */
function shouldExcludeAtomFromChain(atom: any, fgName: string, fgType: string): boolean {
  const symbol = atom.symbol;
  const lowerName = fgName.toLowerCase();
  
  // For ketones and aldehydes: only exclude oxygen, keep carbonyl carbon
  if (lowerName.includes('ketone') || lowerName.includes('aldehyde') || lowerName === 'carbonyl') {
    return symbol === 'O';
  }
  
  // For carboxylic acids: exclude oxygens only, keep COOH carbon
  if (lowerName.includes('carboxylic') || lowerName.includes('acid')) {
    return symbol === 'O';
  }
  
  // For alcohols: exclude oxygen only, keep carbon bearing OH
  if (lowerName.includes('alcohol') || lowerName === 'ol') {
    return symbol === 'O';
  }
  
  // For amines: don't exclude nitrogen (it can be part of parent chain in heterocycles)
  // but for simple amines, nitrogen is typically a substituent
  if (lowerName.includes('amine') || lowerName === 'amino') {
    return symbol === 'N';
  }
  
  // For ethers: exclude oxygen only
  if (lowerName.includes('ether') || lowerName === 'oxy') {
    return symbol === 'O';
  }
  
  // For esters: exclude oxygens only, keep carbonyl carbon
  if (lowerName.includes('ester') || lowerName.includes('oate')) {
    return symbol === 'O';
  }
  
  // For amides: exclude oxygen and nitrogen (not part of parent chain for simple amides)
  if (lowerName.includes('amide')) {
    return symbol === 'O' || symbol === 'N';
  }
  
  // For nitriles: exclude nitrogen only, keep carbon
  if (lowerName.includes('nitrile') || lowerName === 'cyano') {
    return symbol === 'N';
  }
  
  // For thiocyanates: exclude entire S-C≡N group (sulfur, carbon, and nitrogen)
  // The fgType for thiocyanates is 'SC#N' pattern
  if (lowerName.includes('thiocyanate') || lowerName.includes('thiocyano') || fgType === 'SC#N') {
    return true; // Exclude all atoms (S, C, N) in the thiocyanate group
  }
  
  // Default: exclude all heteroatoms (non-carbon)
  return symbol !== 'C';
}

/**
 * Count the number of functional groups directly attached to chain atoms.
 * This helps prefer chains where functional groups are directly accessible,
 * rather than buried in alkyl substituents.
 */
function countDirectFunctionalGroupAttachments(
  chain: number[],
  molecule: Molecule,
  functionalGroups: Array<{name: string, type: string, atoms?: number[]}>
): number {
  let count = 0;
  const chainSet = new Set(chain);
  
  // Look for functional groups that are directly bonded to chain atoms
  for (const fg of functionalGroups) {
    if (!fg.atoms || fg.atoms.length === 0) continue;
    
    // For sulfonyl/sulfinyl groups, check if sulfur is bonded to chain
    if (fg.name === 'sulfonyl' || fg.name === 'sulfinyl') {
      const sulfurIdx = fg.atoms[0]; // Sulfur is the first atom in the functional group
      if (sulfurIdx === undefined) continue;
      
      const sulfurAtom = molecule.atoms[sulfurIdx];
      if (!sulfurAtom) continue;
      
      // Check bonds from sulfur to see if any connect to chain atoms
      for (const bond of molecule.bonds) {
        const otherAtomIdx = bond.atom1 === sulfurIdx ? bond.atom2 : 
                             bond.atom2 === sulfurIdx ? bond.atom1 : null;
        
        if (otherAtomIdx !== null && chainSet.has(otherAtomIdx)) {
          // Sulfur is directly bonded to a chain atom
          count++;
          break; // Count this FG once
        }
      }
    }
    
    // For thiocyanate groups (S-C≡N), check if sulfur is bonded to chain
    if (fg.name === 'thiocyanate' && fg.atoms.length >= 1) {
      const sulfurIdx = fg.atoms[0]; // Sulfur is the first atom in thiocyanate (S-C≡N)
      if (sulfurIdx === undefined) continue;
      
      const sulfurAtom = molecule.atoms[sulfurIdx];
      if (!sulfurAtom) continue;
      
      // Check bonds from sulfur to see if any connect to chain atoms
      for (const bond of molecule.bonds) {
        const otherAtomIdx = bond.atom1 === sulfurIdx ? bond.atom2 : 
                             bond.atom2 === sulfurIdx ? bond.atom1 : null;
        
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

export function findMainChain(molecule: Molecule): number[] {
  // Detect functional groups first to exclude their atoms from the parent chain
  const functionalGroups = getSharedDetector().detectFunctionalGroups(molecule);
  const excludedAtomIds = new Set<number>();
  
  // Collect atom IDs that should be excluded from the parent chain
  // For most functional groups, only heteroatoms (O, N, S, etc.) are excluded
  // The carbon atoms bearing the functional groups should remain in the parent chain
  if (process.env.VERBOSE) {
    console.log(`[findMainChain] Detected ${functionalGroups.length} functional groups`);
  }
  for (const fg of functionalGroups) {
    if (process.env.VERBOSE) {
      console.log(`[findMainChain] FG: name="${fg.name}", type="${fg.type}", atoms=${fg.atoms}`);
    }
    if (fg.atoms && Array.isArray(fg.atoms)) {
      for (const atomId of fg.atoms) {
        if (typeof atomId === 'number') {
          const atom = molecule.atoms[atomId];
          if (!atom) continue;
          
          // Apply selective exclusion based on functional group type
          const shouldExclude = shouldExcludeAtomFromChain(atom, fg.name, fg.type);
          if (process.env.VERBOSE) {
            console.log(`[findMainChain]   Atom ${atomId} (${atom.symbol}): shouldExclude=${shouldExclude}`);
          }
          if (shouldExclude) {
            excludedAtomIds.add(atomId);
          }
        }
      }
    }
  }
  if (process.env.VERBOSE) {
    console.log(`[findMainChain] Excluded FG atoms: ${Array.from(excludedAtomIds).join(',')}`);
  }
  
  // Exclude all ring atoms from the main chain
  // Rings should be treated as substituents unless P-44.1.1 or other rules override this
  // Exclude all ring atoms from the main chain by default. This keeps rings
  // treated as substituents which is the historically-correct behavior for
  // selecting a hydrocarbon parent chain in the presence of aromatic systems.
  if (molecule.rings && molecule.rings.length > 0) {
    for (const ring of molecule.rings) {
      for (const atomId of ring) {
        excludedAtomIds.add(atomId);
      }
    }
    if (process.env.VERBOSE) {
      console.log(`[findMainChain] Excluded ${molecule.rings.length} rings with atoms: ${Array.from(excludedAtomIds).join(',')}`);
    }
  }

  // Consider both carbon-only parent candidates and hetero-containing parent candidates.
  // Find all longest carbon-only chains and all longest heavy-atom chains (non-hydrogen).
  const carbonChains = findAllCarbonChains(molecule, excludedAtomIds);
  const atomChains = findAllAtomChains(molecule, excludedAtomIds);

  if (process.env.VERBOSE) {
    console.log(`[findMainChain] carbonChains: ${JSON.stringify(carbonChains)}, atomChains: ${JSON.stringify(atomChains)}`);
  }

  // Primary preference is by number of carbons in the parent chain. Compute the
  // longest carbon-only chain length; consider hetero-containing chains only if
  // they have the same number of carbons.
  const maxCarbonLen = carbonChains.length ? Math.max(...carbonChains.map(c => c.length)) : 0;

  // Helper function to check if a chain contains halogens (F, Cl, Br, I)
  // Halogens should NEVER be part of the parent chain - they must be substituents
  const containsHalogen = (chain: number[]): boolean => {
    return chain.some(idx => {
      const symbol = molecule.atoms[idx]?.symbol;
      return symbol === 'F' || symbol === 'Cl' || symbol === 'Br' || symbol === 'I';
    });
  };

  // If we have at least one carbon-only chain, use its carbon-length as primary
  // basis for candidate selection. Otherwise, fall back to heavy-atom chains.
  const candidates: number[][] = [];
  if (maxCarbonLen >= 1) {
    // take all carbon-only chains of the max carbon length
    for (const c of carbonChains) if (c.length === maxCarbonLen) candidates.push(c);
    // also include hetero-containing chains that have the same number of carbons
    // BUT exclude any chains containing halogens (F, Cl, Br, I) - they must be substituents
    for (const c of atomChains) {
      const carbonCount = c.filter(idx => molecule.atoms[idx] && molecule.atoms[idx].symbol === 'C').length;
      if (carbonCount === maxCarbonLen && !containsHalogen(c)) candidates.push(c);
    }
  } else {
    // no carbon chains found; pick longest heavy-atom chains
    // BUT exclude any chains containing halogens
    const maxAtomLen = atomChains.length ? Math.max(...atomChains.map(c => c.length)) : 0;
    if (maxAtomLen < 1) return [];
    for (const c of atomChains) {
      if (c.length === maxAtomLen && !containsHalogen(c)) candidates.push(c);
    }
  }

  // Always evaluate orientation, even for single candidates, to ensure lowest locants
  // (Removed early return that prevented orientation check)

  // Evaluate candidates using IUPAC tie-break rules:
  // 1) Prefer chain that contains a principal functional group (carboxylic acid, sulfonic
  //    acid, amide, aldehyde/ketone, alcohol) if present in only some candidates.
  // 2) If none/ambiguous, prefer hydrocarbon chain (all-C) when lengths equal and no
  //    principal functional group favors a hetero chain.
  // 3) If still tied, fall back to priority locants and OPSIN-like heuristics already
  //    implemented below.

  // Compute functional-group priority for each candidate
  const fgPriorities = candidates.map(c => getChainFunctionalGroupPriority(c, molecule));
  if (process.env.VERBOSE) {
    console.log('[findMainChain] Functional group priorities for candidates:');
    candidates.forEach((c, i) => {
      console.log(`  Chain ${i} [${c.join(',')}]: priority = ${fgPriorities[i]}`);
    });
  }
  const maxFG = Math.max(...fgPriorities);
  if (maxFG > 0) {
    // Prefer any candidate with the highest functional group priority
    const filtered = candidates.filter((_, i) => fgPriorities[i] === maxFG);
    // Always check orientation even for single functional group candidates
    // if (filtered.length === 1) return filtered[0]!;
    // otherwise restrict candidates to filtered set and continue
    candidates.length = 0;
    candidates.push(...filtered);
  } else {
    // No principal functional groups found in any candidate: prefer hydrocarbon chain(s)
    const hydroCandidates = candidates.filter(c => isHydrocarbonChain(c, molecule));
    // Always check orientation even for single hydrocarbon candidates
    // if (hydroCandidates.length === 1) return hydroCandidates[0]!;
    if (hydroCandidates.length > 0) {
      // restrict to hydrocarbon candidates only
      candidates.length = 0;
      candidates.push(...hydroCandidates);
    }
    // else continue with mixed candidates if no hydrocarbon-only candidate isolated
  }

  // NEW TIE-BREAKER: Prefer chains with more direct functional group attachments
  // This helps when sulfonyl/sulfinyl groups are present - we want chains where
  // the functional groups are directly attached to chain atoms, not buried in substituents
  if (candidates.length > 1) {
    const fgAttachmentCounts = candidates.map(c => countDirectFunctionalGroupAttachments(c, molecule, functionalGroups));
    const maxAttachments = Math.max(...fgAttachmentCounts);
    
    if (process.env.VERBOSE) {
      console.log('[findMainChain] Direct FG attachment counts:');
      candidates.forEach((c, i) => {
        console.log(`  Chain ${i} [${c.join(',')}]: ${fgAttachmentCounts[i]} direct FG attachments`);
      });
    }
    
    if (maxAttachments > 0) {
      const filteredByFG = candidates.filter((_, i) => fgAttachmentCounts[i] === maxAttachments);
      if (filteredByFG.length > 0) {
        candidates.length = 0;
        candidates.push(...filteredByFG);
        if (process.env.VERBOSE) {
          console.log(`[findMainChain] Filtered to ${filteredByFG.length} chains with max FG attachments (${maxAttachments})`);
        }
      }
    }
  }

  // Now apply existing priority-locant logic and heuristics among remaining candidates
  let bestChain = candidates[0]!;
  let bestPositions: number[] = [];
  let bestCount = 0;
  let bestPriorityLocants: [number[], number[], number[]] | null = null;

  for (const chain of candidates) {
    // Check for functional groups and orient chain to give them lowest numbers
    const fgPositions = getFunctionalGroupPositions(chain, molecule);
    const fgPositionsReversed = getFunctionalGroupPositions([...chain].reverse(), molecule);
    
    if (process.env.VERBOSE) {
      console.log(`[findMainChain] Chain [${chain}]: fgPositions=${JSON.stringify(fgPositions)}, reversed fgPositions=${JSON.stringify(fgPositionsReversed)}`);
    }
    
    let shouldReverse = false;
    if (fgPositions.length > 0 && fgPositionsReversed.length > 0) {
      shouldReverse = isBetterLocants(fgPositionsReversed, fgPositions);
      if (process.env.VERBOSE) {
        console.log(`[findMainChain] Comparing FG locants: reversed ${JSON.stringify(fgPositionsReversed)} vs original ${JSON.stringify(fgPositions)}, shouldReverse=${shouldReverse}`);
      }
    } else {
      let priority = getPriorityLocants(molecule, chain);
      const renum = renumberPriorityLocants(priority, chain.length);
      shouldReverse = isBetterPriorityLocants(renum, priority);
    }
    
    const chosenChain = shouldReverse ? [...chain].reverse() : chain;
    const chosenPriority = getPriorityLocants(molecule, chosenChain);
    
    // Calculate positions AFTER orienting the chain
    const substituents = findSubstituents(molecule, chosenChain);
    const positions = substituents.map(s => parseInt(s.position)).sort((a, b) => a - b);
    const count = substituents.length;

    if (bestPriorityLocants === null) {
      bestChain = chosenChain;
      bestPositions = positions;
      bestCount = count;
      bestPriorityLocants = chosenPriority;
      continue;
    }

    if (isBetterPriorityLocants(chosenPriority, bestPriorityLocants)) {
      if (process.env.VERBOSE) {
        console.log(`[findMainChain] Chain [${chosenChain}] has better priority locants than [${bestChain}]`);
      }
      bestChain = chosenChain;
      bestPositions = positions;
      bestCount = count;
      bestPriorityLocants = chosenPriority;
    } else if (JSON.stringify(chosenPriority) === JSON.stringify(bestPriorityLocants)) {
      if (process.env.VERBOSE) {
        console.log(`[findMainChain] Chain [${chosenChain}] has equal priority locants to [${bestChain}]`);
      }
      if (isBetterByOpsinHeuristics(molecule, chosenChain, bestChain)) {
        if (process.env.VERBOSE) {
          console.log(`[findMainChain] Chain [${chosenChain}] is better by OPSIN heuristics`);
        }
        bestChain = chosenChain;
        bestPositions = positions;
        bestCount = count;
      } else {
        if (process.env.VERBOSE) {
          console.log(`[findMainChain] Comparing chains using compareChains(): [${chosenChain}] vs [${bestChain}]`);
        }
        const isBetter = compareChains(positions, count, chosenChain, bestPositions, bestCount, bestChain);
        if (process.env.VERBOSE) {
          console.log(`[findMainChain] compareChains result: ${isBetter}`);
        }
        if (isBetter) {
          bestChain = chosenChain;
          bestPositions = positions;
          bestCount = count;
        }
      }
    }
  }

  return bestChain;
}

// Return true when every atom in chain is carbon
function isHydrocarbonChain(chain: number[], molecule: Molecule): boolean {
  return chain.every(idx => molecule.atoms[idx] && molecule.atoms[idx].symbol === 'C');
}

// Find all heavy-atom chains (non-hydrogen atoms) of maximum length, canonicalized
function findAllAtomChains(molecule: Molecule, excludedAtomIds: Set<number> = new Set()): number[][] {
  const atomIndices = molecule.atoms
    .map((atom, idx) => ({ atom, idx }))
    .filter(({ atom, idx }) => atom.symbol !== 'H' && !excludedAtomIds.has(idx))
    .map(({ idx }) => idx);

  if (atomIndices.length === 0) return [];

  const adjList = new Map<number, number[]>();
  for (const idx of atomIndices) adjList.set(idx, []);

  for (const bond of molecule.bonds) {
    if (
      molecule.atoms[bond.atom1]?.symbol !== 'H' &&
      molecule.atoms[bond.atom2]?.symbol !== 'H' &&
      !excludedAtomIds.has(bond.atom1) &&
      !excludedAtomIds.has(bond.atom2)
    ) {
      adjList.get(bond.atom1)?.push(bond.atom2);
      adjList.get(bond.atom2)?.push(bond.atom1);
    }
  }

  const longest = ((): number[] => {
    let longestPath: number[] = [];
    const dfs = (node: number, visited: Set<number>, path: number[]): void => {
      if (path.length > longestPath.length) longestPath = [...path];
      const neighbors = adjList.get(node) ?? [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          path.push(neighbor);
          dfs(neighbor, visited, path);
          path.pop();
          visited.delete(neighbor);
        }
      }
    };
    for (const start of atomIndices) {
      const visited = new Set<number>([start]);
      dfs(start, visited, [start]);
    }
    return longestPath;
  })();

  const targetLength = longest.length;
  if (targetLength < 1) return [];

  // Special case: single atom (no bonds)
  if (targetLength === 1) {
    return atomIndices.map(idx => [idx]);
  }

  const found: number[][] = [];
  const seen = new Set<string>();

  function dfsLimited(current: number, visited: Set<number>, path: number[]): void {
    if (path.length === targetLength) {
      const forward = path.join(',');
      const reversed = [...path].slice().reverse().join(',');
      const key = forward < reversed ? forward : reversed;
      if (!seen.has(key)) {
        seen.add(key);
        const canonical = forward < reversed ? [...path] : [...path].slice().reverse();
        found.push(canonical);
      }
      return;
    }

    const neighbors = adjList.get(current) ?? [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        path.push(neighbor);
        dfsLimited(neighbor, visited, path);
        path.pop();
        visited.delete(neighbor);
      }
    }
  }

  for (const startAtom of atomIndices) {
    const visited = new Set<number>([startAtom]);
    dfsLimited(startAtom, visited, [startAtom]);
  }

  return found.filter(chain => chain.length >= 2);
}

// Return small integer priority for principal functional group found on chain
// Higher number => higher precedence as principal group
export function getChainFunctionalGroupPriority(chain: number[], molecule: Molecule): number {
  // Priorities (example, not exhaustive):
  // 7 = ester carbonyl carbon (C in C(=O)-O-C)
  // 6 = carboxylic acid / sulfonic acid / phosphonic acid
  // 5 = amide / ester oxygen-bonded carbon / acid chloride / sulfonamide
  // 4 = aldehyde/ketone / nitrile / sulfone-like
  // 3 = alcohol
  let best = 0;
  const chainSet = new Set(chain);
  for (const idx of chain) {
    const atom = molecule.atoms[idx];
    if (!atom) continue;

    // Carbon-based functional groups (carboxylic acid, amide, ester, acid chloride, carbonyl)
    if (atom.symbol === 'C') {
      let hasDoubleO = false;
      let hasSingleOwithH = false;
      let hasSingleO = false;
      let hasSingleN = false;
      let hasCl = false;
      let singleOConnectedToC = false;
      let isEsterCarbonyl = false;
      
      for (const b of molecule.bonds) {
        if (b.atom1 !== idx && b.atom2 !== idx) continue;
        const neigh = b.atom1 === idx ? b.atom2 : b.atom1;
        const nat = molecule.atoms[neigh];
        if (!nat) continue;
        if (nat.symbol === 'O') {
          if (b.type === BondType.DOUBLE) hasDoubleO = true;
          if (b.type === BondType.SINGLE) {
            hasSingleO = true;
            if ((nat as any).hydrogens && (nat as any).hydrogens > 0) hasSingleOwithH = true;
            // check if that oxygen is bonded to a carbon (ester-like)
            const oConnectedToC = molecule.bonds.some(ob =>
              (ob.atom1 === neigh && molecule.atoms[ob.atom2]?.symbol === 'C') ||
              (ob.atom2 === neigh && molecule.atoms[ob.atom1]?.symbol === 'C')
            );
            if (oConnectedToC) singleOConnectedToC = true;
          }
        }
        if (nat.symbol === 'N' && b.type === BondType.SINGLE) hasSingleN = true;
        if (nat.symbol === 'Cl' && b.type === BondType.SINGLE) hasCl = true;
        // nitrile: C#N triple bond
        if (nat.symbol === 'N' && b.type === BondType.TRIPLE) {
          best = Math.max(best, 4);
        }
      }
      
      // Detect if this is an ester carbonyl carbon (C in R-C(=O)-O-R')
      // This should get highest priority so one ester is chosen as parent chain
      if (hasDoubleO && hasSingleO && singleOConnectedToC && !hasSingleOwithH) {
        isEsterCarbonyl = true;
      }
      
      // carboxylic acid
      if (hasDoubleO && hasSingleOwithH) best = Math.max(best, 6);
      // ester carbonyl carbon (highest priority for chain selection)
      else if (isEsterCarbonyl) best = Math.max(best, 7);
      // amide
      else if (hasDoubleO && hasSingleN) best = Math.max(best, 5);
      // acid chloride
      else if (hasDoubleO && hasCl) best = Math.max(best, 5);
      // anhydride: R-C(=O)-O-C(=O)-R (detect C with =O and -O that connects to another C with =O)
      else if (hasDoubleO && hasSingleO) {
        // find the single O neighbor index
        const singleOidx = molecule.bonds.find(b => (b.atom1 === idx || b.atom2 === idx) && ((b.atom1 === idx ? molecule.atoms[b.atom2] : molecule.atoms[b.atom1])?.symbol === 'O') && b.type === BondType.SINGLE);
        if (singleOidx) {
          const oIdx = singleOidx.atom1 === idx ? singleOidx.atom2 : singleOidx.atom1;
          // check if that O connects to another carbon which has a double O
          const connectsToCarbonyl = molecule.bonds.some(ob => {
            const otherC = ob.atom1 === oIdx ? ob.atom2 : ob.atom1 === oIdx ? ob.atom1 : -1;
            if (otherC < 0) return false;
            const otherNat = molecule.atoms[otherC];
            if (!otherNat || otherNat.symbol !== 'C') return false;
            // check for C=O on that carbon
            return molecule.bonds.some(cb => (cb.atom1 === otherC || cb.atom2 === otherC) && ((cb.atom1 === otherC ? molecule.atoms[cb.atom2] : molecule.atoms[cb.atom1])?.symbol === 'O') && cb.type === BondType.DOUBLE);
          });
          if (connectsToCarbonyl) {
            best = Math.max(best, 5);
          } else {
            // ester-like already handled above, so default to ester level
            best = Math.max(best, 5);
          }
        } else {
          best = Math.max(best, 5);
        }
      }
      // ketone/aldehyde-like
      else if (hasDoubleO) best = Math.max(best, 4);
    }

    // Sulfur: sulfonic acids, sulfonamides, sulfone-like
    if (atom.symbol === 'S') {
      let doubleOcount = 0;
      let singleOwithH = false;
      let singleN = false;
      let hasCl = false;
      for (const b of molecule.bonds) {
        if (b.atom1 !== idx && b.atom2 !== idx) continue;
        const neigh = b.atom1 === idx ? b.atom2 : b.atom1;
        const nat = molecule.atoms[neigh];
        if (!nat) continue;
        if (nat.symbol === 'O') {
          if (b.type === BondType.DOUBLE) doubleOcount++;
          if (b.type === BondType.SINGLE && (nat as any).hydrogens && (nat as any).hydrogens > 0) singleOwithH = true;
        }
        if (nat.symbol === 'N' && b.type === BondType.SINGLE) singleN = true;
        if (nat.symbol === 'Cl' && b.type === BondType.SINGLE) hasCl = true;
      }
      if (doubleOcount >= 2 && singleOwithH) {
        // sulfonic acid R-S(=O)2-OH
        best = Math.max(best, 6);
      } else if (doubleOcount >= 2 && singleN) {
        // sulfonamide R-S(=O)2-NR2
        best = Math.max(best, 5);
      } else if (doubleOcount >= 2 && hasCl) {
        // sulfonyl chloride R-S(=O)2-Cl
        best = Math.max(best, 5);
      } else if (doubleOcount >= 2) {
        best = Math.max(best, 4); // sulfone-like
      }
    }

    // Phosphorus: phosphonic / phosphoric acid detection (simple heuristic)
    if (atom.symbol === 'P') {
      let doubleO = false;
      let singleOwithH = false;
      for (const b of molecule.bonds) {
        if (b.atom1 !== idx && b.atom2 !== idx) continue;
        const neigh = b.atom1 === idx ? b.atom2 : b.atom1;
        const nat = molecule.atoms[neigh];
        if (!nat) continue;
        if (nat.symbol === 'O') {
          if (b.type === BondType.DOUBLE) doubleO = true;
          if (b.type === BondType.SINGLE && (nat as any).hydrogens && (nat as any).hydrogens > 0) singleOwithH = true;
        }
      }
      if (doubleO && singleOwithH) best = Math.max(best, 6); // phosphonic/phosphoric acid like
    }

    // Nitro group detection: look for N with two O neighbors (one double-bonded typical)
    if (atom.symbol === 'N') {
      let oCount = 0;
      let hasDoubleO = false;
      for (const b of molecule.bonds) {
        if (b.atom1 !== idx && b.atom2 !== idx) continue;
        const neigh = b.atom1 === idx ? b.atom2 : b.atom1;
        const nat = molecule.atoms[neigh];
        if (!nat) continue;
        if (nat.symbol === 'O') {
          oCount++;
          if (b.type === BondType.DOUBLE) hasDoubleO = true;
        }
      }
      if (oCount >= 2 && hasDoubleO) {
        best = Math.max(best, 4); // nitro considered similar priority to carbonyls
      }
      // isocyanate/isothiocyanate detection: N double-bond to C which is double-bonded to O or S
      for (const b of molecule.bonds) {
        if (b.atom1 !== idx && b.atom2 !== idx) continue;
        const neigh = b.atom1 === idx ? b.atom2 : b.atom1;
        const nat = molecule.atoms[neigh];
        if (!nat) continue;
        if (nat.symbol === 'C' && b.type === BondType.DOUBLE) {
          // check C has double-bonded O (isocyanate R-N=C=O)
          const cHasDoubleO = molecule.bonds.some(cb => (cb.atom1 === neigh || cb.atom2 === neigh) && ((cb.atom1 === neigh ? molecule.atoms[cb.atom2] : molecule.atoms[cb.atom1])?.symbol === 'O') && cb.type === BondType.DOUBLE);
          const cHasDoubleS = molecule.bonds.some(cb => (cb.atom1 === neigh || cb.atom2 === neigh) && ((cb.atom1 === neigh ? molecule.atoms[cb.atom2] : molecule.atoms[cb.atom1])?.symbol === 'S') && cb.type === BondType.DOUBLE);
          if (cHasDoubleO) best = Math.max(best, 5);
          if (cHasDoubleS) best = Math.max(best, 5);
        }
      }
    }

    // alcohol: O in chain bonded to C and having H
    if (atom.symbol === 'O') {
      if ((atom as any).hydrogens && (atom as any).hydrogens > 0) {
        best = Math.max(best, 3);
      }
    }

    // Check for alcohol groups attached to chain carbons (this handles OH on chain atoms)
    if (atom.symbol === 'C') {
      for (const b of molecule.bonds) {
        if (b.atom1 !== idx && b.atom2 !== idx) continue;
        const neigh = b.atom1 === idx ? b.atom2 : b.atom1;
        const nat = molecule.atoms[neigh];
        if (!nat) continue;
        // Check for alcohol: C-OH (carbon bonded to oxygen with hydrogen)
        if (nat.symbol === 'O' && b.type === BondType.SINGLE && (nat as any).hydrogens && (nat as any).hydrogens > 0) {
          best = Math.max(best, 3);
        }
      }
    }
  }
  return best;
}

function compareChains(
  newPositions: number[],
  newCount: number,
  newChain: number[],
  bestPositions: number[],
  bestCount: number,
  bestChain: number[]
): boolean {
  if (process.env.VERBOSE) {
    console.log(`[compareChains] newChain=[${newChain}] newPositions=[${newPositions}] bestChain=[${bestChain}] bestPositions=[${bestPositions}]`);
  }
  
  // Compare substituent positions (lowest first)
  const minLength = Math.min(newPositions.length, bestPositions.length);
  for (let i = 0; i < minLength; i++) {
    if (newPositions[i]! !== bestPositions[i]!) {
      if (process.env.VERBOSE) {
        console.log(`[compareChains] Position comparison: newPositions[${i}]=${newPositions[i]} vs bestPositions[${i}]=${bestPositions[i]} => ${newPositions[i]! < bestPositions[i]!}`);
      }
      return newPositions[i]! < bestPositions[i]!;
    }
  }

  // If positions are equal, prefer more substituents
  if (newPositions.length !== bestPositions.length) {
    if (process.env.VERBOSE) {
      console.log(`[compareChains] Length comparison: newPositions.length=${newPositions.length} vs bestPositions.length=${bestPositions.length} => ${newPositions.length > bestPositions.length}`);
    }
    return newPositions.length > bestPositions.length;
  }

  // If everything is equal, prefer the chain with lowest atom indices
  for (let i = 0; i < newChain.length; i++) {
    if (newChain[i] !== bestChain[i]) {
      if (process.env.VERBOSE) {
        console.log(`[compareChains] Atom ID comparison: newChain[${i}]=${newChain[i]} vs bestChain[${i}]=${bestChain[i]} => ${newChain[i]! < bestChain[i]!}`);
      }
      return newChain[i]! < bestChain[i]!;
    }
  }

  if (process.env.VERBOSE) {
    console.log(`[compareChains] Chains are identical => false`);
  }
  return false;
}

function getCombinedLocants(molecule: Molecule, chain: number[]): number[] {
  const substituentLocants = findSubstituents(molecule, chain).map(s => parseInt(s.position));
  const unsaturationLocants = getUnsaturationPositions(chain, molecule);
  return [...substituentLocants, ...unsaturationLocants].sort((a, b) => a - b);
}

function getPriorityLocants(molecule: Molecule, chain: number[]): [number[], number[], number[]] {
  const unsaturationLocants = getUnsaturationPositions(chain, molecule);
  const substituentLocants = findSubstituents(molecule, chain).map(s => parseInt(s.position)).sort((a, b) => a - b);
  const heteroLocants = getHeteroPositions(chain, molecule).sort((a, b) => a - b);
  return [unsaturationLocants, substituentLocants, heteroLocants];
}

function getFunctionalGroupPositions(chain: number[], molecule: Molecule): number[] {
  const positions: number[] = [];
  for (let i = 0; i < chain.length; i++) {
    const atomIdx = chain[i]!;
    const atom = molecule.atoms[atomIdx];
    if (!atom || atom.symbol !== 'C') continue;
    
    let hasDoubleO = false;
    let hasSingleOwithH = false;
    let hasSingleO = false;
    let hasNitrogen = false;
    
    for (const b of molecule.bonds) {
      if (b.atom1 !== atomIdx && b.atom2 !== atomIdx) continue;
      const neigh = b.atom1 === atomIdx ? b.atom2 : b.atom1;
      const nat = molecule.atoms[neigh];
      if (!nat) continue;
      if (nat.symbol === 'O') {
        if (b.type === BondType.DOUBLE) hasDoubleO = true;
        if (b.type === BondType.SINGLE) {
          hasSingleO = true;
          const oHydrogens = (nat as any).hydrogens || 0;
          if (oHydrogens > 0) hasSingleOwithH = true;
        }
      }
      if (nat.symbol === 'N') {
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

function getHeteroPositions(chain: number[], molecule: Molecule): number[] {
  const positions: number[] = [];
  for (let i = 0; i < chain.length; i++) {
    const atom = molecule.atoms[chain[i]!];
    if (atom && atom.symbol !== 'C') positions.push(i + 1);
  }
  return positions;
}

function getUnsaturationPositions(chain: number[], molecule: Molecule): number[] {
  const positions: number[] = [];
  for (let i = 0; i < chain.length - 1; i++) {
    const bond = molecule.bonds.find(b =>
      (b.atom1 === chain[i] && b.atom2 === chain[i + 1]) ||
      (b.atom1 === chain[i + 1] && b.atom2 === chain[i])
    );
    if (bond && (bond.type === BondType.DOUBLE || bond.type === BondType.TRIPLE)) {
      positions.push(i + 1);
    }
  }
  return positions;
}

function isValidChain(chain: number[], molecule: Molecule): boolean {
  for (let i = 0; i < chain.length - 1; i++) {
    const atom1 = chain[i];
    const atom2 = chain[i + 1];
    const bondExists = molecule.bonds.some(b =>
      (b.atom1 === atom1 && b.atom2 === atom2) ||
      (b.atom1 === atom2 && b.atom2 === atom1)
    );
    if (!bondExists) return false;
  }
  return true;
}

function findAllCarbonChains(molecule: Molecule, excludedAtomIds: Set<number> = new Set()): number[][] {
  const carbonIndices = molecule.atoms
    .map((atom, idx) => ({ atom, idx }))
    .filter(({ atom, idx }) => atom.symbol === 'C' && !excludedAtomIds.has(idx))
    .map(({ idx }) => idx);

  if (carbonIndices.length === 0) return [];

  const adjList = new Map<number, number[]>();
  for (const idx of carbonIndices) adjList.set(idx, []);

  for (const bond of molecule.bonds) {
    if (
      molecule.atoms[bond.atom1]?.symbol === 'C' &&
      molecule.atoms[bond.atom2]?.symbol === 'C' &&
      !excludedAtomIds.has(bond.atom1) &&
      !excludedAtomIds.has(bond.atom2)
    ) {
      adjList.get(bond.atom1)?.push(bond.atom2);
      adjList.get(bond.atom2)?.push(bond.atom1);
    }
  }

  // Instead of enumerating every simple path (which explodes combinatorially),
  // first determine the maximum chain length and only search for chains of that length.
  // We compute this using the adjacency list we just built (which respects excludedAtomIds)
  // rather than calling findLongestCarbonChain which would include excluded atoms.
  let longestPath: number[] = [];
  const dfsFindLongest = (node: number, visited: Set<number>, path: number[]): void => {
    if (path.length > longestPath.length) longestPath = [...path];
    const neighbors = adjList.get(node) ?? [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        path.push(neighbor);
        dfsFindLongest(neighbor, visited, path);
        path.pop();
        visited.delete(neighbor);
      }
    }
  };
  for (const startAtom of carbonIndices) {
    const visited = new Set<number>([startAtom]);
    dfsFindLongest(startAtom, visited, [startAtom]);
  }
  const targetLength = longestPath.length;
  if (targetLength < 1) return [];
  
  // Special case: single atom (no bonds)
  if (targetLength === 1) {
    return carbonIndices.map(idx => [idx]);
  }

  const found: number[][] = [];
  const seen = new Set<string>();

  function dfsLimited(current: number, visited: Set<number>, path: number[]): void {
    if (path.length === targetLength) {
      // de-duplicate chains by canonical orientation (path vs reversed)
      const forward = path.join(',');
      const reversed = [...path].slice().reverse().join(',');
      const key = forward < reversed ? forward : reversed;
      if (!seen.has(key)) {
        seen.add(key);
        // store the chain in its canonical orientation (lexicographically smaller)
        const canonical = forward < reversed ? [...path] : [...path].slice().reverse();
        found.push(canonical);
      }
      return;
    }

    const neighbors = adjList.get(current) ?? [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        path.push(neighbor);
        dfsLimited(neighbor, visited, path);
        path.pop();
        visited.delete(neighbor);
      }
    }
  }

  for (const startAtom of carbonIndices) {
    const visited = new Set<number>([startAtom]);
    dfsLimited(startAtom, visited, [startAtom]);
  }

  // All paths produced by dfsLimited are valid by construction (adjacent atoms),
  // but ensure ordering is kept and only return unique ordered chains.
  return found.filter(chain => chain.length >= 2);
}

function arraysEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((val, idx) => val === b[idx]);
}

function isBetterLocants(a: number[], b: number[]): boolean {
  // lexicographic comparison: missing elements are treated as +Infinity so shorter arrays
  // compare correctly against longer ones where necessary
  const maxLen = Math.max(a.length, b.length);
  for (let i = 0; i < maxLen; i++) {
    const ai = a[i] ?? Number.POSITIVE_INFINITY;
    const bi = b[i] ?? Number.POSITIVE_INFINITY;
    if (ai !== bi) return ai < bi;
  }
  return false;
}

function compareAtomIndexSequence(a: number[], b: number[]): number {
  const la = a.length;
  const lb = b.length;
  const l = Math.min(la, lb);
  for (let i = 0; i < l; i++) {
    if (a[i] !== b[i]) return a[i]! - b[i]!;
  }
  return la - lb;
}

function isBetterPriorityLocants(a: [number[], number[], number[]], b: [number[], number[], number[]]): boolean {
  const [aUnsaturation, aSubstituents, aHetero] = a;
  const [bUnsaturation, bSubstituents, bHetero] = b;
  // Compare unsaturation locants lexicographically (lowest set wins)
  if (isBetterLocants(aUnsaturation, bUnsaturation)) return true;
  if (isBetterLocants(bUnsaturation, aUnsaturation)) return false;

  // Unsaturation equal -> prefer chains with lower hetero locants (promote hetero chains)
  if (isBetterLocants(aHetero, bHetero)) return true;
  if (isBetterLocants(bHetero, aHetero)) return false;

  // Hetero equal -> compare substituent locants lexicographically
  if (isBetterLocants(aSubstituents, bSubstituents)) return true;
  if (isBetterLocants(bSubstituents, aSubstituents)) return false;

  return false;
}

// OPSIN-inspired lightweight heuristics comparator for candidate chains.
// Prefer chains that contain more hetero atoms and fewer substituents when
// locant priorities are identical. Returns true if a is better than b.
function isBetterByOpsinHeuristics(molecule: Molecule, aChain: number[], bChain: number[]): boolean {
  const aHeteroCount = getHeteroPositions(aChain, molecule).length;
  const bHeteroCount = getHeteroPositions(bChain, molecule).length;

  if (aHeteroCount !== bHeteroCount) return aHeteroCount > bHeteroCount;

  const aSubs = findSubstituents(molecule, aChain);
  const bSubs = findSubstituents(molecule, bChain);
  
  if (process.env.VERBOSE) {
    console.log(`[isBetterByOpsinHeuristics] Comparing chains:`);
    console.log(`  Chain A [${aChain.join(',')}]: ${aSubs.length} substituents`);
    aSubs.forEach(s => console.log(`    pos=${s.position}, name=${s.name}, size=${s.size}`));
    console.log(`  Chain B [${bChain.join(',')}]: ${bSubs.length} substituents`);
    bSubs.forEach(s => console.log(`    pos=${s.position}, name=${s.name}, size=${s.size}`));
  }
  
  if (aSubs.length !== bSubs.length) return aSubs.length < bSubs.length;

  // NEW: Prefer chains where complex substituents (large size) are at lower positions
  // This handles cases like sulfonyl-sulfinyl where we want the complex group at position 1
  const aComplexAtLowPos = aSubs.filter(s => s.size >= 5 && parseInt(s.position) === 1).length;
  const bComplexAtLowPos = bSubs.filter(s => s.size >= 5 && parseInt(s.position) === 1).length;
  if (aComplexAtLowPos !== bComplexAtLowPos) {
    if (process.env.VERBOSE) {
      console.log(`  Complex subs at pos 1: A=${aComplexAtLowPos}, B=${bComplexAtLowPos}`);
    }
    return aComplexAtLowPos > bComplexAtLowPos;
  }

  // Tie-break by sum of substituent positions (lower is better)
  const sumA = aSubs.reduce((s, p) => s + parseInt(p.position), 0);
  const sumB = bSubs.reduce((s, p) => s + parseInt(p.position), 0);
  if (sumA !== sumB) return sumA < sumB;

  return false;
}

function renumberPriorityLocants(locants: [number[], number[], number[]], chainLength: number): [number[], number[], number[]] {
  const [unsaturation, substituents, hetero] = locants;
  // Unsaturation positions are bond-locants (1..chainLength-1). Reverse mapping uses chainLength - p.
  const renumberedUnsaturation = unsaturation.map(p => chainLength - p).sort((a, b) => a - b);
  // Substituent and hetero atom locants are atom positions (1..chainLength). Reverse mapping uses chainLength - p + 1.
  const renumberedSubstituents = substituents.map(p => chainLength - p + 1).sort((a, b) => a - b);
  const renumberedHetero = hetero.map(p => chainLength - p + 1).sort((a, b) => a - b);
  return [renumberedUnsaturation, renumberedSubstituents, renumberedHetero];
}

function renumberUnsaturationToLowest(positions: number[], chainLength: number): number[] {
  if (positions.length === 0) return positions;
  const original = positions.slice().sort((a, b) => a - b);
  const reversed = original.map(p => chainLength - p).sort((a, b) => a - b);

  // Choose the lexicographically lowest full vector (not just the first locant)
  return isBetterLocants(reversed, original) ? reversed : original;
}

export function findLongestCarbonChain(molecule: Molecule): number[] {
  const carbonIndices = molecule.atoms
    .map((atom, idx) => ({ atom, idx }))
    .filter(({ atom }) => atom.symbol === 'C')
    .map(({ idx }) => idx);

  if (carbonIndices.length === 0) return [];
  if (carbonIndices.length === 1) return carbonIndices;

  const adjList = new Map<number, number[]>();
  for (const idx of carbonIndices) adjList.set(idx, []);

  for (const bond of molecule.bonds) {
    if (
      molecule.atoms[bond.atom1]?.symbol === 'C' &&
      molecule.atoms[bond.atom2]?.symbol === 'C'
    ) {
      adjList.get(bond.atom1)?.push(bond.atom2);
      adjList.get(bond.atom2)?.push(bond.atom1);
    }
  }

  let longestPath: number[] = [];
  const dfs = (node: number, visited: Set<number>, path: number[]): void => {
    if (path.length > longestPath.length) longestPath = [...path];
    const neighbors = adjList.get(node) ?? [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        path.push(neighbor);
        dfs(neighbor, visited, path);
        path.pop();
        visited.delete(neighbor);
      }
    }
  };

  for (const startAtom of carbonIndices) {
    const visited = new Set<number>([startAtom]);
    dfs(startAtom, visited, [startAtom]);
  }

  return longestPath;
}

export function findLongestHeteroChain(molecule: Molecule): number[] {
  const carbonChain = findLongestCarbonChain(molecule);
  if (carbonChain.length > 0) return carbonChain;

  const allIndices = molecule.atoms.map((_, idx) => idx);
  if (allIndices.length === 0) return [];
  if (allIndices.length === 1) return allIndices;

  const adjList = new Map<number, number[]>();
  for (const idx of allIndices) adjList.set(idx, []);
  for (const bond of molecule.bonds) {
    adjList.get(bond.atom1)?.push(bond.atom2);
    adjList.get(bond.atom2)?.push(bond.atom1);
  }

  let longestPath: number[] = [];
  const dfs = (node: number, visited: Set<number>, path: number[]): void => {
    if (path.length > longestPath.length) longestPath = [...path];
    const neighbors = adjList.get(node) ?? [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        path.push(neighbor);
        dfs(neighbor, visited, path);
        path.pop();
        visited.delete(neighbor);
      }
    }
  };

  for (const startAtom of allIndices) {
    const visited = new Set<number>([startAtom]);
    dfs(startAtom, visited, [startAtom]);
  }

  return longestPath;
}

export function generateHeteroPrefixes(mainChain: number[], molecule: Molecule): string[] {
  const prefixes: string[] = [];
  const chainSet = new Set(mainChain);
  for (const atomIdx of mainChain) {
    const atom = molecule.atoms[atomIdx];
    if (!atom || atom.symbol === 'C') continue;
    const position = mainChain.indexOf(atomIdx) + 1;
    let prefix = '';
    switch (atom.symbol) {
      case 'O': prefix = `${position}-oxa`; break;
      case 'N': prefix = `${position}-aza`; break;
      case 'S': prefix = `${position}-thia`; break;
      case 'P': prefix = `${position}-phospha`; break;
      case 'Si': prefix = `${position}-sila`; break;
      case 'B': prefix = `${position}-bora`; break;
      case 'F': prefix = `${position}-fluora`; break;
      case 'Cl': prefix = `${position}-chlora`; break;
      case 'Br': prefix = `${position}-broma`; break;
      case 'I': prefix = `${position}-ioda`; break;
      default: prefix = `${position}-${atom.symbol.toLowerCase()}a`;
    }
    prefixes.push(prefix);
  }
  const priorityOrder = ['oxa', 'thia', 'aza', 'phospha', 'sila', 'bora'];
  prefixes.sort((a, b) => {
    const pa = priorityOrder.findIndex(p => a.includes(p));
    const pb = priorityOrder.findIndex(p => b.includes(p));
    if (pa === pb) return a.localeCompare(b);
    if (pa === -1) return 1;
    if (pb === -1) return -1;
    return pa - pb;
  });
  return prefixes;
}

export function generateChainBaseName(mainChain: number[], molecule: Molecule): { hydrocarbonBase: string, unsaturation: { type: 'ene' | 'yne', positions: number[] } | null } | null {
  const heteroAtoms = mainChain
    .map(idx => molecule.atoms[idx])
    .filter((atom): atom is NonNullable<typeof atom> => atom !== undefined && atom.symbol !== 'C');

   let doubleBonds: number[] = [];
   let tripleBonds: number[] = [];
   for (let i = 0; i < mainChain.length - 1; i++) {
     const bond = molecule.bonds.find(b =>
       (b.atom1 === mainChain[i] && b.atom2 === mainChain[i + 1]) ||
       (b.atom1 === mainChain[i + 1] && b.atom2 === mainChain[i])
     );
     if (bond) {
       if (bond.type === BondType.DOUBLE) doubleBonds.push(i + 1);
       else if (bond.type === BondType.TRIPLE) tripleBonds.push(i + 1);
     }
   }

   const carbonCount = mainChain.length;
   const hydrocarbonBase = getAlkaneBaseName(carbonCount);

   let unsaturation: { type: 'ene' | 'yne', positions: number[] } | null = null;
   if (tripleBonds.length > 0) {
     const renumberedTriples = renumberUnsaturationToLowest(tripleBonds, carbonCount);
     unsaturation = { type: 'yne', positions: renumberedTriples };
   } else if (doubleBonds.length > 0) {
     const renumberedDoubles = renumberUnsaturationToLowest(doubleBonds, carbonCount);
     unsaturation = { type: 'ene', positions: renumberedDoubles };
   }

  if (heteroAtoms.length === 0) {
    return { hydrocarbonBase, unsaturation };
  } else {
    return { hydrocarbonBase: `hetero${hydrocarbonBase}`, unsaturation };
  }
}

export function findSubstituents(molecule: Molecule, mainChain: number[]): Substituent[] {
  const substituents: Substituent[] = [];
  const chainSet = new Set(mainChain);
  
  // Detect functional groups to exclude their atoms from being classified as substituents
  const functionalGroups = getSharedDetector().detectFunctionalGroups(molecule);
  const fgAtomIds = new Set<number>();
  for (const fg of functionalGroups) {
    if (fg.atoms && Array.isArray(fg.atoms)) {
      for (const atomId of fg.atoms) {
        fgAtomIds.add(atomId);
      }
    }
  }
  
  if (process.env.VERBOSE) console.log(`[findSubstituents] mainChain: ${mainChain.join(',')}, fgAtoms: ${Array.from(fgAtomIds).join(',')}`);
  for (let i = 0; i < mainChain.length; i++) {
    const chainAtomIdx = mainChain[i]!;
    for (const bond of molecule.bonds) {
      let substituentAtomIdx = -1;
      if (bond.atom1 === chainAtomIdx && !chainSet.has(bond.atom2)) {
        substituentAtomIdx = bond.atom2;
      } else if (bond.atom2 === chainAtomIdx && !chainSet.has(bond.atom1)) {
        substituentAtomIdx = bond.atom1;
      }
      if (substituentAtomIdx >= 0) {
        const substituent = classifySubstituent(molecule, substituentAtomIdx, chainSet, fgAtomIds);
        if (substituent) {
          const position = (i + 1).toString();
          if (process.env.VERBOSE) console.log(`[findSubstituents] i=${i}, chainAtomIdx=${chainAtomIdx}, substituentAtomIdx=${substituentAtomIdx}, position=${position}, type=${substituent.name}`);
          substituents.push({
            position: position,
            type: substituent.type,
            size: substituent.size,
            name: substituent.name,
          });
        }
      }
    }
  }
  // Special handling for ether functional groups
  // After regular substituents are found, check for ether oxygens that connect to carbon chains
  const etherGroups = functionalGroups.filter(fg => fg.name === 'ether' && fg.atoms && fg.atoms.length === 1);
  for (const etherGroup of etherGroups) {
    const oxygenIdx = etherGroup.atoms![0]!;
    
    // Check if this oxygen is attached to the main chain
    let attachedToChainAt = -1;
    let chainSideCarbon = -1;
    let substituentSideCarbon = -1;
    
    for (const bond of molecule.bonds) {
      if (bond.atom1 === oxygenIdx || bond.atom2 === oxygenIdx) {
        const otherAtom = bond.atom1 === oxygenIdx ? bond.atom2 : bond.atom1;
        const otherAtomObj = molecule.atoms[otherAtom];
        
        if (otherAtomObj && otherAtomObj.symbol === 'C') {
          if (chainSet.has(otherAtom)) {
            chainSideCarbon = otherAtom;
            attachedToChainAt = mainChain.indexOf(otherAtom);
          } else {
            substituentSideCarbon = otherAtom;
          }
        }
      }
    }
    
    // If oxygen is attached to main chain and has a carbon substituent
    if (attachedToChainAt >= 0 && substituentSideCarbon >= 0) {
      if (process.env.VERBOSE) {
        console.log(`[findSubstituents] Found ether at O${oxygenIdx}, chain side: C${chainSideCarbon}, substituent side: C${substituentSideCarbon}`);
      }
      
      // Traverse the substituent side to collect all atoms
      const substituentAtoms = new Set<number>();
      substituentAtoms.add(oxygenIdx);
      const visited = new Set<number>(chainSet);
      visited.add(oxygenIdx);
      const stack = [substituentSideCarbon];
      
      while (stack.length > 0) {
        const current = stack.pop()!;
        if (visited.has(current)) continue;
        visited.add(current);
        substituentAtoms.add(current);
        
        for (const bond of molecule.bonds) {
          let neighbor = -1;
          if (bond.atom1 === current && !visited.has(bond.atom2)) {
            neighbor = bond.atom2;
          } else if (bond.atom2 === current && !visited.has(bond.atom1)) {
            neighbor = bond.atom1;
          }
          if (neighbor >= 0) {
            stack.push(neighbor);
          }
        }
      }
      
      // Name the alkoxy substituent
      const alkoxyName = nameAlkoxySubstituent(molecule, substituentAtoms, oxygenIdx);
      const position = (attachedToChainAt + 1).toString();
      
      if (process.env.VERBOSE) {
        console.log(`[findSubstituents] Ether substituent: position=${position}, name=${alkoxyName}`);
      }
      
      substituents.push({
        position: position,
        type: 'functional',
        size: substituentAtoms.size,
        name: alkoxyName,
      });
    }
  }
  
  // Special handling for sulfonyl and sulfinyl functional groups
  // These can form bridges like R-S(=O)-S(=O)(=O)-R' where we need to detect the full substituent
  const sulfurGroups = functionalGroups.filter(fg => 
    (fg.name === 'sulfonyl' || fg.name === 'sulfinyl') && fg.atoms && fg.atoms.length > 0
  );
  
  for (const sulfurGroup of sulfurGroups) {
    const sulfurIdx = sulfurGroup.atoms![0]!;
    const sulfurAtom = molecule.atoms[sulfurIdx];
    if (!sulfurAtom) continue;
    
    // Check if this sulfur is directly attached to the main chain
    let attachedToChainAt = -1;
    let chainSideAtom = -1;
    
    for (const bond of molecule.bonds) {
      if (bond.atom1 === sulfurIdx || bond.atom2 === sulfurIdx) {
        const otherAtom = bond.atom1 === sulfurIdx ? bond.atom2 : bond.atom1;
        
        if (chainSet.has(otherAtom)) {
          chainSideAtom = otherAtom;
          attachedToChainAt = mainChain.indexOf(otherAtom);
          break;
        }
      }
    }
    
    if (attachedToChainAt < 0) continue; // Not attached to chain
    
    // Traverse through FG atoms to find non-FG, non-chain atoms beyond the sulfur bridge
    const visited = new Set<number>(chainSet);
    const sulfurBridge: number[] = []; // Track FG atoms in the bridge
    const substituentStarts: number[] = []; // Track where substituents start
    const queue: number[] = [sulfurIdx];
    visited.add(sulfurIdx);
    sulfurBridge.push(sulfurIdx);
    
    // BFS through FG atoms
    while (queue.length > 0) {
      const current = queue.shift()!;
      
      for (const bond of molecule.bonds) {
        let neighbor = -1;
        if (bond.atom1 === current && !visited.has(bond.atom2)) {
          neighbor = bond.atom2;
        } else if (bond.atom2 === current && !visited.has(bond.atom1)) {
          neighbor = bond.atom1;
        }
        
        if (neighbor >= 0) {
          visited.add(neighbor);
          
          // If neighbor is FG atom, continue traversing
          if (fgAtomIds.has(neighbor)) {
            const neighborAtom = molecule.atoms[neighbor];
            // Only traverse through S atoms in the bridge (not O atoms)
            if (neighborAtom && neighborAtom.symbol === 'S') {
              queue.push(neighbor);
              sulfurBridge.push(neighbor);
            }
          } else {
            // Found a non-FG, non-chain atom - this is the start of a substituent
            substituentStarts.push(neighbor);
          }
        }
      }
    }
    
    if (substituentStarts.length === 0) continue; // No substituent found
    
    // Normalize sulfur bridge order: put chain-attached sulfur first
    // This ensures consistent naming regardless of BFS traversal order
    if (sulfurBridge.length === 2) {
      const s0AttachedToChain = molecule.bonds.some(b => 
        (b.atom1 === sulfurBridge[0]! || b.atom2 === sulfurBridge[0]!) && 
        chainSet.has(b.atom1 === sulfurBridge[0]! ? b.atom2 : b.atom1)
      );
      const s1AttachedToChain = molecule.bonds.some(b => 
        (b.atom1 === sulfurBridge[1]! || b.atom2 === sulfurBridge[1]!) && 
        chainSet.has(b.atom1 === sulfurBridge[1]! ? b.atom2 : b.atom1)
      );
      
      // Swap if needed so that sulfurBridge[0] is always the one attached to chain
      if (!s0AttachedToChain && s1AttachedToChain) {
        [sulfurBridge[0], sulfurBridge[1]] = [sulfurBridge[1]!, sulfurBridge[0]!];
      }
    }
    
    // Collect all atoms in the substituent(s) beyond the sulfur bridge
    const substituentAtoms = new Set<number>();
    const substVisited = new Set<number>([...chainSet, ...sulfurBridge]);
    
    // Also mark all FG oxygen atoms as visited to avoid including them
    for (const fgAtom of fgAtomIds) {
      if (molecule.atoms[fgAtom]?.symbol === 'O') {
        substVisited.add(fgAtom);
      }
    }
    
    for (const startAtom of substituentStarts) {
      const stack = [startAtom];
      
      while (stack.length > 0) {
        const current = stack.pop()!;
        if (substVisited.has(current)) continue;
        substVisited.add(current);
        substituentAtoms.add(current);
        
        for (const bond of molecule.bonds) {
          let neighbor = -1;
          if (bond.atom1 === current && !substVisited.has(bond.atom2)) {
            neighbor = bond.atom2;
          } else if (bond.atom2 === current && !substVisited.has(bond.atom1)) {
            neighbor = bond.atom1;
          }
          if (neighbor >= 0) {
            stack.push(neighbor);
          }
        }
      }
    }
    
    if (substituentAtoms.size === 0) continue;
    
    // Build the substituent name: (alkyl)(functional groups)
    // First, name the alkyl group
    const alkylCarbons = Array.from(substituentAtoms).filter(idx => molecule.atoms[idx]?.symbol === 'C');
    let alkylName = 'methyl';
    
    if (alkylCarbons.length === 0) {
      alkylName = ''; // No alkyl group
    } else if (alkylCarbons.length === 1) {
      alkylName = 'methyl';
    } else if (alkylCarbons.length === 2) {
      alkylName = 'ethyl';
    } else if (alkylCarbons.length === 3) {
      alkylName = 'propyl';
    } else if (alkylCarbons.length === 4) {
      // Check for tert-butyl or isobutyl patterns
      let foundTertButyl = false;
      for (const cIdx of alkylCarbons) {
        const cNeighbors = molecule.bonds.filter(
          b => (b.atom1 === cIdx || b.atom2 === cIdx) && 
               substituentAtoms.has(b.atom1) && substituentAtoms.has(b.atom2) &&
               molecule.atoms[b.atom1 === cIdx ? b.atom2 : b.atom1]?.symbol === 'C'
        );
        if (cNeighbors.length === 3) {
          foundTertButyl = true;
          alkylName = 'tert-butyl';
          break;
        }
      }
      if (!foundTertButyl) alkylName = 'butyl';
    } else {
      // Check for 2,2-dimethylpropyl pattern (5 carbons in specific configuration)
      // Structure: (CH3)2C-CH2-
      if (alkylCarbons.length === 5) {
        // Find the carbon attached to the sulfur bridge
        let attachedCarbon = -1;
        for (const sIdx of sulfurBridge) {
          for (const bond of molecule.bonds) {
            const neighbor = bond.atom1 === sIdx ? bond.atom2 : bond.atom2 === sIdx ? bond.atom1 : -1;
            if (neighbor >= 0 && substituentAtoms.has(neighbor) && molecule.atoms[neighbor]?.symbol === 'C') {
              attachedCarbon = neighbor;
              break;
            }
          }
          if (attachedCarbon >= 0) break;
        }
        
        if (attachedCarbon >= 0) {
          // Check if this carbon is CH2 bonded to a quaternary carbon
          const attachedNeighbors = molecule.bonds
            .filter(b => (b.atom1 === attachedCarbon || b.atom2 === attachedCarbon) && substituentAtoms.has(b.atom1) && substituentAtoms.has(b.atom2))
            .map(b => b.atom1 === attachedCarbon ? b.atom2 : b.atom1)
            .filter(n => molecule.atoms[n]?.symbol === 'C');
          
          if (attachedNeighbors.length === 1) {
            const quaternaryC = attachedNeighbors[0]!;
            const quaternaryNeighbors = molecule.bonds
              .filter(b => (b.atom1 === quaternaryC || b.atom2 === quaternaryC) && substituentAtoms.has(b.atom1) && substituentAtoms.has(b.atom2))
              .map(b => b.atom1 === quaternaryC ? b.atom2 : b.atom1)
              .filter(n => molecule.atoms[n]?.symbol === 'C');
            
            // For 2,2-dimethylpropyl: (CH3)3C-CH2- structure
            // The quaternary carbon has 4 carbon neighbors: 1 CH2 + 3 CH3
            if (quaternaryNeighbors.length === 4) {
              alkylName = '2,2-dimethylpropyl';
            } else {
              alkylName = 'pentyl';
            }
          } else {
            alkylName = 'pentyl';
          }
        } else {
          alkylName = 'pentyl';
        }
      } else {
        alkylName = getAlkylName(alkylCarbons.length);
      }
    }
    
    // Now identify the functional group names from the sulfur bridge
    const fgNames: string[] = [];
    const sulfonylAtoms = sulfurBridge.filter(idx => {
      const fg = functionalGroups.find(g => g.atoms && g.atoms.includes(idx));
      return fg?.name === 'sulfonyl';
    });
    const sulfinylAtoms = sulfurBridge.filter(idx => {
      const fg = functionalGroups.find(g => g.atoms && g.atoms.includes(idx));
      return fg?.name === 'sulfinyl';
    });
    
    // Build name in order: furthest from chain first
    // For S5-S7 bridge where S7 is attached to chain: name is "alkyl-sulfinyl-sulfonyl"
    // We need to determine which sulfur is which
    if (sulfurBridge.length === 2) {
      const s0 = sulfurBridge[0]!;
      const s1 = sulfurBridge[1]!;
      
      if (process.env.VERBOSE) {
        console.log('[DEBUG] Sulfur bridge:', sulfurBridge, 's0=', s0, 's1=', s1);
      }
      
      // Determine which is attached to chain
      const s0AttachedToChain = molecule.bonds.some(b => 
        (b.atom1 === s0 || b.atom2 === s0) && chainSet.has(b.atom1 === s0 ? b.atom2 : b.atom1)
      );
      
      // Also determine which is attached to substituent
      const s0AttachedToSubst = molecule.bonds.some(b => 
        (b.atom1 === s0 || b.atom2 === s0) && substituentAtoms.has(b.atom1 === s0 ? b.atom2 : b.atom1)
      );
      const s1AttachedToSubst = molecule.bonds.some(b => 
        (b.atom1 === s1 || b.atom2 === s1) && substituentAtoms.has(b.atom1 === s1 ? b.atom2 : b.atom1)
      );
      
      if (process.env.VERBOSE) {
        console.log('[DEBUG] s0 attached to chain:', s0AttachedToChain);
        console.log('[DEBUG] s0 attached to subst:', s0AttachedToSubst, 's1 attached to subst:', s1AttachedToSubst);
      }
      
      // Determine the functional group types
      const s0Type = functionalGroups.find(g => g.atoms && g.atoms.includes(s0))?.name || 'sulfur';
      const s1Type = functionalGroups.find(g => g.atoms && g.atoms.includes(s1))?.name || 'sulfur';
      
      if (process.env.VERBOSE) {
        console.log('[DEBUG] s0Type:', s0Type, 's1Type:', s1Type);
      }
      
      // Order: substituent-side FG first, then chain-side FG
      // If s0 is attached to substituent, name is: s0Type-s1Type
      // If s1 is attached to substituent, name is: s1Type-s0Type
      if (s0AttachedToSubst) {
        if (process.env.VERBOSE) {
          console.log('[DEBUG] Pushing order: s0Type, s1Type (s0 attached to substituent)');
        }
        fgNames.push(s0Type, s1Type);
      } else if (s1AttachedToSubst) {
        if (process.env.VERBOSE) {
          console.log('[DEBUG] Pushing order: s1Type, s0Type (s1 attached to substituent)');
        }
        fgNames.push(s1Type, s0Type);
      } else {
        // Fallback: use original chain attachment logic
        if (s0AttachedToChain) {
          if (process.env.VERBOSE) {
            console.log('[DEBUG] Pushing order: s1Type, s0Type (fallback: s0 attached to chain)');
          }
          fgNames.push(s1Type, s0Type);
        } else {
          if (process.env.VERBOSE) {
            console.log('[DEBUG] Pushing order: s0Type, s1Type (fallback: s1 attached to chain)');
          }
          fgNames.push(s0Type, s1Type);
        }
      }
    } else if (sulfurBridge.length === 1) {
      const sType = functionalGroups.find(g => g.atoms && g.atoms.includes(sulfurBridge[0]!))?.name || 'sulfur';
      fgNames.push(sType);
    }
    
    // Construct full substituent name: (alkyl)(fg1)(fg2)
    let fullName = '';
    if (alkylName) {
      fullName = alkylName;
    }
    if (fgNames.length > 0) {
      if (fullName) {
        fullName = `${fullName}${fgNames.join('')}`;
      } else {
        fullName = fgNames.join('');
      }
    }
    
    if (process.env.VERBOSE) {
      console.log(`[findSubstituents] Sulfur bridge substituent at position ${attachedToChainAt + 1}: ${fullName}`);
      console.log(`  Bridge: ${sulfurBridge.join(',')}, Substituent atoms: ${Array.from(substituentAtoms).join(',')}`);
    }
    
    const position = (attachedToChainAt + 1).toString();
    substituents.push({
      position: position,
      type: 'functional',
      size: substituentAtoms.size + sulfurBridge.length,
      name: fullName,
    });
  }
  
  if (process.env.VERBOSE) console.log(`[findSubstituents] result: ${JSON.stringify(substituents)}`);
  return substituents;
}

/**
 * Helper function to analyze an alkyl chain attached to sulfur and generate proper name
 * For example: -S-C≡C-CH3 should be named "prop-1-ynyl"
 */
function nameAlkylSulfanylSubstituent(
  molecule: Molecule,
  substituentAtoms: Set<number>,
  sulfurAtomIdx: number
): string {
  if (process.env.VERBOSE) {
    console.log(`[nameAlkylSulfanylSubstituent] sulfur=${sulfurAtomIdx}, substituentAtoms=${Array.from(substituentAtoms).join(',')}`);
  }
  
  // Find carbon atoms in the substituent (excluding sulfur)
  const carbonAtoms = Array.from(substituentAtoms)
    .filter(idx => molecule.atoms[idx]?.symbol === 'C');
  
  if (process.env.VERBOSE) {
    console.log(`[nameAlkylSulfanylSubstituent] carbonAtoms=${carbonAtoms.join(',')}`);
  }
  
  if (carbonAtoms.length === 0) {
    return 'sulfanyl'; // Just -SH
  }
  
  // Build a carbon chain starting from the carbon attached to sulfur
  // Find the carbon directly bonded to sulfur
  let carbonAttachedToS = -1;
  for (const bond of molecule.bonds) {
    if (bond.atom1 === sulfurAtomIdx && carbonAtoms.includes(bond.atom2)) {
      carbonAttachedToS = bond.atom2;
      break;
    }
    if (bond.atom2 === sulfurAtomIdx && carbonAtoms.includes(bond.atom1)) {
      carbonAttachedToS = bond.atom1;
      break;
    }
  }
  
  if (process.env.VERBOSE) {
    console.log(`[nameAlkylSulfanylSubstituent] carbonAttachedToS=${carbonAttachedToS}`);
  }
  
  if (carbonAttachedToS === -1) {
    return 'sulfanyl'; // No carbon found
  }
  
  // Build the carbon chain
  const carbonChain: number[] = [];
  const visited = new Set<number>([sulfurAtomIdx]);
  const stack = [carbonAttachedToS];
  
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (visited.has(current)) continue;
    visited.add(current);
    carbonChain.push(current);
    
    // Find neighbors that are carbons in the substituent
    for (const bond of molecule.bonds) {
      if (bond.atom1 === current && carbonAtoms.includes(bond.atom2) && !visited.has(bond.atom2)) {
        stack.push(bond.atom2);
      } else if (bond.atom2 === current && carbonAtoms.includes(bond.atom1) && !visited.has(bond.atom1)) {
        stack.push(bond.atom1);
      }
    }
  }
  
  if (process.env.VERBOSE) {
    console.log(`[nameAlkylSulfanylSubstituent] carbonChain=${carbonChain.join(',')}, length=${carbonChain.length}`);
  }
  
  const carbonCount = carbonChain.length;
  
  // Check for unsaturation in the carbon chain
  const tripleBonds: number[] = [];
  const doubleBonds: number[] = [];
  
  for (let i = 0; i < carbonChain.length; i++) {
    const c1 = carbonChain[i];
    for (let j = i + 1; j < carbonChain.length; j++) {
      const c2 = carbonChain[j];
      const bond = molecule.bonds.find(
        b => (b.atom1 === c1 && b.atom2 === c2) || (b.atom1 === c2 && b.atom2 === c1)
      );
      if (bond) {
        if (bond.type === 'triple') {
          tripleBonds.push(i + 1); // Position is 1-indexed
        } else if (bond.type === 'double') {
          doubleBonds.push(i + 1);
        }
      }
    }
  }
  
  // Generate the alkyl name base (meth, eth, prop, but)
  let baseName: string;
  if (carbonCount === 1) {
    baseName = 'meth';
  } else if (carbonCount === 2) {
    baseName = 'eth';
  } else if (carbonCount === 3) {
    baseName = 'prop';
  } else if (carbonCount === 4) {
    baseName = 'but';
  } else {
    baseName = getAlkaneBaseName(carbonCount);
  }
  
  if (tripleBonds.length > 0) {
    // Has triple bonds - use "ynyl" suffix
    const positions = tripleBonds.sort((a, b) => a - b).join(',');
    return `${baseName}-${positions}-ynylsulfanyl`;
  } else if (doubleBonds.length > 0) {
    // Has double bonds - use "enyl" suffix
    const positions = doubleBonds.sort((a, b) => a - b).join(',');
    return `${baseName}-${positions}-enylsulfanyl`;
  } else {
    // Saturated - use "yl" suffix
    return `${baseName}ylsulfanyl`;
  }
}

/**
 * Names a complex alkoxy substituent with nested ether oxygens
 * For example: -O-CH2-O-C(CH3)2CH2CH3 → "(2-methylbutan-2-yloxy)methoxy"
 */
function nameComplexAlkoxySubstituent(
  molecule: Molecule,
  substituentAtoms: Set<number>,
  primaryOxygenIdx: number,
  carbonAtoms: number[],
  nestedOxygenIndices: number[]
): string {
  // Find the carbon attached to the primary oxygen
  let carbonAttachedToO = -1;
  for (const bond of molecule.bonds) {
    if (bond.atom1 === primaryOxygenIdx && carbonAtoms.includes(bond.atom2)) {
      carbonAttachedToO = bond.atom2;
      break;
    }
    if (bond.atom2 === primaryOxygenIdx && carbonAtoms.includes(bond.atom1)) {
      carbonAttachedToO = bond.atom1;
      break;
    }
  }
  
  if (carbonAttachedToO === -1) {
    return 'oxy';
  }
  
  // For nested ether: -O-CH2-O-R or -O-CH(CH3)-O-R
  // We need to find the first oxygen in the chain after the primary oxygen
  const firstNestedOxygen = nestedOxygenIndices[0];
  if (!firstNestedOxygen) {
    return 'oxy';
  }
  
  // Strategy: First collect linker atoms (between primary and nested oxygen),
  // then collect tail atoms (beyond nested oxygen).
  // This prevents the tail collection from going backwards into the linker.
  
  // Step 1: Collect linker atoms (between primary oxygen and nested oxygen)
  const linkerAtoms = new Set<number>();
  const linkerVisited = new Set<number>([primaryOxygenIdx, firstNestedOxygen]);
  
  function collectLinker(currentIdx: number): void {
    if (linkerVisited.has(currentIdx)) return;
    linkerVisited.add(currentIdx);
    
    // Add carbons to linker
    if (substituentAtoms.has(currentIdx) && molecule.atoms[currentIdx]?.symbol === 'C') {
      linkerAtoms.add(currentIdx);
    }
    
    // Stop at the nested oxygen (don't cross it)
    if (currentIdx === firstNestedOxygen) {
      return;
    }
    
    // Traverse neighbors
    for (const bond of molecule.bonds) {
      let neighborIdx = -1;
      if (bond.atom1 === currentIdx && substituentAtoms.has(bond.atom2)) {
        neighborIdx = bond.atom2;
      } else if (bond.atom2 === currentIdx && substituentAtoms.has(bond.atom1)) {
        neighborIdx = bond.atom1;
      }
      
      if (neighborIdx >= 0 && !linkerVisited.has(neighborIdx)) {
        // Only continue if we haven't reached the nested oxygen yet
        // OR if the neighbor is still part of the linker region
        collectLinker(neighborIdx);
      }
    }
  }
  
  // Start from carbon attached to primary oxygen
  collectLinker(carbonAttachedToO);
  
  // Step 2: Collect tail atoms (beyond nested oxygen)
  // Don't traverse back through the nested oxygen or linker atoms
  const tailAtoms = new Set<number>();
  const tailVisited = new Set<number>([primaryOxygenIdx, firstNestedOxygen]);
  
  function collectTail(currentIdx: number): void {
    if (tailVisited.has(currentIdx)) return;
    tailVisited.add(currentIdx);
    
    // Don't collect linker atoms as part of tail
    if (linkerAtoms.has(currentIdx)) {
      return;
    }
    
    if (substituentAtoms.has(currentIdx)) {
      tailAtoms.add(currentIdx);
    }
    
    // Traverse neighbors
    for (const bond of molecule.bonds) {
      let neighborIdx = -1;
      if (bond.atom1 === currentIdx && substituentAtoms.has(bond.atom2)) {
        neighborIdx = bond.atom2;
      } else if (bond.atom2 === currentIdx && substituentAtoms.has(bond.atom1)) {
        neighborIdx = bond.atom1;
      }
      
      if (neighborIdx >= 0 && !tailVisited.has(neighborIdx) && !linkerAtoms.has(neighborIdx)) {
        collectTail(neighborIdx);
      }
    }
  }
  
  // Start from carbon attached to nested oxygen (on the tail side, not linker side)
  let tailStartCarbon = -1;
  for (const bond of molecule.bonds) {
    if (bond.atom1 === firstNestedOxygen && substituentAtoms.has(bond.atom2) && molecule.atoms[bond.atom2]?.symbol === 'C') {
      // Make sure this carbon is NOT in the linker
      if (!linkerAtoms.has(bond.atom2)) {
        tailStartCarbon = bond.atom2;
        break;
      }
    }
    if (bond.atom2 === firstNestedOxygen && substituentAtoms.has(bond.atom1) && molecule.atoms[bond.atom1]?.symbol === 'C') {
      // Make sure this carbon is NOT in the linker
      if (!linkerAtoms.has(bond.atom1)) {
        tailStartCarbon = bond.atom1;
        break;
      }
    }
  }
  
  if (process.env.VERBOSE) {
    console.log(`  Complex ether debug: primaryO=${primaryOxygenIdx}, nestedO=${firstNestedOxygen}, tailStartC=${tailStartCarbon}`);
    console.log(`  substituentAtoms: [${Array.from(substituentAtoms).join(',')}]`);
  }
  
  if (tailStartCarbon >= 0) {
    collectTail(tailStartCarbon);
  }
  
  if (process.env.VERBOSE) {
    console.log(`  Complex ether - Linker carbons: [${Array.from(linkerAtoms).join(',')}]`);
    console.log(`  Complex ether - Tail carbons: [${Array.from(tailAtoms).filter(i => molecule.atoms[i]?.symbol === 'C').join(',')}]`);
  }
  
  // Name the tail portion - need to build it as a complete substituent
  let tailName = '';
  if (tailAtoms.size > 0) {
    const tailCarbons = Array.from(tailAtoms).filter(idx => molecule.atoms[idx]?.symbol === 'C');
    const tailOxygens = Array.from(tailAtoms).filter(idx => {
      const atom = molecule.atoms[idx];
      if (!atom || atom.symbol !== 'O' || idx === firstNestedOxygen) return false;
      // Only include ether-like oxygens (single bonds, not carbonyl)
      const bondsToO = molecule.bonds.filter(b => b.atom1 === idx || b.atom2 === idx);
      const hasSingle = bondsToO.some(b => b.type === BondType.SINGLE);
      if (!hasSingle) return false;
      const hasDoubleToC = bondsToO.some(b => b.type === BondType.DOUBLE && (molecule.atoms[b.atom1 === idx ? b.atom2 : b.atom1]?.symbol === 'C'));
      if (hasDoubleToC) return false;
      return true;
    });
    
    if (tailCarbons.length === 0) {
      tailName = 'oxy';
    } else if (tailOxygens.length > 0) {
      // Tail contains additional nested ethers - recursively name it
      if (process.env.VERBOSE) {
        console.log(`  Tail contains nested oxygens: [${tailOxygens.join(',')}], recursively naming`);
      }
      // Recursively call nameAlkoxySubstituent to handle the nested ether structure
      tailName = nameAlkoxySubstituent(molecule, tailAtoms, firstNestedOxygen);
      if (process.env.VERBOSE) {
        console.log(`  Recursive call returned tailName="${tailName}"`);
      }
    } else {
      // Find the carbon directly bonded to the nested oxygen (attachment point)
      let tailAttachmentCarbon = -1;
      for (const bond of molecule.bonds) {
        if (bond.atom1 === firstNestedOxygen && tailCarbons.includes(bond.atom2)) {
          tailAttachmentCarbon = bond.atom2;
          break;
        }
        if (bond.atom2 === firstNestedOxygen && tailCarbons.includes(bond.atom1)) {
          tailAttachmentCarbon = bond.atom1;
          break;
        }
      }
      
      if (tailAttachmentCarbon === -1) {
        tailName = 'oxy';
      } else {
        // Build the tail structure and name it properly
        // For now, use a simplified approach - build the longest chain and detect branching
        const tailChain = buildLongestChainFrom(molecule, tailAttachmentCarbon, tailAtoms);
        const tailChainSet = new Set(tailChain);
        
        if (process.env.VERBOSE) {
          console.log(`  Tail chain: [${tailChain.join(',')}], attachment at ${tailAttachmentCarbon}`);
        }
        
        // Find substituents on the tail chain
        const tailSubstituents: Array<{ carbon: number; type: string }> = [];
        for (let i = 0; i < tailChain.length; i++) {
          const carbonIdx = tailChain[i];
          if (!carbonIdx) continue;
          
          // Find branches
          for (const bond of molecule.bonds) {
            let neighborIdx = -1;
            if (bond.atom1 === carbonIdx && tailAtoms.has(bond.atom2)) {
              neighborIdx = bond.atom2;
            } else if (bond.atom2 === carbonIdx && tailAtoms.has(bond.atom1)) {
              neighborIdx = bond.atom1;
            }
            
            if (neighborIdx >= 0 && !tailChainSet.has(neighborIdx) && molecule.atoms[neighborIdx]?.symbol === 'C') {
              // This is a methyl branch
              tailSubstituents.push({ carbon: i + 1, type: 'methyl' });
            }
          }
        }
        
        // Generate the tail name with proper IUPAC format
        const chainLength = tailChain.length;
        const baseAlkane = getAlkaneBaseName(chainLength);
        
        if (tailSubstituents.length === 0) {
          // Simple alkyl group - check attachment point
          if (chainLength === 1) {
            tailName = 'methoxy';
          } else if (chainLength === 2) {
            tailName = 'ethoxy';
          } else if (chainLength === 3) {
            tailName = 'propoxy';
          } else if (chainLength === 4) {
            tailName = 'butoxy';
          } else {
            const alkylBase = baseAlkane.replace(/an$/, '');
            tailName = alkylBase + 'oxy';
          }
        } else {
          // Branched alkyl group - need to merge duplicate locants and add attachment point locant
          // Group substituents by type
          const substituentGroups = new Map<string, number[]>();
          for (const sub of tailSubstituents) {
            const existing = substituentGroups.get(sub.type) || [];
            existing.push(sub.carbon);
            substituentGroups.set(sub.type, existing);
          }
          
          // Build substituent prefix with proper multiplicative notation
          const prefixParts: string[] = [];
          for (const [type, locants] of substituentGroups) {
            locants.sort((a, b) => a - b);
            const locantStr = locants.join(',');
            if (locants.length > 1) {
              const multiplier = locants.length === 2 ? 'di' : locants.length === 3 ? 'tri' : locants.length === 4 ? 'tetra' : '';
              prefixParts.push(`${locantStr}-${multiplier}${type}`);
            } else {
              prefixParts.push(`${locantStr}-${type}`);
            }
          }
          
          const substituentPrefix = prefixParts.join('-');
          
          // Determine attachment point locant within the chain
          let attachmentLocant = tailChain.indexOf(tailAttachmentCarbon) + 1;
          if (attachmentLocant === 0) {
            attachmentLocant = 1; // Fallback
          }
          
          // Format: "2-methylbutoxy" (if attached at position 1) or "2-methylbutan-2-yloxy" (if attached at other position)
          if (attachmentLocant === 1) {
            // Remove trailing "an" before adding "oxy" (butan -> butoxy, not butanoxy)
            const alkylBase = baseAlkane.replace(/an$/, '');
            tailName = `${substituentPrefix}${alkylBase}oxy`;
          } else {
            tailName = `${substituentPrefix}${baseAlkane}-${attachmentLocant}-yloxy`;
          }
        }
      }
    }
  } else {
    tailName = 'oxy';
  }
  
  // Name the linker portion
  const linkerCarbons = Array.from(linkerAtoms);
  let linkerName = '';
  
  if (linkerCarbons.length === 1) {
    linkerName = 'methoxy';
  } else if (linkerCarbons.length === 2) {
    // Check for methyl substituents on the linker
    // For now, just call it ethoxy
    linkerName = 'ethoxy';
  } else {
    const alkaneBase = getAlkaneBaseName(linkerCarbons.length);
    linkerName = alkaneBase + 'oxy';
  }
  
  // Combine tail + linker with proper locant and parentheses
  // Format: "1-(2-methylbutoxy)ethoxy" where the tail is attached at position 1 of the linker
  if (tailName && tailName !== 'oxy') {
    // If tailName is already in format "1-(...)", flatten it for concatenation while preserving the inner "1-"
    // This prevents excessive nesting like "1-(1-(ethoxy)ethoxy)" and instead produces "1-ethoxyethoxy"
    let cleanedTailName = tailName;
    if (process.env.VERBOSE) {
      console.log(`[nameComplexAlkoxySubstituent] Before cleaning: tailName="${tailName}"`);
    }
    if (tailName.startsWith('1-(')) {
      // Find the matching closing parenthesis for the opening paren at index 2
      let depth = 0;
      let closeIdx = -1;
      for (let i = 3; i < tailName.length; i++) {  // Start at 3, after "1-("
        if (tailName[i] === '(') depth++;
        else if (tailName[i] === ')') {
          if (depth === 0) {
            closeIdx = i;
            break;
          }
          depth--;
        }
      }
      if (closeIdx !== -1) {
        // Extract content inside parentheses and flatten: "1-(...)" + remainder → "1-..." + remainder
        const innerPart = tailName.slice(3, closeIdx);  // Content inside parens
        const remainder = tailName.slice(closeIdx + 1);  // After closing paren
        // Only prepend "1-" if innerPart doesn't already start with a locant
        if (innerPart.startsWith('1-')) {
          cleanedTailName = `${innerPart}${remainder}`;  // Already has "1-" prefix
        } else {
          cleanedTailName = `1-${innerPart}${remainder}`;  // Add "1-" prefix
        }
        if (process.env.VERBOSE) {
          console.log(`[nameComplexAlkoxySubstituent] After cleaning: cleanedTailName="${cleanedTailName}" (inner="${innerPart}", remainder="${remainder}")`);
        }
      }
    }
    // After flattening, if cleanedTailName already starts with "1-", we should concatenate directly
    // Example: "1-ethoxyethoxy" + "methoxy" → "1-ethoxyethoxymethoxy"  
    // NOT "1-(1-ethoxyethoxy)methoxy"
    const result = cleanedTailName.startsWith('1-') 
      ? `${cleanedTailName}${linkerName}`  // Already flattened, just append
      : `1-(${cleanedTailName})${linkerName}`;  // Not flattened, needs wrapper
    if (process.env.VERBOSE) {
      console.log(`[nameComplexAlkoxySubstituent] Returning: "${result}"`);
    }
    return result;
  } else {
    return linkerName;
  }
}

/**
 * Build the longest carbon chain starting from a given carbon within a set of atoms
 * This explores ALL possible paths to find the true longest chain
 */
function buildLongestChainFrom(molecule: Molecule, startCarbon: number, allowedAtoms: Set<number>): number[] {
  let longestChain: number[] = [];
  
  if (process.env.VERBOSE) {
    console.log(`  [buildLongestChainFrom] startCarbon=${startCarbon}, allowedAtoms=[${Array.from(allowedAtoms).join(',')}]`);
  }
  
  function dfs(current: number, path: number[], visited: Set<number>): void {
    // Always update longest chain if current path is longer
    if (path.length > longestChain.length) {
      longestChain = [...path];
      if (process.env.VERBOSE) {
        console.log(`    [DFS] Updated longest chain: [${longestChain.join(',')}]`);
      }
    }
    
    // Find all unvisited carbon neighbors
    for (const bond of molecule.bonds) {
      let neighborIdx = -1;
      if (bond.atom1 === current && allowedAtoms.has(bond.atom2) && !visited.has(bond.atom2)) {
        neighborIdx = bond.atom2;
      } else if (bond.atom2 === current && allowedAtoms.has(bond.atom1) && !visited.has(bond.atom1)) {
        neighborIdx = bond.atom1;
      }
      
      if (neighborIdx >= 0 && molecule.atoms[neighborIdx]?.symbol === 'C') {
        if (process.env.VERBOSE) {
          console.log(`    [DFS] Exploring from ${current} to ${neighborIdx}`);
        }
        visited.add(neighborIdx);
        path.push(neighborIdx);
        dfs(neighborIdx, path, visited);
        path.pop();
        visited.delete(neighborIdx);
      }
    }
  }
  
  // Try starting from each possible neighbor of startCarbon to find longest chain
  const startNeighbors: number[] = [];
  for (const bond of molecule.bonds) {
    if (bond.atom1 === startCarbon && allowedAtoms.has(bond.atom2) && molecule.atoms[bond.atom2]?.symbol === 'C') {
      startNeighbors.push(bond.atom2);
    } else if (bond.atom2 === startCarbon && allowedAtoms.has(bond.atom1) && molecule.atoms[bond.atom1]?.symbol === 'C') {
      startNeighbors.push(bond.atom1);
    }
  }
  
  if (process.env.VERBOSE) {
    console.log(`  [buildLongestChainFrom] Found ${startNeighbors.length} neighbors: [${startNeighbors.join(',')}]`);
  }
  
  // Try building chain from each direction
  for (const firstNeighbor of startNeighbors) {
    if (process.env.VERBOSE) {
      console.log(`  [buildLongestChainFrom] Trying chain starting from neighbor ${firstNeighbor}`);
    }
    const visited = new Set<number>([startCarbon, firstNeighbor]);
    const path = [startCarbon, firstNeighbor];  // Changed: startCarbon first (attachment point)
    
    // Explore from the firstNeighbor direction using DFS
    dfs(firstNeighbor, path, visited);
    
    // Check if this path is longest
    if (path.length > longestChain.length) {
      longestChain = [...path];
    }
  }
  
  // If no chain found, start with just the start carbon
  if (longestChain.length === 0) {
    longestChain = [startCarbon];
  }
  
  return longestChain;
}

/**
 * Names an aryloxy substituent: -O-Aryl (e.g., phenoxy, 4-chlorophenoxy, naphthoxy)
 * Detects aromatic rings bonded to oxygen and names substituents on the ring
 */
function nameAryloxySubstituent(
  molecule: Molecule,
  substituentAtoms: Set<number>,
  oxygenAtomIdx: number,
  arylCarbonIdx: number
): string {
  if (process.env.VERBOSE) {
    console.log(`[nameAryloxySubstituent] oxygen=${oxygenAtomIdx}, arylCarbon=${arylCarbonIdx}, substituentAtoms=${Array.from(substituentAtoms).join(',')}`);
  }
  
  // Find all aromatic carbons in the substituent
  const aromaticCarbons = Array.from(substituentAtoms)
    .filter(idx => molecule.atoms[idx]?.symbol === 'C' && molecule.atoms[idx]?.aromatic);
  
  if (process.env.VERBOSE) {
    console.log(`[nameAryloxySubstituent] aromaticCarbons=${aromaticCarbons.join(',')}`);
  }
  
  // Identify which ring the aryl carbon belongs to
  let arylRing: readonly number[] | null = null;
  if (molecule.rings) {
    for (const ring of molecule.rings) {
      if (ring.includes(arylCarbonIdx)) {
        // Check if all ring atoms are aromatic carbons
        const allAromatic = ring.every(atomId => {
          const atom = molecule.atoms[atomId];
          return atom && atom.symbol === 'C' && atom.aromatic;
        });
        if (allAromatic) {
          arylRing = ring;
          break;
        }
      }
    }
  }
  
  if (!arylRing) {
    // Fallback: couldn't identify aromatic ring
    return 'phenoxy';
  }
  
  if (process.env.VERBOSE) {
    console.log(`[nameAryloxySubstituent] arylRing=${arylRing.join(',')}`);
  }
  
  // Determine base aryl name
  let arylBase = '';
  if (arylRing.length === 6) {
    arylBase = 'phen'; // phenyl → phenoxy
  } else if (arylRing.length === 5) {
    // Could be furan, pyrrole, thiophene - but if all C, it's cyclopentadienyl
    arylBase = 'cyclopentadienyl';
  } else {
    // For now, use generic naming
    arylBase = 'aryl';
  }
  
  // Find substituents on the aromatic ring (excluding oxygen attachment point)
  const ringSet = new Set(arylRing);
  const ringSubstituents: Array<{ position: number; name: string }> = [];
  
  // We need to number the ring starting from the carbon bonded to oxygen (position 1)
  // Number sequentially around the ring (not BFS) to get correct IUPAC positions
  const ringNumbering = new Map<number, number>();
  
  // Helper to find ring neighbors
  const getRingNeighbors = (atomIdx: number): number[] => {
    const neighbors: number[] = [];
    for (const bond of molecule.bonds) {
      if (bond.atom1 === atomIdx && ringSet.has(bond.atom2)) {
        neighbors.push(bond.atom2);
      } else if (bond.atom2 === atomIdx && ringSet.has(bond.atom1)) {
        neighbors.push(bond.atom1);
      }
    }
    return neighbors;
  };
  
  // Start numbering from the carbon bonded to oxygen (position 1)
  ringNumbering.set(arylCarbonIdx, 1);
  
  // Get the two neighbors of the attachment carbon in the ring
  const startNeighbors = getRingNeighbors(arylCarbonIdx);
  
  if (startNeighbors.length === 2) {
    // Pick one direction and traverse the ring sequentially
    // We'll number one path first, then if needed number the other direction
    let prev: number = arylCarbonIdx;
    let current: number = startNeighbors[0]!;
    let position = 2;
    
    // Traverse in one direction until we return to start or reach the end
    while (current !== arylCarbonIdx && position <= arylRing.length) {
      if (!ringNumbering.has(current)) {
        ringNumbering.set(current, position);
        position++;
      }
      
      // Find next atom in ring (not the one we came from)
      const neighbors = getRingNeighbors(current);
      let next: number | undefined = undefined;
      for (const n of neighbors) {
        if (n !== prev && !ringNumbering.has(n)) {
          next = n;
          break;
        }
      }
      
      if (next === undefined) break;
      prev = current;
      current = next;
    }
  } else {
    // Fallback: use BFS if ring structure is unusual
    const visited = new Set<number>([arylCarbonIdx]);
    const queue: number[] = [arylCarbonIdx];
    let currentPos = 1;
    
    while (queue.length > 0 && visited.size < arylRing.length) {
      const atom = queue.shift()!;
      const neighbors = getRingNeighbors(atom).filter(n => !visited.has(n));
      
      for (const neighbor of neighbors) {
        currentPos++;
        ringNumbering.set(neighbor, currentPos);
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }
  
  if (process.env.VERBOSE) {
    console.log(`[nameAryloxySubstituent] ringNumbering:`, Array.from(ringNumbering.entries()).map(([k, v]) => `${k}:${v}`).join(', '));
  }
  
  // Find substituents on each ring carbon
  for (const ringCarbon of arylRing) {
    const position = ringNumbering.get(ringCarbon);
    if (!position) continue;
    
    // Find non-ring attachments (excluding oxygen)
    for (const bond of molecule.bonds) {
      let substituent = -1;
      if (bond.atom1 === ringCarbon && !ringSet.has(bond.atom2) && bond.atom2 !== oxygenAtomIdx) {
        substituent = bond.atom2;
      } else if (bond.atom2 === ringCarbon && !ringSet.has(bond.atom1) && bond.atom1 !== oxygenAtomIdx) {
        substituent = bond.atom1;
      }
      
      if (substituent >= 0) {
        const subAtom = molecule.atoms[substituent];
        if (subAtom) {
          let subName = '';
          if (subAtom.symbol === 'Cl') subName = 'chloro';
          else if (subAtom.symbol === 'Br') subName = 'bromo';
          else if (subAtom.symbol === 'I') subName = 'iodo';
          else if (subAtom.symbol === 'F') subName = 'fluoro';
          else if (subAtom.symbol === 'C') subName = 'methyl'; // Simple case
          else subName = subAtom.symbol.toLowerCase();
          
          ringSubstituents.push({ position, name: subName });
        }
      }
    }
  }
  
  if (process.env.VERBOSE) {
    console.log(`[nameAryloxySubstituent] ringSubstituents:`, ringSubstituents);
  }
  
  // Build the final name
  if (ringSubstituents.length === 0) {
    return `${arylBase}oxy`;
  }
  
  // Sort by position
  ringSubstituents.sort((a, b) => a.position - b.position);
  
  // Group by name
  const grouped = new Map<string, number[]>();
  for (const sub of ringSubstituents) {
    if (!grouped.has(sub.name)) {
      grouped.set(sub.name, []);
    }
    grouped.get(sub.name)!.push(sub.position);
  }
  
  // Build prefix
  const prefixes: string[] = [];
  for (const [name, positions] of grouped.entries()) {
    const posStr = positions.join(',');
    if (positions.length === 1) {
      prefixes.push(`${posStr}-${name}`);
    } else {
      const mult = getGreekNumeral(positions.length);
      prefixes.push(`${posStr}-${mult}${name}`);
    }
  }
  
  // Sort prefixes alphabetically
  prefixes.sort();
  
  return `(${prefixes.join('-')}${arylBase}oxy)`;
}

/**
 * Names an alkoxy substituent (ether substituent): -O-R
 * Takes the oxygen atom and the substituent atoms, then names the alkyl chain attached to oxygen.
 * For example: -O-CH3 → "methoxy", -O-CH2CH3 → "ethoxy", -O-C(CH3)3 → "tert-butoxy"
 */
function nameAlkoxySubstituent(
  molecule: Molecule,
  substituentAtoms: Set<number>,
  oxygenAtomIdx: number
): string {
  if (process.env.VERBOSE) {
    console.log(`[nameAlkoxySubstituent] oxygen=${oxygenAtomIdx}, substituentAtoms=${Array.from(substituentAtoms).join(',')}`);
  }
  
  // Find carbon atoms in the substituent (excluding oxygen)
  const carbonAtoms = Array.from(substituentAtoms)
    .filter(idx => molecule.atoms[idx]?.symbol === 'C');
  
  // Check for nested oxygens in the substituent (ether-like oxygens only)
  // Exclude carbonyl oxygens or nitro oxygens (double-bonded O) which are not
  // part of an ether chain. We only consider oxygens that have at least one
  // single bond (typical for ethers) and are not double-bonded to carbon.
  const oxygenAtoms = Array.from(substituentAtoms)
    .filter(idx => {
      const atom = molecule.atoms[idx];
      if (!atom || atom.symbol !== 'O' || idx === oxygenAtomIdx) return false;
      const bondsToO = molecule.bonds.filter(b => b.atom1 === idx || b.atom2 === idx);
      // must have at least one single bond
      const hasSingle = bondsToO.some(b => b.type === BondType.SINGLE);
      if (!hasSingle) return false;
      // exclude oxygens that have a double bond to carbon (carbonyl)
      const hasDoubleToC = bondsToO.some(b => b.type === BondType.DOUBLE && (molecule.atoms[b.atom1 === idx ? b.atom2 : b.atom1]?.symbol === 'C'));
      if (hasDoubleToC) return false;
      return true;
    });
  
  if (process.env.VERBOSE) {
    console.log(`[nameAlkoxySubstituent] carbonAtoms=${carbonAtoms.join(',')}, nestedOxygens=${oxygenAtoms.join(',')}`);
  }
  
  // Special-case: silyl-protected oxygens (O-Si). If oxygen is bonded to a silicon
  // atom, try to construct a trialkylsilyl name (e.g., trimethylsilyl) and return
  // the silyloxy substituent name (e.g., trimethylsilyloxy). This covers common
  // protecting groups like TMS (trimethylsilyl).
  for (const bond of molecule.bonds) {
    if (bond.atom1 === oxygenAtomIdx || bond.atom2 === oxygenAtomIdx) {
      const other = bond.atom1 === oxygenAtomIdx ? bond.atom2 : bond.atom1;
      const otherAtom = molecule.atoms[other];
      if (otherAtom && otherAtom.symbol === 'Si') {
        if (process.env.VERBOSE) console.log(`[nameAlkoxySubstituent] Detected silicon at ${other} attached to O${oxygenAtomIdx}`);
        // Inspect substituents on silicon to determine alkyl groups
        const siAlkyls: string[] = [];
        for (const b2 of molecule.bonds) {
          if (b2.atom1 === other || b2.atom2 === other) {
            const nbr = b2.atom1 === other ? b2.atom2 : b2.atom1;
            const nbrAtom = molecule.atoms[nbr];
            if (!nbrAtom) continue;
            if (nbrAtom.symbol === 'C') {
              // Check if this carbon is a methyl (no other carbon neighbors)
              const carbonNeighbors = molecule.bonds.filter(bb => (bb.atom1 === nbr || bb.atom2 === nbr) && (bb.atom1 !== other && bb.atom2 !== other));
              const isMethyl = carbonNeighbors.every(bb => molecule.atoms[(bb.atom1 === nbr ? bb.atom2 : bb.atom1)]?.symbol !== 'C');
              siAlkyls.push(isMethyl ? 'methyl' : getAlkylName(1));
            }
          }
        }

        // Build silyl name: e.g., ['methyl','methyl','methyl'] -> 'trimethylsilyl'
        if (siAlkyls.length > 0) {
          // Count occurrences
          const counts: Record<string, number> = {};
          for (const a of siAlkyls) counts[a] = (counts[a] || 0) + 1;
          const parts: string[] = [];
          for (const [alk, cnt] of Object.entries(counts)) {
            // Local multiplicative prefix helper (di, tri, tetra...)
            const mult = cnt > 1 ? (cnt === 2 ? 'di' : cnt === 3 ? 'tri' : cnt === 4 ? 'tetra' : `${cnt}-`) : '';
            parts.push(`${mult}${alk}`);
          }
          const silylBase = parts.join('');
          const silylName = `${silylBase}silyl`;
          return `${silylName}oxy`;
        }
        // Fallback: generic silyloxy
        return 'silyloxy';
      }
    }
  }

  if (carbonAtoms.length === 0) {
    return 'oxy'; // Just -O- with no carbons
  }
  
  // Handle nested ether structures
  if (oxygenAtoms.length > 0) {
    // Check nested oxygens for silyl protection (O-Si). If any nested oxygen is
    // bonded to a silicon atom, construct a silyloxy name like 'trimethylsilyloxy'.
    for (const oIdx of oxygenAtoms) {
      for (const b of molecule.bonds) {
        if (b.atom1 === oIdx || b.atom2 === oIdx) {
          const other = b.atom1 === oIdx ? b.atom2 : b.atom1;
          const otherAtom = molecule.atoms[other];
          if (otherAtom && otherAtom.symbol === 'Si') {
            if (process.env.VERBOSE) console.log(`[nameAlkoxySubstituent] Detected silicon at ${other} attached to nested O${oIdx}`);
            // Inspect substituents on silicon to determine alkyl groups
            const siAlkyls: string[] = [];
            for (const b2 of molecule.bonds) {
              if (b2.atom1 === other || b2.atom2 === other) {
                const nbr = b2.atom1 === other ? b2.atom2 : b2.atom1;
                const nbrAtom = molecule.atoms[nbr];
                if (!nbrAtom) continue;
                if (nbrAtom.symbol === 'C') {
                  // Determine if this carbon is methyl (no further carbon neighbors in substituent)
                  const carbonNeighbors = molecule.bonds.filter(bb => (bb.atom1 === nbr || bb.atom2 === nbr) && (bb.atom1 !== other && bb.atom2 !== other));
                  const isMethyl = carbonNeighbors.every(bb => molecule.atoms[(bb.atom1 === nbr ? bb.atom2 : bb.atom1)]?.symbol !== 'C');
                  siAlkyls.push(isMethyl ? 'methyl' : getAlkylName(1));
                }
              }
            }

            if (siAlkyls.length > 0) {
              const counts: Record<string, number> = {};
              for (const a of siAlkyls) counts[a] = (counts[a] || 0) + 1;
              const parts: string[] = [];
              for (const [alk, cnt] of Object.entries(counts)) {
                const mult = cnt > 1 ? (cnt === 2 ? 'di' : cnt === 3 ? 'tri' : cnt === 4 ? 'tetra' : `${cnt}-`) : '';
                parts.push(`${mult}${alk}`);
              }
              const silylBase = parts.join('');
              const silylName = `${silylBase}silyl`;
              return `${silylName}oxy`;
            }
            return 'silyloxy';
          }
        }
      }
    }

    return nameComplexAlkoxySubstituent(molecule, substituentAtoms, oxygenAtomIdx, carbonAtoms, oxygenAtoms);
  }
  
  // Build a carbon chain starting from the carbon attached to oxygen
  // Find the carbon directly bonded to oxygen
  let carbonAttachedToO = -1;
  for (const bond of molecule.bonds) {
    if (bond.atom1 === oxygenAtomIdx && carbonAtoms.includes(bond.atom2)) {
      carbonAttachedToO = bond.atom2;
      break;
    }
    if (bond.atom2 === oxygenAtomIdx && carbonAtoms.includes(bond.atom1)) {
      carbonAttachedToO = bond.atom1;
      break;
    }
  }
  
  if (process.env.VERBOSE) {
    console.log(`[nameAlkoxySubstituent] carbonAttachedToO=${carbonAttachedToO}`);
  }
  
  if (carbonAttachedToO === -1) {
    return 'oxy'; // No carbon found
  }
  
  // Check if carbon attached to oxygen is aromatic (phenoxy, naphthoxy, etc.)
  const attachedCarbon = molecule.atoms[carbonAttachedToO];
  if (attachedCarbon && attachedCarbon.aromatic) {
    // This is an aryloxy substituent (e.g., phenoxy, 4-chlorophenoxy)
    return nameAryloxySubstituent(molecule, substituentAtoms, oxygenAtomIdx, carbonAttachedToO);
  }
  
  // Special case: check for common branched patterns
  const carbonCount = carbonAtoms.length;
  
  // Check for tert-butoxy: C(C)(C)(C)-O
  if (carbonCount === 4) {
    // Count neighbors of the first carbon
    const firstCarbon = carbonAttachedToO;
    const neighbors = molecule.bonds.filter(
      b => (b.atom1 === firstCarbon && carbonAtoms.includes(b.atom2)) ||
           (b.atom2 === firstCarbon && carbonAtoms.includes(b.atom1))
    );
    
    // If first carbon has 3 carbon neighbors, it's tert-butoxy
    const carbonNeighbors = neighbors.filter(b => {
      const otherAtom = b.atom1 === firstCarbon ? b.atom2 : b.atom1;
      return molecule.atoms[otherAtom]?.symbol === 'C' && otherAtom !== oxygenAtomIdx;
    });
    
    if (carbonNeighbors.length === 3) {
      // Check if all three neighbors are CH3 (no further carbons)
      const allMethyl = carbonNeighbors.every(b => {
        const methyl = b.atom1 === firstCarbon ? b.atom2 : b.atom1;
        const methylNeighbors = molecule.bonds.filter(
          bond => (bond.atom1 === methyl && carbonAtoms.includes(bond.atom2) && bond.atom2 !== firstCarbon) ||
                  (bond.atom2 === methyl && carbonAtoms.includes(bond.atom1) && bond.atom1 !== firstCarbon)
        );
        return methylNeighbors.length === 0;
      });
      
      if (allMethyl) {
        return '2-methylpropan-2-yloxy';
      }
    }
  }
  
  // Check for isopropoxy: C(C)(C)-O
  if (carbonCount === 3) {
    const firstCarbon = carbonAttachedToO;
    const neighbors = molecule.bonds.filter(
      b => (b.atom1 === firstCarbon && carbonAtoms.includes(b.atom2)) ||
           (b.atom2 === firstCarbon && carbonAtoms.includes(b.atom1))
    );
    
    const carbonNeighbors = neighbors.filter(b => {
      const otherAtom = b.atom1 === firstCarbon ? b.atom2 : b.atom1;
      return molecule.atoms[otherAtom]?.symbol === 'C' && otherAtom !== oxygenAtomIdx;
    });
    
    if (carbonNeighbors.length === 2) {
      // Check if both neighbors are CH3
      const allMethyl = carbonNeighbors.every(b => {
        const methyl = b.atom1 === firstCarbon ? b.atom2 : b.atom1;
        const methylNeighbors = molecule.bonds.filter(
          bond => (bond.atom1 === methyl && carbonAtoms.includes(bond.atom2) && bond.atom2 !== firstCarbon) ||
                  (bond.atom2 === methyl && carbonAtoms.includes(bond.atom1) && bond.atom1 !== firstCarbon)
        );
        return methylNeighbors.length === 0;
      });
      
      if (allMethyl) {
        return 'propan-2-yloxy';
      }
    }
  }
  
  // Check for 2,2-dimethylpropoxy pattern: CH2-C(CH3)3
  if (carbonCount === 5) {
    // Find if we have a CH2 attached to oxygen
    const firstCarbon = carbonAttachedToO;
    const firstCarbonBonds = molecule.bonds.filter(
      b => (b.atom1 === firstCarbon && carbonAtoms.includes(b.atom2)) ||
           (b.atom2 === firstCarbon && carbonAtoms.includes(b.atom1))
    );
    
    const firstCarbonNeighbors = firstCarbonBonds.filter(b => {
      const otherAtom = b.atom1 === firstCarbon ? b.atom2 : b.atom1;
      return molecule.atoms[otherAtom]?.symbol === 'C' && otherAtom !== oxygenAtomIdx;
    });
    
    // If first carbon has only 1 carbon neighbor, check if that's a tert-butyl
    if (firstCarbonNeighbors.length === 1 && firstCarbonNeighbors[0]) {
      const secondCarbon = firstCarbonNeighbors[0].atom1 === firstCarbon ? 
        firstCarbonNeighbors[0].atom2 : firstCarbonNeighbors[0].atom1;
      
      const secondCarbonBonds = molecule.bonds.filter(
        b => (b.atom1 === secondCarbon && carbonAtoms.includes(b.atom2)) ||
             (b.atom2 === secondCarbon && carbonAtoms.includes(b.atom1))
      );
      
      const secondCarbonNeighbors = secondCarbonBonds.filter(b => {
        const otherAtom = b.atom1 === secondCarbon ? b.atom2 : b.atom1;
        return molecule.atoms[otherAtom]?.symbol === 'C' && otherAtom !== firstCarbon;
      });
      
      // If second carbon has 3 carbon neighbors, it's 2,2-dimethylpropoxy
      if (secondCarbonNeighbors.length === 3) {
        const allMethyl = secondCarbonNeighbors.every(b => {
          const methyl = b.atom1 === secondCarbon ? b.atom2 : b.atom1;
          const methylNeighbors = molecule.bonds.filter(
            bond => (bond.atom1 === methyl && carbonAtoms.includes(bond.atom2) && bond.atom2 !== secondCarbon) ||
                    (bond.atom2 === methyl && carbonAtoms.includes(bond.atom1) && bond.atom1 !== secondCarbon)
          );
          return methylNeighbors.length === 0;
        });
        
        if (allMethyl) {
          return '2,2-dimethylpropoxy';
        }
      }
    }
  }
  
  // For simple linear chains, use standard alkyl names
  let baseName: string;
  if (carbonCount === 1) {
    baseName = 'methoxy';
  } else if (carbonCount === 2) {
    baseName = 'ethoxy';
  } else if (carbonCount === 3) {
    baseName = 'propoxy';
  } else if (carbonCount === 4) {
    baseName = 'butoxy';
  } else if (carbonCount === 5) {
    baseName = 'pentoxy';
  } else if (carbonCount === 6) {
    baseName = 'hexoxy';
  } else {
    baseName = getAlkaneBaseName(carbonCount) + 'oxy';
  }
  
  return baseName;
}

/**
 * Finds substituents attached to a ring (excluding the attachment point to parent chain).
 */
function findRingSubstituents(
  molecule: Molecule,
  ring: readonly number[],
  excludeAtom: number
): Array<{ atomIdx: number; ringPosition: number }> {
  const ringSet = new Set(ring);
  const substituents: Array<{ atomIdx: number; ringPosition: number }> = [];
  
  for (let i = 0; i < ring.length; i++) {
    const ringAtomIdx = ring[i]!;
    
    // Check all bonds from this ring atom
    for (const bond of molecule.bonds) {
      let attachedAtomIdx = -1;
      if (bond.atom1 === ringAtomIdx && !ringSet.has(bond.atom2)) {
        attachedAtomIdx = bond.atom2;
      } else if (bond.atom2 === ringAtomIdx && !ringSet.has(bond.atom1)) {
        attachedAtomIdx = bond.atom1;
      }
      
      // Skip if this is the attachment point to parent chain
      if (attachedAtomIdx >= 0 && attachedAtomIdx !== excludeAtom) {
        const attachedAtom = molecule.atoms[attachedAtomIdx];
        // Skip hydrogen atoms
        if (attachedAtom && attachedAtom.symbol !== 'H') {
          substituents.push({
            atomIdx: attachedAtomIdx,
            ringPosition: i
          });
        }
      }
    }
  }
  
  return substituents;
}

/**
 * Names a ring system as a substituent attached to the main chain.
 * Determines the ring type, the attachment position, and converts to substituent form (e.g., "thiazol-4-yl").
 * Recursively analyzes and names any substituents attached to the ring.
 */
function nameRingSubstituent(molecule: Molecule, startAtomIdx: number, chainAtoms: Set<number>): SubstituentInfo | null {
  if (!molecule.rings) return null;
  
  // Import aromatic naming function dynamically to avoid circular dependencies
  const { generateAromaticRingName, isRingAromatic } = require('./iupac-rings/aromatic-naming');
  
  // Find which ring(s) contain the starting atom
  const containingRings = molecule.rings.filter(ring => ring.includes(startAtomIdx));
  if (containingRings.length === 0) return null;
  
  // For now, handle simple case: single ring attached to chain
  // TODO: Handle fused ring systems
  const ring = containingRings[0];
  if (!ring) return null;
  
  // Check if this ring is aromatic
  const aromatic = isRingAromatic(ring, molecule);
  
  if (process.env.VERBOSE) {
    console.log(`[nameRingSubstituent] Ring:`, ring, `aromatic:`, aromatic);
  }
  
  // Get the base ring name (e.g., "thiazole", "benzene", "oxirane")
  let ringName: string;
  if (aromatic) {
    ringName = generateAromaticRingName(ring, molecule);
  } else {
    // For non-aromatic rings, use generateRingName to handle heterocycles properly
    const { generateRingName } = require('../rules/ring-analysis-layer/helpers');
    
    // Build ring system object with atoms and bonds
    const ringAtoms = ring.map((idx: number) => molecule.atoms[idx]);
    const ringBonds = molecule.bonds.filter((bond: any) => 
      ring.includes(bond.atom1) && ring.includes(bond.atom2)
    );
    
    const ringSystem = {
      atoms: ringAtoms,
      bonds: ringBonds,
      size: ring.length,
      type: 'aliphatic',
      rings: [ring]
    };
    
    ringName = generateRingName(ringSystem, molecule);
  }
  
  if (process.env.VERBOSE) {
    console.log(`[nameRingSubstituent] Base ring name: ${ringName}`);
  }
  
  // Determine the attachment position in the ring
  // For heterocycles, we need IUPAC numbering starting from the most senior heteroatom
  const attachmentPosition = determineRingAttachmentPosition(ring, startAtomIdx, molecule, ringName);
  
  if (process.env.VERBOSE) {
    console.log(`[nameRingSubstituent] Attachment atom: ${startAtomIdx}, position in ring: ${attachmentPosition}`);
  }
  
  // Find any substituents attached to this ring (excluding the attachment point to main chain)
  // We need to find the atom in chainAtoms that connects to this ring
  let parentAtom = -1;
  for (const bond of molecule.bonds) {
    if ((bond.atom1 === startAtomIdx && chainAtoms.has(bond.atom2)) ||
        (bond.atom2 === startAtomIdx && chainAtoms.has(bond.atom1))) {
      parentAtom = bond.atom1 === startAtomIdx ? bond.atom2 : bond.atom1;
      break;
    }
  }
  
  const ringSubstituents = findRingSubstituents(molecule, ring, parentAtom);
  
  if (process.env.VERBOSE) {
    console.log(`[nameRingSubstituent] Found ${ringSubstituents.length} substituents on ring`);
  }
  
  // Recursively name each substituent attached to the ring
  const namedSubstituents: Array<{ locant: number; name: string }> = [];
  const ringSet = new Set(ring);
  
  for (const sub of ringSubstituents) {
    // Recursively classify this substituent
    const subInfo = classifySubstituent(molecule, sub.atomIdx, ringSet, new Set());
    
    if (subInfo) {
      // Determine the IUPAC position number for this substituent on the ring
      const ringAtomIdx = ring[sub.ringPosition]!;
      const locant = determineRingAttachmentPosition(ring, ringAtomIdx, molecule, ringName);
      
      if (process.env.VERBOSE) {
        console.log(`[nameRingSubstituent] Substituent at ring position ${sub.ringPosition} (IUPAC locant ${locant}): ${subInfo.name}`);
      }
      
      namedSubstituents.push({ locant, name: subInfo.name });
    }
  }
  
  // Build the complete substituent name with nested substituents
  let fullName: string;
  
  if (namedSubstituents.length > 0) {
    // Sort substituents by locant
    namedSubstituents.sort((a, b) => a.locant - b.locant);
    
    // Separate ring substituents from simple substituents
    const ringSubsts = namedSubstituents.filter(s => s.name.includes('yl'));
    const simpleSubsts = namedSubstituents.filter(s => !s.name.includes('yl'));
    
    // Build substituent prefix
    // For ring substituents, use format: "locant-(substituent)"
    // For simple substituents, use format: "locant-substituent"
    const substParts: string[] = [];
    
    for (const sub of namedSubstituents) {
      if (sub.name.includes('yl')) {
        // Ring substituent - add parentheses
        substParts.push(`${sub.locant}-(${sub.name})`);
      } else {
        // Simple substituent
        substParts.push(`${sub.locant}-${sub.name}`);
      }
    }
    
    const subPrefix = substParts.join('-');
    
    // Build ring stem with proper numbering for heterocycles
    let ringStem = ringName;
    if (ringName.endsWith('ole')) {
      ringStem = ringName.slice(0, -1);
    } else if (ringName.endsWith('ine')) {
      ringStem = ringName.slice(0, -1);
    } else if (ringName.endsWith('ane')) {
      ringStem = ringName.slice(0, -1);
    } else if (ringName === 'benzene') {
      ringStem = 'phenyl';
    }
    
    // For heterocycles, we need to include heteroatom locants
    if (ringName === 'thiazole') {
      // Format: "locant-(substituents)-1,3-thiazol-position-yl"
      // Find positions of N and S
      let nPos = -1, sPos = -1;
      for (let i = 0; i < ring.length; i++) {
        const atom = molecule.atoms[ring[i]!];
        if (atom?.symbol === 'N') nPos = i;
        if (atom?.symbol === 'S') sPos = i;
      }
      
      // Calculate their IUPAC positions
      const nIupacPos = nPos >= 0 ? determineRingAttachmentPosition(ring, ring[nPos]!, molecule, ringName) : 1;
      const sIupacPos = sPos >= 0 ? determineRingAttachmentPosition(ring, ring[sPos]!, molecule, ringName) : 3;
      
      // Build heteroatom locants: "1,3-" for N=1, S=3
      const heteroLocants = [nIupacPos, sIupacPos].sort((a, b) => a - b).join(',');
      
      fullName = `${subPrefix}-${heteroLocants}-${ringStem}-${attachmentPosition}-yl`;
    } else if (ringName === 'benzene') {
      // Format: "locant-(substituents)phenyl"
      fullName = `${subPrefix}phenyl`;
    } else {
      // Generic format
      fullName = `${subPrefix}${ringStem}-${attachmentPosition}-yl`;
    }
  } else {
    // No substituents, use simple conversion
    fullName = convertRingNameToSubstituent(ringName, attachmentPosition);
  }
  
  if (process.env.VERBOSE) {
    console.log(`[nameRingSubstituent] Final substituent name: ${fullName}`);
  }
  
  return {
    type: 'ring',
    size: ring.length,
    name: fullName
  };
}

/**
 * Gets IUPAC numbering for a ring based on heteroatom positions.
 */
function getRingNumbering(ring: readonly number[], molecule: Molecule, ringName: string): Map<number, number> {
  const numbering = new Map<number, number>();
  
  if (ringName === 'thiazole') {
    // Find N and S positions
    let nPos = -1, sPos = -1;
    for (let i = 0; i < ring.length; i++) {
      const atom = molecule.atoms[ring[i]!];
      if (atom?.symbol === 'N') nPos = i;
      if (atom?.symbol === 'S') sPos = i;
    }
    
    if (nPos !== -1 && sPos !== -1) {
      // Standard thiazole numbering: N=1, S=3
      // From N, go in the direction of S
      const direction = (sPos - nPos + ring.length) % ring.length <= ring.length / 2 ? 1 : -1;
      
      for (let i = 0; i < ring.length; i++) {
        const offset = (i * direction + ring.length) % ring.length;
        const actualIdx = (nPos + offset + ring.length) % ring.length;
        const atomIdx = ring[actualIdx]!;
        
        // Assign IUPAC numbers: N=1, first C=2, S=3, second C=4, third C=5
        if (actualIdx === nPos) {
          numbering.set(atomIdx, 1);
        } else if (actualIdx === sPos) {
          numbering.set(atomIdx, 3);
        } else {
          // Carbons get 2, 4, 5
          const relPos = (actualIdx - nPos + ring.length) % ring.length;
          if (relPos === 1) numbering.set(atomIdx, 2);
          else if (relPos === 3) numbering.set(atomIdx, 4);
          else if (relPos === 4) numbering.set(atomIdx, 5);
        }
      }
    }
  }
  
  return numbering;
}

/**
 * Determines the IUPAC position number for the attachment point in a ring.
 * For heterocycles, numbering starts from the most senior heteroatom.
 */
function determineRingAttachmentPosition(ring: readonly number[], attachmentAtom: number, molecule: Molecule, ringName: string): number {
  const posInRing = ring.indexOf(attachmentAtom);
  if (posInRing === -1) return 1; // fallback
  
  if (process.env.VERBOSE) {
    console.log(`[determineRingAttachmentPosition] Ring: [${ring.join(', ')}]`);
    console.log(`[determineRingAttachmentPosition] Attachment atom: ${attachmentAtom}, posInRing: ${posInRing}`);
  }
  
  // For thiazole: N=1, C=2, S=3, C=4, C=5
  // Ring array is in traversal order, need to renumber based on heteroatom priority
  
  if (ringName === 'thiazole') {
    // Find positions of N and S in the ring
    let nPos = -1, sPos = -1;
    for (let i = 0; i < ring.length; i++) {
      const atom = molecule.atoms[ring[i]!];
      if (atom?.symbol === 'N') nPos = i;
      if (atom?.symbol === 'S') sPos = i;
    }
    
    if (process.env.VERBOSE) {
      console.log(`[determineRingAttachmentPosition] N at ring index ${nPos}, S at ring index ${sPos}`);
      for (let i = 0; i < ring.length; i++) {
        const atom = molecule.atoms[ring[i]!];
        console.log(`[determineRingAttachmentPosition]   Ring[${i}] = atom ${ring[i]} (${atom?.symbol})`);
      }
    }
    
    if (nPos === -1 || sPos === -1) return posInRing + 1; // fallback
    
    // Calculate relative position from N
    const relativePos = (posInRing - nPos + ring.length) % ring.length;
    
    if (process.env.VERBOSE) {
      console.log(`[determineRingAttachmentPosition] relativePos from N: ${relativePos}`);
    }
    
    // Map relative position to IUPAC number
    // Relative [0,1,2,3,4] = [N, next-C, next-next-C, next-next-next-C, S]
    // IUPAC    [1,4,2,5,3] based on heteroatom priority
    const thiazoleMapping: { [key: number]: number } = {
      0: 1,  // N
      1: 4,  // C after N (attachment point in our case)
      2: 2,  // C between N and S
      3: 5,  // C after S
      4: 3   // S
    };
    
    // Actually, let me recalculate: the ring is traversed as [C-6, N-7, C-8, C-9, S-10]
    // With N at position 1, we go clockwise: N(1) → C(2) → S(3) → C(4) → C(5)
    // So from N: offset 0 = N = pos 1
    //           offset 1 = next C = pos 2
    //           offset 2 = next C = ?
    //           offset 3 = next C = ?
    //           offset 4 = S = pos 3
    
    // Let me check the bond structure to determine direction
    // For standard thiazole: N-C-S-C-C-N (cycle)
    // Numbering: N=1, C=2, S=3, C=4, C=5
    
    // From our ring [C-6, N-7, C-8, C-9, S-10]:
    // If we start from N(7) and go forward: N→C(8)→C(9)→S(10)→C(6)→back to N
    // So: N(7)=1, C(8)=2, C(9)=3?, S(10)=3, C(6)=5
    // Wait, S must be at position 3...
    
    // Let me recalculate based on proper thiazole numbering
    // Standard thiazole: N at 1, S at 3, two carbons between them
    // From N(index 1): forward to C(8) at index 2, then C(9) at index 3, then S(10) at index 4
    // This means: N→C→C→S→C
    // But standard thiazole is: N→C→S, not N→C→C→S
    
    // I need to check if we traverse N→C(8)→S or N→C(6)→S
    // Looking at bonds: N(7)-C(8), C(8)-C(9), C(9)-S(10), S(10)-C(6), C(6)-N(7)
    // So the ring is: C(6)-N(7)-C(8)-C(9)-S(10)-back to C(6)
    // Wait, that's 5 atoms, so it must be: C-N-C-C-S
    // For thiazole, between N and S we have either 1 or 2 carbons
    // With 2 carbons between N and S: N-C-C-S-C
    // IUPAC: N(1)-C(2)-S(3)-C(4)-C(5)
    
    // So mapping from ring index (relative to N):
    // Offset 0 (N) → 1
    // Offset 1 (C after N) → 2
    // Offset 2 (next C) → must be between N and S, checking bonds...
    
    // Actually, let me check bonds between N and S to count carbons
    // If relativePos=1 is C(8) and relativePos=3 is C(9), and relativePos=4 is S
    // Then N→C(8) is direct, but C(8)→S is not direct
    // So: N(1) → C(2)=pos1 → ? → S(3)=pos4
    // That means C(8) is the carbon at position 2
    // And between C(8) and S we have C(9)
    
    // Thiazole with 2 carbons between N and S... that's not standard
    // Standard thiazole has only 1 carbon between N and S
    // Let me verify the bonds...
    
    // For 5-membered thiazole ring: must be N-C-S-C-C (1,2,3,4,5)
    // Let's check which direction from N leads to S
    
    // Check if there's a C between N and S, or two Cs
    const nAtomIdx = ring[nPos]!;
    const sAtomIdx = ring[sPos]!;
    
    // Find carbon count between N and S in forward direction
    let carbonsForward = 0;
    for (let i = 1; i < ring.length - 1; i++) {
      const idx = (nPos + i) % ring.length;
      if (idx === sPos) break;
      const atom = molecule.atoms[ring[idx]!];
      if (atom?.symbol === 'C') carbonsForward++;
    }
    
    if (process.env.VERBOSE) {
      console.log(`[determineRingAttachmentPosition] carbonsForward (N to S): ${carbonsForward}`);
    }
    
    // For standard thiazole: N-C-S-C-C, so carbonsForward should be 1
    if (carbonsForward === 1) {
      // N(1) → C(2) → S(3) → C(4) → C(5) → back to N
      const mapping: { [key: number]: number } = {
        0: 1,  // N
        1: 2,  // C after N
        2: 4,  // C after S (continuing around)
        3: 5,  // next C
        4: 3   // S
      };
      if (process.env.VERBOSE) {
        console.log(`[determineRingAttachmentPosition] Using standard thiazole mapping (1 C between N and S)`);
      }
      return mapping[relativePos] || (relativePos + 1);
    }
    
    // If carbonsForward === 2, we have 2 carbons between N and S in one direction
    // This means the shorter path from N to S goes the other way with only 1 carbon
    // For ring [C-6, N-7, C-8, C-9, S-10]:
    //   Path 1: N(7) → C(8) → C(9) → S(10) = 2 carbons
    //   Path 2: N(7) → C(6) → S(10) = 1 carbon ← use this path
    // IUPAC numbering: N(7)[1] → C(6)[2] → S(10)[3] → C(9)[4] → C(8)[5]
    
    if (carbonsForward === 2) {
      // Mapping from relativePos (position in ring array relative to N) to IUPAC position
      // Ring array: [C-6, N-7, C-8, C-9, S-10] with N at index 1
      // IUPAC numbering via shorter path: N(7)=1 → C(6)=2 → S(10)=3 → C(9)=4 → C(8)=5
      // relativePos 0: N(7) at index 1 → IUPAC position 1
      // relativePos 1: C(8) at index 2 → IUPAC position 5
      // relativePos 2: C(9) at index 3 → IUPAC position 4
      // relativePos 3: S(10) at index 4 → IUPAC position 3
      // relativePos 4: C(6) at index 0 (wrapping) → IUPAC position 2
      const mapping: { [key: number]: number } = {
        0: 1,  // N(7) → position 1
        1: 5,  // C(8) → position 5
        2: 4,  // C(9) → position 4
        3: 3,  // S(10) → position 3
        4: 2   // C(6) → position 2
      };
      if (process.env.VERBOSE) {
        console.log(`[determineRingAttachmentPosition] Using 2-carbon thiazole mapping (1 C in shorter path)`);
        console.log(`[determineRingAttachmentPosition] Mapped position: ${mapping[relativePos]}`);
      }
      return mapping[relativePos] || (relativePos + 1);
    }
    
    // Fallback
    return relativePos + 1;
  }
  
  if (ringName === 'benzene' || ringName === 'phenyl') {
    // For benzene, we need to find the TRUE attachment point (where benzene connects to parent)
    // and number all positions relative to that point
    
    // Find the attachment point: the atom bonded to a ring system (not simple substituents)
    let attachmentIdx = -1;
    const ringSet = new Set(ring);
    
    // Look for atom bonded to another ring or to the main chain
    for (let i = 0; i < ring.length; i++) {
      const ringAtomIdx = ring[i]!;
      
      // Check if this atom has bonds outside the ring
      for (const bond of molecule.bonds) {
        const otherAtom = bond.atom1 === ringAtomIdx ? bond.atom2 : bond.atom2 === ringAtomIdx ? bond.atom1 : -1;
        if (otherAtom >= 0 && !ringSet.has(otherAtom)) {
          const otherAtomObj = molecule.atoms[otherAtom];
          // Ignore hydrogen atoms
          if (otherAtomObj && otherAtomObj.symbol !== 'H') {
            // Check if this is the main attachment (bonded to another ring/chain, not a simple substituent)
            // Simple substituents are typically: OH, Cl, Br, F, etc.
            const isSimpleSubstituent = otherAtomObj.symbol === 'O' || otherAtomObj.symbol === 'Cl' || 
                                       otherAtomObj.symbol === 'Br' || otherAtomObj.symbol === 'F' ||
                                       otherAtomObj.symbol === 'I';
            
            if (!isSimpleSubstituent) {
              // This is likely the main attachment point
              attachmentIdx = i;
              
              if (process.env.VERBOSE) {
                console.log(`[determineRingAttachmentPosition] Found main attachment at ring index ${i} (atom ${ringAtomIdx}) bonded to atom ${otherAtom} (${otherAtomObj.symbol})`);
              }
              break;
            }
          }
        }
      }
      if (attachmentIdx >= 0) break;
    }
    
    if (attachmentIdx === -1) {
      if (process.env.VERBOSE) {
        console.log(`[determineRingAttachmentPosition] No main attachment found, using fallback`);
      }
      // Fallback if we can't find attachment point
      return posInRing + 1;
    }
    
    // Calculate position relative to attachment point
    // Attachment point is numbered 1, then we continue around the ring
    // Going in the direction that gives lowest substituent locants
    // For benzene, we go backwards through array indices: [5,4,3,2,1,0] if attachment is at 5
    
    const relativePos = (attachmentIdx - posInRing + ring.length) % ring.length;
    
    if (process.env.VERBOSE) {
      console.log(`[determineRingAttachmentPosition] attachmentIdx=${attachmentIdx}, posInRing=${posInRing}, relativePos=${relativePos}, IUPAC position=${relativePos + 1}`);
    }
    
    return relativePos + 1;
  }
  
  // For other rings, use simple sequential numbering (1-indexed)
  return posInRing + 1;
}

/**
 * Converts a ring name to substituent form with position.
 * Examples: "thiazole" + position 4 -> "thiazol-4-yl"
 *           "benzene" -> "phenyl"
 */
function convertRingNameToSubstituent(ringName: string, position: number): string {
  // Special case: benzene becomes phenyl (no position needed for monosubstituted)
  if (ringName === 'benzene') {
    return 'phenyl';
  }
  
  // For heterocycles ending in -ole, -ine, -ane, etc., convert to -yl form
  // thiazole -> thiazol-4-yl
  // pyridine -> pyridin-3-yl
  // furan -> furan-2-yl
  
  let stem = ringName;
  
  // Remove common ring suffixes
  if (ringName.endsWith('ole')) {
    stem = ringName.slice(0, -1); // "thiazole" -> "thiazol"
  } else if (ringName.endsWith('ine')) {
    stem = ringName.slice(0, -1); // "pyridine" -> "pyridin"
  } else if (ringName.endsWith('ane')) {
    stem = ringName.slice(0, -1); // "cyclohexane" -> "cyclohexan"
  } else if (ringName.endsWith('ene')) {
    stem = ringName.slice(0, -1); // "benzene" -> "benzen" (but benzene is handled above)
  }
  
  // Add position and -yl suffix
  return `${stem}-${position}-yl`;
}

export function classifySubstituent(molecule: Molecule, startAtomIdx: number, chainAtoms: Set<number>, fgAtomIds: Set<number> = new Set()): SubstituentInfo | null {
  // First check: if the starting atom is part of a functional group, skip it
  if (fgAtomIds.has(startAtomIdx)) {
    if (process.env.VERBOSE) console.log(`[classifySubstituent] Skipping atom ${startAtomIdx} - part of functional group`);
    return null;
  }
  
  const visited = new Set<number>(chainAtoms);
  const substituentAtoms = new Set<number>();
  const stack = [startAtomIdx];
  visited.add(startAtomIdx);
  substituentAtoms.add(startAtomIdx);
  while (stack.length > 0) {
    const currentIdx = stack.pop()!;
    substituentAtoms.add(currentIdx);
    for (const bond of molecule.bonds) {
      let neighborIdx = -1;
      if (bond.atom1 === currentIdx && !visited.has(bond.atom2)) {
        neighborIdx = bond.atom2;
      } else if (bond.atom2 === currentIdx && !visited.has(bond.atom1)) {
        neighborIdx = bond.atom1;
      }
      if (neighborIdx >= 0) {
        visited.add(neighborIdx);
        stack.push(neighborIdx);
      }
    }
  }

  const atoms = Array.from(substituentAtoms)
    .map(idx => molecule.atoms[idx])
    .filter((atom): atom is typeof molecule.atoms[0] => atom !== undefined);
  const carbonCount = atoms.filter(atom => atom.symbol === 'C').length;
  
  // Check if this substituent contains ring atoms - if so, it might be a ring system substituent
  const hasRingAtoms = Array.from(substituentAtoms).some(atomId => {
    if (!molecule.rings) return false;
    return molecule.rings.some(ring => ring.includes(atomId));
  });
  
  if (hasRingAtoms && process.env.VERBOSE) {
    console.log(`[classifySubstituent] Substituent starting at ${startAtomIdx} contains ring atoms`);
  }
  
  // If this substituent contains ring atoms, it's likely a complex ring system
  // For now, return null to skip it (will be handled by ring system naming later)
  if (hasRingAtoms) {
    if (process.env.VERBOSE) console.log(`[classifySubstituent] Detected ring system substituent starting at ${startAtomIdx}`);
    // Name the ring system as a substituent
    return nameRingSubstituent(molecule, startAtomIdx, chainAtoms);
  }
  
  // Check if this is an ether substituent FIRST (before checking for phenyl)
  // This ensures O-Aryl patterns are detected as "aryloxy" not "phenyl"
  const startAtom = molecule.atoms[startAtomIdx];
  if (startAtom && startAtom.symbol === 'O' && startAtom.hydrogens === 0) {
    // Check if oxygen has a double bond (ketone, aldehyde, etc.)
    const hasDoubleBond = molecule.bonds.some(
      bond => (bond.atom1 === startAtomIdx || bond.atom2 === startAtomIdx) && bond.type === 'double'
    );
    
    // If oxygen has a double bond, it's part of a functional group (C=O), not an ether
    if (hasDoubleBond) {
      return null; // Skip this - it's part of a carbonyl group
    }
    
    // Check for aminooxy pattern: -O-N-R (e.g., tert-butylaminooxy)
    // Find nitrogen bonded to this oxygen
    const nitrogenBond = molecule.bonds.find(
      bond => (bond.atom1 === startAtomIdx || bond.atom2 === startAtomIdx) &&
              bond.type === 'single' &&
              ((bond.atom1 === startAtomIdx && molecule.atoms[bond.atom2]?.symbol === 'N') ||
               (bond.atom2 === startAtomIdx && molecule.atoms[bond.atom1]?.symbol === 'N'))
    );
    
    if (nitrogenBond) {
      const nitrogenIdx = nitrogenBond.atom1 === startAtomIdx ? nitrogenBond.atom2 : nitrogenBond.atom1;
      
      // Find carbon chain attached to nitrogen (excluding chain atoms)
      const carbonBonds = molecule.bonds.filter(
        bond => (bond.atom1 === nitrogenIdx || bond.atom2 === nitrogenIdx) &&
                bond.atom1 !== startAtomIdx && bond.atom2 !== startAtomIdx &&
                ((bond.atom1 === nitrogenIdx && molecule.atoms[bond.atom2]?.symbol === 'C' && substituentAtoms.has(bond.atom2)) ||
                 (bond.atom2 === nitrogenIdx && molecule.atoms[bond.atom1]?.symbol === 'C' && substituentAtoms.has(bond.atom1)))
      );
      
      if (carbonBonds.length > 0) {
        // Get the alkyl group name attached to nitrogen
        const carbonIdx = carbonBonds[0]!.atom1 === nitrogenIdx ? carbonBonds[0]!.atom2 : carbonBonds[0]!.atom1;
        
        // Collect all atoms in the N-C chain (excluding oxygen)
        const ncChainAtoms = new Set<number>();
        ncChainAtoms.add(nitrogenIdx);
        const ncVisited = new Set<number>([...chainAtoms, startAtomIdx]);
        const ncStack = [carbonIdx];
        
        while (ncStack.length > 0) {
          const current = ncStack.pop()!;
          if (ncVisited.has(current)) continue;
          ncVisited.add(current);
          ncChainAtoms.add(current);
          
          for (const bond of molecule.bonds) {
            let neighbor = -1;
            if (bond.atom1 === current && !ncVisited.has(bond.atom2)) {
              neighbor = bond.atom2;
            } else if (bond.atom2 === current && !ncVisited.has(bond.atom1)) {
              neighbor = bond.atom1;
            }
            if (neighbor >= 0) {
              ncStack.push(neighbor);
            }
          }
        }
        
        // Name the alkyl group attached to nitrogen
        // Count carbons and check for branching patterns
        const ncCarbons = Array.from(ncChainAtoms).filter(idx => molecule.atoms[idx]?.symbol === 'C');
        let alkylGroupName = 'alkyl';
        
        if (ncCarbons.length === 1) {
          alkylGroupName = 'methyl';
        } else if (ncCarbons.length === 2) {
          alkylGroupName = 'ethyl';
        } else if (ncCarbons.length === 3) {
          alkylGroupName = 'propyl';
        } else if (ncCarbons.length === 4) {
          // Check for tert-butyl pattern: central carbon bonded to N + 3 methyl carbons
          let foundTertButyl = false;
          for (const cIdx of ncCarbons) {
            const cBonds = molecule.bonds.filter(
              b => (b.atom1 === cIdx || b.atom2 === cIdx) && 
                   ncChainAtoms.has(b.atom1) && ncChainAtoms.has(b.atom2)
            );
            const cNeighbors = cBonds.map(b => b.atom1 === cIdx ? b.atom2 : b.atom1)
              .filter(n => molecule.atoms[n]?.symbol === 'C');
            
            // If this carbon has 3 carbon neighbors within the group, it's the central carbon
            if (cNeighbors.length === 3) {
              foundTertButyl = true;
              break;
            }
          }
          
          alkylGroupName = foundTertButyl ? 'tert-butyl' : 'butyl';
        } else {
          alkylGroupName = getAlkylName(ncCarbons.length);
        }
        
        // The full name is: (alkyl)amino-oxy  (e.g., tert-butylaminooxy)
        const fullName = `(${alkylGroupName}amino)oxy`;
        
        if (process.env.VERBOSE) {
          console.log(`[classifySubstituent] Detected aminooxy: O=${startAtomIdx}, N=${nitrogenIdx}, name=${fullName}`);
        }
        
        return { type: 'functional', size: substituentAtoms.size, name: fullName };
      }
    }
    
    // This is an ether substituent: -O-R
    // Name it as "alkoxy" where alkyl is the carbon chain attached to the oxygen
    if (carbonCount === 0) {
      // Just oxygen with no carbons - this shouldn't happen in normal ethers
      return { type: 'functional', size: 1, name: 'oxy' };
    }
    
    // Get the alkyl chain name
    const alkylName = nameAlkoxySubstituent(molecule, substituentAtoms, startAtomIdx);
    return { type: 'functional', size: carbonCount + 1, name: alkylName };
  }
  
  // Check if this is a phenyl substituent (benzene ring attached to chain)
  // Phenyl = aromatic 6-membered carbon ring
  // This check comes AFTER oxygen check to avoid detecting O-phenyl as phenyl
  if (carbonCount === 6 || carbonCount === 7) {
    // Count aromatic carbons in the substituent
    const aromaticCarbons = atoms.filter(atom => atom.symbol === 'C' && atom.aromatic);
    
    // If we have exactly 6 aromatic carbons, this is a phenyl group
    if (aromaticCarbons.length === 6) {
      // Check if these 6 aromatic carbons form a ring
      const aromaticCarbonIds = new Set(aromaticCarbons.map(a => a.id));
      
      // Verify ring structure by checking molecule.rings
      if (molecule.rings) {
        for (const ring of molecule.rings) {
          if (ring.length === 6) {
            // Check if all ring atoms are in our aromatic carbon set
            const ringIsAromatic = ring.every(atomId => aromaticCarbonIds.has(atomId));
            if (ringIsAromatic) {
              // This is a phenyl substituent!
              return { type: 'aryl', size: 6, name: 'phenyl' };
            }
          }
        }
      }
    }
  }
  
  // detect simple branched alkyls: isopropyl, tert-butyl, isobutyl
  const carbonNeighbors = new Map<number, number>();
  for (const idx of substituentAtoms) {
    const atom = molecule.atoms[idx];
    if (!atom) continue;
    if (atom.symbol !== 'C') continue;
    let neigh = 0;
    for (const b of molecule.bonds) {
      if (b.atom1 === idx && substituentAtoms.has(b.atom2)) neigh++;
      if (b.atom2 === idx && substituentAtoms.has(b.atom1)) neigh++;
    }
    carbonNeighbors.set(idx, neigh);
  }
  const neighborCounts = Array.from(carbonNeighbors.values());
  const maxCNeigh = neighborCounts.length ? Math.max(...neighborCounts) : 0;
  if (carbonCount === 1 && atoms.length === 1) {
    return { type: 'alkyl', size: 1, name: 'methyl' };
  } else if (carbonCount === 2 && atoms.length === 2) {
    return { type: 'alkyl', size: 2, name: 'ethyl' };
  } else if (carbonCount === 3 && atoms.length === 3) {
    // if central carbon has two carbon neighbors it's propan-2-yl (not isopropyl)
    if (maxCNeigh >= 2) return { type: 'alkyl', size: 3, name: 'propan-2-yl' };
    return { type: 'alkyl', size: 3, name: 'propyl' };
  } else if (atoms.some(atom => atom.symbol === 'O' && atom.hydrogens === 1)) {
    return { type: 'functional', size: 1, name: 'hydroxy' };
  } else if (atoms.some(atom => atom.symbol === 'Cl')) {
    return { type: 'halo', size: 1, name: 'chloro' };
  } else if (atoms.some(atom => atom.symbol === 'Br')) {
    return { type: 'halo', size: 1, name: 'bromo' };
  } else if (atoms.some(atom => atom.symbol === 'I')) {
    return { type: 'halo', size: 1, name: 'iodo' };
  } else if (atoms.some(atom => atom.symbol === 'S')) {
    // Check for thiocyanate first: -S-C≡N pattern
    const sulfurAtomIdx = Array.from(substituentAtoms).find(idx => molecule.atoms[idx]?.symbol === 'S');
    if (sulfurAtomIdx !== undefined) {
      // Look for carbon bonded to sulfur
      const carbonBondedToS = molecule.bonds.find(bond =>
        (bond.atom1 === sulfurAtomIdx && substituentAtoms.has(bond.atom2) && molecule.atoms[bond.atom2]?.symbol === 'C') ||
        (bond.atom2 === sulfurAtomIdx && substituentAtoms.has(bond.atom1) && molecule.atoms[bond.atom1]?.symbol === 'C')
      );
      
      if (carbonBondedToS) {
        const carbonIdx = carbonBondedToS.atom1 === sulfurAtomIdx ? carbonBondedToS.atom2 : carbonBondedToS.atom1;
        
        // Check if this carbon has a triple bond to nitrogen
        const tripleBondToN = molecule.bonds.find(bond =>
          (bond.atom1 === carbonIdx || bond.atom2 === carbonIdx) &&
          bond.type === 'triple' &&
          ((bond.atom1 === carbonIdx && molecule.atoms[bond.atom2]?.symbol === 'N') ||
           (bond.atom2 === carbonIdx && molecule.atoms[bond.atom1]?.symbol === 'N'))
        );
        
        if (tripleBondToN) {
          // This is a thiocyanate group: -S-C≡N → thiocyano
          return { type: 'functional', size: 3, name: 'thiocyano' };
        }
      }
    }
    
    // Sulfur-containing substituents
    if (atoms.length === 1 && carbonCount === 0) {
      // Just sulfur: -SH → sulfanyl (or mercapto in older nomenclature)
      return { type: 'functional', size: 1, name: 'sulfanyl' };
    } else if (carbonCount > 0) {
      // Alkylsulfanyl: -S-alkyl → alkylsulfanyl (e.g., methylsulfanyl, ethylsulfanyl, prop-1-ynylsulfanyl)
      if (sulfurAtomIdx !== undefined) {
        const name = nameAlkylSulfanylSubstituent(molecule, substituentAtoms, sulfurAtomIdx);
        return { type: 'functional', size: carbonCount + 1, name };
      }
      return { type: 'functional', size: carbonCount + 1, name: 'sulfanyl' };
    }
  }
  if (carbonCount > 0) {
    // detect simple branched alkyls: propan-2-yl, 2-methylpropan-2-yl, 2-methylpropyl
    if (carbonCount === 4) {
      // 2-methylpropan-2-yl (formerly tert-butyl): one carbon connected to three carbons inside substituent
      if (maxCNeigh >= 3) return { type: 'alkyl', size: 4, name: '2-methylpropan-2-yl' };
      // 2-methylpropyl (formerly isobutyl): contains a branch but not quaternary center
      if (maxCNeigh === 2) return { type: 'alkyl', size: 4, name: '2-methylpropyl' };
    }
    return { type: 'alkyl', size: carbonCount, name: getAlkylName(carbonCount) };
  }
  return null;
}

export function generateSubstitutedName(
  hydrocarbonBase: string,
  substituents: Substituent[],
  heteroPrefixes: string[] = [],
  unsaturation: { type: 'ene' | 'yne', positions: number[] } | null
): string {
  // Group substituents by root name, collect positions and counts. Build prefix
  // objects so we can sort alphabetically by root name ignoring multiplicative
  // prefixes (di/tri/bis) according to IUPAC rules.
  const grouped = new Map<string, { positions: string[]; count: number }>();
  for (const sub of substituents) {
    const entry = grouped.get(sub.name);
    if (entry) {
      entry.positions.push(sub.position);
      entry.count += 1;
    } else {
      grouped.set(sub.name, { positions: [sub.position], count: 1 });
    }
  }

  type PrefixObj = { positions: string[]; count: number; root: string; text: string };
  const substituentPrefixes: PrefixObj[] = [];
  for (const [root, data] of grouped.entries()) {
    const positions = data.positions.sort((a, b) => parseInt(a) - parseInt(b));
    const count = positions.length;
    const multiplier = count === 1 ? '' : getGreekNumeral(count);
    const text = count === 1 ? `${positions.join(',')}-${root}` : `${positions.join(',')}-${multiplier}${root}`;
    substituentPrefixes.push({ positions, count, root, text });
  }

  // heteroPrefixes come as strings like '2-oxa' — parse root for sorting (after '-')
  const heteroPrefixObjs: PrefixObj[] = heteroPrefixes.map(h => {
    const parts = h.split('-');
    const pos = parts[0] ?? '';
    const root = parts[1] ?? h;
    return { positions: [pos], count: 1, root, text: h };
  });

  // Sort prefixes alphabetically by root (IUPAC ignores multiplicative prefixes)
  const allPrefixes: PrefixObj[] = [...substituentPrefixes, ...heteroPrefixObjs];
  allPrefixes.sort((A, B) => {
    const aRoot = A.root.replace(/^(di|tri|tetra|bis|tris|tetr)/i, '');
    const bRoot = B.root.replace(/^(di|tri|tetra|bis|tris|tetr)/i, '');
    if (aRoot === bRoot) return A.text.localeCompare(B.text);
    return aRoot.localeCompare(bRoot);
  });
  const prefixes = allPrefixes.map(p => p.text);

  let unsaturationSuffix = '';
  if (unsaturation) {
    const positions = unsaturation.positions;
    if (positions.length === 1 && positions[0] === 1) {
      unsaturationSuffix = unsaturation.type;
    } else {
      unsaturationSuffix = `-${positions.join(',')}-${unsaturation.type}`;
    }
  } else {
    unsaturationSuffix = 'ane';
  }

  const prefixPart = prefixes.length > 0 ? prefixes.join('-') : '';
  if (prefixPart.length > 0) {
    // If there are hetero prefixes present, insert a hyphen between the prefix part
    // and the hydrocarbon base (e.g., 2-oxa-propene). If no hetero prefixes, do not
    // add an extra hyphen between substituent prefix and base (e.g., 2-methylbutane).
    if (heteroPrefixes && heteroPrefixes.length > 0) {
      return `${prefixPart}-${hydrocarbonBase}${unsaturationSuffix}`;
    }
    return `${prefixPart}${hydrocarbonBase}${unsaturationSuffix}`;
  }
  return `${hydrocarbonBase}${unsaturationSuffix}`;
}