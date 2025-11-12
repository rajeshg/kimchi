import type { ParentStructure } from "../../../types";
import type { Atom } from "types";

/**
 * Transforms partially saturated heterocycles to indicated hydrogen format.
 * Per IUPAC P-25.2: Use indicated hydrogen nomenclature for partially saturated heterocycles.
 *
 * Examples:
 * - "thiazoline" → "4H-1,3-thiazol"
 * - "imidazoline" → "2H-1,3-imidazol"
 * - "5-methylidenethiazoline" → "5-methylidene-4H-1,3-thiazol"
 */
export function transformPartiallySaturatedHeterocycle(
  name: string,
  parentStructure: ParentStructure,
): string {
  // Only apply to ring structures
  if (parentStructure.type !== "ring" || !parentStructure.ring) {
    return name;
  }

  const ring = parentStructure.ring;

  // Get heteroatoms from ring atoms
  const ringAtoms = ring.atoms || [];
  const heteroAtomsList = ringAtoms.filter(
    (a) => a.symbol !== "C" && a.symbol !== "H",
  );

  // Get locants for heteroatoms
  const locants = parentStructure.locants || [];
  const heteroatomsWithLocants = heteroAtomsList
    .map((atom) => {
      const atomIndex = ringAtoms.findIndex((a) => a.id === atom.id);
      return {
        atom,
        atomIndex,
        locant: locants[atomIndex] ?? atomIndex + 1,
      };
    })
    .sort((a, b) => a.locant - b.locant);

  if (process.env.VERBOSE) {
    console.log(
      `[transformPartiallySaturatedHeterocycle] Checking for transformation`,
    );
    console.log(`[transformPartiallySaturatedHeterocycle]   name="${name}"`);
    console.log(
      `[transformPartiallySaturatedHeterocycle]   ringAtoms:`,
      ringAtoms.map((a) => `${a.id}:${a.symbol}`).join(", "),
    );
    console.log(`[transformPartiallySaturatedHeterocycle]   locants:`, locants);
    console.log(
      `[transformPartiallySaturatedHeterocycle]   heteroAtomsList.length=${heteroAtomsList.length}`,
    );
    console.log(
      `[transformPartiallySaturatedHeterocycle]   heteroatomsWithLocants:`,
      heteroatomsWithLocants
        .map((h) => `${h.atom.symbol}@${h.locant}(idx:${h.atomIndex})`)
        .join(", "),
    );
    console.log(
      `[transformPartiallySaturatedHeterocycle]   ring.size=${ring.size}`,
    );
  }

  // Check if this is a partially saturated 5-membered heterocycle
  const partiallySaturatedPattern =
    /^(.+?)(thiazoline|imidazoline|oxazoline|pyrazoline)$/;
  const match = name.match(partiallySaturatedPattern);

  if (process.env.VERBOSE) {
    console.log(
      `[transformPartiallySaturatedHeterocycle]   pattern match:`,
      match,
    );
  }

  if (!match || heteroatomsWithLocants.length < 2) {
    return name;
  }

  const prefix = match[1] || "";
  const ringType = match[2] || "";

  // Get heteroatom positions (locants)
  const heteroatomLocants = heteroatomsWithLocants.map((h) => h.locant);

  if (heteroatomLocants.length < 2 || ring.size !== 5) {
    return name;
  }

  // Determine which position has the saturated carbon (added hydrogen)
  let hydrogenPosition = 4; // Default for thiazoline-like rings

  // For specific ring types, adjust hydrogen position
  if (ringType === "imidazoline") {
    hydrogenPosition = 2; // Imidazoline typically has 2H
  }

  // Build the heteroatom locant string (e.g., "1,3")
  const heteroLocantStr = heteroatomLocants.join(",");

  // Transform the ring name: "thiazoline" → "thiazol", "imidazoline" → "imidazol"
  const baseName = ringType.replace(/ine$/, "");

  // Reconstruct name with indicated hydrogen format
  const separator = prefix.length > 0 ? "-" : "";
  let transformedName = `${prefix}${separator}${hydrogenPosition}H-${heteroLocantStr}-${baseName}`;

  // Renumber substituent locants from old numbering to new numbering
  if (prefix.length > 0 && ringAtoms.length === 5) {
    transformedName = renumberSubstituentLocants(
      prefix,
      ringAtoms,
      hydrogenPosition,
      heteroLocantStr,
      baseName,
    );
  }

  if (process.env.VERBOSE) {
    console.log(
      `[transformPartiallySaturatedHeterocycle] Transformed:`,
      `"${match[0]}" → "${transformedName}"`,
    );
    console.log(
      `[transformPartiallySaturatedHeterocycle] Heteroatom locants: ${heteroLocantStr}, H position: ${hydrogenPosition}`,
    );
  }

  return transformedName;
}

