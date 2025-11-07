import type { OPSINService } from "./opsin-service";

/**
 * OPSIN Adapter Layer
 *
 * Pure transformation functions that use OPSIN data as the authoritative source.
 * All functions are stateless. Missing OPSIN data is treated as an error.
 *
 * Phase 2: OPSIN Rules Integration
 */

/**
 * Get functional group priority from OPSIN data
 * @param pattern - SMARTS or name pattern to lookup
 * @param opsinService - OPSIN service instance
 * @returns Priority number (lower = higher priority), or 999 if not found
 */
export function getPriorityFromOPSIN(
  pattern: string,
  opsinService: OPSINService,
): number {
  const priority = opsinService.getFunctionalGroupPriority(pattern);
  return priority ?? 999; // Fallback for unknown patterns
}

/**
 * Get functional group suffix from OPSIN data
 * @param pattern - SMARTS or name pattern to lookup
 * @param opsinService - OPSIN service instance
 * @returns Suffix string, or undefined if not found
 */
export function getSuffixFromOPSIN(
  pattern: string,
  opsinService: OPSINService,
): string | undefined {
  return opsinService.getFunctionalGroupSuffix(pattern);
}

/**
 * Get functional group prefix from OPSIN data
 * @param pattern - SMARTS or name pattern to lookup
 * @param opsinService - OPSIN service instance
 * @returns Prefix string, or undefined if not found
 */
export function getPrefixFromOPSIN(
  pattern: string,
  opsinService: OPSINService,
): string | undefined {
  return opsinService.getFunctionalGroupPrefix(pattern);
}

/**
 * Get multiplicative prefix from OPSIN data
 * @param count - Number to convert to prefix (e.g., 2 → "di")
 * @param type - 'basic' for simple multipliers (di, tri, tetra) or 'group' for complex (bis, tris, tetrakis)
 * @param opsinService - OPSIN service instance
 * @returns Multiplicative prefix
 * @throws Error if OPSIN data doesn't contain the requested multiplier
 */
export function getMultiplierFromOPSIN(
  count: number,
  type: "basic" | "group",
  opsinService: OPSINService,
): string {
  const prefix = opsinService.getMultiplicativePrefix(count, type);

  if (!prefix) {
    throw new Error(
      `[OPSIN Adapter] Missing ${type} multiplier for count ${count} in OPSIN data`,
    );
  }

  return prefix;
}

/**
 * Get chain name from OPSIN alkanes data
 * @param length - Number of carbons in the chain
 * @param opsinService - OPSIN service instance
 * @returns Chain name (e.g., 1 → "meth", 2 → "eth")
 * @throws Error if OPSIN data doesn't contain the requested chain length
 */
export function getChainNameFromOPSIN(
  length: number,
  opsinService: OPSINService,
): string {
  const chainName = opsinService.getChainName(length);

  if (!chainName) {
    throw new Error(
      `[OPSIN Adapter] Missing chain name for length ${length} in OPSIN data`,
    );
  }

  return chainName;
}

/**
 * Get acyloxy name from OPSIN data (for ester substituents)
 * @param chainLength - Length of the acyl chain
 * @param opsinService - OPSIN service instance
 * @returns Acyloxy name (e.g., 2 → "acetoxy", 3 → "propanoyloxy")
 * @throws Error if OPSIN data doesn't contain the requested chain length
 */
export function getAcyloxyNameFromOPSIN(
  chainLength: number,
  opsinService: OPSINService,
): string {
  // Special case: acetoxy (common name for 2-carbon acyl)
  if (chainLength === 2) {
    return "acetoxy";
  }

  // Special case: formyloxy (1-carbon acyl)
  if (chainLength === 1) {
    return "formyloxy";
  }

  // General case: use OPSIN chain name + "oyloxy"
  const chainName = getChainNameFromOPSIN(chainLength, opsinService);
  return `${chainName}anoyloxy`;
}

/**
 * Add 'a' suffix to multiplier if it ends with a consonant cluster
 * IUPAC rule: multipliers 4-19 get 'a' added when followed by a consonant
 * (e.g., "tetr" + "methyl" = "tetramethyl")
 */
function addMultiplierVowel(multiplier: string, nextChar: string): string {
  // List of multipliers that need 'a' added: tetr, pent, hex, hept, oct, non
  // (dec, undec, dodec, etc. already end with vowels)
  const needsVowel = ["tetr", "pent", "hex", "hept", "oct", "non"];

  // Check if multiplier needs 'a' and next character is a consonant
  if (needsVowel.includes(multiplier) && /^[^aeiou]/i.test(nextChar)) {
    return multiplier + "a";
  }

  return multiplier;
}

/**
 * Get simple multiplicative prefix (di, tri, tetra, etc.)
 * Wrapper for basic multiplier type
 */
export function getSimpleMultiplier(
  count: number,
  opsinService: OPSINService,
): string {
  return getMultiplierFromOPSIN(count, "basic", opsinService);
}

/**
 * Get simple multiplicative prefix with vowel handling
 * Adds 'a' to multipliers (tetr, pent, hex, etc.) when followed by consonant
 * @param count - Number to convert to prefix
 * @param nextChar - First character of the following word (to determine if 'a' is needed)
 * @param opsinService - OPSIN service instance
 */
export function getSimpleMultiplierWithVowel(
  count: number,
  nextChar: string,
  opsinService: OPSINService,
): string {
  const multiplier = getMultiplierFromOPSIN(count, "basic", opsinService);
  return addMultiplierVowel(multiplier, nextChar);
}

/**
 * Get complex multiplicative prefix (bis, tris, tetrakis, etc.)
 * Wrapper for group multiplier type
 */
export function getComplexMultiplier(
  count: number,
  opsinService: OPSINService,
): string {
  return getMultiplierFromOPSIN(count, "group", opsinService);
}

/**
 * Check if a functional group pattern exists in OPSIN data
 * @param pattern - Pattern to check
 * @param opsinService - OPSIN service instance
 * @returns true if pattern exists, false otherwise
 */
export function hasFunctionalGroupInOPSIN(
  pattern: string,
  opsinService: OPSINService,
): boolean {
  return opsinService.hasFunctionalGroup(pattern);
}

/**
 * Get functional group name from OPSIN data
 * @param pattern - SMARTS or name pattern to lookup
 * @param opsinService - OPSIN service instance
 * @returns Functional group name, or undefined if not found
 */
export function getFunctionalGroupNameFromOPSIN(
  pattern: string,
  opsinService: OPSINService,
): string | undefined {
  return opsinService.getFunctionalGroupName(pattern);
}

/**
 * Build alkyl prefix from chain length using OPSIN data
 * @param length - Number of carbons
 * @param opsinService - OPSIN service instance
 * @returns Alkyl prefix (e.g., 1 → "methyl", 2 → "ethyl")
 * @throws Error if OPSIN data doesn't contain the requested chain length
 */
export function getAlkylPrefixFromOPSIN(
  length: number,
  opsinService: OPSINService,
): string {
  const chainName = getChainNameFromOPSIN(length, opsinService);
  return `${chainName}yl`;
}

/**
 * Get heteroatom prefix from OPSIN data for replacement nomenclature
 * @param atomSymbol - Element symbol (e.g., "O", "N", "S")
 * @param opsinService - OPSIN service instance
 * @returns Heteroatom prefix (e.g., "oxa", "aza", "thia"), or undefined if not found
 */
export function getHeteroAtomPrefixFromOPSIN(
  atomSymbol: string,
  opsinService: OPSINService,
): string | undefined {
  return opsinService.getHeteroAtomPrefix(atomSymbol);
}
