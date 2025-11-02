/**
 * Find lexicographically smallest array among a list of number arrays.
 * Shorter array wins if equal up to min length.
 */
export function lexicographicallySmallest(sets: (number | undefined)[][]): number[] | null {
  if (!sets || sets.length === 0) return null;
  // Normalize undefined entries to 0 and ensure arrays of numbers
  const normalized: number[][] = sets.map(s => (s || []).map(v => (v ?? 0)));
  let lowest = normalized[0] as number[];
  for (let i = 1; i < normalized.length; i++) {
    const current = normalized[i]!;
    const n = Math.min(lowest.length, current.length);
    let decided = false;
    for (let j = 0; j < n; j++) {
      const cv = current[j] ?? 0;
      const lv = lowest[j] ?? 0;
      if (cv < lv) { lowest = current; decided = true; break; }
      if (cv > lv) { decided = true; break; }
    }
    if (!decided && current.length < lowest.length) {
      lowest = current;
    }
  }
  return lowest || null;
}

/**
 * Convert a RingSystem to a minimal Chain object for parent selection.
 */
export function ringSystemToChain(ring: import('../../types').RingSystem): import('../../types').Chain {
  return {
    atoms: ring.atoms,
    bonds: ring.bonds,
    length: ring.atoms.length,
    multipleBonds: [], // Could be populated if needed
    substituents: [], // Could be populated if needed
    locants: [], // Could be populated if needed
  };
}
