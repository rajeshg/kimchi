import type { Molecule } from "../../../types";
import { buildRingSubstituentAlkylName } from "./ring-substituent-naming";
import { analyzeRings } from "src/utils/ring-analysis";

/**
 * Build functional class name for ester with ring-based alkyl group
 * Example: CC(C)C1(CC(C(O1)(C)C)C(=O)C)OC(=O)C
 * Expected: (4-acetyl-5,5-dimethyl-2-propan-2-yloxolan-2-yl)acetate
 */
export function buildEsterWithRingAlkylGroup(
  parentStructure: any,
  esterGroup: any,
  molecule: any,
  functionalGroups: any[],
): string {
  // For functional class nomenclature, build: (ring-with-all-substituents-yl)alkanoate
  // Example: (4-acetyl-5,5-dimethyl-2-propan-2-yloxolan-2-yl)acetate

  if (process.env.VERBOSE) {
    console.log(
      "[buildEsterWithRingAlkylGroup] functionalGroups:",
      functionalGroups.map((fg) => ({
        type: fg.type,
        isPrincipal: fg.isPrincipal,
        prefix: fg.prefix,
      })),
    );
  }

  // Get all substituents from parent structure
  const parentSubstituents = parentStructure.substituents || [];

  // Get functional group substituents (non-ester, as prefixes)
  const fgSubstituents = functionalGroups
    .filter((fg) => fg.type !== "ester" && fg.type !== "alkoxy" && fg.prefix)
    .map((fg) => ({
      type: fg.type,
      name: fg.prefix || fg.type,
      locant: fg.locant || (fg.locants && fg.locants[0]) || 0,
      prefix: fg.prefix,
    }));

  // Combine all substituents
  const allSubstituents = [...fgSubstituents, ...parentSubstituents];

  if (process.env.VERBOSE) {
    console.log(
      "[buildEsterWithRingAlkylGroup] parentSubstituents:",
      parentSubstituents,
    );
    console.log(
      "[buildEsterWithRingAlkylGroup] fgSubstituents:",
      fgSubstituents,
    );
    console.log(
      "[buildEsterWithRingAlkylGroup] allSubstituents:",
      allSubstituents,
    );
  }

  // Sort substituents by locant
  allSubstituents.sort((a: any, b: any) => (a.locant || 0) - (b.locant || 0));

  // Group identical substituents
  const groupedSubstituents = new Map<
    string,
    { locants: number[]; name: string }
  >();
  for (const sub of allSubstituents) {
    const key = sub.name || sub.type;
    if (!groupedSubstituents.has(key)) {
      groupedSubstituents.set(key, { locants: [], name: key });
    }
    groupedSubstituents.get(key)!.locants.push(sub.locant || 0);
  }

  // Build substituent parts
  const substituentParts: string[] = [];
  for (const [_, group] of groupedSubstituents) {
    const locantStr = group.locants.join(",");
    const multiplier =
      group.locants.length > 1 ? getMultiplier(group.locants.length) : "";
    substituentParts.push(`${locantStr}-${multiplier}${group.name}`);
  }

  // Get ring name
  const ringName = parentStructure.name || "ring";

  // Functional class: ring name ends with -yl suffix
  const ringBaseName = ringName.replace(/e$/, ""); // oxolane → oxolan
  const alkylGroupName =
    substituentParts.length > 0
      ? `${substituentParts.join("-")}-${ringBaseName}-yl`
      : `${ringBaseName}-yl`;

  // Extract the acyl portion (C=O side) length
  const acylLength = getAcylChainLength(esterGroup, molecule);
  const acylName = getAlkanoateName(acylLength);

  if (process.env.VERBOSE) {
    console.log(
      "[buildEsterWithRingAlkylGroup] alkylGroupName:",
      alkylGroupName,
    );
    console.log("[buildEsterWithRingAlkylGroup] acylLength:", acylLength);
    console.log("[buildEsterWithRingAlkylGroup] acylName:", acylName);
  }

  // Functional class format: (alkyl)alkanoate
  return `(${alkylGroupName})${acylName}`;
}

/**
 * Get multiplicity prefix (di, tri, tetra, etc.)
 */
export function getMultiplier(count: number): string {
  const prefixes = [
    "",
    "",
    "di",
    "tri",
    "tetra",
    "penta",
    "hexa",
    "hepta",
    "octa",
    "nona",
    "deca",
  ];
  return count < prefixes.length ? (prefixes[count] ?? "") : `${count}-`;
}

/**
 * Get the length of the acyl chain (C=O side of the ester)
 */
export function getAcylChainLength(esterGroup: any, molecule: any): number {
  if (!esterGroup.atoms || esterGroup.atoms.length < 3) return 1;

  const carbonylCarbon = esterGroup.atoms[0] as unknown as number;
  const esterOxygen = esterGroup.atoms[2] as unknown as number;

  // BFS from carbonyl carbon, avoiding ester oxygen
  const visited = new Set<number>();
  const queue = [carbonylCarbon];
  let carbonCount = 0;

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    if (visited.has(currentId)) continue;
    visited.add(currentId);

    const currentAtom = molecule.atoms[currentId];
    if (currentAtom?.symbol === "C") {
      carbonCount++;

      // Find neighbors
      for (const bond of molecule.bonds) {
        if (bond.atom1 === currentId || bond.atom2 === currentId) {
          const otherId = bond.atom1 === currentId ? bond.atom2 : bond.atom1;

          // Don't cross the ester oxygen
          if (otherId === esterOxygen) continue;

          const otherAtom = molecule.atoms[otherId];
          if (otherAtom?.symbol === "C" && !visited.has(otherId)) {
            queue.push(otherId);
          }
        }
      }
    }
  }

  return carbonCount;
}

/**
 * Convert carbon chain length to alkanoate name
 */
export function getAlkanoateName(length: number): string {
  const prefixes = [
    "",
    "meth",
    "eth",
    "prop",
    "but",
    "pent",
    "hex",
    "hept",
    "oct",
    "non",
    "dec",
  ];
  if (length < prefixes.length) {
    return `${prefixes[length]}anoate`;
  }
  return `C${length}-alkanoate`;
}

/**
 * Build ester name when ring is on acyl side
 * Example: CC(C)COC(=O)C1CCCC1 → "2-methylpropyl cyclopentanecarboxylate"
 */
export function buildEsterWithRingAcylGroup(
  parentStructure: any,
  esterGroup: any,
  molecule: any,
  functionalGroups: any[],
): string {
  if (process.env.VERBOSE) {
    console.log(
      "[buildEsterWithRingAcylGroup] parentStructure:",
      parentStructure,
    );
  }

  // Get ring name
  const ringName = parentStructure.name || "ring";
  const isAromatic = parentStructure.ring?.type === "aromatic";

  // For aromatic rings with carboxylate, use special naming
  if (isAromatic && ringName.includes("benzen")) {
    // benzoate for benzene ring
    const acylName = "benzoate";

    // Now find the alkoxy group
    const alkoxyName = getAlkoxyGroupName(
      esterGroup,
      molecule,
      functionalGroups,
    );

    if (process.env.VERBOSE) {
      console.log("[buildEsterWithRingAcylGroup] aromatic acylName:", acylName);
      console.log("[buildEsterWithRingAcylGroup] alkoxyName:", alkoxyName);
    }

    return `${alkoxyName} ${acylName}`;
  }

  // For non-aromatic rings: cyclo[ring]carboxylate
  // cyclopentane → cyclopentanecarboxylate
  const ringBaseName = ringName; // keep as-is (e.g., "cyclopentane")
  const acylName = `${ringBaseName}carboxylate`;

  // Now find the alkoxy group
  const alkoxyName = getAlkoxyGroupName(esterGroup, molecule, functionalGroups);

  if (process.env.VERBOSE) {
    console.log("[buildEsterWithRingAcylGroup] ringBaseName:", ringBaseName);
    console.log("[buildEsterWithRingAcylGroup] acylName:", acylName);
    console.log("[buildEsterWithRingAcylGroup] alkoxyName:", alkoxyName);
  }

  return `${alkoxyName} ${acylName}`;
}

/**
 * Detect if an atom is part of an amide group (C=O-N)
 * Returns { carbonylC, nitrogen } or null
 */
