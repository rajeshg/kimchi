import type { Molecule } from 'types';

export function getAlkaneBySize(n: number): string {
  const map: Record<number, string> = {
    1: 'methane', 2: 'ethane', 3: 'propane', 4: 'butane', 5: 'pentane', 6: 'hexane',
    7: 'heptane', 8: 'octane', 9: 'nonane', 10: 'decane', 11: 'undecane', 12: 'dodecane',
    13: 'tridecane', 14: 'tetradecane', 15: 'pentadecane', 16: 'hexadecane', 17: 'heptadecane',
    18: 'octadecane', 19: 'nonadecane', 20: 'eicosane'
  };
  return map[n] ?? `C${n}`;
}

export function combineCycloWithSuffix(base: string, suffix: string): string {
  if (base.endsWith('ane') && /^[aeiou]/.test(suffix)) return base.slice(0, -1) + suffix;
  return base + suffix;
}

export function buildPerimeterFromRings(fusedSystem: any): number[] {
  // Build edges present in rings, count ring-membership per edge and keep edges
  // that belong to only one ring -> outer perimeter edges. Then traverse that
  // cycle to return an ordered list of perimeter atoms.
  const edgeCount: Record<string, number> = {};
  const rings: number[][] = fusedSystem.rings || [];
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]!, b = ring[(i + 1) % ring.length]!;
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      edgeCount[key] = (edgeCount[key] || 0) + 1;
    }
  }
  const perimeterAdj: Record<string, number[]> = {};
  for (const key of Object.keys(edgeCount)) {
    if (edgeCount[key] === 1) {
      const parts = key.split('-');
      const sa = Number(parts[0]);
      const sb = Number(parts[1]);
      const ksa = String(sa), ksb = String(sb);
      if (!Array.isArray(perimeterAdj[ksa])) perimeterAdj[ksa] = [];
      if (!Array.isArray(perimeterAdj[ksb])) perimeterAdj[ksb] = [];
      if (Array.isArray(perimeterAdj[ksa]) && !perimeterAdj[ksa].includes(sb)) perimeterAdj[ksa].push(sb);
      if (Array.isArray(perimeterAdj[ksb]) && !perimeterAdj[ksb].includes(sa)) perimeterAdj[ksb].push(sa);
    }
  }
  const perimeterAtoms = Object.keys(perimeterAdj).map(k => Number(k));
  if (perimeterAtoms.length === 0) return Array.from(new Set(rings.flat()));
  // Find a start (degree 2 nodes expected on a closed perimeter)
   const start = perimeterAtoms.find(a => {
     const adj = perimeterAdj[String(a)];
     return Array.isArray(adj) && adj.length === 2;
   }) ?? perimeterAtoms[0];
   const ordered: number[] = [];
   const visited = new Set<number>();
   let current = start;
   let prev: number | null = null;
   while (typeof current === 'number' && !visited.has(current)) {
     ordered.push(current);
     visited.add(current);
     const adj = perimeterAdj[String(current)];
     const neighbors = Array.isArray(adj) ? adj.filter((n: number) => n !== prev) : [];
     prev = current;
     current = neighbors.length ? neighbors[0] : undefined;
     if (ordered.length > 1000) break; // safety
   }
  // ensure we have all perimeter atoms; otherwise, fallback
  if (!Array.isArray(ordered) || ordered.length !== perimeterAtoms.length) return Array.from(new Set(rings.flat()));
  return ordered;
}

export function getMultiplicityPrefix(n: number): string {
  const map: Record<number, string> = { 2: 'di', 3: 'tri', 4: 'tetra', 5: 'penta' };
  return map[n] ?? `${n}`;
}

export function compareNumericArrays(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
   for (let i = 0; i < n; i++) {
     const ai = a[i];
     const bi = b[i];
     if (typeof ai !== 'number' || typeof bi !== 'number') continue;
     if (ai < bi) return -1;
     if (ai > bi) return 1;
   }
  if (a.length < b.length) return -1;
  if (a.length > b.length) return 1;
  return 0;
}


