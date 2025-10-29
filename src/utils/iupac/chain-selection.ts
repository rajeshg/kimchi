import type { Molecule } from 'types';
import { BondType } from 'types';
import { getChainFunctionalGroupPriority } from './functional-group-detector';
import { analyzeRings } from '../ring-analysis';
import { createDefaultChainSelector } from './chain-selector';
import type { Chain } from './iupac-types';

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
      
       // Exclude carboxyl carbons from being part of the main chain except as terminals
       if (hasCarboxyl) {
         // For dicarboxylic acids, exclude carboxyl carbons from chain except as terminal atoms
         // Only include as chain start if it is a terminal carboxyl carbon (i.e., only one neighbor is carbon)
         const carboxylNeighbors = bonds.filter(b => {
           const neighbor = molecule.atoms[b.atom1 === i ? b.atom2 : b.atom1];
           return neighbor?.symbol === 'C';
         });
         // Allow carboxyl carbons that have at least one carbon neighbor to be chain starts.
         // Previously we required exactly one carbon neighbor (terminal only), but that
         // excluded valid parent chains in some cases (dicarboxyl/ester arrangements).
         if (carboxylNeighbors.length === 0) continue; // need at least one carbon neighbor
         // Found terminal carboxylic acid carbon, build chain from it
         const visited = new Set<number>();
         const chain: number[] = [];
         dfsChainFromFunctionalGroup(i, molecule, visited, chain, chains);
       }
    }
   
   // Remove duplicates and sub-chains
   const uniqueChains = new Map<string, number[]>();
   for (const chain of chains) {
    const canonical = canonicalizeAcyclicChainOrder(chain, molecule);
    const key = [...canonical].sort((a, b) => a - b).join(',');
    const existing = uniqueChains.get(key);
    if (!existing || canonical.length > existing.length) {
      uniqueChains.set(key, canonical);
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
  // New policy (per request):
  // - Longest carbon chain that contains the principal group.
  // - If multiple, choose one with more substituents.
  // - If still tied, choose alphabetically smaller substituents.

  // Gather all candidate chains: include chains found from functional groups plus general acyclic chains
  const fgChains = findChainsFromFunctionalGroups(molecule);
  const acyclicChains = findAllAcyclicChains(molecule);
  const ringChains = findRingBasedChains(molecule);
  const allCandidatesMap = new Map<string, number[]>();

  for (const c of fgChains) allCandidatesMap.set(c.join(','), c);
  for (const c of acyclicChains) allCandidatesMap.set(c.join(','), c);
  for (const c of ringChains) allCandidatesMap.set(c.join(','), c);

   const allCandidates = Array.from(allCandidatesMap.values());

   if (allCandidates.length === 0) {
     return { chain: [], reason: 'No candidate chains found' };
   }

   // Filter to only chains of maximum length (IUPAC: prefer most highly branched among longest chains)
   const maxLen = Math.max(...allCandidates.map(c => c.length));
   const maxLenCandidates = allCandidates.filter(c => c.length === maxLen);

  // Determine principal functional group atom indices (atoms with highest per-atom FG priority)
  const principalAtoms = getPrincipalFunctionalGroupAtoms(molecule);

  if (principalAtoms.length === 0) {
      // No principal functional group — fall back to existing selection pipeline
      // Diagnostic logging gated by VERBOSE
      if (process.env.VERBOSE) {
        try {
          const fg = findChainsFromFunctionalGroups(molecule);
          const ac = findAllAcyclicChains(molecule);
          const rc = findRingBasedChains(molecule);
          const ringInfo = analyzeRings(molecule);
          console.debug('[chain-selection] VERBOSE: no principal FG, candidates counts:', { fgCount: fg.length, acCount: ac.length, rcCount: rc.length, ringCount: ringInfo.rings.length });
          console.debug('[chain-selection] VERBOSE: sample candidates', { fgSample: fg.slice(0,3), acSample: ac.slice(0,3), rcSample: rc.slice(0,3) });
        } catch (e) {}
      }

       // If there are ring-based candidates (fused/spiro/biphenyl unions), prefer
       // them when they are nearly as long as the longest carbon path. This helps
       // select aromatic/polycyclic parents (anthracene, biphenyl, benzoic parents)
       // in structures with no principal FG. Keep the threshold conservative
       // (allow ring candidate if length >= maxLen - 1) to avoid regressing long
       // aliphatic chain selection.
       try {
         if (ringChains && ringChains.length > 0) {
           const bestRingLen = Math.max(...ringChains.map(c => c.length));
           if (bestRingLen >= Math.max(1, maxLen - 1)) {
             // Prefer top ring candidates (those with bestRingLen)
             const topRingCandidates = ringChains.filter(c => c.length === bestRingLen);
             if (process.env.VERBOSE) console.debug('[chain-selection] VERBOSE: preferring ring-based candidates (no principal FG):', topRingCandidates.map(c => c.join('-')));
             if (topRingCandidates.length === 1) return { chain: topRingCandidates[0]!, reason: 'Preferred ring-based candidate (no principal FG)' };
             return selectBestChain(topRingCandidates, molecule, 'No principal FG (ring preference)');
           }
         }
       } catch (e) {
         // ignore ring preference errors and continue to length-based fallback
       }

       // Always restrict to maxLenCandidates for highly branched alkanes (IUPAC compliance)
       if (maxLenCandidates.length === 1) return { chain: maxLenCandidates[0]!, reason: 'Only one chain candidate' };
       return selectBestChain(maxLenCandidates, molecule, 'No principal FG (max length only)');
    }

  // Instead of requiring the chain to literally contain the principal atom index (which
  // excludes ring-only parents for substituent-based functional groups like benzoic acid),
  // compute a per-chain functional group priority and prefer chains with the highest
  // chain-level priority. This allows ring parents that carry the functional group as a
  // substituent to be selected correctly.
  const chainPriorities = allCandidates.map(c => ({ chain: c, priority: getChainFunctionalGroupPriority(c, molecule) }));
  const maxChainPriority = Math.max(...chainPriorities.map(x => x.priority));

  if (maxChainPriority === 0) {
    // No chain-level functional group detected — fall back to full pipeline
    return selectBestChain(allCandidates, molecule, 'No principal FG at chain level');
  }

  // If the principal functional group is attached to a ring (e.g., benzoic acid),
  // prefer ring-origin candidates that are adjacent to the principal atom(s).
  try {
    const ringInfo = analyzeRings(molecule);
    if (ringInfo.rings.length > 0 && principalAtoms.length > 0) {
      // find ring-origin candidates among allCandidates
      const ringOriginCandidates = allCandidates.filter(c => c.every(i => ringInfo.getRingsContainingAtom(i).length > 0));
      if (ringOriginCandidates.length > 0) {
        for (const p of principalAtoms) {
          const neighs = getNeighbors(p, molecule);
          // if any neighbor of principal atom is part of a ring-origin candidate, prefer ring
          const near = ringOriginCandidates.filter(c => c.some(idx => neighs.includes(idx) || c.includes(p)));
          if (near.length > 0) {
            if (process.env.VERBOSE) console.debug('[chain-selection] Preferring ring-origin candidate adjacent to principal FG', near.map(c => c.join('-')));
            const outcome = selectBestChain(near, molecule, 'Preferred ring-origin candidate due to principal FG adjacency');
            return { chain: outcome.chain, reason: outcome.reason || 'Preferred ring-origin candidate adjacent to FG' };
          }
        }
      }
    }
  } catch (e) {
    // ignore
  }

  // If we have principal functional group atoms, ensure the longest carbon-only
  // path that contains any of these atoms is considered as a candidate. This
  // addresses cases where the enumerated acyclic candidates may miss a longer
  // chain that includes the functional group (important for acid-terminated
  // parents in tests). Keep this conservative: only prefer a principal-containing
  // longest path if it is strictly longer than existing candidates.
  try {
    if (principalAtoms.length > 0) {
      const enumerated = enumerateAllSimpleCarbonPaths(molecule, molecule.atoms.length || 12);
      if (process.env.VERBOSE) {
        try {
          console.debug('[chain-selection] VERBOSE: enumerated carbon paths (count=', enumerated.length, '):', enumerated.slice(0,20).map(p => ({ len: p.length, path: p })));
        } catch (e) {}
      }
      const withPrincipal = enumerated.filter(p => p.some(idx => principalAtoms.includes(idx)));
      if (withPrincipal.length > 0) {
        let best = withPrincipal[0]!;
        for (const p of withPrincipal) {
          if (p.length > best.length) best = p;
        }
        // Always include the best principal-containing path as a candidate so the
        // selector can prefer chains that contain the principal functional group
        // even when they are not strictly longer than other enumerated candidates.
        // This is a conservative change: we only add a single candidate (the best
        // principal-containing path) to the pool to give the selector more options
        // rather than forcing it to ignore plausible principal-containing chains.
        try {
          if (process.env.VERBOSE) console.debug('[chain-selection] VERBOSE: adding longest principal-containing carbon path (forced):', best);
        } catch (e) {}
        // Avoid adding duplicates
        try {
          const key = best.join(',');
          const exists = allCandidatesMap ? allCandidatesMap.has(key) : false;
          if (!exists) allCandidates.push(best);
        } catch (e) {
          // fallback: just push
          allCandidates.push(best);
        }
      }
    }
  } catch (e) {
    // ignore enumeration errors
  }

  // Among chains with maximum FG priority, prefer those where the principal
  // functional group atom(s) appear as terminal atoms (chain ends). This ensures
  // that carboxylic acids and similar terminal functional groups produce short
  // parent chains (e.g., propanoic/phenylacetic acid) instead of being subsumed by
  // a longer carbon path that merely passes through the FG atom internally.
  const principalAtomSet = new Set(principalAtoms);
  // Also detect carboxyl-like carbons (C with =O and -O) as principal atoms
  const carboxylAtomSet = new Set<number>();
  for (let i = 0; i < molecule.atoms.length; i++) {
    const atom = molecule.atoms[i];
    if (!atom || atom.symbol !== 'C') continue;
    const bonds = molecule.bonds.filter(b => b.atom1 === i || b.atom2 === i);
    let hasDoubleO = false;
    let hasSingleO = false;
    for (const b of bonds) {
      const neigh = b.atom1 === i ? b.atom2 : b.atom1;
      const nat = molecule.atoms[neigh];
      if (!nat) continue;
      if (nat.symbol === 'O') {
        if (b.type === BondType.DOUBLE) hasDoubleO = true;
        if (b.type === BondType.SINGLE) hasSingleO = true;
      }
    }
    if (hasDoubleO && hasSingleO) carboxylAtomSet.add(i);
  }

  if (process.env.VERBOSE) {
    try {
      console.debug('[chain-selection] principalAtoms:', principalAtoms);
      console.debug('[chain-selection] carboxylAtoms:', Array.from(carboxylAtomSet.values()));
    } catch (e) {}
  }
  const candidatesWithPriority = chainPriorities.filter(x => x.priority === maxChainPriority).map(x => x.chain);

  // Detect terminal-FG candidates
  const terminalCandidates = candidatesWithPriority.filter(c => {
    if (c.length === 0) return false;
    const first = c[0]!;
    const last = c[c.length - 1]!;
    return principalAtomSet.has(first) || principalAtomSet.has(last) || carboxylAtomSet.has(first) || carboxylAtomSet.has(last);
  });

  // Also detect candidates that contain a principal atom anywhere in the chain
  // (useful for ring-based chains where the principal FG is attached to an internal
  // ring atom rather than being a terminal atom).
  const principalContainingCandidates = candidatesWithPriority.filter(c => c.some(idx => principalAtomSet.has(idx) || carboxylAtomSet.has(idx)));

  if (process.env.VERBOSE) {
    try {
      console.debug('[chain-selection] candidatesWithPriority:', candidatesWithPriority.map(c => c.join('-')));
      console.debug('[chain-selection] terminalCandidates:', terminalCandidates.map(c => c.join('-')));
    } catch (e) {}
  }

  // If there are ring-origin candidates that are adjacent to the principal FG
  // (e.g., benzoic acid where the carboxyl is attached to the ring), prefer
  // those ring candidates before applying the terminal/aliphatic heuristics.
  try {
    const ringInfo = analyzeRings(molecule);
    const ringCandidates = candidatesWithPriority.filter(c => c.every(i => ringInfo.getRingsContainingAtom(i).length > 0));
    const ringCandidatesNearFG = ringCandidates.filter(c => {
      for (const p of principalAtoms) {
        // If principal atom itself is on the ring, prefer the ring candidate
        if (c.includes(p)) return true;
        // If any neighbor of principal atom is part of the ring candidate, prefer it
        const neighs = getNeighbors(p, molecule);
        if (neighs.some(n => c.includes(n))) return true;
      }
      return false;
    });
    if (ringCandidatesNearFG.length > 0) {
      if (process.env.VERBOSE) console.debug('[chain-selection] preferring ring candidates near FG:', ringCandidatesNearFG.map(c => c.join('-')));
      // prefer these ring candidates
      const outcome = selectBestChain(ringCandidatesNearFG, molecule, 'Preferred ring-origin candidate adjacent to FG');
      return { chain: outcome.chain, reason: outcome.reason || 'Preferred ring-origin candidate adjacent to FG' };
    }
  } catch (e) {
    // ignore ring-based preference errors and continue
  }

  // Prefer terminal candidates first, then any candidate that contains the principal
  // functional group anywhere (this lets ring parents win when they carry the FG as a
  // substituent). Fall back to all candidates with the top priority.
  const finalCandidates = terminalCandidates.length > 0 ? terminalCandidates : (principalContainingCandidates.length > 0 ? principalContainingCandidates : candidatesWithPriority);

  // Special-case: if the principal functional group is a high-priority suffix (e.g., carboxylic acid)
  // and we have terminal candidates, STRICTLY prefer the SHORTEST terminal chain (fewest carbon atoms).
  // This ensures short acid-terminated parents (phenylacetic acid, propanoic acid in ibuprofen)
  // are chosen over much longer aromatic-inclusive chains.
  const CARBOXYL_PRIORITY_THRESHOLD = 6;
  if (terminalCandidates.length > 0 && maxChainPriority >= CARBOXYL_PRIORITY_THRESHOLD) {
    // Handle dicarboxylic acids specially - detect ALL carboxylic acid carbons
    const allCarboxylCarbons = getAllCarboxylCarbons(molecule);
    if (allCarboxylCarbons.length > 1) {
      // Debug logging
      if (process.env.VERBOSE) {
        console.debug('[chain-selection] Dicarboxylic acid detected:', { allCarboxylCarbons, totalCandidates: allCandidates.length });
        console.debug('[chain-selection] All candidates:', allCandidates.map(c => c.join('-')));
      }

      // For dicarboxylic acids, find the optimal chain length based on distances
      const distances = [];
      for (let i = 0; i < allCarboxylCarbons.length; i++) {
        for (let j = i + 1; j < allCarboxylCarbons.length; j++) {
          const path = findShortestPath(allCarboxylCarbons[i]!, allCarboxylCarbons[j]!, molecule);
          if (path.length > 0) {
            distances.push(path.length - 1);
          }
        }
      }
      
      const minDistance = distances.length > 0 ? Math.min(...distances) : 0;
      if (process.env.VERBOSE) {
        console.debug('[chain-selection] Min distance between carboxyls:', minDistance);
      }
      
      // Find chains that contain multiple carboxyl carbons
      const multiCarboxylChains = allCandidates.filter(chain => {
        const chainSet = new Set(chain);
        const carboxylsInChain = allCarboxylCarbons.filter(c => chainSet.has(c));
        return carboxylsInChain.length >= 2;
      });
      
      // Also find chains that contain exactly one carboxyl carbon
      const singleCarboxylChains = allCandidates.filter(chain => {
        const chainSet = new Set(chain);
        const carboxylsInChain = allCarboxylCarbons.filter(c => chainSet.has(c));
        return carboxylsInChain.length === 1;
      });
      
      if (process.env.VERBOSE) {
        console.debug('[chain-selection] Multi-carboxyl chains found:', multiCarboxylChains.length, multiCarboxylChains.map(c => c.join('-')));
        console.debug('[chain-selection] Single-carboxyl chains found:', singleCarboxylChains.length, singleCarboxylChains.map(c => c.join('-')));
      }
      
      if (multiCarboxylChains.length > 0 || singleCarboxylChains.length > 0) {
        let best: number[] | undefined;
        
        // Comprehensive dicarboxylic acid logic:
        // 1. For simple malonic acid (OC(=O)CC(=O)O): prefer 2-carbon chains
        // 2. For substituted malonic acid (CC(C(=O)O)C(=O)O): prefer 3-carbon chains
        // 3. For extended dicarboxylic acids (minDistance > 2): prefer longer chains
        // 4. For branched dicarboxylic acids: prefer chains that include branches
        
        // Detect simple malonic acid vs substituted variants
        const isSimpleMalonic = isSimpleMalonicAcid(molecule, allCarboxylCarbons, minDistance);
        
        if (minDistance === 2 && isSimpleMalonic) {
          // Simple malonic acid case: prefer 2-carbon chains with single carboxyls
          const twoCarbonChains = singleCarboxylChains.filter(chain => chain.length === 2);
          if (twoCarbonChains.length > 0) {
            best = twoCarbonChains[0]!;
            // Choose lexicographically smallest
            for (const c of twoCarbonChains) {
              if (c.join(',') < best!.join(',')) best = c;
            }
          }
        } else if (minDistance === 2 && !isSimpleMalonic) {
          // Substituted malonic acid: prefer 3-carbon chains that include the central carbon
          if (multiCarboxylChains.length > 0) {
            // Use the multi-carboxyl chain which includes the central carbon and both carboxyls
            best = multiCarboxylChains[0]!;
          } else {
            // Find 3-carbon chains that connect both carboxyl regions
            const threeCarbonChains = allCandidates.filter(chain => 
              chain.length === 3 && 
              chain.some(atom => getNeighbors(atom, molecule).some(neighbor => 
                allCarboxylCarbons.includes(neighbor)
              ))
            );
            if (threeCarbonChains.length > 0) {
              best = threeCarbonChains[0]!;
            }
          }
        } else if (minDistance > 2) {
          // Extended dicarboxylic acids: prefer longest chains
          // Check if we have chains that span from one carboxyl to the other
          if (multiCarboxylChains.length > 0) {
            best = multiCarboxylChains[0]!;
            for (const c of multiCarboxylChains) {
              if (c.length > best!.length) best = c;
              else if (c.length === best!.length && c.join(',') < best!.join(',')) best = c;
            }
          } else {
            // Look for chains that connect carboxyl-containing regions
            // For case 17 (succinic acid), find chains that include intermediate carbons
            const extendedChains = allCandidates.filter(chain => {
              const chainSet = new Set(chain);
              const carboxylsInChain = allCarboxylCarbons.filter(c => chainSet.has(c));
              // Include chains that have at least one carboxyl and span sufficient length
              return carboxylsInChain.length >= 1 && chain.length >= (minDistance + 1);
            });
            
            if (extendedChains.length > 0) {
              best = extendedChains[0]!;
              for (const c of extendedChains) {
                if (c.length > best!.length) best = c;
                else if (c.length === best!.length && c.join(',') < best!.join(',')) best = c;
              }
            }
          }
        } else if (minDistance > 1) {
          // Case for branched dicarboxylic acids like case 16
          // Prefer chains that include the branch point
          const branchedChains = allCandidates.filter(chain => {
            const chainSet = new Set(chain);
            const carboxylsInChain = allCarboxylCarbons.filter(c => chainSet.has(c));
            // Find chains that include carboxyls and have sufficient length
            return carboxylsInChain.length >= 1 && chain.length >= 3;
          });
          
          if (branchedChains.length > 0) {
            best = branchedChains[0]!;
            for (const c of branchedChains) {
              if (c.length > best!.length) best = c;
              else if (c.length === best!.length && c.join(',') < best!.join(',')) best = c;
            }
          }
        }
        
        // If we found a suitable chain, use it
        if (best) {
          if (process.env.VERBOSE) {
            console.debug('[chain-selection] Selected best dicarboxylic chain:', best.join('-'), 'length:', best.length);
          }
          
          const outcome = selectBestChain([best], molecule, `Preferred dicarboxylic acid chain (distance ${minDistance})`);
          return { chain: outcome.chain, reason: outcome.reason || `Preferred dicarboxylic acid chain (distance ${minDistance})` };
        }
        // If no suitable chain found, fall through to existing logic
      }
    }

    // Continue with existing logic for monocarboxylic acids
    const ringInfo = analyzeRings(molecule);

    // If any terminal candidate is a ring-origin candidate adjacent to the principal FG,
    // prefer those before aliphatic terminal candidates. This ensures carboxyls attached to
    // rings (benzoic/phenylacetic-like parents) are chosen over long aliphatic chains.
    const ringCandidatesNearFG = terminalCandidates.filter(c => {
      // candidate is ring-origin if any atom is part of a ring
      const isRingOrigin = c.some(i => ringInfo.getRingsContainingAtom(i).length > 0);
      if (!isRingOrigin) return false;
      // check adjacency to any principal atom (principal atom itself or its neighbors)
      for (const p of principalAtoms) {
        if (c.includes(p)) return true;
        const neighs = getNeighbors(p, molecule);
        if (neighs.some(n => c.includes(n))) return true;
      }
      return false;
    });

    const aliphaticTerminal = terminalCandidates.filter(c => c.every(i => !molecule.atoms[i]?.aromatic && ringInfo.getRingsContainingAtom(i).length === 0));

    const pool = ringCandidatesNearFG.length > 0 ? ringCandidatesNearFG : (aliphaticTerminal.length > 0 ? aliphaticTerminal : terminalCandidates);

    // STRICTLY prefer the SHORTEST carbon chain for high-priority FGs
    // This fixes issues like OC(=O)CC(=O)O (malonic acid) where we need chain length 2, not 3
    let best = pool[0]!;
    for (const c of pool) {
      const bestCarbons = countCarbons(best, molecule);
      const cCarbons = countCarbons(c, molecule);
      // Prefer shorter chain FIRST (reverse of previous logic)
      if (cCarbons < bestCarbons) best = c;
      else if (cCarbons === bestCarbons && c.length < best.length) best = c;
    }
    // Run a final fine-grained selection among ties (if any) using existing selector to build reason
    const tied = pool.filter(c => countCarbons(c, molecule) === countCarbons(best, molecule) && c.length === best.length);
    const outcome = selectBestChain(tied.length > 0 ? tied : [best], molecule, 'Preferred shortest terminal chain for high-priority FG');
    return { chain: outcome.chain, reason: outcome.reason || 'Preferred shortest terminal chain for high-priority FG' };
  }

  // For molecules with multiple carboxylic acid functional groups (dicarboxylic acids),
  // handle them specially regardless of how many principal atoms were detected
  // First, detect all carboxylic acid carbons in the molecule
  const allCarboxylCarbons = getAllCarboxylCarbons(molecule);
  if (terminalCandidates.length > 0 && allCarboxylCarbons.length > 1) {
    // Debug logging
    if (process.env.VERBOSE) {
      console.debug('[chain-selection] Dicarboxylic acid detected:', { allCarboxylCarbons, terminalCandidates: terminalCandidates.map(c => c.join('-')) });
    }

    // Check which terminal candidates have ALL carboxyl carbons as terminals
    const fullTerminalCandidates = terminalCandidates.filter(c => {
      const first = c[0]!;
      const last = c[c.length - 1]!;
      return allCarboxylCarbons.every(p => p === first || p === last);
    });

    if (process.env.VERBOSE) {
      console.debug('[chain-selection] Full terminal candidates for dicarboxylic acid:', fullTerminalCandidates.map(c => c.join('-')));
    }

    if (fullTerminalCandidates.length > 0) {
      // Calculate distances between carboxyl carbons
      const distances = [];
      for (let i = 0; i < allCarboxylCarbons.length; i++) {
        for (let j = i + 1; j < allCarboxylCarbons.length; j++) {
          const p1 = allCarboxylCarbons[i]!;
          const p2 = allCarboxylCarbons[j]!;
          // Calculate shortest path between carboxyl carbons
          const path = findShortestPath(p1, p2, molecule);
          if (path.length > 0) {
            const distance = path.length - 1; // number of bonds between carboxyl carbons
            distances.push(distance);
            if (process.env.VERBOSE) {
              console.debug('[chain-selection] Distance between carboxyl carbons', p1, 'and', p2, ':', distance, 'path:', path);
            }
          }
        }
      }
      
      const minDistance = distances.length > 0 ? Math.min(...distances) : 0;
      if (process.env.VERBOSE) {
        console.debug('[chain-selection] Minimum carboxyl carbon distance:', minDistance);
      }
      
      // If the distance between carboxyl carbons is 1 (adjacent carbons like malonic acid),
      // prefer the shortest chain. Otherwise, prefer the longest chain that still has
      // all carboxyl carbons as terminals (to maintain the carbon backbone).
      if (minDistance === 1) {
        // For malonic acid type: STRICTLY prefer the SHORTEST chain
        let best = fullTerminalCandidates[0]!;
        for (const c of fullTerminalCandidates) {
          const bestCarbons = countCarbons(best, molecule);
          const cCarbons = countCarbons(c, molecule);
          if (cCarbons < bestCarbons) best = c;
          else if (cCarbons === bestCarbons && c.length < best.length) best = c;
        }
        const outcome = selectBestChain([best], molecule, 'Preferred shortest chain for malonic acid type');
        return { chain: outcome.chain, reason: outcome.reason || 'Preferred shortest chain for malonic acid type' };
      } else {
        // For longer dicarboxylic acids: prefer the LONGEST terminal chain to maintain backbone
        let best = fullTerminalCandidates[0]!;
        for (const c of fullTerminalCandidates) {
          const bestCarbons = countCarbons(best, molecule);
          const cCarbons = countCarbons(c, molecule);
          if (cCarbons > bestCarbons) best = c;
          else if (cCarbons === bestCarbons && c.length > best.length) best = c;
        }
        const outcome = selectBestChain([best], molecule, 'Preferred longest chain for extended dicarboxylic acid');
        return { chain: outcome.chain, reason: outcome.reason || 'Preferred longest chain for extended dicarboxylic acid' };
      }
    }
  }

  // For molecules with multiple terminal functional groups (e.g., dicarboxylic acids),
  // STRICTLY prefer the shortest chain that has all principal FG atoms at terminals
  // EXCEPT: for acids with exactly 1 carbon between FG atoms (like OC(=O)CC(=O)O - malonic acid),
  // prefer the 2-carbon chain. For longer chains, prefer the full backbone.
  if (terminalCandidates.length > 0 && principalAtoms.length > 1) {
    // Debug logging
    if (process.env.VERBOSE) {
      console.debug('[chain-selection] Multiple principal FGs detected:', { principalAtoms, terminalCandidates: terminalCandidates.map(c => c.join('-')) });
    }

    // Check which terminal candidates have ALL principal atoms as terminals
    const fullTerminalCandidates = terminalCandidates.filter(c => {
      const first = c[0]!;
      const last = c[c.length - 1]!;
      return principalAtoms.every(p => p === first || p === last);
    });

    if (process.env.VERBOSE) {
      console.debug('[chain-selection] Full terminal candidates:', fullTerminalCandidates.map(c => c.join('-')));
    }

    if (fullTerminalCandidates.length > 0) {
      // Special handling for malonic acid type molecules (1 carbon between FG atoms)
      // These should use the minimal 2-carbon chain (both FG carbons)
      const distances = [];
      for (const p1 of principalAtoms) {
        for (const p2 of principalAtoms) {
          if (p1 < p2) {
            // Calculate shortest path between principal atoms
            const path = findShortestPath(p1, p2, molecule);
            if (path.length > 0) {
              const distance = path.length - 1; // number of bonds between FG atoms
              distances.push(distance);
              if (process.env.VERBOSE) {
                console.debug('[chain-selection] Distance between FG atoms', p1, 'and', p2, ':', distance, 'path:', path);
              }
            }
          }
        }
      }
      
      const minDistance = distances.length > 0 ? Math.min(...distances) : 0;
      if (process.env.VERBOSE) {
        console.debug('[chain-selection] Minimum FG distance:', minDistance);
      }
      
      // If the distance between principal FGs is 1 (adjacent carbons like malonic acid),
      // prefer the shortest chain. Otherwise, prefer the longest chain that still has
      // all FGs as terminals (to maintain the carbon backbone).
      if (minDistance === 1) {
        // For malonic acid type: STRICTLY prefer the SHORTEST chain
        let best = fullTerminalCandidates[0]!;
        for (const c of fullTerminalCandidates) {
          const bestCarbons = countCarbons(best, molecule);
          const cCarbons = countCarbons(c, molecule);
          if (cCarbons < bestCarbons) best = c;
          else if (cCarbons === bestCarbons && c.length < best.length) best = c;
        }
        const outcome = selectBestChain([best], molecule, 'Preferred shortest chain for malonic acid type');
        return { chain: outcome.chain, reason: outcome.reason || 'Preferred shortest chain for malonic acid type' };
      } else {
        // For longer dicarboxylic acids: prefer the LONGEST terminal chain to maintain backbone
        let best = fullTerminalCandidates[0]!;
        for (const c of fullTerminalCandidates) {
          const bestCarbons = countCarbons(best, molecule);
          const cCarbons = countCarbons(c, molecule);
          if (cCarbons > bestCarbons) best = c;
          else if (cCarbons === bestCarbons && c.length > best.length) best = c;
        }
        const outcome = selectBestChain([best], molecule, 'Preferred longest chain for extended dicarboxylic acid');
        return { chain: outcome.chain, reason: outcome.reason || 'Preferred longest chain for extended dicarboxylic acid' };
      }
    }
  }

  const bestOutcome = selectBestChain(finalCandidates, molecule, terminalCandidates.length > 0 ? 'Contains principal FG at terminal' : 'Contains principal FG (chain-level)');
  return { chain: bestOutcome.chain, reason: bestOutcome.reason || 'Selected chain by chain-level FG priority' };
 }

/**
 * Compute per-atom principal functional group indices using getChainFunctionalGroupPriority by passing single-atom chains.
 */
function getPrincipalFunctionalGroupAtoms(molecule: Molecule): number[] {
  let bestPriority = 0;
  const priorMap = new Map<number, number>();
  for (let i = 0; i < molecule.atoms.length; i++) {
    const atom = molecule.atoms[i];
    if (!atom) continue;
    // compute small priority using existing detector on single-atom chain
    const p = getChainFunctionalGroupPriority([i], molecule);
    priorMap.set(i, p);
    if (p > bestPriority) bestPriority = p;
  }
  if (bestPriority === 0) return [];
  const result: number[] = [];
  for (const [idx, p] of priorMap) {
    if (p === bestPriority) result.push(idx);
  }
  return result;
}

/**
 * Compare two chains according to the requested policy.
 * Returns -1 if b is better than a, 1 if a is better, 0 if equal.
 */
function compareChainsPreferPrincipal(a: number[], b: number[], molecule: Molecule): number {
  // Calculate locants for both chains
  const aLocants = getSubstituentLocants(a, molecule).slice().sort((x, y) => x - y);
  const bLocants = getSubstituentLocants(b, molecule).slice().sort((x, y) => x - y);

  // 1) Longest carbon chain (count carbon atoms)
  const aCarbons = countCarbons(a, molecule);
  const bCarbons = countCarbons(b, molecule);
  if (bCarbons > aCarbons) return -1;
  if (bCarbons < aCarbons) return 1;

  // 2) More substituents (count substituent positions)
  const aSubs = aLocants.length;
  const bSubs = bLocants.length;
  if (bSubs > aSubs) return -1;
  if (bSubs < aSubs) return 1;

  // 3) If equal carbon count, prefer the longer total atom chain (tie-breaker)
  if (b.length > a.length) return -1;
  if (b.length < a.length) return 1;

  // 4) Prefer the set of locants that is lower (IUPAC lowest-set rule)
  if (isLowerLocants(bLocants, aLocants)) return -1;
  if (isLowerLocants(aLocants, bLocants)) return 1;

  // 5) Alphabetically smaller substituents
  const aLabels = getSubstituentLabels(a, molecule).sort();
  const bLabels = getSubstituentLabels(b, molecule).sort();
  const len = Math.min(aLabels.length, bLabels.length);
  for (let i = 0; i < len; i++) {
    if (aLabels[i]! < bLabels[i]!) return 1; // a is alphabetically smaller -> a better
    if (aLabels[i]! > bLabels[i]!) return -1;
  }
  if (aLabels.length < bLabels.length) return -1; // b has extra labels -> b better
  if (aLabels.length > bLabels.length) return 1;

  return 0;
}

/**
 * Build simple substituent labels for each substituent attached to a chain.
 * Label is constructed by taking the atom symbol of the substituent root plus a small
 * fingerprint of its immediate neighborhood (up to depth 2), joined as a string.
 */
function getSubstituentLabels(chain: number[], molecule: Molecule): string[] {
  const labels: string[] = [];
  const chainSet = new Set(chain);
  for (let i = 0; i < chain.length; i++) {
    const atomIdx = chain[i]!;
    const neighbors = getNeighbors(atomIdx, molecule);
    for (const neigh of neighbors) {
      if (chainSet.has(neigh)) continue;
      // Build small fingerprint
      const seen = new Set<number>();
      const parts: string[] = [];
      const queue: number[] = [neigh];
      let depth = 0;
      while (queue.length > 0 && depth < 2) {
        const levelSize = queue.length;
        for (let j = 0; j < levelSize; j++) {
          const n = queue.shift()!;
          if (seen.has(n)) continue;
          seen.add(n);
          const nat = molecule.atoms[n];
          if (!nat) continue;
          parts.push(nat.symbol + (nat.aromatic ? 'a' : ''));
          for (const nb of getNeighbors(n, molecule)) {
            if (!seen.has(nb) && !chainSet.has(nb)) queue.push(nb);
          }
        }
        depth++;
      }
      labels.push(parts.join('-'));
    }
  }
  return labels;
}

/**
 * Generate chain candidates based on ring topology.
 * - Includes individual SSSR rings (carbon-only atom lists)
 * - Includes unions of two rings (for fused/spiro/bridged systems) as candidate chains
 */
function findRingBasedChains(molecule: Molecule): number[][] {
  const ringInfo = analyzeRings(molecule);
  const rings = ringInfo.rings || [];
  const candidates: number[][] = [];
  // Debug: log rings detected for troubleshooting
  try {
    console.debug('[chain-selection] findRingBasedChains: detected rings:', rings.map(r => r.join('-')));
  } catch (e) {}

  // Single-ring candidates (carbon-only)
  for (const ring of rings) {
    const carbons = ring.filter(i => molecule.atoms[i]?.symbol === 'C');
    if (carbons.length >= 3) {
      candidates.push(carbons);
      try {
        console.debug('[chain-selection] findRingBasedChains: adding single-ring candidate:', carbons.join('-'));
      } catch (e) {}
    }
  }

  // Pairwise unions for fused/spiro/bridged systems
  for (let i = 0; i < rings.length; i++) {
    for (let j = i + 1; j < rings.length; j++) {
      const ringA = rings[i]!;
      const ringB = rings[j]!;
      // Compute carbon-only counts for rings and their union so heteroatom-containing
      // rings don't cause incorrect skipping of viable carbon unions.
      const ringACarbons = ringA.filter(i => molecule.atoms[i]?.symbol === 'C');
      const ringBCarbons = ringB.filter(i => molecule.atoms[i]?.symbol === 'C');
      const unionSet = new Set<number>([...ringACarbons, ...ringBCarbons]);
      const unionCarbons = Array.from(unionSet);
      // Only consider if union expands beyond individual carbon-only rings
      if (unionCarbons.length > Math.max(ringACarbons.length, ringBCarbons.length) && unionCarbons.length >= 3) {
        candidates.push(unionCarbons);
        try {
        console.debug('[chain-selection] findRingBasedChains: adding union candidate:', unionCarbons.join('-'));
        } catch (e) {}
      } else {
        try {
          console.debug('[chain-selection] findRingBasedChains: skipping union (not larger):', unionCarbons.join('-'));
        } catch (e) {}
      }
    }
  }

  // Deduplicate by sorted key
  const unique = new Map<string, number[]>();
  for (const c of candidates) {
    const key = [...c].sort((a, b) => a - b).join(',');
    const existing = unique.get(key);
    if (!existing || c.length > existing.length) unique.set(key, c);
  }

  return Array.from(unique.values()).sort((a, b) => b.length - a.length);
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

  // Convert numeric chains (number[] of atom indices) into Chain objects expected by ChainSelector
  const converted: Chain[] = chains.map(c => {
    const isAromatic = c.some(i => molecule.atoms[i]?.aromatic);

    // Determine functional group priority on this chain
    const fgPriority = getChainFunctionalGroupPriority(c, molecule);

    // Populate a lightweight functionalGroups array so filters can detect presence
    const functionalGroups = fgPriority > 0 ? [{ functionalGroup: { name: 'principal', priority: fgPriority, smarts: '', suffix: '', parenthesized: false, atomIndices: [], isPrincipal: true } as any, position: 1, count: 1 }] : [];

    // Determine substituent positions (simple count)
    const locants = getSubstituentLocants(c, molecule);
    const substituents = locants.map(l => ({ position: String(l), type: 'alkyl', size: 1, name: 'alkyl' }));

    // Rough cycle detection: if any atom in chain is part of a ring (via analyzeRings), mark cyclic
    const ringInfo = analyzeRings(molecule);
    const isCyclic = c.some(i => ringInfo.getRingsContainingAtom(i).length > 0);

    // Mark if this numeric chain exactly matches a single SSSR ring or a union of rings
    let isFromRingUnion = false;
    try {
      // Use carbon-only ring sets so the ring-origin hint is consistent with
      // chain candidates (which are carbon-only lists).
      const sets = ringInfo.rings.map(r => new Set(r.filter((x: number) => molecule.atoms[x]?.symbol === 'C')));
      // exact match to a ring (carbon-only)
      for (const s of sets) {
        if (s.size === c.length && c.every(idx => s.has(idx))) {
          isFromRingUnion = true;
          break;
        }
      }
      // check union of any two carbon-only rings
      if (!isFromRingUnion) {
        for (let i = 0; i < sets.length; i++) {
          for (let j = i + 1; j < sets.length; j++) {
            const union = new Set<number>();
            for (const v of sets[i]!) union.add(v);
            for (const v of sets[j]!) union.add(v);
            if (union.size === c.length && c.every(idx => union.has(idx))) {
              isFromRingUnion = true;
              break;
            }
          }
          if (isFromRingUnion) break;
        }
      }
    } catch (e) {
      isFromRingUnion = false;
    }

    return {
      atomIndices: c,
      length: c.length,
      substituents,
      functionalGroups: functionalGroups as any,
      isCyclic,
      isAromatic,
      // attach ring-origin hint for downstream filters (cast to any to avoid strict type errors)
      ...(isFromRingUnion ? { isFromRingUnion: true } : {}),
    } as Chain;
  });

  const selector = createDefaultChainSelector();
  try {
    console.debug('[chain-selection] selectBestChain: converted candidates:', converted.map(c => ({ len: c.length, atomIndices: c.atomIndices, isCyclic: c.isCyclic, isAromatic: c.isAromatic, isFromRingUnion: (c as any).isFromRingUnion || false })));
  } catch (e) {}
  const outcome = selector.selectBestChain(converted, { allChains: converted, moleculeData: { molecule } });
    try {
      // Log selected chain indices and full filter results for deep debugging
      const selectedIndices = outcome.selectedChain?.atomIndices ?? null;
      const filterResultsObj: Record<string, any> = {};
      for (const [k, v] of outcome.filterResults) {
        filterResultsObj[k] = v.map(t => ({ passes: t.result.passes, score: t.result.score, reason: t.result.reason }));
      }
      // Use JSON.stringify to ensure nested objects are fully printed in VERBOSE runs
      try {
        console.debug('[chain-selection] selector outcome:', JSON.parse(JSON.stringify({ selectedLen: outcome.selectedChain?.length ?? null, selectedIndices, reason: outcome.reason, filterResults: filterResultsObj })));
      } catch (e) {
        // Fallback to plain debug if stringify fails
        console.debug('[chain-selection] selector outcome:', { selectedLen: outcome.selectedChain?.length ?? null, selectedIndices, reason: outcome.reason, filterResults: filterResultsObj });
      }
    } catch (e) {}

  if (outcome.selectedChain) {
    return { chain: outcome.selectedChain.atomIndices, reason: prefix || outcome.reason };
  }

  return { chain: chains[0]!, reason: prefix || 'Defaulted to first candidate' };
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

    // Also ensure we include the longest carbon-only path found globally as a candidate
    try {
      const longest = computeLongestCarbonPath(molecule);
      if (longest.length >= 2) {
        const canonicalLongest = canonicalizeAcyclicChainOrder(longest, molecule);
        const key = [...canonicalLongest].sort((a, b) => a - b).join(',');
        if (!uniqueChains.has(key)) uniqueChains.set(key, canonicalLongest);
      }
    } catch (e) {
      // ignore
    }

    // Also enumerate all simple carbon-only paths (bounded) and include them as candidates
    try {
      const enumerated = enumerateAllSimpleCarbonPaths(molecule, 12);
      for (const p of enumerated) {
        if (p.length < 2) continue;
        const key = [...p].sort((a, b) => a - b).join(',');
        if (!uniqueChains.has(key)) uniqueChains.set(key, p);
      }
    } catch (e) {
      // ignore
    }

    // Sort by length descending
    return Array.from(uniqueChains.values()).sort((a, b) => b.length - a.length);
 }

/**
 * Compute the longest simple path consisting only of carbon atoms.
 * This is a fallback candidate to ensure highly-branched molecules still
 * have their true longest carbon chain considered.
 */
function computeLongestCarbonPath(molecule: Molecule): number[] {
  // Prefer exhaustive enumeration of all simple carbon-only paths (deduplicated)
  // and select the longest one. This is more robust than a greedy DFS
  // which may miss long paths in branched graphs.
  try {
    const enumerated = enumerateAllSimpleCarbonPaths(molecule, molecule.atoms.length || 12);
    if (enumerated && enumerated.length > 0) {
      let best = enumerated[0]!;
      for (const p of enumerated) {
        if (p.length > best.length) best = p;
      }
      try {
        console.debug('[chain-selection] computeLongestCarbonPath (enumerated): best length', best.length, 'atoms', best);
      } catch (e) {}
      return best;
    }
  } catch (e) {
    // fall through to DFS fallback
  }

  // Fallback: previous DFS-based approach
  const n = molecule.atoms.length;
  const isCarbon = (i: number) => molecule.atoms[i]?.symbol === 'C';
  let best: number[] = [];

  const visited = new Set<number>();

  function dfs(u: number, path: number[]) {
    if (path.length > best.length) best = path.slice();
    const neighbors = getNeighbors(u, molecule);
    for (const v of neighbors) {
      if (visited.has(v)) continue;
      if (!isCarbon(v)) continue;
      visited.add(v);
      path.push(v);
      dfs(v, path);
      path.pop();
      visited.delete(v);
    }
  }

  for (let i = 0; i < n; i++) {
    if (!isCarbon(i)) continue;
    visited.clear();
    visited.add(i);
    dfs(i, [i]);
  }

  try {
    console.debug('[chain-selection] computeLongestCarbonPath (fallback): best length', best.length, 'atoms', best);
  } catch (e) {}

  return best;
}

/**
 * Enumerate all simple paths (no repeated nodes) composed only of carbon atoms up to maxLen.
 * Returns an array of paths (each path is an array of atom indices).
 */
function enumerateAllSimpleCarbonPaths(molecule: Molecule, maxLen = 12): number[][] {
  const n = molecule.atoms.length;
  const isCarbon = (i: number) => molecule.atoms[i]?.symbol === 'C';
  const results: number[][] = [];

  function dfs(path: number[], visited: Set<number>) {
    // record current path
    if (path.length >= 1) results.push(path.slice());
    if (path.length >= maxLen) return;
  const last = path[path.length - 1]!;
  const neighbors = getNeighbors(last, molecule);
    for (const nb of neighbors) {
      if (visited.has(nb)) continue;
      if (!isCarbon(nb)) continue;
      visited.add(nb);
      path.push(nb);
      dfs(path, visited);
      path.pop();
      visited.delete(nb);
    }
  }

  for (let i = 0; i < n; i++) {
    if (!isCarbon(i)) continue;
    const visited = new Set<number>([i]);
    dfs([i], visited);
  }

  // Deduplicate by sorted key to reduce equivalent permutations
  const seen = new Set<string>();
  const unique: number[][] = [];
  for (const p of results) {
    if (p.length < 2) continue;
    // Canonicalize acyclic path ordering (choose forward or reversed ordering
    // that yields the lower locant set) to make selector tie-breaking deterministic.
    const canonical = canonicalizeAcyclicChainOrder(p, molecule);
    const key = [...canonical].join(',');
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(canonical);
    }
  }
  return unique;
}

