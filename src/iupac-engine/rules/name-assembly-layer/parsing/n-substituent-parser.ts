/**
 * Parsing logic for N-substituent prefixes in amine nomenclature
 */

export interface NSubstituentEntry {
  locant: string;
  name: string;
}

/**
 * Parse N-substituent string for multiplicative amines.
 *
 * Handles patterns like:
 * - "N,N'-diformyl" → [{locant: "N,N'", name: "diformyl"}]
 * - "N,N'-diformyl-N,N'-dihydroxymethyl" → [{locant: "N,N'", name: "diformyl"}, {locant: "N,N'", name: "dihydroxymethyl"}]
 * - "N,N,N',N'-tetramethyl" → [{locant: "N,N,N',N'", name: "tetramethyl"}]
 *
 * @param nSubstituentsPrefix - N-substituent prefix string (e.g., "N,N'-diformyl")
 * @returns Array of parsed N-substituent entries
 */
export function parseNSubstituentsMultiplicative(
  nSubstituentsPrefix: string,
): NSubstituentEntry[] {
  const entries: NSubstituentEntry[] = [];

  // Split by the pattern that separates different substituent groups
  // We need to match patterns like: N,N'-diformyl or N-methyl or N'-ethyl or N,N,N',N'-tetramethyl
  // The regex matches: (N locants with commas and primes)-(substituent name)
  // Pattern breakdown: N(?:,N'?|')* matches N followed by zero or more of: ,N (with optional '), or just '
  const regex = /(N(?:,N'?|')*)-([a-z()]+)/gi;
  const matches = nSubstituentsPrefix.matchAll(regex);
  for (const match of matches) {
    const locantsPart = match[1];
    const namePart = match[2];
    if (locantsPart && namePart) {
      entries.push({
        locant: locantsPart,
        name: namePart,
      });
    }
  }

  if (process.env.VERBOSE) {
    console.log(
      `[parseNSubstituentsMultiplicative] Parsed N-substituents for multiplicative amine:`,
      JSON.stringify(entries),
    );
  }

  return entries;
}

/**
 * Parse N-substituent string for single amines.
 *
 * Handles patterns like:
 * - "N-methyl" → [{locant: "N", name: "methyl"}]
 * - "N,N-dimethyl" → [{locant: "N,N", name: "dimethyl"}]
 * - "N-ethyl-N-methyl" → [{locant: "N", name: "ethyl"}, {locant: "N", name: "methyl"}]
 *
 * @param nSubstituentsPrefix - N-substituent prefix string (e.g., "N,N-dimethyl")
 * @returns Array of parsed N-substituent entries
 */
export function parseNSubstituentsSingle(
  nSubstituentsPrefix: string,
): NSubstituentEntry[] {
  const entries: NSubstituentEntry[] = [];

  // Match patterns like "N-methyl", "N,N-dimethyl", etc.
  // Pattern 1: N,N-dimethyl → locants ["N", "N"], name "dimethyl"
  const multipleIdenticalMatch = nSubstituentsPrefix.match(/^(N(?:,N)+)-(.+)$/);
  if (
    multipleIdenticalMatch &&
    multipleIdenticalMatch[1] &&
    multipleIdenticalMatch[2]
  ) {
    const locantsPart = multipleIdenticalMatch[1]; // "N,N"
    const namePart = multipleIdenticalMatch[2]; // "dimethyl"
    const locants = locantsPart.split(","); // ["N", "N"]
    entries.push({
      locant: locants.join(","),
      name: namePart,
    });
  } else {
    // Pattern 2: N-methyl or N-ethyl-N-methyl (different substituents)
    // Split by "-N-" to get individual N-substituents
    const parts = nSubstituentsPrefix.split(/-N-/);
    for (const part of parts) {
      // Remove leading "N-" if present
      const cleanPart = part.startsWith("N-") ? part.substring(2) : part;
      if (cleanPart) {
        entries.push({
          locant: "N",
          name: cleanPart,
        });
      }
    }
  }

  if (process.env.VERBOSE) {
    console.log(
      `[parseNSubstituentsSingle] Parsed N-substituents:`,
      JSON.stringify(entries),
    );
  }

  return entries;
}
