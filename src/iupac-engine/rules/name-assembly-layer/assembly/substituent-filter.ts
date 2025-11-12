import type { FunctionalGroup } from "src/iupac-engine/types";

/**
 * Normalizes a string for comparison by removing locants, hyphens, brackets, and multiplicative prefixes.
 * Example: "2,2-dichloro" → "chloro", "bis(methyl)" → "methyl"
 */
export function normalizeForComparison(s: string): string {
  return s
    .toString()
    .toLowerCase()
    .replace(/\b(di|tri|tetra|penta|hexa|hepta|octa|nona|deca)\b/g, "") // remove multiplicative prefixes
    .replace(/[\d,[\]()-]/g, "") // remove digits, commas, hyphens and brackets
    .replace(/\s+/g, "")
    .trim();
}

/**
 * Extracts the base name from a substituent by removing locants, multiplicative prefixes, and delimiters.
 * Returns only the first alpha token.
 * Example: "2-dichloro" → "chloro", "3,3-bis(methyl)" → "methyl"
 */
export function extractBaseName(s: string): string {
  // Remove locants, multiplicative prefixes and delimiters
  let t = s.toString().toLowerCase();
  t = t.replace(/\b(di|tri|tetra|penta|hexa|hepta|octa|nona|deca)\b/g, "");
  t = t.replace(/[\d,[\]()-]/g, "");
  t = t.replace(/\s+/g, "");
  // Return only leading letters
  const m = t.match(/^[a-z]+/);
  return m ? m[0] : t;
}

/**
 * Filters substituent parts to remove duplicates of:
 * 1. Principal functional group prefix
 * 2. Hydroxy substituents when principal suffix is alcohol (ol)
 * 3. Substituents already included in parent name
 *
 * Per IUPAC P-15.1: avoid duplicating substituents that are already in the parent structure.
 */
export function filterSubstituents(
  substituentParts: string[],
  parentAssembled: string,
  principalFG: FunctionalGroup | null,
): string[] {
  const normalizedParent = normalizeForComparison(parentAssembled);

  // Extract principal prefix if exists (e.g., "hydroxy" for alcohols)
  const principalPrefix =
    principalFG && principalFG.prefix
      ? principalFG.prefix.toString().toLowerCase()
      : null;

  // Filter out parts that duplicate the principal functional-group prefix
  let filtered = substituentParts.filter((p) => {
    if (!principalPrefix) return true;
    const base = extractBaseName(p);
    if (!base) return true;
    // Treat 'hydroxy' as duplicate when principal prefix is 'hydroxy'
    if (base === principalPrefix) return false;
    return true;
  });

  // If principal suffix is an alcohol (ol), also filter out any 'hydroxy' substituents
  const principalSuffix =
    principalFG && principalFG.suffix
      ? (principalFG.suffix as string).toLowerCase()
      : "";

  if (principalSuffix.includes("ol")) {
    const beforeFilter = [...filtered];
    filtered = filtered.filter((p) => {
      // Keep complex substituents that contain hydroxy as part of their internal structure
      // Complex substituents are identified by having parentheses (e.g., "2-(2-hydroxypropan-2-yl)")
      const isComplexStructuralSubstituent = p.includes("(") && p.includes(")");
      const containsHydroxy = /hydroxy/i.test(p);

      // Only filter out simple "hydroxy" substituents, not complex ones
      if (isComplexStructuralSubstituent) {
        return true; // Keep all complex substituents
      }
      return !containsHydroxy; // Filter out simple hydroxy substituents
    });

    if (process.env.VERBOSE && beforeFilter.length !== filtered.length) {
      console.log(
        `[filterSubstituents] Hydroxy filter removed: ${beforeFilter.filter((p) => !filtered.includes(p)).join(", ")}`,
      );
      console.log(
        `[filterSubstituents] Remaining after hydroxy filter: ${filtered.join(", ")}`,
      );
    }
  }

  // Find substituentParts that are not (approximately) present in parent
  const missingParts = filtered.filter((part) => {
    const normalizedPart = normalizeForComparison(part);
    const isMissing =
      normalizedPart.length > 0 && !normalizedParent.includes(normalizedPart);
    if (process.env.VERBOSE) {
      console.log(
        `[filterSubstituents] Checking part "${part}": normalized="${normalizedPart}", parent="${parentAssembled}", normalizedParent="${normalizedParent}", isMissing=${isMissing}`,
      );
    }
    return isMissing;
  });

  if (missingParts.length === 0 && process.env.VERBOSE) {
    console.log(
      "[filterSubstituents] Skipping adding substituentParts because parent already contains them (approx match)",
    );
    console.log(`[filterSubstituents] filtered: ${JSON.stringify(filtered)}`);
    console.log(`[filterSubstituents] normalizedParent: "${normalizedParent}"`);
  }

  return missingParts;
}

/**
 * Fixes locant hyphenation in substituent parts.
 * Example: "6hydroxy" → "6-hydroxy"
 */
function fixLocantHyphenation(p: string): string {
  let s = p.toString();
  // Ensure leading locant has a hyphen: "6hydroxy" -> "6-hydroxy"
  // Match: digit(s) followed by a letter (not another digit or hyphen)
  s = s.replace(/^(\d+)(?=[A-Za-z])/, "$1-");
  return s;
}

/**
 * Joins substituent parts with proper hyphenation.
 *
 * IUPAC hyphenation rules:
 * 1. Single substituent with no locant (e.g., "methyl"): join directly → "methylcyclohexane"
 * 2. Single substituent with locant (e.g., "2-methyl"): already has hyphen, join directly → "2-methylcyclohexane"
 * 3. Multiple substituents on chain/ring: join with hyphens → "2,2-dichloro-1-methylcyclohexane"
 * 4. Multiple substituents on heteroatom (no locants): join directly → "ethylmethylsilane"
 */
export function joinSubstituents(
  missingParts: string[],
  isHeteroatomParent: boolean,
): string {
  if (missingParts.length === 0) {
    return "";
  }

  // Fix locant hyphens in all parts
  const fixedParts = missingParts.map(fixLocantHyphenation);

  if (process.env.VERBOSE) {
    console.log("[joinSubstituents] fixedParts:", JSON.stringify(fixedParts));
  }

  if (fixedParts.length === 1) {
    return fixedParts[0] ?? "";
  }

  // Multiple parts: join with or without hyphens depending on parent type
  if (isHeteroatomParent) {
    return fixedParts.join(""); // No hyphens for heteroatom parents
  } else {
    const joined = fixedParts.join("-"); // Hyphens for chain/ring parents
    if (process.env.VERBOSE) {
      console.log("[joinSubstituents] joining with hyphen:", joined);
    }
    return joined;
  }
}