function detectAmideGroup(
  atomId: number,
  molecule: Molecule,
  visited: Set<number> = new Set(),
): { carbonylC: number; nitrogen: number } | null {
  const atom = molecule.atoms[atomId];
  if (!atom) return null;

  // Prevent infinite recursion
  if (visited.has(atomId)) {
    if (process.env.VERBOSE) {
      console.log(
        `[detectAmideGroup] Already visited atom ${atomId}, skipping`,
      );
    }
    return null;
  }
  visited.add(atomId);

  if (process.env.VERBOSE) {
    console.log(`[detectAmideGroup] Checking atom ${atomId} (${atom.symbol})`);
  }

  // If this is already a carbonyl carbon, check for amide pattern
  if (atom.symbol === "C") {
    let hasDoubleBondToO = false;
    for (const bond of molecule.bonds) {
      if (bond.type === "double") {
        if (
          (bond.atom1 === atomId &&
            molecule.atoms[bond.atom2]?.symbol === "O") ||
          (bond.atom2 === atomId && molecule.atoms[bond.atom1]?.symbol === "O")
        ) {
          hasDoubleBondToO = true;
          break;
        }
      }
    }

    if (process.env.VERBOSE && hasDoubleBondToO) {
      console.log(`[detectAmideGroup] Atom ${atomId} has C=O`);
    }

    // If this carbon has C=O, check if it's an amide (also has C-N)
    if (hasDoubleBondToO) {
      for (const bond of molecule.bonds) {
        if (bond.type === "single") {
          if (
            bond.atom1 === atomId &&
            molecule.atoms[bond.atom2]?.symbol === "N"
          ) {
            if (process.env.VERBOSE) {
              console.log(
                `[detectAmideGroup] Found amide: C=${atomId}, N=${bond.atom2}`,
              );
            }
            return { carbonylC: atomId, nitrogen: bond.atom2 };
          } else if (
            bond.atom2 === atomId &&
            molecule.atoms[bond.atom1]?.symbol === "N"
          ) {
            if (process.env.VERBOSE) {
              console.log(
                `[detectAmideGroup] Found amide: C=${atomId}, N=${bond.atom1}`,
              );
            }
            return { carbonylC: atomId, nitrogen: bond.atom1 };
          }
        }
      }
      // Has C=O but no N, not an amide
      return null;
    }

    // This carbon doesn't have C=O, check neighbors
    const neighbors: number[] = [];
    for (const bond of molecule.bonds) {
      if (bond.type === "single") {
        let neighborId: number | undefined;
        if (bond.atom1 === atomId) neighborId = bond.atom2;
        else if (bond.atom2 === atomId) neighborId = bond.atom1;

        if (neighborId !== undefined) {
          neighbors.push(neighborId);
          const neighbor = molecule.atoms[neighborId];
          if (process.env.VERBOSE) {
            console.log(
              `[detectAmideGroup] Neighbor ${neighborId}: ${neighbor?.symbol || "undefined"}`,
            );
          }
          if (neighbor?.symbol === "C") {
            if (process.env.VERBOSE) {
              console.log(
                `[detectAmideGroup] Recursing to neighbor ${neighborId}`,
              );
            }
            const check = detectAmideGroup(neighborId, molecule, visited);
            if (check) return check;
          }
        }
      }
    }

    if (process.env.VERBOSE) {
      console.log(
        `[detectAmideGroup] No amide found from atom ${atomId}, checked ${neighbors.length} neighbors`,
      );
    }
  }

  return null;
}

/**
 * Build complex alkoxy name when amide group is attached
 * Pattern: [2-methyl-1-[4-nitro-3-(trifluoromethyl)anilino]-1-oxopropan-2-yl]
 */
function buildComplexAlkoxyWithAmide(
  alkoxyCarbonId: number,
  esterOxygenId: number,
  amideInfo: { carbonylC: number; nitrogen: number },
  molecule: Molecule,
): string | null {
  if (process.env.VERBOSE) {
    console.log(
      "[buildComplexAlkoxyWithAmide] alkoxyCarbonId:",
      alkoxyCarbonId,
    );
    console.log("[buildComplexAlkoxyWithAmide] amideInfo:", amideInfo);
  }

  // Build the alkoxy chain structure
  // The alkoxyCarbonId is the central carbon (propan-2-yl in the example)
  // Find all substituents on this carbon
  const substituents: Array<{
    type: string;
    name: string;
    locant: number;
    atomId: number;
  }> = [];

  // Get all neighbors of alkoxy carbon
  const neighbors: number[] = [];
  for (const bond of molecule.bonds) {
    if (bond.type === "single") {
      if (bond.atom1 === alkoxyCarbonId && bond.atom2 !== esterOxygenId) {
        neighbors.push(bond.atom2);
      } else if (
        bond.atom2 === alkoxyCarbonId &&
        bond.atom1 !== esterOxygenId
      ) {
        neighbors.push(bond.atom1);
      }
    }
  }

  if (process.env.VERBOSE) {
    console.log(
      "[buildComplexAlkoxyWithAmide] neighbors of alkoxyCarbonId:",
      neighbors,
    );
  }

  // Classify neighbors: methyl branches, amide carbonyl, etc.
  let chainLength = 1; // Start with the alkoxy carbon itself
  const methylGroups: number[] = [];
  let amideCarbonylId: number | undefined;

  for (const nId of neighbors) {
    const nAtom = molecule.atoms[nId];
    if (!nAtom) continue;

    if (nAtom.symbol === "C") {
      // Check if this is the amide carbonyl
      if (nId === amideInfo.carbonylC) {
        amideCarbonylId = nId;
        chainLength++; // The amide carbonyl is part of the main chain
      } else {
        // Check if it's a terminal methyl (degree 1 or only connected to alkoxy carbon)
        const degree = molecule.bonds.filter(
          (b) => b.atom1 === nId || b.atom2 === nId,
        ).length;
        if (degree === 1) {
          methylGroups.push(nId);
        } else {
          // Could be part of a longer chain - for now, treat as methyl
          methylGroups.push(nId);
        }
      }
    }
  }

  // If we have multiple methyls, one should be counted as chain extension
  if (methylGroups.length === 2) {
    chainLength++; // One methyl extends the chain to make it propan
    methylGroups.pop(); // Remove one from the methyl groups list
  }

  if (!amideCarbonylId) {
    if (process.env.VERBOSE) {
      console.log(
        "[buildComplexAlkoxyWithAmide] No amide carbonyl found as direct neighbor",
      );
    }
    return null;
  }

  // Now analyze the aromatic ring attached to the amide nitrogen
  const nitrogenId = amideInfo.nitrogen;
  let aromaticRingAtomId: number | undefined;

  for (const bond of molecule.bonds) {
    if (bond.type === "single") {
      if (bond.atom1 === nitrogenId) {
        const neighbor = molecule.atoms[bond.atom2];
        if (neighbor?.symbol === "C" && neighbor.aromatic) {
          aromaticRingAtomId = bond.atom2;
          break;
        }
      } else if (bond.atom2 === nitrogenId) {
        const neighbor = molecule.atoms[bond.atom1];
        if (neighbor?.symbol === "C" && neighbor.aromatic) {
          aromaticRingAtomId = bond.atom1;
          break;
        }
      }
    }
  }

  if (!aromaticRingAtomId) {
    if (process.env.VERBOSE) {
      console.log("[buildComplexAlkoxyWithAmide] No aromatic ring found");
    }
    return null;
  }

  // Find ring substituents
  const ringSubstituents = findRingSubstituents(
    aromaticRingAtomId,
    nitrogenId,
    molecule,
  );

  // Build the anilino part: [4-nitro-3-(trifluoromethyl)anilino]
  const anilinoPart = buildAnilinoPart(ringSubstituents);

  // Build the complete name
  // Pattern: [2-methyl-1-[anilino]-1-oxopropan-2-yl]
  // Numbering: alkoxy carbon is position 2, amide carbonyl is position 1
  const parts: string[] = [];

  // Methyl substituents at position 2
  if (methylGroups.length > 0) {
    if (methylGroups.length === 1) {
      parts.push("2-methyl");
    } else if (methylGroups.length === 2) {
      parts.push("2,2-dimethyl");
    }
  }

  // Anilino substituent at position 1
  parts.push(`1-[${anilinoPart}]`);

  // Oxo group at position 1
  parts.push("1-oxo");

  // Base name: propan-2-yl (3 carbons total: 2 methyls counted as branches + alkoxy C + amide C = but we need to count properly)
  // Actually: alkoxy carbon + amide carbon = 2 carbons in main chain, plus the connection point
  // Wait, let's reconsider: position 1 = amide C, position 2 = alkoxy C
  // So we have a 2-carbon chain + 1 for connection = propan
  const baseName =
    chainLength === 1 ? "methan" : chainLength === 2 ? "ethan" : "propan";

  // Alphabetical order for substituents
  parts.sort((a, b) => {
    const aName = a.replace(/^[0-9,[\]-]+-/, "");
    const bName = b.replace(/^[0-9,[\]-]+-/, "");
    return aName.localeCompare(bName);
  });

  const fullName = `[${parts.join("-")}${baseName}-2-yl]`;

  if (process.env.VERBOSE) {
    console.log("[buildComplexAlkoxyWithAmide] Built name:", fullName);
  }

  return fullName;
}

/**
 * Find substituents on an aromatic ring
 */
