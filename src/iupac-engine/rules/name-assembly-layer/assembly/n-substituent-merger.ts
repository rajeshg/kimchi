/**
 * Logic for merging N-substituent entries into assembled IUPAC names
 */

import type { OPSINService } from "../../../opsin-service";
import type { ParentStructureExtended } from "../types";
import { getMultiplicativePrefix } from "../utils";
import {
  stripMultiplicativePrefix,
  stripDelimiters,
  extractAfterLocants,
} from "../utils/substituent-name-utils";
import type { NSubstituentEntry } from "../parsing/n-substituent-parser";

/**
 * Merge N-substituent entries with existing substituents in the assembled name.
 * Groups substituents with the same base name and re-sorts alphabetically.
 *
 * @param name - Current assembled name (without suffix)
 * @param nSubstituentEntries - Array of N-substituent entries to merge
 * @param parentStructure - Parent structure information
 * @param opsinService - Optional OPSIN service for multiplicative prefixes
 * @returns Updated name with N-substituents merged and sorted
 */
export function mergeNSubstituentsWithName(
  name: string,
  nSubstituentEntries: NSubstituentEntry[],
  parentStructure: ParentStructureExtended,
  opsinService?: OPSINService,
): string {
  if (nSubstituentEntries.length === 0) {
    return name;
  }

  if (process.env.VERBOSE) {
    console.log(
      `[mergeNSubstituentsWithName] Merging N-substituents with existing name: "${name}"`,
    );
  }

  // Extract parent name and suffix from current name
  // The name structure is: [substituents][parent]
  // At this point, the suffix has NOT been added yet (that happens later)
  // Note: The parent name might have lost its trailing 'e' when joined (e.g., "azirine" → "azirin")

  // Find where the parent name starts in the assembled name
  // For heterocycles that were transformed (e.g., "thiazoline" → "4H-1,3-thiazol"),
  // we need to detect the transformed parent portion
  const fullParentName =
    parentStructure.assembledName || parentStructure.name || "";
  let parentName = fullParentName;
  let parentIndex = name.indexOf(parentName);

  // If not found, try without trailing 'e' (common when joining)
  if (parentIndex === -1 && parentName.endsWith("e")) {
    const parentWithoutE = parentName.slice(0, -1);
    parentIndex = name.indexOf(parentWithoutE);
    if (parentIndex !== -1) {
      parentName = parentWithoutE;
    }
  }

  // Special case: Check for partially saturated heterocycle transformation
  // Pattern: "[substituents]-4H-1,3-thiazol" where parent was originally "thiazoline"
  // Look for patterns like "XH-Y,Z-baseName" where X,Y,Z are digits
  if (parentIndex === -1 && parentStructure.type === "ring") {
    // Try to match a transformed heterocycle pattern: "XH-Y,Z-baseName"
    const heterocyclePattern = /(\d+H-[\d,]+-[a-z]+)$/;
    const match = name.match(heterocyclePattern);
    if (match && match[1]) {
      // Found a transformed heterocycle parent
      parentName = match[1];
      parentIndex = name.indexOf(parentName);
      if (process.env.VERBOSE) {
        console.log(
          `[mergeNSubstituentsWithName] Detected transformed heterocycle parent: "${parentName}"`,
        );
      }
    }
  }

  if (parentIndex !== -1) {
    // Extract the substituent portion (everything before parent)
    const substituentPortion = name.substring(0, parentIndex);
    const parentPortion = name.substring(parentIndex);

    if (process.env.VERBOSE) {
      console.log(
        `[mergeNSubstituentsWithName] substituentPortion: "${substituentPortion}", parentPortion: "${parentPortion}"`,
      );
    }

    // Parse existing substituent parts from the substituent portion
    const existingParts = parseSubstituentParts(substituentPortion);

    if (process.env.VERBOSE) {
      console.log(
        `[mergeNSubstituentsWithName] Existing substituent parts:`,
        JSON.stringify(existingParts),
      );
    }

    // Add N-substituent parts
    for (const entry of nSubstituentEntries) {
      const nPart = `${entry.locant}-${entry.name}`;
      existingParts.push(nPart);
    }

    if (process.env.VERBOSE) {
      console.log(
        `[mergeNSubstituentsWithName] All parts before grouping:`,
        JSON.stringify(existingParts),
      );
    }

    // Group substituents with the same base name
    const groupedParts = groupAndSortSubstituents(existingParts, opsinService);

    if (process.env.VERBOSE) {
      console.log(
        `[mergeNSubstituentsWithName] Grouped parts after sorting:`,
        JSON.stringify(groupedParts),
      );
    }

    // Rebuild name with sorted and grouped substituents
    name = rebuildNameWithSubstituents(groupedParts, parentPortion);

    if (process.env.VERBOSE) {
      console.log(
        `[mergeNSubstituentsWithName] Rebuilt name with N-substituents: "${name}"`,
      );
    }
  }

  return name;
}