export function classifyFusedSubstituent(molecule: Molecule, startAtomIdx: number, fusedAtoms: Set<number>): { type: string; size: number; name: string } | null {
  const visited = new Set<number>(fusedAtoms);
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

  // Simple substituents
  if (carbonCount === 1 && atoms.length === 1) {
    return { type: 'alkyl', size: 1, name: 'methyl' };
  } else if (carbonCount === 2 && atoms.length === 2) {
    return { type: 'alkyl', size: 2, name: 'ethyl' };
  } else if (carbonCount === 3 && atoms.length === 3) {
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

  // Larger alkyl groups
  if (carbonCount > 0) {
    const alkaneNames = ['', 'meth', 'eth', 'prop', 'but', 'pent', 'hex', 'hept', 'oct', 'non', 'dec'];
    const prefix = alkaneNames[carbonCount] || `C${carbonCount}`;
    return { type: 'alkyl', size: carbonCount, name: `${prefix}yl` };
  }

  return null;
}

/**
 * Generates classic IUPAC polycyclic names (bicyclo, tricyclo) for non-aromatic systems.
 * Returns null if not a classic polycyclic system.
 */
export function generateClassicPolycyclicName(molecule: Molecule, rings: number[][]): string | null {
  // Only consider 2 or 3 rings, all atoms carbon, all non-aromatic
  if (rings.length !== 2 && rings.length !== 3) {
    if (process.env.VERBOSE) console.log('[VERBOSE] classic polycyclic: not 2 or 3 rings');
    return null;
  }
  const atomIds = Array.isArray(rings) ? Array.from(new Set(rings.flat().filter((idx): idx is number => typeof idx === 'number'))) : [];
  const atoms = atomIds.map(idx => molecule.atoms[idx]).filter((a): a is typeof molecule.atoms[0] => a !== undefined);
  if (!atoms.every(a => a.symbol === 'C' && !a.aromatic)) {
    if (process.env.VERBOSE) console.log('[VERBOSE] classic polycyclic: not all non-aromatic carbons');
    return null;
  }

  // Find bridgehead atoms: atoms shared by more than one ring
  const ringMembership: Record<number, number> = {};
    for (const ring of rings) {
      if (!Array.isArray(ring)) continue;
      for (const idx of ring) {
        if (typeof idx !== 'number') continue;
        ringMembership[idx] = (ringMembership[idx] || 0) + 1;
      }
    }
  const bridgeheads = Object.entries(ringMembership).filter(([_, count]) => typeof count === 'number' && count > 1).map(([idx]) => Number(idx));
  if (process.env.VERBOSE) {
    console.log('[VERBOSE] classic polycyclic: ringMembership=', ringMembership);
    console.log('[VERBOSE] classic polycyclic: bridgeheads=', bridgeheads);
  }
  if (bridgeheads.length < 2) {
    if (process.env.VERBOSE) console.log('[VERBOSE] classic polycyclic: not enough bridgeheads');
    return null;
  }

  // For bicyclo: two bridgeheads, three bridges
  if (rings.length === 2 && bridgeheads.length === 2) {
    const bh1 = bridgeheads[0]!;
    const bh2 = bridgeheads[1]!;
    const paths: number[][] = [];
    const visited = new Set<number>();
    
    function dfs(current: number, target: number, path: number[]): void {
      if (current === target) {
        paths.push([...path]);
        return;
      }
      visited.add(current);
      for (const bond of molecule.bonds) {
        let next: number | undefined = undefined;
        if (bond.atom1 === current) next = bond.atom2;
        else if (bond.atom2 === current) next = bond.atom1;
        if (typeof next === 'number' && next >= 0 && !visited.has(next)) {
          dfs(next, target, [...path, next]);
        }
      }
      visited.delete(current);
    }
    
    dfs(bh1, bh2, [bh1]);
    
    // Filter unique paths
    const uniquePaths = paths.filter((p, i, arr) => arr.findIndex(q => q.join(',') === p.join(',')) === i);
    
    const bridgeLengths = uniquePaths.map(p => p.length - 2).filter(n => n >= 0);
    if (bridgeLengths.length >= 3) {
      bridgeLengths.sort((a, b) => b - a); // IUPAC: descending order
      const alkaneName = getAlkaneBySize(atomIds.length);
      if (process.env.VERBOSE) console.log('[VERBOSE] classic polycyclic: bicyclo', bridgeLengths, alkaneName);
      return `bicyclo[${bridgeLengths.slice(0, 3).join('.').replace(/0/g, '')}]${alkaneName}`;
    }
    if (process.env.VERBOSE) console.log('[VERBOSE] classic polycyclic: did not find 3 bridges', bridgeLengths);
    return null;
  }

  // For tricyclo: three or more rings, three or more bridgeheads
  if (rings.length >= 3 && bridgeheads.length >= 3) {
    // Find all bridge lengths between all pairs of bridgeheads
    const bridgeLengths: number[] = [];
    for (let i = 0; i < bridgeheads.length; i++) {
      for (let j = i + 1; j < bridgeheads.length; j++) {
        const start = bridgeheads[i]!;
        const end = bridgeheads[j]!;
        const paths: number[][] = [];
        const visited = new Set<number>();
        
        function dfs(current: number, path: number[]): void {
          if (current === end) {
            paths.push([...path]);
            return;
          }
          visited.add(current);
          for (const bond of molecule.bonds) {
            let next: number | undefined = undefined;
            if (bond.atom1 === current) next = bond.atom2;
            else if (bond.atom2 === current) next = bond.atom1;
            if (typeof next === 'number' && next >= 0 && !visited.has(next)) {
              dfs(next, [...path, next]);
            }
          }
          visited.delete(current);
        }
        
        dfs(start, [start]);
        
        // Find all shortest paths between bridgeheads
        const validPaths = paths.filter(path => path.length >= 2); // At least start and end
        
        if (validPaths.length > 0) {
          const minLength = Math.min(...validPaths.map(p => p.length - 2));
          if (process.env.VERBOSE) console.log(`[VERBOSE] bridge between ${start}-${end}: paths=${validPaths.length}, minLength=${minLength}`);
          if (minLength >= 0) {
            bridgeLengths.push(minLength);
          }
        }
      }
    }
    
    // Remove duplicates and sort
    const uniqueLengths = Array.from(new Set(bridgeLengths)).sort((a, b) => b - a);
    
    if (uniqueLengths.length >= 3) {
      const alkaneName = getAlkaneBySize(atomIds.length);
      const prefix = rings.length === 3 ? 'tricyclo' : 'polycyclo';
      if (process.env.VERBOSE) console.log('[VERBOSE] classic polycyclic: tricyclo+', uniqueLengths, alkaneName);
      return `${prefix}[${uniqueLengths.slice(0, Math.min(uniqueLengths.length, 4)).join('.').replace(/0/g, '')}]${alkaneName}`;
    }
    if (process.env.VERBOSE) console.log('[VERBOSE] classic polycyclic: did not find enough bridges', uniqueLengths);
    return null;
  }

  if (process.env.VERBOSE) console.log('[VERBOSE] classic polycyclic: no valid system');
  return null;
}


export function findHeteroatomsInRing(ring: number[], molecule: Molecule): { symbol: string; count: number }[] {
  const atoms = ring.map(idx => molecule.atoms[idx]).filter(a => a);
  const counts: Record<string, number> = {};
  atoms.forEach(atom => {
    if (atom && atom.symbol !== 'C') counts[atom.symbol] = (counts[atom.symbol] || 0) + 1;
  });
  return Object.entries(counts).map(([symbol, count]) => ({ symbol, count }));
}