function findRingSubstituents(
  attachmentAtomId: number,
  nitrogenId: number,
  molecule: Molecule,
): Array<{ position: number; name: string }> {
  // Find all atoms in the aromatic ring
  const ringAtoms = findAromaticRingAtoms(attachmentAtomId, molecule);

  if (process.env.VERBOSE) {
    console.log("[findRingSubstituents] ringAtoms:", ringAtoms);
  }

  // Number the ring positions (1 = attachment point)
  // Walk around the ring sequentially to assign positions
  const positionMap = new Map<number, number>();
  positionMap.set(attachmentAtomId, 1);

  // Build adjacency list for ring atoms
  const adjacency = new Map<number, number[]>();
  for (const atomId of ringAtoms) {
    adjacency.set(atomId, []);
  }

  for (const bond of molecule.bonds) {
    if (
      bond.type === "aromatic" ||
      (bond.type === "single" &&
        molecule.atoms[bond.atom1]?.aromatic &&
        molecule.atoms[bond.atom2]?.aromatic)
    ) {
      if (ringAtoms.includes(bond.atom1) && ringAtoms.includes(bond.atom2)) {
        adjacency.get(bond.atom1)!.push(bond.atom2);
        adjacency.get(bond.atom2)!.push(bond.atom1);
      }
    }
  }

  // Walk around the ring from the attachment point
  const ordered: number[] = [attachmentAtomId];
  const visited = new Set<number>([attachmentAtomId]);
  let current = attachmentAtomId;

  while (ordered.length < ringAtoms.length) {
    const neighbors = adjacency.get(current) || [];
    let nextAtom: number | undefined;

    // Find the first unvisited neighbor
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor) && ringAtoms.includes(neighbor)) {
        nextAtom = neighbor;
        break;
      }
    }

    if (nextAtom === undefined) break;

    ordered.push(nextAtom);
    visited.add(nextAtom);
    current = nextAtom;
  }

  // Assign positions based on ordered walk
  for (let i = 0; i < ordered.length; i++) {
    positionMap.set(ordered[i]!, i + 1);
  }

  // Find substituents on each ring atom
  const substituents: Array<{ position: number; name: string }> = [];

  for (const atomId of ringAtoms) {
    const position = positionMap.get(atomId);
    if (!position) continue;

    // Check neighbors for substituents
    for (const bond of molecule.bonds) {
      if (bond.type !== "single") continue;

      let neighborId: number | undefined;
      if (bond.atom1 === atomId) neighborId = bond.atom2;
      else if (bond.atom2 === atomId) neighborId = bond.atom1;

      if (neighborId === undefined || neighborId === nitrogenId) continue;

      const neighbor = molecule.atoms[neighborId];
      if (!neighbor || ringAtoms.includes(neighborId)) continue;

      // Identify substituent type
      if (neighbor.symbol === "N" && neighbor.charge === 1) {
        // Nitro group
        substituents.push({ position, name: "nitro" });
      } else if (neighbor.symbol === "C") {
        // Check for trifluoromethyl
        const fluorines: number[] = [];
        for (const b2 of molecule.bonds) {
          if (b2.type === "single") {
            let fId: number | undefined;
            if (
              b2.atom1 === neighborId &&
              molecule.atoms[b2.atom2]?.symbol === "F"
            )
              fId = b2.atom2;
            else if (
              b2.atom2 === neighborId &&
              molecule.atoms[b2.atom1]?.symbol === "F"
            )
              fId = b2.atom1;
            if (fId !== undefined) fluorines.push(fId);
          }
        }

        if (fluorines.length === 3) {
          substituents.push({ position, name: "trifluoromethyl" });
        }
      }
    }
  }

  if (process.env.VERBOSE) {
    console.log("[findRingSubstituents] substituents:", substituents);
  }

  return substituents;
}

/**
 * Find all atoms in an aromatic ring starting from one atom
 */
function findAromaticRingAtoms(
  startAtomId: number,
  molecule: Molecule,
): number[] {
  const ringAtoms: number[] = [];
  const visited = new Set<number>();
  const queue = [startAtomId];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    if (visited.has(currentId)) continue;
    visited.add(currentId);

    const currentAtom = molecule.atoms[currentId];
    if (currentAtom?.aromatic) {
      ringAtoms.push(currentId);

      // Find aromatic neighbors
      for (const bond of molecule.bonds) {
        if (bond.type === "aromatic" || bond.type === "single") {
          let neighborId: number | undefined;
          if (bond.atom1 === currentId) neighborId = bond.atom2;
          else if (bond.atom2 === currentId) neighborId = bond.atom1;

          if (neighborId !== undefined && !visited.has(neighborId)) {
            const neighbor = molecule.atoms[neighborId];
            if (neighbor?.aromatic) {
              queue.push(neighborId);
            }
          }
        }
      }
    }
  }

  return ringAtoms;
}

/**
 * Build anilino part with substituents
 * Example: 4-nitro-3-(trifluoromethyl)anilino
 */
function buildAnilinoPart(
  substituents: Array<{ position: number; name: string }>,
): string {
  if (substituents.length === 0) {
    return "anilino";
  }

  // Build parts with positions
  const parts: string[] = [];
  for (const sub of substituents) {
    const name = sub.name;
    // Complex substituents in parentheses
    if (name.includes("trifluoro") || name.includes("dimethyl")) {
      parts.push(`${sub.position}-(${name})`);
    } else {
      parts.push(`${sub.position}-${name}`);
    }
  }

  // Sort alphabetically by substituent name
  parts.sort((a, b) => {
    const aName = a.replace(/^\d+-\(?/, "").replace(/\)?$/, "");
    const bName = b.replace(/^\d+-\(?/, "").replace(/\)?$/, "");
    return aName.localeCompare(bName);
  });

  return `${parts.join("-")}anilino`;
}

/**
 * Get the alkoxy group name from an ester
 * Walks from ester oxygen to find the alkoxy chain
 */
