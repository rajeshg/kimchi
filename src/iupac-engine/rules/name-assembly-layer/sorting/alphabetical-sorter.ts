export function sortSubstituentsAlphabetically(
  substituentParts: string[],
): string[] {
  return substituentParts.sort((a, b) => {
    // Extract name after locants: "2,2-dichloro" → "dichloro" or "2-[1-(2-methylbutoxy)ethoxy]" → "[1-(2-methylbutoxy)ethoxy]"
    const aName = a.split("-").slice(1).join("-");
    const bName = b.split("-").slice(1).join("-");

    // Strip multiplicative prefixes for comparison: "dichloro" → "chloro", "bis(methyl)" → "(methyl)"
    const stripMultiplicativePrefix = (name: string): string => {
      const prefixes = [
        "bis",
        "tris",
        "tetrakis",
        "pentakis",
        "hexakis",
        "heptakis",
        "octakis",
        "nonakis",
        "decakis",
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
      for (const prefix of prefixes) {
        if (name.startsWith(prefix)) {
          return name.slice(prefix.length);
        }
      }
      return name;
    };

    // Extract the principal substituent name for complex substituents for alphabetization
    // Per IUPAC P-14.4: For complex substituents, alphabetize by the first letter of the complex name
    // ignoring locants, multiplicative prefixes, and opening delimiters
    // Example: "[1-(2-methylbutoxy)ethoxy]" → alphabetize by first letter inside: "m" (from methylbutoxy)
    // Example: "bis(1,1-dimethylethyl)" → alphabetize by "d" (from dimethylethyl)
    const extractPrincipalName = (name: string): string => {
      let result = name;

      // Remove leading brackets/parentheses and locants recursively
      // "[1-(2-methylbutoxy)ethoxy]" → "1-(2-methylbutoxy)ethoxy" → "(2-methylbutoxy)ethoxy"
      while (true) {
        const before = result;

        // Remove leading brackets/parentheses
        if (result.startsWith("(") || result.startsWith("[")) {
          result = result.slice(1);
        }
        // Remove trailing brackets/parentheses
        if (result.endsWith(")") || result.endsWith("]")) {
          result = result.slice(0, -1);
        }
        // Remove leading locants (number followed by hyphen)
        result = result.replace(/^\d+-/, "");

        // If nothing changed, we're done
        if (result === before) break;
      }

      // Now for complex substituents with nested parentheses/brackets,
      // we need to find the first alphabetic character
      // "(2-methylbutoxy)ethoxy" → look inside the first parenthetical → "methylbutoxy"
      if (result.startsWith("(") || result.startsWith("[")) {
        // Find the matching closing delimiter
        const openDelim = result[0];
        const closeDelim = openDelim === "(" ? ")" : "]";
        let depth = 1;
        let i = 1;
        while (i < result.length && depth > 0) {
          if (result[i] === openDelim) depth++;
          else if (result[i] === closeDelim) depth--;
          i++;
        }
        // Extract content inside the first parenthetical
        const insideFirst = result.substring(1, i - 1);
        // Recursively extract from inside, removing any locants
        result = extractPrincipalName(insideFirst);
      }

      return result;
    };

    let aBase = stripMultiplicativePrefix(aName);
    let bBase = stripMultiplicativePrefix(bName);

    // Extract principal names for alphabetization
    aBase = extractPrincipalName(aBase);
    bBase = extractPrincipalName(bBase);

    return aBase.localeCompare(bBase);
  });
}