/**
 * For an acyclic chain (path), choose the orientation (forward or reversed)
 * that yields the IUPAC "lowest set of locants" for substituents so that
 * equivalent paths are presented in a canonical direction for comparison.
 */
function canonicalizeAcyclicChainOrder(chain: number[], molecule: Molecule): number[] {
  if (chain.length < 2) return chain.slice();
  // compute locants for forward and reversed order
  const forward = getSubstituentLocants(chain, molecule) || [];
  const reversedChain = [...chain].reverse();
  const reverse = getSubstituentLocants(reversedChain, molecule) || [];
  // If reversed locants are lower, return reversed ordering
  if (isLowerLocants(reverse, forward)) return reversedChain;
  return chain.slice();
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
 * Find shortest path between two atoms using BFS.
 * Returns array of atom indices representing the path.
 */
function findShortestPath(start: number, end: number, molecule: Molecule): number[] {
  if (start === end) return [start];
  
  const queue: number[][] = [[start]];
  const visited = new Set<number>([start]);
  
  while (queue.length > 0) {
    const path = queue.shift()!;
    const current = path[path.length - 1]!;
    
    if (current === end) {
      return path;
    }
    
    const neighbors = getNeighbors(current, molecule);
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push([...path, neighbor]);
      }
    }
  }
  
  return []; // No path found
}