export function getAlkoxyGroupName(
  esterGroup: any,
  molecule: Molecule,
  functionalGroups?: any[],
): string {
  // Find carbonyl carbon and ester oxygen
  let carbonylCarbonId: number | undefined;
  let esterOxygenId: number | undefined;

  if (esterGroup.atoms && esterGroup.atoms.length >= 2) {
    // Find carbonyl carbon
    // Note: esterGroup.atoms can be either atom IDs (numbers) or atom objects
    for (const atomOrId of esterGroup.atoms) {
      const atomId = typeof atomOrId === "number" ? atomOrId : atomOrId.id;
      const atom = molecule.atoms[atomId];
      if (atom?.symbol === "C") {
        const hasDoubleBondToO = molecule.bonds.some(
          (bond: any) =>
            bond.type === "double" &&
            ((bond.atom1 === atomId &&
              molecule.atoms[bond.atom2]?.symbol === "O") ||
              (bond.atom2 === atomId &&
                molecule.atoms[bond.atom1]?.symbol === "O")),
        );
        if (hasDoubleBondToO) {
          carbonylCarbonId = atomId;
          break;
        }
      }
    }

    // Find ester oxygen
    if (carbonylCarbonId !== undefined) {
      for (const atomOrId of esterGroup.atoms) {
        const atomId = typeof atomOrId === "number" ? atomOrId : atomOrId.id;
        const atom = molecule.atoms[atomId];
        if (atom?.symbol === "O") {
          const isSingleBonded = molecule.bonds.some(
            (bond: any) =>
              bond.type === "single" &&
              ((bond.atom1 === carbonylCarbonId && bond.atom2 === atomId) ||
                (bond.atom2 === carbonylCarbonId && bond.atom1 === atomId)),
          );
          if (isSingleBonded) {
            esterOxygenId = atomId;
            break;
          }
        }
      }
    }
  }

  if (!esterOxygenId) {
    return "alkyl";
  }

  // Find alkoxy carbon (carbon bonded to ester oxygen, not carbonyl carbon)
  let alkoxyCarbonId: number | undefined;
  for (const bond of molecule.bonds) {
    if (bond.type === "single") {
      const atom1 = molecule.atoms[bond.atom1];
      const atom2 = molecule.atoms[bond.atom2];

      if (
        bond.atom1 === esterOxygenId &&
        atom2?.symbol === "C" &&
        bond.atom2 !== carbonylCarbonId
      ) {
        alkoxyCarbonId = bond.atom2;
        break;
      } else if (
        bond.atom2 === esterOxygenId &&
        atom1?.symbol === "C" &&
        bond.atom1 !== carbonylCarbonId
      ) {
        alkoxyCarbonId = bond.atom1;
        break;
      }
    }
  }

  if (alkoxyCarbonId === undefined || esterOxygenId === undefined) {
    return "alkyl";
  }

  // **COMPLEX ESTER CHECK**: Check if alkoxy carbon is connected to an amide group
  // Pattern: R-O-C(R')(R'')(C(=O)N-Ar) where Ar is an aromatic ring
  const amideCheck = detectAmideGroup(alkoxyCarbonId, molecule);

  if (amideCheck) {
    // Found an amide group attached to the alkoxy carbon
    // This requires complex nomenclature: [substituents-anilino-oxo-yl]alkanoate
    if (process.env.VERBOSE) {
      console.log(
        "[getAlkoxyGroupName] Detected amide group at alkoxy carbon:",
        amideCheck,
      );
    }

    const complexName = buildComplexAlkoxyWithAmide(
      alkoxyCarbonId,
      esterOxygenId,
      amideCheck,
      molecule,
    );
    if (complexName) {
      return complexName;
    }
    // Fall through to regular logic if complex naming fails
  }

  // BFS from alkoxy carbon to find chain length and branches
  const visited = new Set<number>();
  const queue: Array<{ id: number; parent: number | null }> = [
    { id: alkoxyCarbonId, parent: esterOxygenId },
  ];
  const carbonChain: number[] = [];
  const branches = new Map<number, number[]>(); // position -> branch carbon IDs
  const alkoxyCarbonIds = new Set<number>();

  if (process.env.VERBOSE) {
    console.log(
      "[getAlkoxyGroupName] Starting BFS from alkoxyCarbonId:",
      alkoxyCarbonId,
    );
  }

  while (queue.length > 0) {
    const { id: currentId, parent: parentId } = queue.shift()!;
    if (visited.has(currentId)) continue;
    visited.add(currentId);

    const currentAtom = molecule.atoms[currentId];
    if (currentAtom?.symbol === "C") {
      carbonChain.push(currentId);
      alkoxyCarbonIds.add(currentId);

      if (process.env.VERBOSE) {
        console.log(
          `[getAlkoxyGroupName] Visiting carbon ${currentId}, chain position ${carbonChain.length}`,
        );
      }

      // Find neighbors
      const neighbors: number[] = [];
      for (const bond of molecule.bonds) {
        if (bond.type === "single") {
          if (bond.atom1 === currentId) {
            const otherId = bond.atom2;
            if (
              otherId !== parentId &&
              otherId !== esterOxygenId &&
              molecule.atoms[otherId]?.symbol === "C"
            ) {
              neighbors.push(otherId);
            }
          } else if (bond.atom2 === currentId) {
            const otherId = bond.atom1;
            if (
              otherId !== parentId &&
              otherId !== esterOxygenId &&
              molecule.atoms[otherId]?.symbol === "C"
            ) {
              neighbors.push(otherId);
            }
          }
        }
      }

      if (process.env.VERBOSE) {
        console.log(
          `[getAlkoxyGroupName] Found ${neighbors.length} neighbors:`,
          neighbors,
        );
      }

      // If more than 1 neighbor, we have branching
      if (neighbors.length > 1) {
        // First neighbor is main chain continuation, rest are branches
        const firstNeighbor = neighbors[0];
        if (firstNeighbor !== undefined) {
          queue.push({ id: firstNeighbor, parent: currentId });
        }
        for (let i = 1; i < neighbors.length; i++) {
          const branchNeighbor = neighbors[i];
          if (branchNeighbor !== undefined) {
            if (!branches.has(carbonChain.length)) {
              branches.set(carbonChain.length, []);
            }
            branches.get(carbonChain.length)!.push(branchNeighbor);

            // IMPORTANT: Also add branch to queue so it gets visited and added to alkoxyCarbonIds
            queue.push({ id: branchNeighbor, parent: currentId });

            if (process.env.VERBOSE) {
              console.log(
                `[getAlkoxyGroupName] Recording branch ${branchNeighbor} at chain position ${carbonChain.length}`,
              );
            }
          }
        }
      } else if (neighbors.length === 1) {
        const neighbor = neighbors[0];
        if (neighbor !== undefined) {
          queue.push({ id: neighbor, parent: currentId });
        }
      }
    }
  }

  // **RING DETECTION INTEGRATION POINT**
  // Check if the alkoxy group contains any rings
  const ringInfo = analyzeRings(molecule);
  const ringsInAlkoxy: number[][] = [];

  if (process.env.VERBOSE) {
    console.log(
      "[getAlkoxyGroupName] BFS complete. alkoxyCarbonIds:",
      Array.from(alkoxyCarbonIds),
    );
    console.log(
      "[getAlkoxyGroupName] Total rings in molecule:",
      ringInfo.rings.length,
    );
    for (let i = 0; i < ringInfo.rings.length; i++) {
      console.log(`[getAlkoxyGroupName] Ring ${i}:`, ringInfo.rings[i]);
    }
  }

  for (const ring of ringInfo.rings) {
    const ringIntersection = ring.filter((atomId) =>
      alkoxyCarbonIds.has(atomId),
    );
    if (process.env.VERBOSE) {
      console.log(
        `[getAlkoxyGroupName] Ring ${ringInfo.rings.indexOf(ring)} intersection:`,
        ringIntersection,
        `(length ${ringIntersection.length})`,
      );
    }
    if (ringIntersection.length >= 3) {
      ringsInAlkoxy.push(ring);
    }
  }

  if (process.env.VERBOSE) {
    console.log("[getAlkoxyGroupName] ringsInAlkoxy:", ringsInAlkoxy);
  }

  // If rings detected, use ring-based naming
  if (ringsInAlkoxy.length > 0) {
    const ringName = buildRingSubstituentAlkylName(
      alkoxyCarbonId,
      esterOxygenId,
      molecule,
    );
    if (ringName) {
      if (process.env.VERBOSE) {
        console.log("[getAlkoxyGroupName] Using ring-based name:", ringName);
      }
      return ringName;
    }
  }

  // Fall back to chain-only logic if no rings or ring naming failed
  // Build alkoxy name
  const chainLength = carbonChain.length;

  // **DETECT SUBSTITUENTS ON ALKOXY CHAIN**
  type AlkoxySubstituent = {
    position: number;
    name: string;
    type: string;
  };
  const alkoxySubstituents: AlkoxySubstituent[] = [];

  if (process.env.VERBOSE) {
    console.log(
      "[getAlkoxyGroupName] functionalGroups provided:",
      functionalGroups ? functionalGroups.length : "none",
    );
    if (functionalGroups) {
      for (const fg of functionalGroups) {
        console.log(
          "[getAlkoxyGroupName] FG:",
          fg.type,
          "prefix:",
          fg.prefix,
          "atoms:",
          fg.atoms,
        );
      }
    }
    console.log(
      "[getAlkoxyGroupName] alkoxyCarbonIds:",
      Array.from(alkoxyCarbonIds),
    );
    console.log("[getAlkoxyGroupName] carbonChain:", carbonChain);
  }

  // 1. Detect acyloxy substituents (nested esters converted to acyloxy)
  if (functionalGroups) {
    for (const fg of functionalGroups) {
      if (fg.type === "acyloxy" && fg.atoms && fg.prefix) {
        // Find the attachment point: oxygen atom connected to alkoxy chain
        for (const fgAtomObj of fg.atoms) {
          // Extract atom ID from Atom object or use directly if it's a number
          const fgAtomId =
            typeof fgAtomObj === "number" ? fgAtomObj : fgAtomObj.id;
          const fgAtom = molecule.atoms[fgAtomId];
          if (fgAtom?.symbol === "O") {
            // Check if this oxygen is bonded to any carbon in the alkoxy chain
            for (const bond of molecule.bonds) {
              if (bond.type === "single") {
                let alkoxyChainCarbon: number | undefined;
                if (
                  bond.atom1 === fgAtomId &&
                  alkoxyCarbonIds.has(bond.atom2)
                ) {
                  alkoxyChainCarbon = bond.atom2;
                } else if (
                  bond.atom2 === fgAtomId &&
                  alkoxyCarbonIds.has(bond.atom1)
                ) {
                  alkoxyChainCarbon = bond.atom1;
                }

                if (alkoxyChainCarbon !== undefined) {
                  // Found attachment point! Determine position in chain
                  const position = carbonChain.indexOf(alkoxyChainCarbon) + 1;
                  if (position > 0) {
                    alkoxySubstituents.push({
                      position,
                      name: fg.prefix,
                      type: "acyloxy",
                    });
                    if (process.env.VERBOSE) {
                      console.log(
                        `[getAlkoxyGroupName] Found acyloxy substituent "${fg.prefix}" at position ${position}`,
                      );
                    }
                  }
                  break;
                }
              }
            }
          }
        }
      }
    }
  }

  // 2. Detect alkoxy (ether) substituents
  if (functionalGroups) {
    for (const fg of functionalGroups) {
      if (fg.type === "alkoxy" && fg.atoms && fg.prefix) {
        // Find the attachment point: oxygen atom connected to alkoxy chain
        for (const fgAtomObj of fg.atoms) {
          // Extract atom ID from Atom object or use directly if it's a number
          const fgAtomId =
            typeof fgAtomObj === "number" ? fgAtomObj : fgAtomObj.id;
          const fgAtom = molecule.atoms[fgAtomId];
          if (fgAtom?.symbol === "O") {
            // Check if this oxygen is bonded to any carbon in the alkoxy chain
            for (const bond of molecule.bonds) {
              if (bond.type === "single") {
                let alkoxyChainCarbon: number | undefined;
                if (
                  bond.atom1 === fgAtomId &&
                  alkoxyCarbonIds.has(bond.atom2)
                ) {
                  alkoxyChainCarbon = bond.atom2;
                } else if (
                  bond.atom2 === fgAtomId &&
                  alkoxyCarbonIds.has(bond.atom1)
                ) {
                  alkoxyChainCarbon = bond.atom1;
                }

                if (alkoxyChainCarbon !== undefined) {
                  // Found attachment point! Determine position in chain
                  const position = carbonChain.indexOf(alkoxyChainCarbon) + 1;
                  if (position > 0) {
                    alkoxySubstituents.push({
                      position,
                      name: fg.prefix,
                      type: "alkoxy",
                    });
                    if (process.env.VERBOSE) {
                      console.log(
                        `[getAlkoxyGroupName] Found alkoxy substituent "${fg.prefix}" at position ${position}`,
                      );
                    }
                  }
                  break;
                }
              }
            }
          }
        }
      }
    }
  }

  // 3. Check each carbon in the alkoxy chain for O-Si groups (silyloxy substituents)
  type SilyloxySubstituent = {
    position: number;
    oxygenId: number;
    siliconId: number;
    methylCount: number;
    name: string;
  };
  const silyloxySubstituents: SilyloxySubstituent[] = [];

  for (let i = 0; i < carbonChain.length; i++) {
    const carbonId = carbonChain[i];
    if (carbonId === undefined) continue;

    // Find oxygen atoms connected to this carbon
    for (const bond of molecule.bonds) {
      if (bond.type === "single") {
        let oxygenId: number | undefined;

        if (
          bond.atom1 === carbonId &&
          molecule.atoms[bond.atom2]?.symbol === "O"
        ) {
          oxygenId = bond.atom2;
        } else if (
          bond.atom2 === carbonId &&
          molecule.atoms[bond.atom1]?.symbol === "O"
        ) {
          oxygenId = bond.atom1;
        }

        if (oxygenId !== undefined && oxygenId !== esterOxygenId) {
          // Found an oxygen attached to this alkoxy carbon (not the ester oxygen)
          // Check if this oxygen is connected to silicon
          for (const bond2 of molecule.bonds) {
            let siliconId: number | undefined;

            if (
              bond2.atom1 === oxygenId &&
              molecule.atoms[bond2.atom2]?.symbol === "Si"
            ) {
              siliconId = bond2.atom2;
            } else if (
              bond2.atom2 === oxygenId &&
              molecule.atoms[bond2.atom1]?.symbol === "Si"
            ) {
              siliconId = bond2.atom1;
            }

            if (siliconId !== undefined) {
              // Found O-Si group! Now count methyl groups on silicon
              let methylCount = 0;
              for (const bond3 of molecule.bonds) {
                let carbonIdOnSi: number | undefined;

                if (
                  bond3.atom1 === siliconId &&
                  molecule.atoms[bond3.atom2]?.symbol === "C"
                ) {
                  carbonIdOnSi = bond3.atom2;
                } else if (
                  bond3.atom2 === siliconId &&
                  molecule.atoms[bond3.atom1]?.symbol === "C"
                ) {
                  carbonIdOnSi = bond3.atom1;
                }

                if (carbonIdOnSi !== undefined) {
                  // Check if this carbon is a methyl (no other carbons attached)
                  const carbonNeighbors = molecule.bonds.filter(
                    (b: any) =>
                      b.atom1 === carbonIdOnSi || b.atom2 === carbonIdOnSi,
                  );
                  const hasOtherCarbons = carbonNeighbors.some((b: any) => {
                    const otherId =
                      b.atom1 === carbonIdOnSi ? b.atom2 : b.atom1;
                    return (
                      otherId !== siliconId &&
                      molecule.atoms[otherId]?.symbol === "C"
                    );
                  });

                  if (!hasOtherCarbons) {
                    methylCount++;
                  }
                }
              }

              // Build the silyloxy name based on methyl count
              let silyloxyName = "";
              if (methylCount === 1) {
                silyloxyName = "methylsilyloxy";
              } else if (methylCount === 2) {
                silyloxyName = "dimethylsilyloxy";
              } else if (methylCount === 3) {
                silyloxyName = "trimethylsilyloxy";
              } else {
                silyloxyName = "silyloxy";
              }

              silyloxySubstituents.push({
                position: i + 1, // IUPAC numbering starts at 1
                oxygenId,
                siliconId,
                methylCount,
                name: silyloxyName,
              });

              if (process.env.VERBOSE) {
                console.log(
                  `[getAlkoxyGroupName] Found ${silyloxyName} at position ${i + 1} (carbon ${carbonId})`,
                );
              }
            }
          }
        }
      }
    }
  }

  // Merge all substituents (acyloxy, alkoxy, silyloxy) for unified naming
  const allSubstituents: AlkoxySubstituent[] = [
    ...alkoxySubstituents,
    ...silyloxySubstituents.map((s) => ({
      position: s.position,
      name: s.name,
      type: "silyloxy",
    })),
  ];

  // Build prefix for all substituents
  let substituentsPrefix = "";
  if (allSubstituents.length > 0) {
    // Sort by position first, then alphabetically by name
    allSubstituents.sort((a, b) => {
      if (a.position !== b.position) return a.position - b.position;
      return a.name.localeCompare(b.name);
    });

    // Group substituents by name to detect identical substituents at different positions
    const byName = new Map<string, number[]>();
    for (const sub of allSubstituents) {
      if (!byName.has(sub.name)) {
        byName.set(sub.name, []);
      }
      byName.get(sub.name)!.push(sub.position);
    }

    // Build prefix parts with multiplicative prefixes for identical substituents
    const prefixParts: string[] = [];
    const sortedNames = Array.from(byName.keys()).sort();

    for (const name of sortedNames) {
      const positions = byName.get(name)!;
      const positionString = positions.join(",");

      if (positions.length === 1) {
        // Single substituent: "2-trimethylsilyloxy"
        prefixParts.push(`${positionString}-${name}`);
      } else {
        // Multiple identical substituents: use bis/tris/tetrakis
        const multiplicity = positions.length;
        let multiplicativePrefix = "";

        if (multiplicity === 2) {
          multiplicativePrefix = "bis";
        } else if (multiplicity === 3) {
          multiplicativePrefix = "tris";
        } else if (multiplicity === 4) {
          multiplicativePrefix = "tetrakis";
        } else if (multiplicity === 5) {
          multiplicativePrefix = "pentakis";
        } else if (multiplicity === 6) {
          multiplicativePrefix = "hexakis";
        } else {
          multiplicativePrefix = `${multiplicity}-kis`;
        }

        // For complex substituent names (containing hyphens or being compound),
        // wrap in parentheses: "2,3-bis(trimethylsilyloxy)"
        // For simple names, no parentheses needed
        const needsParentheses =
          name.includes("-") || name.includes("oxy") || name.length > 6;

        if (needsParentheses) {
          prefixParts.push(
            `${positionString}-${multiplicativePrefix}(${name})`,
          );
        } else {
          prefixParts.push(`${positionString}-${multiplicativePrefix}${name}`);
        }
      }
    }

    substituentsPrefix = prefixParts.join("-");

    if (process.env.VERBOSE) {
      console.log(
        "[getAlkoxyGroupName] Built substituentsPrefix:",
        substituentsPrefix,
      );
    }
  }

  if (branches.size === 0) {
    // Simple alkyl group (possibly with substituents)
    const alkylPrefixes = [
      "",
      "meth",
      "eth",
      "prop",
      "but",
      "pent",
      "hex",
      "hept",
      "oct",
      "non",
      "dec",
    ];
    const baseName =
      chainLength < alkylPrefixes.length
        ? `${alkylPrefixes[chainLength]}yl`
        : `C${chainLength}-alkyl`;

    if (substituentsPrefix) {
      // Determine if parentheses are needed based on substituent complexity
      // Use parentheses when:
      // 1. Multiple different substituent types (mixed substituents)
      // 2. Substituents at the same position

      // Check if all substituents are identical (same name)
      const uniqueNames = new Set(allSubstituents.map((s) => s.name));
      const hasMultipleTypes = uniqueNames.size > 1;

      // Check if any position has multiple substituents
      const positionCounts = new Map<number, number>();
      for (const sub of allSubstituents) {
        positionCounts.set(
          sub.position,
          (positionCounts.get(sub.position) || 0) + 1,
        );
      }
      const hasMultipleAtSamePosition = Array.from(
        positionCounts.values(),
      ).some((count) => count > 1);

      // Use parentheses for complex cases (mixed types or multiple at same position)
      const needsParentheses = hasMultipleTypes || hasMultipleAtSamePosition;

      if (needsParentheses) {
        return `(${substituentsPrefix}${baseName})`;
      } else {
        // Simple case: all identical substituents at different positions
        // Example: "2,3-bis(trimethylsilyloxy)propyl"
        return `${substituentsPrefix}${baseName}`;
      }
    }
    return baseName;
  } else {
    // Branched alkyl group - need to name the branches
    const branchNames: string[] = [];

    for (const [position, branchCarbons] of branches) {
      for (const branchId of branchCarbons) {
        // Simple case: assume single carbon branch (methyl)
        // Position in IUPAC starts at 1, and branch is on the NEXT carbon in chain
        branchNames.push(`${position}-methyl`);
      }
    }

    const alkylPrefixes = [
      "",
      "meth",
      "eth",
      "prop",
      "but",
      "pent",
      "hex",
      "hept",
      "oct",
      "non",
      "dec",
    ];
    const baseName =
      chainLength < alkylPrefixes.length
        ? alkylPrefixes[chainLength]
        : `C${chainLength}-alk`;

    const allSubstituents = substituentsPrefix
      ? `${substituentsPrefix}-${branchNames.join("-")}`
      : branchNames.join("-");
    // Wrap in parentheses for complex alkyl names
    return `(${allSubstituents}${baseName}yl)`;
  }
}

