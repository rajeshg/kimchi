import type { Atom, Molecule } from "types";

/**
 * Normalize detector-provided priorities to the engine's static scale.
 * OPSIN/other detectors often return small numbers (e.g., 1..12). The engine
 * uses larger static values (roughly 80..100). To compare fairly, rescale
 * small detector priorities into the static range. If a priority already
 * appears to be on the engine scale (>20) leave it unchanged.
 *
 * IMPORTANT: OPSIN uses inverted scale (1=highest, 12=lowest) while engine
 * uses normal scale (100=highest, 0=lowest). We must invert during normalization.
 */
export function normalizePriority(p: number): number {
  if (typeof p !== "number" || Number.isNaN(p)) return 0;
  if (p > 20) return p; // assume already in engine scale
  const detectorMax = 19; // maximum priority in OPSIN detector (borane = 19)
  // Invert OPSIN scale: (detectorMax + 1 - p) makes 1→19, 19→1
  // Then scale to engine range: /detectorMax * 100
  return Math.round(((detectorMax + 1 - p) / detectorMax) * 100);
}

/**
 * Helper to check if two atoms form a C=O carbonyl bond
 */
export function isCarbonyl(atom1: Atom, atom2: Atom): boolean {
  return (
    (atom1.symbol === "C" && atom2.symbol === "O") ||
    (atom2.symbol === "C" && atom1.symbol === "O")
  );
}

/**
 * Helper to extract carbon atom from a C=O carbonyl pair
 */
export function getCarbonFromCarbonyl(atom1: Atom, atom2: Atom): Atom {
  return atom1.symbol === "C" ? atom1 : atom2;
}

/**
 * Find the acyl chain for an ester carbonyl carbon.
 * Traverses from carbonyl carbon through C-C bonds to build the acyl chain.
 * For CCCC(=O)O-, returns [C,C,C,C(=O)] (4 carbons including carbonyl)
 */
export function findAcylChain(mol: Molecule, carbonylCarbon: number): number[] {
  const visited = new Set<number>();
  const chain: number[] = [carbonylCarbon];
  visited.add(carbonylCarbon);

  // Find carbonyl oxygen and ester oxygen to know which direction to traverse
  let esterOxygen: number | undefined;
  for (const bond of mol.bonds) {
    if (
      bond.type === "single" &&
      (bond.atom1 === carbonylCarbon || bond.atom2 === carbonylCarbon)
    ) {
      const otherId = bond.atom1 === carbonylCarbon ? bond.atom2 : bond.atom1;
      const otherAtom = mol.atoms[otherId];
      if (otherAtom?.symbol === "O") {
        esterOxygen = otherId;
        break;
      }
    }
  }

  // BFS to find all carbons in the acyl chain (away from ester oxygen)
  const queue = [carbonylCarbon];

  while (queue.length > 0) {
    const currentId = queue.shift()!;

    for (const bond of mol.bonds) {
      if (bond.type !== "single") continue;
      if (bond.atom1 !== currentId && bond.atom2 !== currentId) continue;

      const otherId = bond.atom1 === currentId ? bond.atom2 : bond.atom1;
      if (visited.has(otherId)) continue;
      if (otherId === esterOxygen) continue; // Don't traverse into ester oxygen

      const otherAtom = mol.atoms[otherId];
      if (otherAtom?.symbol === "C") {
        visited.add(otherId);
        chain.push(otherId);
        queue.push(otherId);
      }
    }
  }

  return chain;
}

/**
 * Expand a ketone functional group to include the complete acyl substituent chain.
 *
 * For ketones that are part of acyl substituents (R-C(=O)-), we need to include
 * all atoms in the R group to prevent fragmentation during parent chain selection.
 *
 * Detection criteria:
 * - Ketone carbonyl carbon has exactly 2 carbon neighbors (excluding C=O oxygen)
 * - One neighbor is on the main chain (has more connections to rest of molecule)
 * - Other neighbor is the acyl chain (traverse to collect all carbons/branches)
 *
 * Example: CC(C)CC(=O)- (3-methylbutanoyl)
 * - Carbonyl at C4: neighbors are C3 (acyl chain start) and C6 (main chain)
 * - Traverse from C3 to collect: C0, C1, C2, C3 (full branched acyl group)
 * - Result: ketone atoms = [C4, O5, C0, C1, C2, C3] (all marked as functional group)
 *
 * @param mol - The molecule containing the ketone
 * @param ketoneAtomIndices - Original ketone atom indices [carbonyl C, O]
 * @returns Expanded atom indices including full acyl chain, or original if not an acyl substituent
 */