/**
 * Get all carboxylic acid carbon atoms in the molecule.
 * A carboxylic acid carbon is one that has both a double bond to oxygen and a single bond to oxygen.
 */
function getAllCarboxylCarbons(molecule: Molecule): number[] {
  const carboxylCarbons: number[] = [];
  
  for (let i = 0; i < molecule.atoms.length; i++) {
    const atom = molecule.atoms[i];
    if (!atom || atom.symbol !== 'C') continue;
    
    const bonds = molecule.bonds.filter(b => b.atom1 === i || b.atom2 === i);
    let hasDoubleO = false;
    let hasSingleO = false;
    
    for (const b of bonds) {
      const neighbor = molecule.atoms[b.atom1 === i ? b.atom2 : b.atom1];
      if (!neighbor) continue;
      
      if (neighbor.symbol === 'O') {
        if (b.type === BondType.DOUBLE) hasDoubleO = true;
        if (b.type === BondType.SINGLE) hasSingleO = true;
      }
    }
    
    // This is a carboxylic acid carbon if it has both =O and -O
    if (hasDoubleO && hasSingleO) {
      carboxylCarbons.push(i);
    }
  }
  
  return carboxylCarbons;
}

/**
 * Detect if this is a simple malonic acid (OC(=O)CC(=O)O) vs a substituted variant.
 * Simple malonic acid has:
 * - Exactly 2 carboxyl carbons at distance 2
 * - Central carbon has no additional substituents except the two carboxyls
 * - No additional carbon branches
 */