export function buildEsterName(
  parentStructure: any,
  esterGroup: any,
  molecule: any,
  functionalGroups: any[],
): string {
  // Ester functional class nomenclature:
  // Monoester: [alkyl] [alkanoate] (e.g., "methyl acetate")
  // Complex alkyl: (substituted-alkyl)alkanoate (e.g., "(2-butanoyloxy-2-ethoxyethyl)butanoate")
  // Diester: [dialkyl] [numbered substituents] [alkanedioate] (e.g., "dimethyl 2-propoxybutanedioate")

  if (process.env.VERBOSE) {
    console.log(
      "[buildEsterName] parentStructure:",
      JSON.stringify(parentStructure, null, 2),
    );
    console.log(
      "[buildEsterName] parentStructure.type:",
      parentStructure?.type,
    );
    console.log(
      "[buildEsterName] parentStructure.chain:",
      parentStructure?.chain,
    );
    console.log("[buildEsterName] esterGroup:", esterGroup);
  }

  // Handle ring-based structures
  // We need to determine if the ring is on the acyl side or alkoxy side
  if (parentStructure.type === "ring" && !parentStructure.chain) {
    // Check which side the ring is on by checking connectivity
    // First, let's identify the ester components
    let carbonylCarbonIdTemp: number | undefined;
    let esterOxygenIdTemp: number | undefined;

    if (esterGroup.atoms && esterGroup.atoms.length >= 2) {
      for (const atomOrId of esterGroup.atoms) {
        const atomId = typeof atomOrId === "number" ? atomOrId : atomOrId.id;
        const atom = molecule.atoms[atomId];
        if (atom?.symbol === "C") {
          const hasDoubleBondToO = molecule.bonds.some(
            (bond: any) =>
              bond.type === "double" &&
              ((bond.atom1 === atomId &&
                molecule.atoms[bond.atom2]?.symbol === "O") ||
                (bond.atom2 === atomId &&
                  molecule.atoms[bond.atom1]?.symbol === "O")),
          );
          if (hasDoubleBondToO) {
            carbonylCarbonIdTemp = atomId;
            break;
          }
        }
      }

      if (carbonylCarbonIdTemp !== undefined) {
        for (const atomOrId of esterGroup.atoms) {
          const atomId = typeof atomOrId === "number" ? atomOrId : atomOrId.id;
          const atom = molecule.atoms[atomId];
          if (atom?.symbol === "O") {
            const isSingleBonded = molecule.bonds.some(
              (bond: any) =>
                bond.type === "single" &&
                ((bond.atom1 === carbonylCarbonIdTemp &&
                  bond.atom2 === atomId) ||
                  (bond.atom2 === carbonylCarbonIdTemp &&
                    bond.atom1 === atomId)),
            );
            if (isSingleBonded) {
              esterOxygenIdTemp = atomId;
              break;
            }
          }
        }
      }
    }

    // Now check if the ring atoms include the carbonyl carbon (acyl side) or not (alkoxy side)
    // OR if the carbonyl carbon is bonded to a ring atom (ring substituent on acyl side)
    const ringAtomIds = new Set(
      (parentStructure.ring?.atoms || parentStructure.atoms || []).map(
        (a: any) => a.id,
      ),
    );

    let isRingOnAcylSide =
      carbonylCarbonIdTemp !== undefined &&
      ringAtomIds.has(carbonylCarbonIdTemp);

    // Also check if carbonyl carbon is bonded to any ring atom
    if (!isRingOnAcylSide && carbonylCarbonIdTemp !== undefined) {
      for (const bond of molecule.bonds) {
        if (bond.type === "single") {
          if (
            bond.atom1 === carbonylCarbonIdTemp &&
            ringAtomIds.has(bond.atom2)
          ) {
            isRingOnAcylSide = true;
            break;
          } else if (
            bond.atom2 === carbonylCarbonIdTemp &&
            ringAtomIds.has(bond.atom1)
          ) {
            isRingOnAcylSide = true;
            break;
          }
        }
      }
    }

    if (process.env.VERBOSE) {
      console.log(
        "[buildEsterName] Ring detected: isRingOnAcylSide=",
        isRingOnAcylSide,
      );
      console.log(
        "[buildEsterName] carbonylCarbonIdTemp=",
        carbonylCarbonIdTemp,
        "ringAtomIds=",
        Array.from(ringAtomIds),
      );
    }

    if (isRingOnAcylSide) {
      // Ring is on acyl side - build ring-based acyl name
      // (e.g., "alkyl cyclopentanecarboxylate")
      if (process.env.VERBOSE)
        console.log(
          "[buildEsterName] Ring is on acyl side, calling buildEsterWithRingAcylGroup",
        );
      return buildEsterWithRingAcylGroup(
        parentStructure,
        esterGroup,
        molecule,
        functionalGroups,
      );
    } else {
      // Ring is on alkoxy side - handle as ring-based alkyl group
      // (e.g., "cyclohexyl propanoate")
      if (process.env.VERBOSE)
        console.log(
          "[buildEsterName] Ring is on alkoxy side, building ring-based alkyl group",
        );
      return buildEsterWithRingAlkylGroup(
        parentStructure,
        esterGroup,
        molecule,
        functionalGroups,
      );
    }
  }

  if (!parentStructure.chain) {
    if (process.env.VERBOSE)
      console.log(
        "[buildEsterName] ERROR: No chain in parentStructure, returning fallback",
      );
    return "alkyl carboxylate"; // Fallback
  }

  const chain = parentStructure.chain;
  const multiplicity = esterGroup.multiplicity || 1;
  const isMultiester = multiplicity > 1;

  if (process.env.VERBOSE) {
    console.log(
      "[buildEsterName] multiplicity:",
      multiplicity,
      "isMultiester:",
      isMultiester,
    );
    console.log(
      "[buildEsterName] chain.atoms:",
      chain.atoms?.length,
      "chain.length:",
      chain.length,
    );
  }

  if (isMultiester) {
    return buildDiesterName(parentStructure, esterGroup, molecule);
  }

  // Original monoester logic
  const chainAtomIds = chain.atoms?.map((a: any) => a.id) || [];

  // Use esterGroup.atoms to identify the specific ester we're processing
  // esterGroup.atoms typically contains [carbonyl C, ester O]
  let carbonylCarbonId: number | undefined;
  let esterOxygenId: number | undefined;

  if (esterGroup.atoms && esterGroup.atoms.length >= 2) {
    // esterGroup.atoms typically contains [carbonyl C, carbonyl O, ester O]
    // We need to identify:
    // 1. carbonyl carbon (has C=O double bond)
    // 2. ester oxygen (single bonded to carbonyl C and to alkoxy C)

    if (process.env.VERBOSE) {
      console.log("[buildEsterName] esterGroup.atoms:", esterGroup.atoms);
      esterGroup.atoms.forEach((atomOrId: number | any, idx: number) => {
        const atomId = typeof atomOrId === "number" ? atomOrId : atomOrId.id;
        const atom = molecule.atoms[atomId];
        console.log(
          `[buildEsterName]   atoms[${idx}]: ${atomId} = ${atom?.symbol}`,
        );
      });
    }

    // Find carbonyl carbon (should be bonded to one oxygen via double bond)
    for (const atomOrId of esterGroup.atoms) {
      const atomId = typeof atomOrId === "number" ? atomOrId : atomOrId.id;
      const atom = molecule.atoms[atomId];
      if (atom?.symbol === "C") {
        // Verify it has a double bond to an oxygen
        const hasDoubleBondToO = molecule.bonds.some(
          (bond: any) =>
            bond.type === "double" &&
            ((bond.atom1 === atomId &&
              molecule.atoms[bond.atom2]?.symbol === "O") ||
              (bond.atom2 === atomId &&
                molecule.atoms[bond.atom1]?.symbol === "O")),
        );
        if (hasDoubleBondToO) {
          carbonylCarbonId = atomId;
          break;
        }
      }
    }

    // Find ester oxygen (bonded to carbonyl C via single bond, not double bond)
    if (carbonylCarbonId !== undefined) {
      for (const atomOrId of esterGroup.atoms) {
        const atomId = typeof atomOrId === "number" ? atomOrId : atomOrId.id;
        const atom = molecule.atoms[atomId];
        if (atom?.symbol === "O") {
          // Check if this oxygen is single-bonded to the carbonyl carbon
          const isSingleBonded = molecule.bonds.some(
            (bond: any) =>
              bond.type === "single" &&
              ((bond.atom1 === carbonylCarbonId && bond.atom2 === atomId) ||
                (bond.atom2 === carbonylCarbonId && bond.atom1 === atomId)),
          );
          if (isSingleBonded) {
            esterOxygenId = atomId;
            break;
          }
        }
      }
    }

    if (process.env.VERBOSE) {
      console.log(
        "[buildEsterName] Identified from esterGroup: carbonylCarbonId=",
        carbonylCarbonId,
        "esterOxygenId=",
        esterOxygenId,
      );
    }
  }

  // Fallback to searching if esterGroup doesn't specify atoms
  if (!carbonylCarbonId || !esterOxygenId) {
    if (process.env.VERBOSE)
      console.log(
        "[buildEsterName] Fallback: searching for carbonyl and ester oxygen",
      );
    for (const bond of molecule.bonds) {
      if (bond.type === "double") {
        const atom1 = molecule.atoms[bond.atom1];
        const atom2 = molecule.atoms[bond.atom2];

        if (atom1?.symbol === "C" && atom2?.symbol === "O") {
          carbonylCarbonId = bond.atom1;
        } else if (atom1?.symbol === "O" && atom2?.symbol === "C") {
          carbonylCarbonId = bond.atom2;
        }
      }
    }

    if (!carbonylCarbonId) {
      if (process.env.VERBOSE)
        console.log("[buildEsterName] ERROR: Could not find carbonyl carbon");
      return "alkyl carboxylate";
    }

    for (const bond of molecule.bonds) {
      if (bond.type === "single") {
        const atom1 = molecule.atoms[bond.atom1];
        const atom2 = molecule.atoms[bond.atom2];

        if (
          bond.atom1 === carbonylCarbonId &&
          atom1?.symbol === "C" &&
          atom2?.symbol === "O"
        ) {
          esterOxygenId = bond.atom2;
          break;
        } else if (
          bond.atom2 === carbonylCarbonId &&
          atom2?.symbol === "C" &&
          atom1?.symbol === "O"
        ) {
          esterOxygenId = bond.atom1;
          break;
        }
      }
    }
  }

  if (!esterOxygenId) {
    return "alkyl carboxylate";
  }

  let alkoxyCarbonId: number | undefined;
  for (const bond of molecule.bonds) {
    if (bond.type === "single") {
      const atom1 = molecule.atoms[bond.atom1];
      const atom2 = molecule.atoms[bond.atom2];

      if (
        bond.atom1 === esterOxygenId &&
        atom2?.symbol === "C" &&
        bond.atom2 !== carbonylCarbonId
      ) {
        alkoxyCarbonId = bond.atom2;
        break;
      } else if (
        bond.atom2 === esterOxygenId &&
        atom1?.symbol === "C" &&
        bond.atom1 !== carbonylCarbonId
      ) {
        alkoxyCarbonId = bond.atom1;
        break;
      }
    }
  }

  if (!alkoxyCarbonId) {
    if (process.env.VERBOSE)
      console.log(
        "[buildEsterName] ERROR: Could not find alkoxyCarbonId, returning fallback",
      );
    return "alkyl carboxylate";
  }

  if (process.env.VERBOSE)
    console.log("[buildEsterName] Found alkoxyCarbonId:", alkoxyCarbonId);

  const acylCarbonIds = new Set<number>();
  const visitedAcyl = new Set<number>();
  const queueAcyl = [carbonylCarbonId];

  while (queueAcyl.length > 0) {
    const currentId = queueAcyl.shift()!;
    if (visitedAcyl.has(currentId)) continue;
    visitedAcyl.add(currentId);

    const currentAtom = molecule.atoms[currentId];
    if (currentAtom?.symbol === "C") {
      acylCarbonIds.add(currentId);

      for (const bond of molecule.bonds) {
        if (bond.atom1 === currentId || bond.atom2 === currentId) {
          const otherId = bond.atom1 === currentId ? bond.atom2 : bond.atom1;
          const otherAtom = molecule.atoms[otherId];

          if (otherId === esterOxygenId) continue;

          if (otherAtom?.symbol === "C" && !visitedAcyl.has(otherId)) {
            queueAcyl.push(otherId);
          }
        }
      }
    }
  }

  const acylLength = acylCarbonIds.size;

  const alkoxyCarbonIds = new Set<number>();
  const visitedAlkoxy = new Set<number>();
  const queueAlkoxy = [alkoxyCarbonId];

  while (queueAlkoxy.length > 0) {
    const currentId = queueAlkoxy.shift()!;
    if (visitedAlkoxy.has(currentId)) continue;
    visitedAlkoxy.add(currentId);

    const currentAtom = molecule.atoms[currentId];
    if (currentAtom?.symbol === "C") {
      alkoxyCarbonIds.add(currentId);

      for (const bond of molecule.bonds) {
        if (bond.atom1 === currentId || bond.atom2 === currentId) {
          const otherId = bond.atom1 === currentId ? bond.atom2 : bond.atom1;
          const otherAtom = molecule.atoms[otherId];

          if (otherAtom?.symbol === "C" && !visitedAlkoxy.has(otherId)) {
            queueAlkoxy.push(otherId);
          }
        }
      }
    }
  }

  const alkoxyLength = alkoxyCarbonIds.size;

  if (process.env.VERBOSE) {
    console.log("[buildEsterName] carbonylCarbonId:", carbonylCarbonId);
    console.log("[buildEsterName] esterOxygenId:", esterOxygenId);
    console.log("[buildEsterName] alkoxyCarbonId:", alkoxyCarbonId);
    console.log("[buildEsterName] acylLength:", acylLength);
    console.log("[buildEsterName] alkoxyLength:", alkoxyLength);
    console.log(
      "[buildEsterName] alkoxyCarbonIds:",
      Array.from(alkoxyCarbonIds),
    );
  }

  // Check if alkoxy chain has substituents (acyloxy, alkoxy groups)
  const alkoxySubstituents = functionalGroups.filter(
    (fg) =>
      (fg.type === "acyloxy" || fg.type === "alkoxy") &&
      fg.atoms &&
      fg.atoms.some((atomId: number) => {
        // Check if this functional group is attached to the alkoxy chain
        for (const bond of molecule.bonds) {
          const atom1 = bond.atom1;
          const atom2 = bond.atom2;
          if (alkoxyCarbonIds.has(atom1) && atomId === atom2) return true;
          if (alkoxyCarbonIds.has(atom2) && atomId === atom1) return true;
        }
        return false;
      }),
  );

  // Also consider substituents recorded on the parent chain (which may represent the alkoxy chain)
  // e.g., trimethylsilyloxy recorded in parentStructure.chain.substituents for the alkoxy group
  try {
    const parentSubstituents = parentStructure.chain?.substituents || [];
    for (const sub of parentSubstituents) {
      // Avoid duplicates by checking if a similar type already exists in alkoxySubstituents
      const key = (sub.type || sub.name || "").toString();
      // We'll attempt to find an attachment atom below; declare here so we can merge if needed
      let attachmentAtomId: number | undefined;
      const exists = alkoxySubstituents.some(
        (s: any) => (s.type || s.prefix || s.name || "").toString() === key,
      );
      if (!exists) {
        // Attempt to find the attachment atom in the molecule for this substituent
        let attachmentAtomId: number | undefined;

        try {
          // If substituent looks like a silyloxy group, find an O bonded to an alkoxy carbon that connects to Si
          const typeStr = (sub.type || sub.name || "").toString().toLowerCase();
          if (
            typeStr.includes("silyl") ||
            typeStr.includes("silyloxy") ||
            typeStr.includes("trimethylsilyl")
          ) {
            for (const cid of Array.from(alkoxyCarbonIds)) {
              for (const b of molecule.bonds) {
                if (b.type !== "single") continue;
                const other =
                  b.atom1 === cid
                    ? b.atom2
                    : b.atom2 === cid
                      ? b.atom1
                      : undefined;
                if (other === undefined) continue;
                const otherAtom = molecule.atoms[other];
                if (!otherAtom || otherAtom.symbol !== "O") continue;
                // check if this oxygen connects to Si
                const neigh = molecule.bonds
                  .filter(
                    (bb: any) =>
                      (bb.atom1 === other || bb.atom2 === other) &&
                      bb.type === "single",
                  )
                  .map((bb: any) => (bb.atom1 === other ? bb.atom2 : bb.atom1))
                  .map((id: number) => molecule.atoms[id]);
                if (neigh.some((na: any) => na && na.symbol === "Si")) {
                  attachmentAtomId = other;
                  break;
                }
              }
              if (attachmentAtomId) break;
            }
          }

          // Fallback: find a carbon neighbor of alkoxy carbons that likely represents a simple alkyl branch
          if (!attachmentAtomId) {
            for (const cid of Array.from(alkoxyCarbonIds)) {
              for (const b of molecule.bonds) {
                if (b.type !== "single") continue;
                const other =
                  b.atom1 === cid
                    ? b.atom2
                    : b.atom2 === cid
                      ? b.atom1
                      : undefined;
                if (other === undefined) continue;
                const otherAtom = molecule.atoms[other];
                if (!otherAtom) continue;
                if (otherAtom.symbol === "C" && !alkoxyCarbonIds.has(other)) {
                  attachmentAtomId = other;
                  break;
                }
              }
              if (attachmentAtomId) break;
            }
          }
        } catch (e) {
          // ignore errors, leave attachmentAtomId undefined
        }

        const newEntry: any = {
          type: sub.type || sub.name || "substituent",
          prefix: sub.prefix || sub.name || undefined,
          atoms: attachmentAtomId ? [attachmentAtomId] : [],
          isPrincipal: false,
        };

        alkoxySubstituents.push(newEntry);
      } else {
        // merge attachment atom into existing entry so multiplicities (bis/tri) can be computed
        if (attachmentAtomId) {
          const existing = alkoxySubstituents.find(
            (s: any) => (s.type || s.prefix || s.name || "").toString() === key,
          );
          if (existing) {
            existing.atoms = existing.atoms || [];
            if (!existing.atoms.includes(attachmentAtomId))
              existing.atoms.push(attachmentAtomId);
          }
        }
      }
    }
  } catch (e) {
    // non-fatal - just proceed
  }

  if (process.env.VERBOSE) {
    console.log(
      "[buildEsterName] alkoxySubstituents:",
      alkoxySubstituents.map((s) => ({
        type: s.type,
        prefix: s.prefix,
        atoms: s.atoms,
      })),
    );
  }

  // Always use getAlkoxyGroupName - it handles both simple and complex cases
  // It has built-in detection for amide groups and other complex structural features
  const alkylName = getAlkoxyGroupName(esterGroup, molecule, functionalGroups);

  // Prefer deriving the acyl name from the parentStructure.chain when the parent chain contains the carbonyl carbon
  let acylName = "";
  try {
    const parentChainAtoms = (parentStructure.chain?.atoms || []).map(
      (a: any) =>
        a && typeof a === "object" && typeof a.id === "number" ? a.id : a,
    );
    const parentIsAcyl =
      carbonylCarbonId !== undefined &&
      parentChainAtoms.includes(carbonylCarbonId);

    if (parentIsAcyl) {
      if (process.env.VERBOSE)
        console.log(
          "[buildEsterName] parentIsAcyl true, parentChainAtoms:",
          parentChainAtoms,
        );
      // Count carbon atoms in parent chain
      const carbonCount = (parentStructure.chain?.atoms || []).filter(
        (a: any) => {
          const atomId =
            a && typeof a === "object" && typeof a.id === "number" ? a.id : a;
          return molecule.atoms[atomId]?.symbol === "C";
        },
      ).length;
      if (process.env.VERBOSE)
        console.log(
          "[buildEsterName] computed carbonCount from parent chain:",
          carbonCount,
        );

      // Build substituent part from parent chain substituents (e.g., 2-methyl)
      const acylSubs = parentStructure.chain?.substituents || [];
      const acylSubParts: string[] = [];
      for (const s of acylSubs) {
        const loc = s.locant || s.position;
        const name = s.name || s.type;
        if (loc && name && !(name || "").toLowerCase().includes("oxy")) {
          acylSubParts.push(`${loc}-${name}`);
        }
      }

      const baseNames = [
        "",
        "methane",
        "ethane",
        "propane",
        "butane",
        "pentane",
        "hexane",
        "heptane",
        "octane",
        "nonane",
        "decane",
      ];
      const base =
        carbonCount < baseNames.length
          ? baseNames[carbonCount]
          : `C${carbonCount}-alkane`;
      const baseAnoate = (base || "").replace("ane", "anoate");
      acylName =
        acylSubParts.length > 0
          ? `${acylSubParts.join(",")}${baseAnoate}`
          : baseAnoate;
    } else {
      const acylNames = [
        "",
        "formate",
        "acetate",
        "propanoate",
        "butanoate",
        "pentanoate",
        "hexanoate",
        "heptanoate",
        "octanoate",
        "nonanoate",
        "decanoate",
      ];
      acylName =
        acylLength < acylNames.length && acylNames[acylLength]
          ? acylNames[acylLength]
          : `C${acylLength}-anoate`;
    }
  } catch (e) {
    const acylNames = [
      "",
      "formate",
      "acetate",
      "propanoate",
      "butanoate",
      "pentanoate",
      "hexanoate",
      "heptanoate",
      "octanoate",
      "nonanoate",
      "decanoate",
    ];
    acylName =
      acylLength < acylNames.length && acylNames[acylLength]
        ? acylNames[acylLength]
        : `C${acylLength}-anoate`;
  }

  // Don't add space if alkyl name is complex (surrounded by brackets) or ring-based (contains parentheses with ring names)
  const isComplexAlkyl = alkylName.startsWith("[") && alkylName.endsWith("]");
  const isRingBasedAlkyl =
    alkylName.includes("(") && alkylName.includes(")") && /\d+/.test(alkylName);
  const result =
    alkoxySubstituents.length > 0 || isComplexAlkyl || isRingBasedAlkyl
      ? `${alkylName}${acylName}`
      : `${alkylName} ${acylName}`;

  if (process.env.VERBOSE) {
    console.log("[buildEsterName] result:", result);
  }

  return result;
}