/**
 * Parse existing substituent parts from the substituent portion of a name.
 * Strategy: split on hyphens that come BEFORE a locant (digit or letter at start)
 * BUT preserve parts within parentheses/brackets.
 *
 * Example: "3-methyl-3-(propan-2-ylsulfanyl)" → ["3-methyl", "3-(propan-2-ylsulfanyl)"]
 *
 * @param substituentPortion - The substituent portion of the name
 * @returns Array of substituent part strings
 */
function parseSubstituentParts(substituentPortion: string): string[] {
  const existingParts: string[] = [];
  if (!substituentPortion) {
    return existingParts;
  }

  // Remove trailing hyphen if present
  let remaining = substituentPortion.replace(/-$/, "");

  // Parse parts by finding split points:
  // A split point is a hyphen that is:
  // 1. NOT inside parentheses/brackets (depth = 0)
  // 2. Followed by a digit or capital letter (indicating start of new locant)
  // 3. NOT followed by another hyphen
  const splitPoints: number[] = [];
  let depth = 0;
  for (let i = 0; i < remaining.length; i++) {
    const char = remaining[i];
    if (char === "(" || char === "[") {
      depth++;
    } else if (char === ")" || char === "]") {
      depth--;
    } else if (char === "-" && depth === 0 && i + 1 < remaining.length) {
      const nextChar = remaining[i + 1];
      // Check if next char is a digit (for locants like "3-") or letter (for "N-")
      // But NOT if it's a lowercase letter right after a digit-hyphen (that's part of the name)
      if (nextChar) {
        const isStartOfNewPart =
          /\d/.test(nextChar) ||
          (nextChar === "N" && (i === 0 || remaining[i - 1] === "-"));
        if (isStartOfNewPart) {
          splitPoints.push(i);
        }
      }
    }
  }

  // Extract parts based on split points
  let lastIdx = 0;
  for (const splitIdx of splitPoints) {
    existingParts.push(remaining.substring(lastIdx, splitIdx));
    lastIdx = splitIdx + 1; // Skip the hyphen
  }
  // Add the last part (or entire string if no split points)
  if (lastIdx < remaining.length) {
    existingParts.push(remaining.substring(lastIdx));
  }

  return existingParts;
}

/**
 * Group substituents with the same base name and sort alphabetically.
 *
 * Example: ["3-methyl", "N,N-dimethyl"] → ["N,N,3-trimethyl"]
 *
 * @param parts - Array of substituent parts (format: "locants-name")
 * @param opsinService - Optional OPSIN service for multiplicative prefixes
 * @returns Array of grouped and sorted substituent parts
 */