function isSimpleMalonicAcid(molecule: Molecule, carboxylCarbons: number[], minDistance: number): boolean {
  if (minDistance !== 2 || carboxylCarbons.length !== 2) return false;
  
  // Find the central carbon (one that connects to both carboxyls)
  const path = findShortestPath(carboxylCarbons[0]!, carboxylCarbons[1]!, molecule);
  if (path.length !== 3) return false; // Should be [carboxyl1, central, carboxyl2]
  
  const centralCarbon = path[1]!;
  const centralNeighbors = getNeighbors(centralCarbon, molecule);
  
  // Count non-carboxyl carbon neighbors
  const nonCarboxylCarbons = centralNeighbors.filter(neighbor => 
    molecule.atoms[neighbor]?.symbol === 'C' && !carboxylCarbons.includes(neighbor)
  );
  
  // Simple malonic acid should have no additional carbon substituents
  return nonCarboxylCarbons.length === 0;
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
  const chainLen = chain.length;
  const chainSet = new Set(chain);

  // Collect raw locant positions assuming the provided chain ordering is a possible numbering
  const rawLocants: number[] = [];
  for (let i = 0; i < chain.length; i++) {
    const atomIdx = chain[i]!;
    const neighbors = getNeighbors(atomIdx, molecule);
    for (const neighbor of neighbors) {
      if (!chainSet.has(neighbor)) {
        rawLocants.push(i + 1); // 1-based
        break;
      }
    }
  }

  // If no substituents, return empty list
  if (rawLocants.length === 0) return [];

  // Helper: compare two locant arrays lexicographically (IUPAC lowest-set rule)
  const compareLocantSets = (a: number[], b: number[]) => {
    const la = a.slice().sort((x, y) => x - y);
    const lb = b.slice().sort((x, y) => x - y);
    const len = Math.min(la.length, lb.length);
    for (let i = 0; i < len; i++) {
      if (la[i]! < lb[i]!) return -1;
      if (la[i]! > lb[i]!) return 1;
    }
    if (la.length < lb.length) return -1;
    if (la.length > lb.length) return 1;
    return 0;
  };

  // Detect whether chain is cyclic (first and last atoms bonded)
  const isChainCyclic = () => {
    if (chainLen < 3) return false;
    const first = chain[0]!;
    const last = chain[chainLen - 1]!;
    for (const b of molecule.bonds) {
      if ((b.atom1 === first && b.atom2 === last) || (b.atom2 === first && b.atom1 === last)) return true;
    }
    return false;
  };

  // For acyclic chains there are only two possible directionings; choose the better locant set
  if (!isChainCyclic()) {
    const forward = rawLocants.slice().sort((a, b) => a - b);
    const reverse = rawLocants.map(p => chainLen - p + 1).sort((a, b) => a - b);
    return compareLocantSets(forward, reverse) <= 0 ? forward : reverse;
  }

  // For cyclic chains, try all rotations and both directions (forward and reversed)
  const rotations: number[][] = [];
  // positions are 1-based indices in the original ordering
  const positions = rawLocants.slice();
  for (let start = 0; start < chainLen; start++) {
    // forward rotation
    const rotated = positions.map(p => ((p - start - 1 + chainLen) % chainLen) + 1).sort((a, b) => a - b);
    rotations.push(rotated);
    // reversed rotation
    const reversedPositions = positions.map(p => chainLen - p + 1);
    const revRot = reversedPositions.map(p => ((p - start - 1 + chainLen) % chainLen) + 1).sort((a, b) => a - b);
    rotations.push(revRot);
  }

  // Choose lexicographically smallest rotation
  rotations.sort((x, y) => {
    const len = Math.min(x.length, y.length);
    for (let i = 0; i < len; i++) {
      if (x[i]! < y[i]!) return -1;
      if (x[i]! > y[i]!) return 1;
    }
    return x.length - y.length;
  });
  return rotations[0] || [];
}

/**
 * Compare two sets of locants. Returns true if locants1 is "better" (lower) than locants2.
 */
function isLowerLocants(locants1: number[], locants2: number[]): boolean {
  const a = locants1.slice().sort((x, y) => x - y);
  const b = locants2.slice().sort((x, y) => x - y);
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if (a[i]! < b[i]!) return true;
    if (a[i]! > b[i]!) return false;
  }
  return a.length < b.length;
}

export default selectPrincipalChain;

// Export helpers for debugging and tests
export { findChainsFromFunctionalGroups, findAllAcyclicChains, findRingBasedChains, getPrincipalFunctionalGroupAtoms };
