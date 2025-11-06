import type { OPSINService } from "../services/opsin-service";

/**
 * OPSIN Adapter Layer
 *
 * Pure transformation functions that use OPSIN data to replace hardcoded rule logic.
 * All functions are stateless and provide fallback behavior for missing OPSIN data.
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
 * @returns Multiplicative prefix, or fallback string if not found
 */
export function getMultiplierFromOPSIN(
  count: number,
  type: "basic" | "group",
  opsinService: OPSINService,
): string {
  const prefix = opsinService.getMultiplicativePrefix(count, type);

  if (prefix) {
    return prefix;
  }

  // Fallback for counts not in OPSIN data
  if (process.env.VERBOSE) {
    console.warn(
      `[OPSIN Adapter] No ${type} multiplier for count ${count}, using fallback`,
    );
  }

  // Return numeric fallback
  return `${count}-`;
}

/**
 * Get chain name from OPSIN alkanes data
 * @param length - Number of carbons in the chain
 * @param opsinService - OPSIN service instance
 * @returns Chain name (e.g., 1 → "meth", 2 → "eth"), or fallback if not found
 */
export function getChainNameFromOPSIN(
  length: number,
  opsinService: OPSINService,
): string {
  const chainName = opsinService.getChainName(length);

  if (chainName) {
    return chainName;
  }

  // Fallback for very long chains not in OPSIN data
  if (process.env.VERBOSE) {
    console.warn(
      `[OPSIN Adapter] No chain name for length ${length}, using fallback`,
    );
  }

  return `C${length}`;
}

/**
 * Get acyloxy name from OPSIN data (for ester substituents)
 * @param chainLength - Length of the acyl chain
 * @param opsinService - OPSIN service instance
 * @returns Acyloxy name (e.g., 2 → "acetoxy", 3 → "propanoyloxy")
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

  // If OPSIN returned a proper name, add "anoyloxy" suffix
  if (chainName && !chainName.startsWith("C")) {
    return `${chainName}anoyloxy`;
  }

  // Fallback for unknown chains
  return `${chainName}anoyloxy`;
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
 */
export function getAlkylPrefixFromOPSIN(
  length: number,
  opsinService: OPSINService,
): string {
  const chainName = getChainNameFromOPSIN(length, opsinService);

  if (chainName && !chainName.startsWith("C")) {
    return `${chainName}yl`;
  }

  return `C${length}yl`;
}