export function buildDiesterName(
  parentStructure: any,
  esterGroup: any,
  molecule: any,
): string {
  // Diester nomenclature: dialkyl [substituents] alkanedioate
  // Example: CCCOC(CC(=O)OC)C(=O)OC → dimethyl 2-propoxybutanedioate

  const chain = parentStructure.chain;
  const multiplicity = esterGroup.multiplicity || 2;

  // Find all ester oxygens (C-O-C where C=O is present)
  const esterOxygens: number[] = [];
  const alkoxyCarbons: number[] = [];

  for (const bond of molecule.bonds) {
    if (bond.type !== "double") continue;

    const atom1 = molecule.atoms[bond.atom1];
    const atom2 = molecule.atoms[bond.atom2];
    let carbonylCarbonId: number | undefined;

    if (atom1?.symbol === "C" && atom2?.symbol === "O") {
      carbonylCarbonId = bond.atom1;
    } else if (atom1?.symbol === "O" && atom2?.symbol === "C") {
      carbonylCarbonId = bond.atom2;
    }

    if (!carbonylCarbonId) continue;

    // Find ester oxygen bonded to this carbonyl carbon
    for (const bond2 of molecule.bonds) {
      if (bond2.type !== "single") continue;

      const b1 = molecule.atoms[bond2.atom1];
      const b2 = molecule.atoms[bond2.atom2];

      let esterOxygenId: number | undefined;
      if (
        bond2.atom1 === carbonylCarbonId &&
        b1?.symbol === "C" &&
        b2?.symbol === "O"
      ) {
        esterOxygenId = bond2.atom2;
      } else if (
        bond2.atom2 === carbonylCarbonId &&
        b2?.symbol === "C" &&
        b1?.symbol === "O"
      ) {
        esterOxygenId = bond2.atom1;
      }

      if (!esterOxygenId) continue;

      // Find alkoxy carbon
      for (const bond3 of molecule.bonds) {
        if (bond3.type !== "single") continue;

        const c1 = molecule.atoms[bond3.atom1];
        const c2 = molecule.atoms[bond3.atom2];

        if (
          bond3.atom1 === esterOxygenId &&
          c2?.symbol === "C" &&
          bond3.atom2 !== carbonylCarbonId
        ) {
          esterOxygens.push(esterOxygenId);
          alkoxyCarbons.push(bond3.atom2);
          break;
        } else if (
          bond3.atom2 === esterOxygenId &&
          c1?.symbol === "C" &&
          bond3.atom1 !== carbonylCarbonId
        ) {
          esterOxygens.push(esterOxygenId);
          alkoxyCarbons.push(bond3.atom1);
          break;
        }
      }
    }
  }

  if (process.env.VERBOSE) {
    console.log(
      "[buildDiesterName] Found",
      alkoxyCarbons.length,
      "ester groups",
    );
  }

  // Calculate length of each alkoxy chain
  const alkoxyLengths: number[] = [];
  for (const alkoxyCarbonId of alkoxyCarbons) {
    const visited = new Set<number>();
    const queue = [alkoxyCarbonId];
    const carbonIds = new Set<number>();

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      if (visited.has(currentId)) continue;
      visited.add(currentId);

      const currentAtom = molecule.atoms[currentId];
      if (currentAtom?.symbol === "C") {
        carbonIds.add(currentId);

        for (const bond of molecule.bonds) {
          if (bond.atom1 === currentId || bond.atom2 === currentId) {
            const otherId = bond.atom1 === currentId ? bond.atom2 : bond.atom1;
            const otherAtom = molecule.atoms[otherId];

            if (
              otherAtom?.symbol === "C" &&
              !visited.has(otherId) &&
              !esterOxygens.includes(otherId)
            ) {
              queue.push(otherId);
            }
          }
        }
      }
    }

    alkoxyLengths.push(carbonIds.size);
  }

  // Check if all alkoxy groups are the same length
  const allSameLength = alkoxyLengths.every((len) => len === alkoxyLengths[0]);

  const alkylNames = [
    "",
    "methyl",
    "ethyl",
    "propyl",
    "butyl",
    "pentyl",
    "hexyl",
    "heptyl",
    "octyl",
    "nonyl",
    "decyl",
  ];

  let alkylPart = "";
  if (allSameLength && alkoxyLengths.length > 0) {
    const len = alkoxyLengths[0] ?? 1;
    const baseName =
      len < alkylNames.length && len >= 0
        ? (alkylNames[len] ?? "methyl")
        : `C${len}-alkyl`;
    const multiplicativePrefix = getMultiplicativePrefix(alkoxyLengths.length);
    alkylPart = `${multiplicativePrefix}${baseName}`;
  } else {
    alkylPart = "mixed alkyl";
  }

  // Get substituents from parent structure, excluding ester alkoxy groups
  // Ester alkoxy groups are at the same positions as the ester carbonyl groups
  // Parse locantString to get all ester positions (e.g., "2,5" -> [2, 5])
  const locantString = esterGroup.locantString || "";
  const esterLocants = new Set<number>(
    locantString
      .split(",")
      .map((s: string) => parseInt(s.trim(), 10))
      .filter((n: number) => !isNaN(n)),
  );

  const substituents = (chain.substituents || []).filter((sub: any) => {
    const subLocant = sub.locant || sub.position;
    const isAlkoxySubstituent = sub.type?.includes("oxy"); // methoxy, ethoxy, propoxy, etc.

    // Exclude alkoxy substituents at ester positions (they're part of the ester)
    if (isAlkoxySubstituent && esterLocants.has(subLocant)) {
      return false;
    }

    return true;
  });

  // Count carbons in acid chain (excluding alkoxy groups)
  const chainAtomIds = new Set<number>(
    chain.atoms?.map((a: any) => a.id) || [],
  );
  const alkoxyCarbonSet = new Set<number>(alkoxyCarbons);
  const acidChainCarbons = Array.from(chainAtomIds).filter((id: number) => {
    const atom = molecule.atoms[id];
    return atom?.symbol === "C" && !alkoxyCarbonSet.has(id);
  });

  // Build mapping from atom ID to carbon-only position
  const chainAtoms = chain.atoms || [];
  const carbonOnlyPositions = new Map<number, number>();
  let carbonPosition = 1;
  for (let i = 0; i < chainAtoms.length; i++) {
    const atomId = chainAtoms[i]?.id;
    const atom = molecule.atoms[atomId];
    if (atom?.symbol === "C" && !alkoxyCarbonSet.has(atomId)) {
      carbonOnlyPositions.set(atomId, carbonPosition);
      carbonPosition++;
    }
  }

  // Re-calculate substituent locants based on carbon-only positions
  const renumberedSubstituents = substituents.map((sub: any) => {
    const subLocant = sub.locant || sub.position;
    const chainAtomAtPosition = chainAtoms[subLocant - 1];
    const atomId = chainAtomAtPosition?.id;

    // The chain atom at this position might be an oxygen (for carbonyl groups)
    // We need to find the carbon that this substituent is actually attached to
    let attachedCarbonId: number | undefined;

    // If the chain atom itself is a carbon in our carbon-only positions, use it
    if (carbonOnlyPositions.has(atomId)) {
      attachedCarbonId = atomId;
    } else {
      // Otherwise, find the carbon that this oxygen is bonded to
      for (const bond of molecule.bonds) {
        if (bond.atom1 === atomId || bond.atom2 === atomId) {
          const otherId = bond.atom1 === atomId ? bond.atom2 : bond.atom1;
          if (carbonOnlyPositions.has(otherId)) {
            attachedCarbonId = otherId;
            break;
          }
        }
      }
    }

    const newLocant =
      attachedCarbonId !== undefined
        ? carbonOnlyPositions.get(attachedCarbonId)
        : subLocant;
    return { ...sub, locant: newLocant };
  });

  let substituentPart = "";
  if (renumberedSubstituents.length > 0) {
    const subParts: string[] = [];
    for (const sub of renumberedSubstituents) {
      const locant = sub.locant || sub.position;
      const name = sub.name || sub.type;
      if (locant && name) {
        subParts.push(`${locant}-${name}`);
      }
    }
    if (subParts.length > 0) {
      substituentPart = subParts.join(",") + "";
    }
  }

  const acidChainLength = acidChainCarbons.length;

  const chainNames = [
    "",
    "methane",
    "ethane",
    "propane",
    "butane",
    "pentane",
    "hexane",
    "heptane",
    "octane",
    "nonane",
    "decane",
  ];

  let acidSuffix = "";
  if (acidChainLength < chainNames.length) {
    const baseName = chainNames[acidChainLength] || "alkane";
    acidSuffix = baseName.replace("ane", "anedioate");
  } else {
    acidSuffix = `C${acidChainLength}-anedioate`;
  }

  const result = substituentPart
    ? `${alkylPart}${substituentPart}${acidSuffix}`
    : `${alkylPart}${acidSuffix}`;

  if (process.env.VERBOSE) {
    console.log("[buildDiesterName] result:", result);
  }

  return result;
}

function getMultiplicativePrefix(count: number): string {
  const prefixes: { [key: number]: string } = {
    2: "di",
    3: "tri",
    4: "tetra",
    5: "penta",
    6: "hexa",
    7: "hepta",
    8: "octa",
    9: "nona",
    10: "deca",
  };

  return prefixes[count] || `${count}-`;
}