function groupAndSortSubstituents(
  parts: string[],
  opsinService?: OPSINService,
): string[] {
  // Group substituents with the same base name
  // E.g., "3-methyl" and "N,N-dimethyl" should combine to "N,N,3-trimethyl"
  const substituentGroups = new Map<string, string[]>();
  for (const part of parts) {
    // Parse part into locants and name
    // Format: "locants-name" e.g. "3-methyl" or "N,N-dimethyl" or "3-(propan-2-ylsulfanyl)"
    const hyphenIdx = part.indexOf("-");
    if (hyphenIdx === -1) continue;

    const locantsStr = part.substring(0, hyphenIdx);
    let name = part.substring(hyphenIdx + 1);

    let baseName = stripMultiplicativePrefix(name);

    // Strip outer parentheses from base name if present
    // E.g., "(propan-2-ylsulfanyl)" becomes "propan-2-ylsulfanyl"
    // BUT preserve parentheses for N-aryl substituents like "(3-chloro-4-fluorophenyl)"
    const isNLocant = locantsStr.split(",").some((loc) => loc === "N");
    const hasComplexStructure = baseName.includes("-");
    const shouldPreserveParentheses = isNLocant && hasComplexStructure;

    if (!shouldPreserveParentheses) {
      while (baseName.startsWith("(") && baseName.endsWith(")")) {
        baseName = baseName.slice(1, -1);
      }
    }

    // Split locants by comma
    const locants = locantsStr.split(",");

    if (!substituentGroups.has(baseName)) {
      substituentGroups.set(baseName, []);
    }
    substituentGroups.get(baseName)!.push(...locants);
  }

  if (process.env.VERBOSE) {
    console.log(
      `[groupAndSortSubstituents] Substituent groups:`,
      JSON.stringify(Array.from(substituentGroups.entries())),
    );
  }

  // Rebuild parts from groups
  const groupedParts: string[] = [];
  for (const [baseName, locants] of substituentGroups.entries()) {
    // Sort locants: N comes first, then numbers
    locants.sort((a, b) => {
      if (a === "N" && b !== "N") return -1;
      if (a !== "N" && b === "N") return 1;
      if (a === "N" && b === "N") return 0;
      return Number.parseInt(a, 10) - Number.parseInt(b, 10);
    });

    const locantsStr = locants.join(",");
    const count = locants.length;

    // Add multiplicative prefix if count > 1
    const prefix =
      count > 1
        ? getMultiplicativePrefix(
            count,
            false,
            opsinService,
            baseName.charAt(0),
          )
        : "";
    const fullName = prefix + baseName;

    groupedParts.push(`${locantsStr}-${fullName}`);
  }

  if (process.env.VERBOSE) {
    console.log(
      `[groupAndSortSubstituents] Grouped parts before sorting:`,
      JSON.stringify(groupedParts),
    );
  }

  // Sort alphabetically (same logic as substituent sorting)
  groupedParts.sort((a, b) => {
    const aName = extractAfterLocants(a);
    const bName = extractAfterLocants(b);

    let aBase = stripMultiplicativePrefix(aName);
    let bBase = stripMultiplicativePrefix(bName);

    // Strip delimiters for alphabetization
    aBase = stripDelimiters(aBase);
    bBase = stripDelimiters(bBase);

    return aBase.localeCompare(bBase);
  });

  return groupedParts;
}

/**
 * Rebuild the full name with sorted and grouped substituents attached to parent.
 *
 * Handles special cases for connector suffixes (-yl, -ylidene, etc.) that should
 * attach directly to parent without hyphen.
 *
 * @param groupedParts - Sorted and grouped substituent parts
 * @param parentPortion - The parent structure name portion
 * @returns Rebuilt name with substituents and parent
 */
function rebuildNameWithSubstituents(
  groupedParts: string[],
  parentPortion: string,
): string {
  let name: string;

  // Check if the last substituent ends with a connector (like -yl) that should attach directly to parent
  if (groupedParts.length > 0) {
    // Extract the last substituent's name (after locants)
    const lastPart = groupedParts[groupedParts.length - 1]!;
    const lastHyphenIdx = lastPart.lastIndexOf("-");
    const lastSubstName =
      lastHyphenIdx >= 0 ? lastPart.substring(lastHyphenIdx + 1) : lastPart;

    // If last substituent ends with a connector suffix, attach directly without hyphen
    // UNLESS the parent starts with a locant indicator (digit or special format like "4H-")
    const connectorSuffixes = ["yl", "ylidene", "ylidyne", "ylium"];
    const endsWithConnector = connectorSuffixes.some((suffix) =>
      lastSubstName.endsWith(suffix),
    );

    // Check if parent starts with a locant or special indicator that needs a hyphen
    const parentNeedsHyphen = /^[\d]/.test(parentPortion);

    if (endsWithConnector && groupedParts.length === 1 && !parentNeedsHyphen) {
      // Single substituent ending with connector: attach directly
      name = lastPart + parentPortion;
    } else if (
      endsWithConnector &&
      groupedParts.length > 1 &&
      !parentNeedsHyphen
    ) {
      // Multiple substituents, last one ending with connector
      const allButLast = groupedParts.slice(0, -1).join("-");
      name = allButLast + "-" + lastPart + parentPortion;
    } else {
      // Normal case: all substituents joined with hyphens
      name = groupedParts.join("-") + "-" + parentPortion;
    }
  } else {
    name = parentPortion;
  }

  return name;
}
