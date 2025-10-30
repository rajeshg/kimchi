import type { Molecule } from 'types';
import { BondType } from 'types';
import { getAlkaneName, getGreekNumeral, getAlkaneBaseName, getAlkylName } from './iupac-helpers';
import type { Substituent, SubstituentInfo } from './iupac-types';

export function findMainChain(molecule: Molecule): number[] {
  // Consider both carbon-only parent candidates and hetero-containing parent candidates.
  // Find all longest carbon-only chains and all longest heavy-atom chains (non-hydrogen).
  const carbonChains = findAllCarbonChains(molecule);
  const atomChains = findAllAtomChains(molecule);

  // Primary preference is by number of carbons in the parent chain. Compute the
  // longest carbon-only chain length; consider hetero-containing chains only if
  // they have the same number of carbons.
  const maxCarbonLen = carbonChains.length ? Math.max(...carbonChains.map(c => c.length)) : 0;

  // If we have at least one carbon-only chain, use its carbon-length as primary
  // basis for candidate selection. Otherwise, fall back to heavy-atom chains.
  const candidates: number[][] = [];
  if (maxCarbonLen >= 2) {
    // take all carbon-only chains of the max carbon length
    for (const c of carbonChains) if (c.length === maxCarbonLen) candidates.push(c);
    // also include hetero-containing chains that have the same number of carbons
    for (const c of atomChains) {
      const carbonCount = c.filter(idx => molecule.atoms[idx] && molecule.atoms[idx].symbol === 'C').length;
      if (carbonCount === maxCarbonLen) candidates.push(c);
    }
  } else {
    // no carbon chains found; pick longest heavy-atom chains
    const maxAtomLen = atomChains.length ? Math.max(...atomChains.map(c => c.length)) : 0;
    if (maxAtomLen < 2) return [];
    for (const c of atomChains) if (c.length === maxAtomLen) candidates.push(c);
  }

  if (candidates.length === 1) return candidates[0]!;

  // Evaluate candidates using IUPAC tie-break rules:
  // 1) Prefer chain that contains a principal functional group (carboxylic acid, sulfonic
  //    acid, amide, aldehyde/ketone, alcohol) if present in only some candidates.
  // 2) If none/ambiguous, prefer hydrocarbon chain (all-C) when lengths equal and no
  //    principal functional group favors a hetero chain.
  // 3) If still tied, fall back to priority locants and OPSIN-like heuristics already
  //    implemented below.

  // Compute functional-group priority for each candidate
  const fgPriorities = candidates.map(c => getChainFunctionalGroupPriority(c, molecule));
  const maxFG = Math.max(...fgPriorities);
  if (maxFG > 0) {
    // Prefer any candidate with the highest functional group priority
    const filtered = candidates.filter((_, i) => fgPriorities[i] === maxFG);
    if (filtered.length === 1) return filtered[0]!;
    // otherwise restrict candidates to filtered set and continue
    candidates.length = 0;
    candidates.push(...filtered);
  } else {
    // No principal functional groups found in any candidate: prefer hydrocarbon chain(s)
    const hydroCandidates = candidates.filter(c => isHydrocarbonChain(c, molecule));
    if (hydroCandidates.length === 1) return hydroCandidates[0]!;
    if (hydroCandidates.length > 1) {
      // restrict to hydrocarbon candidates only
      candidates.length = 0;
      candidates.push(...hydroCandidates);
    }
    // else continue with mixed candidates if no hydrocarbon-only candidate isolated
  }

  // Now apply existing priority-locant logic and heuristics among remaining candidates
  let bestChain = candidates[0]!;
  let bestPositions: number[] = [];
  let bestCount = 0;
  let bestPriorityLocants: [number[], number[], number[]] | null = null;

  for (const chain of candidates) {
    const substituents = findSubstituents(molecule, chain);
    const positions = substituents.map(s => parseInt(s.position)).sort((a, b) => a - b);
    const count = substituents.length;

    let priority = getPriorityLocants(molecule, chain);
    const renum = renumberPriorityLocants(priority, chain.length);
    const chosenPriority = isBetterPriorityLocants(renum, priority) ? renum : priority;

    if (bestPriorityLocants === null) {
      bestChain = chain;
      bestPositions = positions;
      bestCount = count;
      bestPriorityLocants = chosenPriority;
      continue;
    }

    if (isBetterPriorityLocants(chosenPriority, bestPriorityLocants)) {
      bestChain = chain;
      bestPositions = positions;
      bestCount = count;
      bestPriorityLocants = chosenPriority;
    } else if (JSON.stringify(chosenPriority) === JSON.stringify(bestPriorityLocants)) {
      if (isBetterByOpsinHeuristics(molecule, chain, bestChain)) {
        bestChain = chain;
        bestPositions = positions;
        bestCount = count;
      } else {
        const isBetter = compareChains(positions, count, chain, bestPositions, bestCount, bestChain);
        if (isBetter) {
          bestChain = chain;
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
function findAllAtomChains(molecule: Molecule): number[][] {
  const atomIndices = molecule.atoms
    .map((atom, idx) => ({ atom, idx }))
    .filter(({ atom }) => atom.symbol !== 'H')
    .map(({ idx }) => idx);

  if (atomIndices.length === 0) return [];

  const adjList = new Map<number, number[]>();
  for (const idx of atomIndices) adjList.set(idx, []);

  for (const bond of molecule.bonds) {
    if (
      molecule.atoms[bond.atom1]?.symbol !== 'H' &&
      molecule.atoms[bond.atom2]?.symbol !== 'H'
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
  if (targetLength < 2) return [];

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
  // 6 = carboxylic acid / sulfonic acid / phosphonic acid
  // 5 = amide / ester / acid chloride / sulfonamide
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
      // carboxylic acid
      if (hasDoubleO && hasSingleOwithH) best = Math.max(best, 6);
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
      // ester (R-C(=O)-O-R)
      else if (hasDoubleO && hasSingleO && singleOConnectedToC) best = Math.max(best, 5);
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
  // Compare substituent positions (lowest first)
  const minLength = Math.min(newPositions.length, bestPositions.length);
  for (let i = 0; i < minLength; i++) {
    if (newPositions[i]! !== bestPositions[i]!) {
      return newPositions[i]! < bestPositions[i]!;
    }
  }

  // If positions are equal, prefer more substituents
  if (newPositions.length !== bestPositions.length) {
    return newPositions.length > bestPositions.length;
  }

  // If everything is equal, prefer the chain with lowest atom indices
  for (let i = 0; i < newChain.length; i++) {
    if (newChain[i] !== bestChain[i]) {
      return newChain[i]! < bestChain[i]!;
    }
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

function findAllCarbonChains(molecule: Molecule): number[][] {
  const carbonIndices = molecule.atoms
    .map((atom, idx) => ({ atom, idx }))
    .filter(({ atom }) => atom.symbol === 'C')
    .map(({ idx }) => idx);

  if (carbonIndices.length === 0) return [];

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

  // Instead of enumerating every simple path (which explodes combinatorially),
  // first determine the maximum chain length and only search for chains of that length.
  const longest = findLongestCarbonChain({ atoms: molecule.atoms, bonds: molecule.bonds });
  const targetLength = longest.length;
  if (targetLength < 2) return [];

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
  if (aSubs.length !== bSubs.length) return aSubs.length < bSubs.length;

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
        const substituent = classifySubstituent(molecule, substituentAtomIdx, chainSet);
        if (substituent) {
          substituents.push({
            position: (i + 1).toString(),
            type: substituent.type,
            size: substituent.size,
            name: substituent.name,
          });
        }
      }
    }
  }
  return substituents;
}

export function classifySubstituent(molecule: Molecule, startAtomIdx: number, chainAtoms: Set<number>): SubstituentInfo | null {
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
    // if central carbon has two carbon neighbors it's isopropyl
    if (maxCNeigh >= 2) return { type: 'alkyl', size: 3, name: 'isopropyl' };
    return { type: 'alkyl', size: 3, name: 'propyl' };
  } else if (atoms.some(atom => atom.symbol === 'O' && atom.hydrogens === 1)) {
    return { type: 'functional', size: 1, name: 'hydroxy' };
  } else if (atoms.some(atom => atom.symbol === 'Cl')) {
    return { type: 'halo', size: 1, name: 'chloro' };
  } else if (atoms.some(atom => atom.symbol === 'Br')) {
    return { type: 'halo', size: 1, name: 'bromo' };
  } else if (atoms.some(atom => atom.symbol === 'I')) {
    return { type: 'halo', size: 1, name: 'iodo' };
  }
  if (carbonCount > 0) {
    // detect simple tert-/iso-butyl patterns for 4-carbon substituents
    if (carbonCount === 4) {
      // tert-butyl: one carbon connected to three carbons inside substituent
      if (maxCNeigh >= 3) return { type: 'alkyl', size: 4, name: 'tert-butyl' };
      // isobutyl: contains a branch but not quaternary center
      if (maxCNeigh === 2) return { type: 'alkyl', size: 4, name: 'isobutyl' };
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