/**
 * Renumbers substituent locants when transforming heterocycle naming.
 * Maps old numbering (e.g., N-first) to new numbering (e.g., S-first).
 */
function renumberSubstituentLocants(
  prefix: string,
  ringAtoms: Atom[],
  hydrogenPosition: number,
  heteroLocantStr: string,
  baseName: string,
): string {
  // Build mapping from old locants to new locants
  // ringAtoms is in the OLD numbering order (N-first)
  // We need to renumber based on S-first (standard 1,3-thiazol numbering)

  // Find sulfur and nitrogen atom indices in ringAtoms
  const sulfurIndex = ringAtoms.findIndex((a) => a.symbol === "S");
  const nitrogenIndex = ringAtoms.findIndex((a) => a.symbol === "N");

  if (sulfurIndex === -1 || nitrogenIndex === -1) {
    // If no S or N found, return without renumbering
    const separator = prefix.length > 0 ? "-" : "";
    return `${prefix}${separator}${hydrogenPosition}H-${heteroLocantStr}-${baseName}`;
  }

  // Create old-to-new locant mapping
  const locantMapping: Map<number, number> = new Map();

  // Calculate forward and backward distances from S to N
  const forwardDist =
    (nitrogenIndex - sulfurIndex + ringAtoms.length) % ringAtoms.length;
  const backwardDist =
    (sulfurIndex - nitrogenIndex + ringAtoms.length) % ringAtoms.length;

  // Choose direction that puts N at position 3 (i.e., 2 steps away from S)
  const goBackward = backwardDist === 2;

  if (process.env.VERBOSE) {
    console.log(
      `[renumberSubstituentLocants] Ring traversal: S at index ${sulfurIndex}, N at index ${nitrogenIndex}`,
    );
    console.log(
      `[renumberSubstituentLocants] Forward dist: ${forwardDist}, Backward dist: ${backwardDist}`,
    );
    console.log(
      `[renumberSubstituentLocants] Direction: ${goBackward ? "backward" : "forward"}`,
    );
  }

  // Map each old locant to new locant based on chosen direction
  for (let i = 0; i < ringAtoms.length; i++) {
    const oldLocant = i + 1; // Old locant (1-based, N-first)
    let newPosition: number;

    if (goBackward) {
      // Traverse backward from S
      newPosition = (sulfurIndex - i + ringAtoms.length) % ringAtoms.length;
    } else {
      // Traverse forward from S
      newPosition = (i - sulfurIndex + ringAtoms.length) % ringAtoms.length;
    }

    const newLocant = newPosition + 1; // New locant (1-based, S-first)
    locantMapping.set(oldLocant, newLocant);
  }

  if (process.env.VERBOSE) {
    console.log(
      `[renumberSubstituentLocants] Locant mapping (old→new):`,
      Array.from(locantMapping.entries())
        .map(([old, n]) => `${old}→${n}`)
        .join(", "),
    );
  }

  // Update substituent locants in the prefix
  const prefixPattern = /(\d+)-([a-z]+)/g;
  let updatedPrefix = prefix;
  let match2: RegExpExecArray | null;

  while ((match2 = prefixPattern.exec(prefix)) !== null) {
    const oldLocantStr = match2[1];
    const substituentName = match2[2];
    const oldLocant = Number.parseInt(oldLocantStr || "0", 10);
    const newLocant = locantMapping.get(oldLocant);

    if (newLocant !== undefined && newLocant !== oldLocant) {
      // Replace old locant with new locant
      const oldPattern = `${oldLocant}-${substituentName}`;
      const newPattern = `${newLocant}-${substituentName}`;
      updatedPrefix = updatedPrefix.replace(oldPattern, newPattern);

      if (process.env.VERBOSE) {
        console.log(
          `[renumberSubstituentLocants] Updated substituent locant: "${oldPattern}" → "${newPattern}"`,
        );
      }
    }
  }

  // Reconstruct name with updated prefix
  const sep = updatedPrefix.length > 0 ? "-" : "";
  const transformedName = `${updatedPrefix}${sep}${hydrogenPosition}H-${heteroLocantStr}-${baseName}`;

  if (updatedPrefix !== prefix && process.env.VERBOSE) {
    console.log(
      `[renumberSubstituentLocants] Name after locant renumbering: "${transformedName}"`,
    );
  }

  return transformedName;
}
