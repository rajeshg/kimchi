import type { Molecule } from "types";
import { BondType } from "types";
import {
  getAlkaneBaseName,
  getAlkylName,
  getGreekNumeral,
} from "../../iupac-helpers";
import { getSharedOPSINService } from "../../../opsin-service";
import { getSimpleMultiplier } from "../../../opsin-adapter";

export function nameComplexAlkoxySubstituent(
  molecule: Molecule,
  substituentAtoms: Set<number>,
  oxygenAtomIdx: number,
  carbonAtoms: number[],
  oxygenAtoms: number[],
): string {
  if (process.env.VERBOSE) {
    console.log(
      `[nameComplexAlkoxySubstituent] oxygenAtomIdx=${oxygenAtomIdx}, carbonAtoms=[${carbonAtoms.join(",")}], oxygenAtoms=[${oxygenAtoms.join(",")}]`,
    );
  }

  // Find the primary carbon (bonded to the primary oxygen)
  let primaryCarbon = -1;
  for (const bond of molecule.bonds) {
    if (bond.atom1 === oxygenAtomIdx && carbonAtoms.includes(bond.atom2)) {
      primaryCarbon = bond.atom2;
      break;
    }
    if (bond.atom2 === oxygenAtomIdx && carbonAtoms.includes(bond.atom1)) {
      primaryCarbon = bond.atom1;
      break;
    }
  }

  if (primaryCarbon === -1) {
    return "oxy";
  }

  if (process.env.VERBOSE) {
    console.log(
      `[nameComplexAlkoxySubstituent] primaryCarbon=${primaryCarbon}`,
    );
  }

  // Find the nearest nested oxygen (the first oxygen in the ether chain)
  // It should be bonded to a carbon in the substituent and not be the primary oxygen
  let firstNestedOxygen = -1;
  let distanceToNested = Number.POSITIVE_INFINITY;

  for (const oIdx of oxygenAtoms) {
    // BFS to find shortest path from primaryCarbon to this nested oxygen
    const visited = new Set<number>();
    const queue: Array<{ atom: number; dist: number }> = [
      { atom: primaryCarbon, dist: 0 },
    ];
    visited.add(primaryCarbon);

    let foundDist = Number.POSITIVE_INFINITY;
    while (queue.length > 0) {
      const current = queue.shift()!;

      if (current.atom === oIdx) {
        foundDist = current.dist;
        break;
      }

      for (const bond of molecule.bonds) {
        let neighbor = -1;
        if (
          bond.atom1 === current.atom &&
          substituentAtoms.has(bond.atom2) &&
          !visited.has(bond.atom2)
        ) {
          neighbor = bond.atom2;
        } else if (
          bond.atom2 === current.atom &&
          substituentAtoms.has(bond.atom1) &&
          !visited.has(bond.atom1)
        ) {
          neighbor = bond.atom1;
        }

        if (neighbor >= 0) {
          visited.add(neighbor);
          queue.push({ atom: neighbor, dist: current.dist + 1 });
        }
      }
    }

    if (foundDist < distanceToNested) {
      distanceToNested = foundDist;
      firstNestedOxygen = oIdx;
    }
  }

  if (process.env.VERBOSE) {
    console.log(
      `[nameComplexAlkoxySubstituent] firstNestedOxygen=${firstNestedOxygen}, distance=${distanceToNested}`,
    );
  }

  if (firstNestedOxygen === -1) {
    return "oxy";
  }

  // Collect atoms in the linker (between primary oxygen and first nested oxygen)
  // and atoms in the tail (after the nested oxygen)
  const linkerAtoms = new Set<number>();
  const tailAtoms = new Set<number>();

  // Helper to traverse and collect atoms up to (but not including) the nested oxygen
  function collectLinker(currentAtom: number): void {
    if (currentAtom === firstNestedOxygen) {
      return; // Stop when we reach the nested oxygen
    }
    if (linkerAtoms.has(currentAtom)) return; // Already visited

    linkerAtoms.add(currentAtom);

    // Traverse neighbors in the substituent
    for (const bond of molecule.bonds) {
      let neighbor = -1;
      if (bond.atom1 === currentAtom && substituentAtoms.has(bond.atom2)) {
        neighbor = bond.atom2;
      } else if (
        bond.atom2 === currentAtom &&
        substituentAtoms.has(bond.atom1)
      ) {
        neighbor = bond.atom1;
      }

      if (
        neighbor >= 0 &&
        neighbor !== oxygenAtomIdx &&
        !linkerAtoms.has(neighbor)
      ) {
        collectLinker(neighbor);
      }
    }
  }

  // Helper to traverse from a starting carbon collecting all reachable atoms excluding linker
  function collectTail(currentAtom: number): void {
    if (tailAtoms.has(currentAtom) || linkerAtoms.has(currentAtom)) return;
    if (currentAtom === oxygenAtomIdx) return;

    tailAtoms.add(currentAtom);

    for (const bond of molecule.bonds) {
      let neighbor = -1;
      if (bond.atom1 === currentAtom && substituentAtoms.has(bond.atom2)) {
        neighbor = bond.atom2;
      } else if (
        bond.atom2 === currentAtom &&
        substituentAtoms.has(bond.atom1)
      ) {
        neighbor = bond.atom1;
      }

      if (
        neighbor >= 0 &&
        !tailAtoms.has(neighbor) &&
        !linkerAtoms.has(neighbor)
      ) {
        collectTail(neighbor);
      }
    }
  }

  collectLinker(primaryCarbon);

  // Find the carbon bonded to the nested oxygen that's NOT in the linker
  let tailStartCarbon = -1;
  for (const bond of molecule.bonds) {
    if (bond.atom1 === firstNestedOxygen && !linkerAtoms.has(bond.atom2)) {
      tailStartCarbon = bond.atom2;
      break;
    }
    if (bond.atom2 === firstNestedOxygen && !linkerAtoms.has(bond.atom1)) {
      tailStartCarbon = bond.atom1;
      break;
    }
  }

  if (process.env.VERBOSE) {
    console.log(
      `  Complex ether debug: primaryO=${oxygenAtomIdx}, nestedO=${firstNestedOxygen}, tailStartC=${tailStartCarbon}`,
    );
    console.log(
      `  substituentAtoms: [${Array.from(substituentAtoms).join(",")}]`,
    );
  }

  if (tailStartCarbon >= 0) {
    collectTail(tailStartCarbon);
  }

  if (process.env.VERBOSE) {
    console.log(
      `  Complex ether - Linker carbons: [${Array.from(linkerAtoms).join(",")}]`,
    );
    console.log(
      `  Complex ether - Tail carbons: [${Array.from(tailAtoms)
        .filter((i) => molecule.atoms[i]?.symbol === "C")
        .join(",")}]`,
    );
  }

  // Name the tail portion - need to build it as a complete substituent
  let tailName = "";
  if (tailAtoms.size > 0) {
    const tailCarbons = Array.from(tailAtoms).filter(
      (idx) => molecule.atoms[idx]?.symbol === "C",
    );
    const tailOxygens = Array.from(tailAtoms).filter((idx) => {
      const atom = molecule.atoms[idx];
      if (!atom || atom.symbol !== "O" || idx === firstNestedOxygen)
        return false;
      // Only include ether-like oxygens (single bonds, not carbonyl)
      const bondsToO = molecule.bonds.filter(
        (b) => b.atom1 === idx || b.atom2 === idx,
      );
      const hasSingle = bondsToO.some((b) => b.type === BondType.SINGLE);
      if (!hasSingle) return false;
      const hasDoubleToC = bondsToO.some(
        (b) =>
          b.type === BondType.DOUBLE &&
          molecule.atoms[b.atom1 === idx ? b.atom2 : b.atom1]?.symbol === "C",
      );
      if (hasDoubleToC) return false;
      return true;
    });

    if (tailCarbons.length === 0) {
      tailName = "oxy";
    } else if (tailOxygens.length > 0) {
      // Tail contains additional nested ethers - recursively name it
      if (process.env.VERBOSE) {
        console.log(
          `  Tail contains nested oxygens: [${tailOxygens.join(",")}], recursively naming`,
        );
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
        if (
          bond.atom1 === firstNestedOxygen &&
          tailCarbons.includes(bond.atom2)
        ) {
          tailAttachmentCarbon = bond.atom2;
          break;
        }
        if (
          bond.atom2 === firstNestedOxygen &&
          tailCarbons.includes(bond.atom1)
        ) {
          tailAttachmentCarbon = bond.atom1;
          break;
        }
      }

      if (tailAttachmentCarbon === -1) {
        tailName = "oxy";
      } else {
        // Build the tail structure and name it properly
        // For now, use a simplified approach - build the longest chain and detect branching
        const tailChain = buildLongestChainFrom(
          molecule,
          tailAttachmentCarbon,
          tailAtoms,
        );
        const tailChainSet = new Set(tailChain);

        if (process.env.VERBOSE) {
          console.log(
            `  Tail chain: [${tailChain.join(",")}], attachment at ${tailAttachmentCarbon}`,
          );
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

            if (
              neighborIdx >= 0 &&
              !tailChainSet.has(neighborIdx) &&
              molecule.atoms[neighborIdx]?.symbol === "C"
            ) {
              // This is a methyl branch
              tailSubstituents.push({ carbon: i + 1, type: "methyl" });
            }
          }
        }

        // Generate the tail name with proper IUPAC format
        const chainLength = tailChain.length;
        const baseAlkane = getAlkaneBaseName(chainLength);

        if (tailSubstituents.length === 0) {
          // Simple alkyl group - check attachment point
          if (chainLength === 1) {
            tailName = "methoxy";
          } else if (chainLength === 2) {
            tailName = "ethoxy";
          } else if (chainLength === 3) {
            tailName = "propoxy";
          } else if (chainLength === 4) {
            tailName = "butoxy";
          } else {
            const alkylBase = baseAlkane.replace(/an$/, "");
            tailName = alkylBase + "oxy";
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
            const locantStr = locants.join(",");
            if (locants.length > 1) {
              const multiplier = getSimpleMultiplier(
                locants.length,
                getSharedOPSINService(),
              );
              prefixParts.push(`${locantStr}-${multiplier}${type}`);
            } else {
              prefixParts.push(`${locantStr}-${type}`);
            }
          }

          const substituentPrefix = prefixParts.join("-");

          // Determine attachment point locant within the chain
          let attachmentLocant = tailChain.indexOf(tailAttachmentCarbon) + 1;
          if (attachmentLocant === 0) {
            attachmentLocant = 1; // Fallback
          }

          // Format: "2-methylbutoxy" (if attached at position 1) or "2-methylbutan-2-yloxy" (if attached at other position)
          if (attachmentLocant === 1) {
            // Remove trailing "an" before adding "oxy" (butan -> butoxy, not butanoxy)
            const alkylBase = baseAlkane.replace(/an$/, "");
            tailName = `${substituentPrefix}${alkylBase}oxy`;
          } else {
            tailName = `${substituentPrefix}${baseAlkane}-${attachmentLocant}-yloxy`;
          }
        }
      }
    }
  } else {
    tailName = "oxy";
  }

  // Name the linker portion
  const linkerCarbons = Array.from(linkerAtoms);
  let linkerName = "";

  if (linkerCarbons.length === 1) {
    linkerName = "methoxy";
  } else if (linkerCarbons.length === 2) {
    // Check for methyl substituents on the linker
    // For now, just call it ethoxy
    linkerName = "ethoxy";
  } else {
    const alkaneBase = getAlkaneBaseName(linkerCarbons.length);
    linkerName = alkaneBase + "oxy";
  }

  // Combine tail + linker with proper locant and parentheses
  // Format depends on linker length:
  // - Single carbon linker (methoxy): "(tailName)methoxy" - no locant needed
  // - Multi-carbon linker (ethoxy, propoxy): "1-(tailName)ethoxy" - needs locant
  if (tailName && tailName !== "oxy") {
    // If tailName is already in format "1-(...)", flatten it for concatenation while preserving the inner "1-"
    // This prevents excessive nesting like "1-(1-(ethoxy)ethoxy)" and instead produces "1-ethoxyethoxy"
    let cleanedTailName = tailName;
    if (process.env.VERBOSE) {
      console.log(
        `[nameComplexAlkoxySubstituent] Before cleaning: tailName="${tailName}", linkerCarbons.length=${linkerCarbons.length}`,
      );
    }
    if (tailName.startsWith("1-(")) {
      // Find the matching closing parenthesis for the opening paren at index 2
      let depth = 0;
      let closeIdx = -1;
      for (let i = 3; i < tailName.length; i++) {
        // Start at 3, after "1-("
        if (tailName[i] === "(") depth++;
        else if (tailName[i] === ")") {
          if (depth === 0) {
            closeIdx = i;
            break;
          }
          depth--;
        }
      }
      if (closeIdx !== -1) {
        // Extract content inside parentheses and flatten: "1-(...)" + remainder → "1-..." + remainder
        const innerPart = tailName.slice(3, closeIdx); // Content inside parens
        const remainder = tailName.slice(closeIdx + 1); // After closing paren
        // Only prepend "1-" if innerPart doesn't already start with a locant
        if (innerPart.startsWith("1-")) {
          cleanedTailName = `${innerPart}${remainder}`; // Already has "1-" prefix
        } else {
          cleanedTailName = `1-${innerPart}${remainder}`; // Add "1-" prefix
        }
        if (process.env.VERBOSE) {
          console.log(
            `[nameComplexAlkoxySubstituent] After cleaning: cleanedTailName="${cleanedTailName}" (inner="${innerPart}", remainder="${remainder}")`,
          );
        }
      }
    }

    // Determine if we need a locant based on linker length
    // Single-carbon linker (methoxy): no locant needed - only one possible attachment point
    // Multi-carbon linker (ethoxy, propoxy, etc.): needs locant to specify position
    let result: string;
    if (linkerCarbons.length === 1) {
      // Methoxy linker - format: "tailNamemethoxy" (direct concatenation)
      // No locant or parentheses needed since there's only one carbon
      // Per IUPAC: concatenate ether substituents directly for clarity
      // Example: "2-methylbutan-2-yloxy" + "methoxy" → "2-methylbutan-2-yloxymethoxy"
      result = `${cleanedTailName}${linkerName}`;
    } else {
      // Multi-carbon linker - format: "1-(tailName)linkerName" or "cleanedTailName + linkerName"
      // After flattening, if cleanedTailName already starts with "1-", we should concatenate directly
      // Example: "1-ethoxyethoxy" + "ethoxy" → "1-ethoxyethoxyethoxy"
      // NOT "1-(1-ethoxyethoxy)ethoxy"
      result = cleanedTailName.startsWith("1-")
        ? `${cleanedTailName}${linkerName}` // Already flattened, just append
        : `1-(${cleanedTailName})${linkerName}`; // Not flattened, needs wrapper with locant
    }

    if (process.env.VERBOSE) {
      console.log(`[nameComplexAlkoxySubstituent] Returning: "${result}"`);
    }
    return result;
  } else {
    return linkerName;
  }
}

