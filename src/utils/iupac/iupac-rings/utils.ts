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
      if (!perimeterAdj[ksa]) perimeterAdj[ksa] = [];
      if (!perimeterAdj[ksb]) perimeterAdj[ksb] = [];
      if (!perimeterAdj[ksa]!.includes(sb)) perimeterAdj[ksa]!.push(sb);
      if (!perimeterAdj[ksb]!.includes(sa)) perimeterAdj[ksb]!.push(sa);
    }
  }
  const perimeterAtoms = Object.keys(perimeterAdj).map(k => Number(k));
  if (perimeterAtoms.length === 0) return Array.from(new Set(rings.flat()));
  // Find a start (degree 2 nodes expected on a closed perimeter)
  const start = perimeterAtoms.find(a => (perimeterAdj[String(a)] ?? []).length === 2) ?? perimeterAtoms[0];
  const ordered: number[] = [];
  const visited = new Set<number>();
  let current = start;
  let prev: number | null = null;
  while (current !== undefined && !visited.has(current)) {
    ordered.push(current);
    visited.add(current);
    const neighbors = (perimeterAdj[String(current)] ?? []).filter((n: number) => n !== prev);
    prev = current;
    current = neighbors.length ? neighbors[0] : undefined;
    if (ordered.length > 1000) break; // safety
  }
  // ensure we have all perimeter atoms; otherwise, fallback
  if (ordered.length !== perimeterAtoms.length) return Array.from(new Set(rings.flat()));
  return ordered;
}

export function getMultiplicityPrefix(n: number): string {
  const map: Record<number, string> = { 2: 'di', 3: 'tri', 4: 'tetra', 5: 'penta' };
  return map[n] ?? `${n}`;
}

export function compareNumericArrays(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i]! < b[i]!) return -1;
    if (a[i]! > b[i]!) return 1;
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

export function findHeteroatomsInRing(ring: number[], molecule: Molecule): { symbol: string; count: number }[] {
  const atoms = ring.map(idx => molecule.atoms[idx]).filter(a => a);
  const counts: Record<string, number> = {};
  atoms.forEach(atom => {
    if (atom && atom.symbol !== 'C') counts[atom.symbol] = (counts[atom.symbol] || 0) + 1;
  });
  return Object.entries(counts).map(([symbol, count]) => ({ symbol, count }));
}