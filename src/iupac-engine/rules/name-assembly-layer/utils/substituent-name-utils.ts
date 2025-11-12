/**
 * Utility functions for manipulating substituent names during IUPAC name assembly
 */

/**
 * Strip multiplicative prefixes from substituent names to get base name.
 * Preserves prefixes that are part of complex substituent names.
 *
 * Examples:
 * - "dimethyl" → "methyl"
 * - "tetrachloro" → "chloro"
 * - "diphenylphosphanyloxy" → "diphenylphosphanyloxy" (preserved, complex)
 *
 * @param name - Substituent name that may have a multiplicative prefix
 * @returns Base name without multiplicative prefix
 */
export function stripMultiplicativePrefix(name: string): string {
  // Don't strip multiplicative prefixes from complex substituent names
  // where "di", "tri", etc. are part of the substituent name itself
  // Examples: "diphenylphosphanyloxy", "triphenylphosphoryl", "dimethylamino"
  const complexSubstituentPatterns = ["phosph", "sulf", "amino", "phenyl"];
  for (const pattern of complexSubstituentPatterns) {
    if (name.includes(pattern)) {
      return name; // Don't strip prefix from complex substituents
    }
  }

  const prefixes = [
    "nona", // Check longer prefixes first
    "octa",
    "hepta",
    "hexa",
    "penta",
    "tetra",
    "tri",
    "di",
  ];
  for (const prefix of prefixes) {
    if (name.startsWith(prefix)) {
      return name.slice(prefix.length);
    }
  }
  return name;
}

/**
 * Strip leading and trailing delimiters (parentheses, brackets) from a name
 * for alphabetical comparison.
 *
 * Examples:
 * - "(propan-2-ylsulfanyl)" → "propan-2-ylsulfanyl"
 * - "[[methyl]]" → "methyl"
 *
 * @param name - Name that may have delimiters
 * @returns Name without outer delimiters
 */
export function stripDelimiters(name: string): string {
  let result = name;
  while (
    (result.startsWith("(") && result.endsWith(")")) ||
    (result.startsWith("[") && result.endsWith("]"))
  ) {
    result = result.slice(1, -1);
  }
  return result;
}

/**
 * Extract the name portion after locants from a substituent part.
 *
 * Examples:
 * - "2,2-dichloro" → "dichloro"
 * - "N,N-dimethyl" → "dimethyl"
 * - "3-methyl" → "methyl"
 *
 * @param part - Substituent part with locants (format: "locants-name")
 * @returns Name portion without locants
 */
export function extractAfterLocants(part: string): string {
  // Split by hyphen and take everything after first part (which is the locant)
  const parts = part.split("-");
  return parts.length > 1 ? parts.slice(1).join("-") : part;
}
