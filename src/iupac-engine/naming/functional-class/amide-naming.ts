import type { Molecule } from "types";
import type { ParentStructure, FunctionalGroup } from "../../types";
import { getSimpleMultiplier } from "../../opsin-adapter";
import { getSharedOPSINService } from "../../opsin-service";

/**
 * Build N-substituted amide name
 *
 * Example: CC(C)(C)C(C(=O)NC1=CC=CC=C1)ONC(C)(C)C
 * Should generate: N-phenylbutanamide (or with full prefix: 2-(tert-butylamino)oxy-3,3-dimethyl-N-phenylbutanamide)
 */
export function buildAmideName(
  parentStructure: ParentStructure,
  functionalGroup: FunctionalGroup,
  molecule: Molecule,
  _functionalGroups: FunctionalGroup[],
): string {
  if (process.env.VERBOSE) {
    console.log(
      "[buildAmideName] parentStructure:",
      JSON.stringify(parentStructure, null, 2),
    );
    console.log("[buildAmideName] functionalGroup:", functionalGroup);
    console.log(
      "[buildAmideName] functionalGroup.atoms:",
      functionalGroup.atoms,
    );
  }

  // Build base amide name from parent structure
  // For functional class nomenclature, build like: "butanamide", "pentanamide", etc.
  const chainLength = parentStructure.chain?.length || 0;
  const chainNames = [
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
  let baseName = "amide";
  if (chainLength > 0 && chainLength < chainNames.length) {
    const stem = chainNames[chainLength];
    baseName = `${stem}anamide`;
  }

  if (process.env.VERBOSE) {
    console.log("[buildAmideName] baseName:", baseName);
  }

  // Extract amide nitrogen from functional group atoms
  // Format: [carbonylC, oxygen, nitrogen]
  const nitrogenAtom = functionalGroup.atoms?.[2];

  if (!nitrogenAtom) {
    if (process.env.VERBOSE) {
      console.log(
        "[buildAmideName] No nitrogen found in amide functional group",
      );
    }
    return baseName;
  }

  const amideNitrogenId = nitrogenAtom.id;

  if (process.env.VERBOSE) {
    console.log("[buildAmideName] amideNitrogenId:", amideNitrogenId);
  }

  // Use the nitrogen atom directly
  const nitrogen = nitrogenAtom;
  if (!nitrogen) {
    return baseName;
  }

  // Find all neighbors of the nitrogen (excluding the carbonyl carbon)
  const carbonylCarbonId = functionalGroup.atoms?.[0]?.id;
  const nSubstituents: Array<{ atomId: number; name: string }> = [];

  for (const bond of molecule.bonds) {
    if (bond.type !== "single") continue;

    let neighborId: number | undefined;
    if (bond.atom1 === amideNitrogenId && bond.atom2 !== carbonylCarbonId) {
      neighborId = bond.atom2;
    } else if (
      bond.atom2 === amideNitrogenId &&
      bond.atom1 !== carbonylCarbonId
    ) {
      neighborId = bond.atom1;
    }

    if (neighborId === undefined) continue;

    const neighbor = molecule.atoms[neighborId];
    if (!neighbor) continue;

    if (process.env.VERBOSE) {
      console.log(
        `[buildAmideName] Found N-neighbor: atom ${neighborId}, symbol ${neighbor.symbol}, aromatic ${neighbor.aromatic}`,
      );
    }

    // Check if neighbor is aromatic carbon (likely phenyl ring)
    if (neighbor.aromatic && neighbor.symbol === "C") {
      // Find the aromatic ring name
      const ringName = getAromaticRingName(neighborId, molecule);
      nSubstituents.push({ atomId: neighborId, name: ringName });
      if (process.env.VERBOSE) {
        console.log(`[buildAmideName] Added aromatic substituent: ${ringName}`);
      }
    }
    // Handle alkyl substituents (methyl, ethyl, etc.)
    else if (neighbor.symbol === "C") {
      const alkylName = getAlkylSubstituentName(neighborId, molecule, [amideNitrogenId, carbonylCarbonId || -1]);
      if (alkylName) {
        nSubstituents.push({ atomId: neighborId, name: alkylName });
        if (process.env.VERBOSE) {
          console.log(`[buildAmideName] Added alkyl substituent: ${alkylName}`);
        }
      }
    }
  }

  // Build final name with N-substituents and carbon chain substituents

  // Get carbon chain substituents from parent structure
  const chainSubstituents =
    (parentStructure as { substituents?: unknown[] }).substituents || [];

  // Group identical substituents by locant
  const groupedSubstituents = new Map<
    string,
    { locants: number[]; name: string }
  >();
  for (const sub of chainSubstituents) {
    const s = sub as { type: string; name?: string; locant?: number };
    const key = s.name || s.type;
    if (!groupedSubstituents.has(key)) {
      groupedSubstituents.set(key, { locants: [], name: key });
    }
    groupedSubstituents.get(key)!.locants.push(s.locant || 0);
  }

  // Build substituent parts
  const substituentParts: string[] = [];
  for (const [_, group] of groupedSubstituents) {
    const locantStr = group.locants.join(",");
    const multiplier =
      group.locants.length > 1 ? getMultiplier(group.locants.length) : "";
    substituentParts.push(`${locantStr}-${multiplier}${group.name}`);
  }

  // Sort substituent parts alphabetically
  substituentParts.sort();

  // Build N-prefixes with proper multipliers for identical groups
  // Group by substituent name
  const nSubMap = new Map<string, number>();
  for (const sub of nSubstituents) {
    nSubMap.set(sub.name, (nSubMap.get(sub.name) || 0) + 1);
  }

  // Build N-prefixes: "N-methyl", "N,N-dimethyl", "N-ethyl-N-methyl", etc.
  const nPrefixParts: string[] = [];
  for (const [name, count] of Array.from(nSubMap.entries()).sort()) {
    if (count === 1) {
      nPrefixParts.push(`N-${name}`);
    } else {
      const locants = Array(count).fill("N").join(",");
      const multiplier = getMultiplier(count);
      nPrefixParts.push(`${locants}-${multiplier}${name}`);
    }
  }
  const nPrefixes = nPrefixParts.join("-");

  // Combine: substituents + N-substituents + base name
  // Example: 2-(tert-butylamino)oxy-3,3-dimethyl-N-phenylbutanamide
  let finalName = "";
  if (substituentParts.length > 0) {
    finalName = substituentParts.join("-") + "-";
  }
  if (nPrefixes) {
    finalName += nPrefixes;
  }
  finalName += baseName;

  if (process.env.VERBOSE) {
    console.log("[buildAmideName] chainSubstituents:", chainSubstituents);
    console.log("[buildAmideName] substituentParts:", substituentParts);
    console.log("[buildAmideName] nPrefixes:", nPrefixes);
    console.log("[buildAmideName] Final name:", finalName);
  }

  return finalName;
}

function getMultiplier(count: number): string {
  const opsinService = getSharedOPSINService();
  return getSimpleMultiplier(count, opsinService);
}

/**
 * Get the name of an alkyl substituent attached to nitrogen
 * Traces from the starting carbon to build names like "methyl", "ethyl", "propyl", etc.
 */
function getAlkylSubstituentName(
  startAtomId: number,
  molecule: Molecule,
  excludeAtoms: number[]
): string | null {
  const startAtom = molecule.atoms[startAtomId];
  if (!startAtom || startAtom.symbol !== "C") return null;

  // Count carbons in this alkyl chain (simple linear chain only for now)
  const visited = new Set<number>(excludeAtoms);
  const queue: number[] = [startAtomId];
  const carbonIds: number[] = [];

  while (queue.length > 0) {
    const atomId = queue.shift()!;
    if (visited.has(atomId)) continue;
    visited.add(atomId);

    const atom = molecule.atoms[atomId];
    if (!atom || atom.symbol !== "C") continue;
    
    carbonIds.push(atomId);

    // Add neighbors
    for (const bond of molecule.bonds) {
      if (bond.type !== "single") continue;
      
      let neighborId: number | undefined;
      if (bond.atom1 === atomId) neighborId = bond.atom2;
      else if (bond.atom2 === atomId) neighborId = bond.atom1;

      if (neighborId !== undefined && !visited.has(neighborId)) {
        const neighbor = molecule.atoms[neighborId];
        if (neighbor?.symbol === "C") {
          queue.push(neighborId);
        }
      }
    }
  }

  // Build alkyl name based on carbon count
  const chainLength = carbonIds.length;
  const alkylNames = ["", "methyl", "ethyl", "propyl", "butyl", "pentyl", "hexyl"];
  
  if (chainLength > 0 && chainLength < alkylNames.length) {
    const name = alkylNames[chainLength];
    return name || null;
  }

  return null;
}

/**
 * Get the name of an aromatic ring (e.g., "phenyl")
 */
function getAromaticRingName(startAtomId: number, molecule: Molecule): string {
  // Find the aromatic ring containing this atom
  const atom = molecule.atoms[startAtomId];
  if (!atom) return "aryl";

  // Check if it's part of a 6-membered aromatic ring (benzene/phenyl)
  if (atom.ringIds && atom.ringIds.length > 0) {
    for (const ringId of atom.ringIds) {
      const ring = molecule.rings?.[ringId];
      if (!ring) continue;

      const ringAtoms = ring.map((atomId) => molecule.atoms[atomId]);
      const allAromatic = ringAtoms.every((a) => a?.aromatic);
      const allCarbon = ringAtoms.every((a) => a?.symbol === "C");

      if (allAromatic && allCarbon && ring.length === 6) {
        return "phenyl";
      }

      // Handle other aromatic rings (pyridine, etc.)
      if (allAromatic && ring.length === 6) {
        const hasNitrogen = ringAtoms.some((a) => a?.symbol === "N");
        if (hasNitrogen) {
          return "pyridyl";
        }
      }
    }
  }

  // Default to generic aryl
  return "aryl";
}