export function buildLongestChainFrom(
  molecule: Molecule,
  startCarbon: number,
  allowedAtoms: Set<number>,
): number[] {
  let longestChain: number[] = [];

  if (process.env.VERBOSE) {
    console.log(
      `  [buildLongestChainFrom] startCarbon=${startCarbon}, allowedAtoms=[${Array.from(allowedAtoms).join(",")}]`,
    );
  }

  function dfs(current: number, path: number[], visited: Set<number>): void {
    // Always update longest chain if current path is longer
    if (path.length > longestChain.length) {
      longestChain = [...path];
      if (process.env.VERBOSE) {
        console.log(
          `    [DFS] Updated longest chain: [${longestChain.join(",")}]`,
        );
      }
    }

    // Find all unvisited carbon neighbors
    for (const bond of molecule.bonds) {
      let neighborIdx = -1;
      if (
        bond.atom1 === current &&
        allowedAtoms.has(bond.atom2) &&
        !visited.has(bond.atom2)
      ) {
        neighborIdx = bond.atom2;
      } else if (
        bond.atom2 === current &&
        allowedAtoms.has(bond.atom1) &&
        !visited.has(bond.atom1)
      ) {
        neighborIdx = bond.atom1;
      }

      if (neighborIdx >= 0 && molecule.atoms[neighborIdx]?.symbol === "C") {
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

  // Get all carbon neighbors of startCarbon
  const startNeighbors: number[] = [];
  for (const bond of molecule.bonds) {
    if (
      bond.atom1 === startCarbon &&
      allowedAtoms.has(bond.atom2) &&
      molecule.atoms[bond.atom2]?.symbol === "C"
    ) {
      startNeighbors.push(bond.atom2);
    } else if (
      bond.atom2 === startCarbon &&
      allowedAtoms.has(bond.atom1) &&
      molecule.atoms[bond.atom1]?.symbol === "C"
    ) {
      startNeighbors.push(bond.atom1);
    }
  }

  if (process.env.VERBOSE) {
    console.log(
      `  [buildLongestChainFrom] Found ${startNeighbors.length} neighbors: [${startNeighbors.join(",")}]`,
    );
  }

  // NEW APPROACH: Try all pairs of neighbors to find chains passing THROUGH startCarbon
  // This handles cases like CH3-C(CH3)2-CH2-CH3 where we need C-C-C-C not C-C-C
  if (startNeighbors.length >= 2) {
    // Try all pairs of starting directions (chain from neighbor1 through startCarbon to neighbor2)
    for (let i = 0; i < startNeighbors.length; i++) {
      const neighbor1 = startNeighbors[i];
      if (neighbor1 === undefined) continue;

      for (let j = 0; j < startNeighbors.length; j++) {
        if (i === j) continue;
        const neighbor2 = startNeighbors[j];
        if (neighbor2 === undefined) continue;

        if (process.env.VERBOSE) {
          console.log(
            `  [buildLongestChainFrom] Trying chain from ${neighbor1} through ${startCarbon} to ${neighbor2}`,
          );
        }

        // Build chain in direction 1 (from neighbor1, away from startCarbon)
        const visited1 = new Set<number>([startCarbon, neighbor1]);
        const path1 = [startCarbon, neighbor1];
        dfs(neighbor1, path1, visited1);

        // Now extend in the opposite direction (from startCarbon towards neighbor2)
        // We need to reverse path1 and then extend in direction 2
        const reversedPath1 = [...path1].reverse(); // Now ends with startCarbon
        const visited2 = new Set<number>(visited1);
        visited2.add(neighbor2);
        const fullPath = [...reversedPath1, neighbor2]; // startCarbon is at reversedPath1[length-1]

        // Continue exploring from neighbor2
        dfs(neighbor2, fullPath, visited2);

        if (fullPath.length > longestChain.length) {
          longestChain = [...fullPath];
          if (process.env.VERBOSE) {
            console.log(
              `    [buildLongestChainFrom] Updated with bidirectional chain: [${longestChain.join(",")}]`,
            );
          }
        }
      }
    }
  }

  // Also try single-direction chains (original behavior for cases with only 1 neighbor)
  for (const firstNeighbor of startNeighbors) {
    if (process.env.VERBOSE) {
      console.log(
        `  [buildLongestChainFrom] Trying single-direction chain from ${firstNeighbor}`,
      );
    }
    const visited = new Set<number>([startCarbon, firstNeighbor]);
    const path = [startCarbon, firstNeighbor];

    dfs(firstNeighbor, path, visited);

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

export function nameAryloxySubstituent(
  molecule: Molecule,
  substituentAtoms: Set<number>,
  oxygenAtomIdx: number,
  arylCarbonIdx: number,
): string {
  if (process.env.VERBOSE) {
    console.log(
      `[nameAryloxySubstituent] oxygen=${oxygenAtomIdx}, arylCarbon=${arylCarbonIdx}, substituentAtoms=${Array.from(substituentAtoms).join(",")}`,
    );
  }

  // Find all aromatic carbons in the substituent
  const aromaticCarbons = Array.from(substituentAtoms).filter(
    (idx) =>
      molecule.atoms[idx]?.symbol === "C" && molecule.atoms[idx]?.aromatic,
  );

  if (process.env.VERBOSE) {
    console.log(
      `[nameAryloxySubstituent] aromaticCarbons=${aromaticCarbons.join(",")}`,
    );
  }

  // Identify which ring the aryl carbon belongs to
  let arylRing: readonly number[] | null = null;
  if (molecule.rings) {
    for (const ring of molecule.rings) {
      if (ring.includes(arylCarbonIdx)) {
        // Check if all ring atoms are aromatic carbons
        const allAromatic = ring.every((atomId) => {
          const atom = molecule.atoms[atomId];
          return atom && atom.symbol === "C" && atom.aromatic;
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
    return "phenoxy";
  }

  if (process.env.VERBOSE) {
    console.log(`[nameAryloxySubstituent] arylRing=${arylRing.join(",")}`);
  }

  // Determine base aryl name
  let arylBase = "";
  if (arylRing.length === 6) {
    arylBase = "phen"; // phenyl → phenoxy
  } else if (arylRing.length === 5) {
    // Could be furan, pyrrole, thiophene - but if all C, it's cyclopentadienyl
    arylBase = "cyclopentadienyl";
  } else {
    // For now, use generic naming
    arylBase = "aryl";
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
      const neighbors = getRingNeighbors(atom).filter((n) => !visited.has(n));

      for (const neighbor of neighbors) {
        currentPos++;
        ringNumbering.set(neighbor, currentPos);
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }

  if (process.env.VERBOSE) {
    console.log(
      `[nameAryloxySubstituent] ringNumbering:`,
      Array.from(ringNumbering.entries())
        .map(([k, v]) => `${k}:${v}`)
        .join(", "),
    );
  }

  // Find substituents on each ring carbon
  for (const ringCarbon of arylRing) {
    const position = ringNumbering.get(ringCarbon);
    if (!position) continue;

    // Find non-ring attachments (excluding oxygen)
    for (const bond of molecule.bonds) {
      let substituent = -1;
      if (
        bond.atom1 === ringCarbon &&
        !ringSet.has(bond.atom2) &&
        bond.atom2 !== oxygenAtomIdx
      ) {
        substituent = bond.atom2;
      } else if (
        bond.atom2 === ringCarbon &&
        !ringSet.has(bond.atom1) &&
        bond.atom1 !== oxygenAtomIdx
      ) {
        substituent = bond.atom1;
      }

      if (substituent >= 0) {
        const subAtom = molecule.atoms[substituent];
        if (subAtom) {
          let subName = "";
          if (subAtom.symbol === "Cl") subName = "chloro";
          else if (subAtom.symbol === "Br") subName = "bromo";
          else if (subAtom.symbol === "I") subName = "iodo";
          else if (subAtom.symbol === "F") subName = "fluoro";
          else if (subAtom.symbol === "C")
            subName = "methyl"; // Simple case
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
    const posStr = positions.join(",");
    if (positions.length === 1) {
      prefixes.push(`${posStr}-${name}`);
    } else {
      const mult = getGreekNumeral(positions.length);
      prefixes.push(`${posStr}-${mult}${name}`);
    }
  }

  // Sort prefixes alphabetically
  prefixes.sort();

  return `(${prefixes.join("-")}${arylBase}oxy)`;
}

export function nameAlkoxySubstituent(
  molecule: Molecule,
  substituentAtoms: Set<number>,
  oxygenAtomIdx: number,
): string {
  if (process.env.VERBOSE) {
    console.log(
      `[nameAlkoxySubstituent] oxygen=${oxygenAtomIdx}, substituentAtoms=${Array.from(substituentAtoms).join(",")}`,
    );
  }

  // Find carbon atoms in the substituent (excluding oxygen)
  const carbonAtoms = Array.from(substituentAtoms).filter(
    (idx) => molecule.atoms[idx]?.symbol === "C",
  );

  // Check for nested oxygens in the substituent (ether-like oxygens only)
  // Exclude carbonyl oxygens or nitro oxygens (double-bonded O) which are not
  // part of an ether chain. We only consider oxygens that have at least one
  // single bond (typical for ethers) and are not double-bonded to carbon.
  const oxygenAtoms = Array.from(substituentAtoms).filter((idx) => {
    const atom = molecule.atoms[idx];
    if (!atom || atom.symbol !== "O" || idx === oxygenAtomIdx) return false;
    const bondsToO = molecule.bonds.filter(
      (b) => b.atom1 === idx || b.atom2 === idx,
    );
    // must have at least one single bond
    const hasSingle = bondsToO.some((b) => b.type === BondType.SINGLE);
    if (!hasSingle) return false;
    // exclude oxygens that have a double bond to carbon (carbonyl)
    const hasDoubleToC = bondsToO.some(
      (b) =>
        b.type === BondType.DOUBLE &&
        molecule.atoms[b.atom1 === idx ? b.atom2 : b.atom1]?.symbol === "C",
    );
    if (hasDoubleToC) return false;
    return true;
  });

  if (process.env.VERBOSE) {
    console.log(
      `[nameAlkoxySubstituent] carbonAtoms=${carbonAtoms.join(",")}, nestedOxygens=${oxygenAtoms.join(",")}`,
    );
  }

  // Special-case: silyl-protected oxygens (O-Si). If oxygen is bonded to a silicon
  // atom, try to construct a trialkylsilyl name (e.g., trimethylsilyl) and return
  // the silyloxy substituent name (e.g., trimethylsilyloxy). This covers common
  // protecting groups like TMS (trimethylsilyl).
  for (const bond of molecule.bonds) {
    if (bond.atom1 === oxygenAtomIdx || bond.atom2 === oxygenAtomIdx) {
      const other = bond.atom1 === oxygenAtomIdx ? bond.atom2 : bond.atom1;
      const otherAtom = molecule.atoms[other];
      if (otherAtom && otherAtom.symbol === "Si") {
        if (process.env.VERBOSE)
          console.log(
            `[nameAlkoxySubstituent] Detected silicon at ${other} attached to O${oxygenAtomIdx}`,
          );
        // Inspect substituents on silicon to determine alkyl groups
        const siAlkyls: string[] = [];
        for (const b2 of molecule.bonds) {
          if (b2.atom1 === other || b2.atom2 === other) {
            const nbr = b2.atom1 === other ? b2.atom2 : b2.atom1;
            const nbrAtom = molecule.atoms[nbr];
            if (!nbrAtom) continue;
            if (nbrAtom.symbol === "C") {
              // Check if this carbon is a methyl (no other carbon neighbors)
              const carbonNeighbors = molecule.bonds.filter(
                (bb) =>
                  (bb.atom1 === nbr || bb.atom2 === nbr) &&
                  bb.atom1 !== other &&
                  bb.atom2 !== other,
              );
              const isMethyl = carbonNeighbors.every(
                (bb) =>
                  molecule.atoms[bb.atom1 === nbr ? bb.atom2 : bb.atom1]
                    ?.symbol !== "C",
              );
              siAlkyls.push(isMethyl ? "methyl" : getAlkylName(1));
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
            // Use OPSIN for multiplicative prefix (di, tri, tetra...)
            const mult =
              cnt > 1 ? getSimpleMultiplier(cnt, getSharedOPSINService()) : "";
            parts.push(`${mult}${alk}`);
          }
          const silylBase = parts.join("");
          const silylName = `${silylBase}silyl`;
          return `${silylName}oxy`;
        }
        // Fallback: generic silyloxy
        return "silyloxy";
      }
    }
  }

  if (carbonAtoms.length === 0) {
    return "oxy"; // Just -O- with no carbons
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
          if (otherAtom && otherAtom.symbol === "Si") {
            if (process.env.VERBOSE)
              console.log(
                `[nameAlkoxySubstituent] Detected silicon at ${other} attached to nested O${oIdx}`,
              );
            // Inspect substituents on silicon to determine alkyl groups
            const siAlkyls: string[] = [];
            for (const b2 of molecule.bonds) {
              if (b2.atom1 === other || b2.atom2 === other) {
                const nbr = b2.atom1 === other ? b2.atom2 : b2.atom1;
                const nbrAtom = molecule.atoms[nbr];
                if (!nbrAtom) continue;
                if (nbrAtom.symbol === "C") {
                  // Determine if this carbon is methyl (no further carbon neighbors in substituent)
                  const carbonNeighbors = molecule.bonds.filter(
                    (bb) =>
                      (bb.atom1 === nbr || bb.atom2 === nbr) &&
                      bb.atom1 !== other &&
                      bb.atom2 !== other,
                  );
                  const isMethyl = carbonNeighbors.every(
                    (bb) =>
                      molecule.atoms[bb.atom1 === nbr ? bb.atom2 : bb.atom1]
                        ?.symbol !== "C",
                  );
                  siAlkyls.push(isMethyl ? "methyl" : getAlkylName(1));
                }
              }
            }

            if (siAlkyls.length > 0) {
              const counts: Record<string, number> = {};
              for (const a of siAlkyls) counts[a] = (counts[a] || 0) + 1;
              const parts: string[] = [];
              for (const [alk, cnt] of Object.entries(counts)) {
                const mult =
                  cnt > 1
                    ? getSimpleMultiplier(cnt, getSharedOPSINService())
                    : "";
                parts.push(`${mult}${alk}`);
              }
              const silylBase = parts.join("");
              const silylName = `${silylBase}silyl`;
              return `${silylName}oxy`;
            }
            return "silyloxy";
          }
        }
      }
    }

    return nameComplexAlkoxySubstituent(
      molecule,
      substituentAtoms,
      oxygenAtomIdx,
      carbonAtoms,
      oxygenAtoms,
    );
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
    console.log(
      `[nameAlkoxySubstituent] carbonAttachedToO=${carbonAttachedToO}`,
    );
  }

  if (carbonAttachedToO === -1) {
    return "oxy"; // No carbon found
  }

  // Check if carbon attached to oxygen is aromatic (phenoxy, naphthoxy, etc.)
  const attachedCarbon = molecule.atoms[carbonAttachedToO];
  if (attachedCarbon && attachedCarbon.aromatic) {
    // This is an aryloxy substituent (e.g., phenoxy, 4-chlorophenoxy)
    return nameAryloxySubstituent(
      molecule,
      substituentAtoms,
      oxygenAtomIdx,
      carbonAttachedToO,
    );
  }

  // Special case: check for common branched patterns
  const carbonCount = carbonAtoms.length;

  // Check for tert-butoxy: C(C)(C)(C)-O
  if (carbonCount === 4) {
    // Count neighbors of the first carbon
    const firstCarbon = carbonAttachedToO;
    const neighbors = molecule.bonds.filter(
      (b) =>
        (b.atom1 === firstCarbon && carbonAtoms.includes(b.atom2)) ||
        (b.atom2 === firstCarbon && carbonAtoms.includes(b.atom1)),
    );

    // If first carbon has 3 carbon neighbors, it's tert-butoxy
    const carbonNeighbors = neighbors.filter((b) => {
      const otherAtom = b.atom1 === firstCarbon ? b.atom2 : b.atom1;
      return (
        molecule.atoms[otherAtom]?.symbol === "C" && otherAtom !== oxygenAtomIdx
      );
    });

    if (carbonNeighbors.length === 3) {
      // Check if all three neighbors are CH3 (no further carbons)
      const allMethyl = carbonNeighbors.every((b) => {
        const methyl = b.atom1 === firstCarbon ? b.atom2 : b.atom1;
        const methylNeighbors = molecule.bonds.filter(
          (bond) =>
            (bond.atom1 === methyl &&
              carbonAtoms.includes(bond.atom2) &&
              bond.atom2 !== firstCarbon) ||
            (bond.atom2 === methyl &&
              carbonAtoms.includes(bond.atom1) &&
              bond.atom1 !== firstCarbon),
        );
        return methylNeighbors.length === 0;
      });

      if (allMethyl) {
        return "2-methylpropan-2-yloxy";
      }
    }
  }

  // Check for isopropoxy: C(C)(C)-O
  if (carbonCount === 3) {
    const firstCarbon = carbonAttachedToO;
    const neighbors = molecule.bonds.filter(
      (b) =>
        (b.atom1 === firstCarbon && carbonAtoms.includes(b.atom2)) ||
        (b.atom2 === firstCarbon && carbonAtoms.includes(b.atom1)),
    );

    const carbonNeighbors = neighbors.filter((b) => {
      const otherAtom = b.atom1 === firstCarbon ? b.atom2 : b.atom1;
      return (
        molecule.atoms[otherAtom]?.symbol === "C" && otherAtom !== oxygenAtomIdx
      );
    });

    if (carbonNeighbors.length === 2) {
      // Check if both neighbors are CH3
      const allMethyl = carbonNeighbors.every((b) => {
        const methyl = b.atom1 === firstCarbon ? b.atom2 : b.atom1;
        const methylNeighbors = molecule.bonds.filter(
          (bond) =>
            (bond.atom1 === methyl &&
              carbonAtoms.includes(bond.atom2) &&
              bond.atom2 !== firstCarbon) ||
            (bond.atom2 === methyl &&
              carbonAtoms.includes(bond.atom1) &&
              bond.atom1 !== firstCarbon),
        );
        return methylNeighbors.length === 0;
      });

      if (allMethyl) {
        return "propan-2-yloxy";
      }
    }
  }

  // Check for 2,2-dimethylpropoxy pattern: CH2-C(CH3)3
  if (carbonCount === 5) {
    // Find if we have a CH2 attached to oxygen
    const firstCarbon = carbonAttachedToO;
    const firstCarbonBonds = molecule.bonds.filter(
      (b) =>
        (b.atom1 === firstCarbon && carbonAtoms.includes(b.atom2)) ||
        (b.atom2 === firstCarbon && carbonAtoms.includes(b.atom1)),
    );

    const firstCarbonNeighbors = firstCarbonBonds.filter((b) => {
      const otherAtom = b.atom1 === firstCarbon ? b.atom2 : b.atom1;
      return (
        molecule.atoms[otherAtom]?.symbol === "C" && otherAtom !== oxygenAtomIdx
      );
    });

    // If first carbon has only 1 carbon neighbor, check if that's a tert-butyl
    if (firstCarbonNeighbors.length === 1 && firstCarbonNeighbors[0]) {
      const secondCarbon =
        firstCarbonNeighbors[0].atom1 === firstCarbon
          ? firstCarbonNeighbors[0].atom2
          : firstCarbonNeighbors[0].atom1;

      const secondCarbonBonds = molecule.bonds.filter(
        (b) =>
          (b.atom1 === secondCarbon && carbonAtoms.includes(b.atom2)) ||
          (b.atom2 === secondCarbon && carbonAtoms.includes(b.atom1)),
      );

      const secondCarbonNeighbors = secondCarbonBonds.filter((b) => {
        const otherAtom = b.atom1 === secondCarbon ? b.atom2 : b.atom1;
        return (
          molecule.atoms[otherAtom]?.symbol === "C" && otherAtom !== firstCarbon
        );
      });

      // If second carbon has 3 carbon neighbors, it's 2,2-dimethylpropoxy
      if (secondCarbonNeighbors.length === 3) {
        const allMethyl = secondCarbonNeighbors.every((b) => {
          const methyl = b.atom1 === secondCarbon ? b.atom2 : b.atom1;
          const methylNeighbors = molecule.bonds.filter(
            (bond) =>
              (bond.atom1 === methyl &&
                carbonAtoms.includes(bond.atom2) &&
                bond.atom2 !== secondCarbon) ||
              (bond.atom2 === methyl &&
                carbonAtoms.includes(bond.atom1) &&
                bond.atom1 !== secondCarbon),
          );
          return methylNeighbors.length === 0;
        });

        if (allMethyl) {
          return "2,2-dimethylpropoxy";
        }
      }
    }
  }

  // For simple linear chains, use standard alkyl names
  let baseName: string;
  if (carbonCount === 1) {
    baseName = "methoxy";
  } else if (carbonCount === 2) {
    baseName = "ethoxy";
  } else if (carbonCount === 3) {
    baseName = "propoxy";
  } else if (carbonCount === 4) {
    baseName = "butoxy";
  } else if (carbonCount === 5) {
    baseName = "pentoxy";
  } else if (carbonCount === 6) {
    baseName = "hexoxy";
  } else {
    baseName = getAlkaneBaseName(carbonCount) + "oxy";
  }

  return baseName;
}