export function expandKetoneToAcylGroup(
  mol: Molecule,
  ketoneAtomIndices: number[],
): number[] {
  // Ketone detection gives us [carbonyl C, O]
  if (ketoneAtomIndices.length < 2) return ketoneAtomIndices;

  const carbonylIdx = ketoneAtomIndices[0];
  const oxygenIdx = ketoneAtomIndices[1];

  // Guard against undefined indices
  if (carbonylIdx === undefined || oxygenIdx === undefined) {
    return ketoneAtomIndices;
  }

  // Do not expand ketones that are part of ring systems
  const carbonylAtom = mol.atoms[carbonylIdx];
  if (carbonylAtom?.isInRing) {
    return ketoneAtomIndices;
  }

  // Find all carbon neighbors of the carbonyl carbon (excluding oxygen)
  const carbonNeighbors: number[] = [];
  for (const bond of mol.bonds) {
    if (bond.type !== "single") continue;
    if (bond.atom1 !== carbonylIdx && bond.atom2 !== carbonylIdx) continue;

    const otherIdx = bond.atom1 === carbonylIdx ? bond.atom2 : bond.atom1;
    if (otherIdx === oxygenIdx) continue; // Skip the C=O oxygen

    const otherAtom = mol.atoms[otherIdx];
    if (otherAtom?.symbol === "C") {
      carbonNeighbors.push(otherIdx);
    }
  }

  // If carbonyl has 0 or 1 carbon neighbors, it's not a substitutable ketone (e.g., aldehyde or terminal ketone)
  // If it has 2+ carbon neighbors, it's an internal ketone - check if it's an acyl substituent
  if (carbonNeighbors.length !== 2) {
    return ketoneAtomIndices; // Not an acyl substituent pattern
  }

  // Determine which neighbor is the "acyl chain" vs "main chain"
  // Heuristic: the neighbor with fewer total connections is likely the acyl chain
  // (main chain typically has more connectivity to rest of molecule)
  const neighbor1Idx = carbonNeighbors[0];
  const neighbor2Idx = carbonNeighbors[1];

  // Guard against undefined neighbors
  if (neighbor1Idx === undefined || neighbor2Idx === undefined) {
    return ketoneAtomIndices;
  }

  const neighbor1Connections = mol.bonds.filter(
    (b) => b.atom1 === neighbor1Idx || b.atom2 === neighbor1Idx,
  ).length;
  const neighbor2Connections = mol.bonds.filter(
    (b) => b.atom1 === neighbor2Idx || b.atom2 === neighbor2Idx,
  ).length;

  let acylChainStart: number;

  // If connections are unequal, use connection count heuristic
  if (neighbor1Connections !== neighbor2Connections) {
    acylChainStart =
      neighbor1Connections < neighbor2Connections ? neighbor1Idx : neighbor2Idx;
  } else {
    // Tie-breaker: count chain length from each neighbor (BFS)
    const getChainLength = (startIdx: number, excludeIdx: number): number => {
      const visited = new Set<number>([excludeIdx]);
      const queue = [startIdx];
      visited.add(startIdx);
      let count = 0;

      while (queue.length > 0) {
        const currentIdx = queue.shift()!;
        count++;

        for (const bond of mol.bonds) {
          if (bond.atom1 !== currentIdx && bond.atom2 !== currentIdx) continue;
          const otherIdx = bond.atom1 === currentIdx ? bond.atom2 : bond.atom1;
          if (visited.has(otherIdx)) continue;
          const otherAtom = mol.atoms[otherIdx];
          if (otherAtom?.symbol === "C") {
            visited.add(otherIdx);
            queue.push(otherIdx);
          }
        }
      }

      return count;
    };

    const neighbor1ChainLength = getChainLength(neighbor1Idx, carbonylIdx);
    const neighbor2ChainLength = getChainLength(neighbor2Idx, carbonylIdx);

    if (neighbor1ChainLength === neighbor2ChainLength) {
      return ketoneAtomIndices;
    }

    // Shorter chain is likely the acyl substituent
    acylChainStart =
      neighbor1ChainLength < neighbor2ChainLength ? neighbor1Idx : neighbor2Idx;
  }

  // BFS traversal from acyl chain start, away from carbonyl
  // STOP at ring atoms to prevent including aromatic rings and benzyl groups
  const visited = new Set<number>([carbonylIdx, oxygenIdx]);
  const acylAtoms: number[] = [];
  const queue = [acylChainStart];
  visited.add(acylChainStart);

  while (queue.length > 0) {
    const currentIdx = queue.shift()!;
    const currentAtom = mol.atoms[currentIdx];

    // STOP if we encounter a ring atom (don't include it or traverse beyond it)
    if (currentAtom?.isInRing) {
      continue;
    }

    acylAtoms.push(currentIdx);

    for (const bond of mol.bonds) {
      if (bond.atom1 !== currentIdx && bond.atom2 !== currentIdx) continue;

      const otherIdx = bond.atom1 === currentIdx ? bond.atom2 : bond.atom1;
      if (visited.has(otherIdx)) continue;

      const otherAtom = mol.atoms[otherIdx];
      // Include only aliphatic carbons (not in rings)
      if (otherAtom?.symbol === "C" && !otherAtom.isInRing) {
        visited.add(otherIdx);
        queue.push(otherIdx);
      }
    }
  }

  // Return expanded atom list: [carbonyl C, O, ...acyl chain atoms]
  return [carbonylIdx, oxygenIdx, ...acylAtoms];
}
