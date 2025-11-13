import * as fs from "fs";
import * as path from "path";

/**
 * Extract OPSIN XML rules into structured JSON format
 * Handles all OPSIN XML files from opsin-iupac-data directory
 */

interface Token {
  value: string;
  aliases: string[];
  metadata?: Record<string, string>;
}

interface TokenList {
  tagname: string;
  type?: string;
  subType?: string;
  symbol?: string;
  tokens: Token[];
}

interface ExtractedRules {
  alkanes: Record<string, string>;
  alkaneStemComponents: {
    units: Record<string, string>;
    tens: Record<string, string>;
    hundreds: Record<string, string>;
  };
  multipliers: {
    basic: Record<string, string>;
    group: Record<string, string>;
    vonBaeyer: Record<string, string>;
    ringAssembly: Record<string, string>;
    fractional: Record<string, string>;
  };
  suffixes: Record<string, { aliases: string[]; type?: string }>;
  substituents: Record<string, { aliases: string[]; smiles?: string }>;
  functionalGroups: Record<string, { aliases: string[]; type?: string }>;
  ringSystems: Record<string, { aliases: string[]; labels?: string }>;
  [key: string]: any;
}

/**
 * Parse a single XML token element
 */
function parseToken(tokenLine: string): Token | null {
  // Match: <token value="X" ...>content|aliases</token>
  const match = tokenLine.match(/<token\s+([^>]*)>(.*?)<\/token>/);
  if (!match) return null;

  const attrs = match[1];
  const content = match[2];

  if (!attrs || !content) return null;

  // Extract value attribute
  const valueMatch = attrs.match(/value="([^"]*)"/);
  if (!valueMatch || !valueMatch[1]) return null;

  const value = valueMatch[1];

  // Extract other metadata attributes
  const metadata: Record<string, string> = {};
  const attrRegex = /(\w+)="([^"]*)"/g;
  let attrMatch;
  while ((attrMatch = attrRegex.exec(attrs)) !== null) {
    const attrName = attrMatch[1];
    const attrValue = attrMatch[2];
    if (attrName && attrValue && attrName !== "value") {
      metadata[attrName] = attrValue;
    }
  }

  // Parse aliases from content (pipe-separated)
  const aliases = content
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    value,
    aliases,
    metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
  };
}

/**
 * Extract all token lists from an XML file
 */
function extractTokenLists(xmlContent: string): TokenList[] {
  const lists: TokenList[] = [];

  // Find all tokenList elements (handle multi-line)
  const tokenListRegex = /<tokenList\s+([^>]*)>([\s\S]*?)<\/tokenList>/g;
  let match;

  while ((match = tokenListRegex.exec(xmlContent)) !== null) {
    const attrs = match[1];
    const content = match[2];

    if (!attrs || !content) continue;

    // Parse tokenList attributes
    const tagnameMatch = attrs.match(/tagname="([^"]*)"/);
    const typeMatch = attrs.match(/type="([^"]*)"/);
    const subTypeMatch = attrs.match(/subType="([^"]*)"/);
    const symbolMatch = attrs.match(/symbol="([^"]*)"/);

    if (!tagnameMatch || !tagnameMatch[1]) continue;

    // Extract all token elements
    const tokenRegex = /<token[^>]*>[\s\S]*?<\/token>/g;
    const tokens: Token[] = [];
    let tokenMatch;

    while ((tokenMatch = tokenRegex.exec(content)) !== null) {
      const token = parseToken(tokenMatch[0]);
      if (token) tokens.push(token);
    }

    if (tokens.length > 0) {
      lists.push({
        tagname: tagnameMatch[1],
        type: typeMatch?.[1],
        subType: subTypeMatch?.[1],
        symbol: symbolMatch?.[1],
        tokens,
      });
    }
  }

  return lists;
}

/**
 * Process alkanes.xml
 */
function processAlkanes(xmlContent: string): Partial<ExtractedRules> {
  const result: Partial<ExtractedRules> = {
    alkanes: {},
    alkaneStemComponents: {
      units: {},
      tens: {},
      hundreds: {},
    },
  };

  const lists = extractTokenLists(xmlContent);

  for (const list of lists) {
    if (list.tagname === "group" && list.subType === "alkaneStem") {
      // Build alkanes map: C -> meth, CC -> eth, etc.
      for (const token of list.tokens) {
        const alias = token.aliases[0];
        if (alias) {
          result.alkanes![token.value] = alias;
        }
      }
    } else if (list.tagname === "alkaneStemComponent") {
      // Categorize by symbol
      const category =
        list.symbol === "Ï"
          ? "units"
          : list.symbol === "Ð"
            ? "tens"
            : list.symbol === "Õ"
              ? "hundreds"
              : null;

      if (category && result.alkaneStemComponents) {
        for (const token of list.tokens) {
          if (token.aliases.length > 0) {
            result.alkaneStemComponents[
              category as "units" | "tens" | "hundreds"
            ][token.value] = token.aliases.join("|");
          }
        }
      }
    }
  }

  return result;
}

/**
 * Process multipliers.xml
 */
function processMultipliers(xmlContent: string): Partial<ExtractedRules> {
  const result: Partial<ExtractedRules> = {
    multipliers: {
      basic: {},
      group: {},
      vonBaeyer: {},
      ringAssembly: {},
      fractional: {},
    },
  };

  const lists = extractTokenLists(xmlContent);

  for (const list of lists) {
    let category:
      | "basic"
      | "group"
      | "vonBaeyer"
      | "ringAssembly"
      | "fractional"
      | null = null;

    if (list.tagname === "multiplier") {
      if (list.type === "basic") {
        category = "basic";
      } else if (list.type === "group") {
        category = "group";
      } else if (list.type === "VonBaeyer") {
        category = "vonBaeyer";
      }
    } else if (list.tagname === "ringAssemblyMultiplier") {
      category = "ringAssembly";
    } else if (list.tagname === "fractionalMultiplier") {
      category = "fractional";
    }

    if (category && result.multipliers) {
      for (const token of list.tokens) {
        const alias = token.aliases[0];
        if (alias) {
          result.multipliers[category][token.value] = alias;
        }
      }
    }
  }

  return result;
}

/**
 * Process suffixes.xml
 */
function processSuffixes(xmlContent: string): Partial<ExtractedRules> {
  const result: Partial<ExtractedRules> = {
    suffixes: {},
  };

  const lists = extractTokenLists(xmlContent);

  for (const list of lists) {
    if (list.tagname === "suffix") {
      for (const token of list.tokens) {
        result.suffixes![token.value] = {
          aliases: token.aliases,
          type: list.type,
        };
      }
    }
  }

  return result;
}

/**
 * Process substituents.xml (and similar files)
 */
function processSubstituents(xmlContent: string): Partial<ExtractedRules> {
  const result: Partial<ExtractedRules> = {
    substituents: {},
  };

  const lists = extractTokenLists(xmlContent);

  for (const list of lists) {
    if (list.tagname === "group" || list.tagname === "token") {
      for (const token of list.tokens) {
        result.substituents![token.value] = {
          aliases: token.aliases,
          smiles: token.metadata?.value || undefined,
        };
      }
    }
  }

  return result;
}

/**
 * Process functionalTerms.xml
 */
function processFunctionalTerms(xmlContent: string): Partial<ExtractedRules> {
  const result: Partial<ExtractedRules> = {
    functionalGroups: {},
  };

  const lists = extractTokenLists(xmlContent);

  for (const list of lists) {
    for (const token of list.tokens) {
      result.functionalGroups![token.value] = {
        aliases: token.aliases,
        type: list.type,
      };
    }
  }

  return result;
}

/**
 * Process arylGroups.xml and simpleCyclicGroups.xml for ring systems
 */
function processRingSystems(xmlContent: string): Partial<ExtractedRules> {
  const result: Partial<ExtractedRules> = {
    ringSystems: {},
  };

  const lists = extractTokenLists(xmlContent);

  for (const list of lists) {
    if (list.tagname === "group" && list.type === "ring") {
      for (const token of list.tokens) {
        const smiles = token.value;
        
        // If entry exists, merge aliases
        if (result.ringSystems![smiles]) {
          const existing = result.ringSystems![smiles];
          const newAliases = token.aliases.filter(
            a => !existing.aliases.includes(a)
          );
          existing.aliases.push(...newAliases);
        } else {
          result.ringSystems![smiles] = {
            aliases: token.aliases,
            labels: token.metadata?.labels,
          };
        }
      }
    }
  }

  return result;
}

/**
 * Main extraction function
 */
function extractAllRules(): ExtractedRules {
  const dataDir = path.join(__dirname, "../opsin-iupac-data");
  const rules: ExtractedRules = {
    alkanes: {},
    alkaneStemComponents: { units: {}, tens: {}, hundreds: {} },
    multipliers: {
      basic: {},
      group: {},
      vonBaeyer: {},
      ringAssembly: {},
      fractional: {},
    },
    suffixes: {},
    substituents: {},
    functionalGroups: {},
    ringSystems: {},
  };

  // Process key files
  const filesToProcess = [
    { file: "alkanes.xml", processor: processAlkanes },
    { file: "multipliers.xml", processor: processMultipliers },
    { file: "suffixes.xml", processor: processSuffixes },
    { file: "functionalTerms.xml", processor: processFunctionalTerms },
    { file: "substituents.xml", processor: processSubstituents },
    { file: "simpleSubstituents.xml", processor: processSubstituents },
    { file: "arylGroups.xml", processor: processRingSystems },
    { file: "simpleCyclicGroups.xml", processor: processRingSystems },
  ];

  for (const { file, processor } of filesToProcess) {
    const filePath = path.join(dataDir, file);
    if (fs.existsSync(filePath)) {
      try {
        const content = fs.readFileSync(filePath, "utf-8");
        const extracted = processor(content);
        
        // Special handling for ringSystems to merge entries
        if (extracted.ringSystems) {
          for (const [smiles, data] of Object.entries(extracted.ringSystems)) {
            if (rules.ringSystems[smiles]) {
              // Merge aliases
              const existing = rules.ringSystems[smiles];
              const newAliases = data.aliases.filter(
                a => !existing.aliases.includes(a)
              );
              existing.aliases.push(...newAliases);
            } else {
              rules.ringSystems[smiles] = data;
            }
          }
          delete extracted.ringSystems;
        }
        
        Object.assign(rules, extracted);
        console.log(`✓ Processed ${file}`);
      } catch (err) {
        console.error(`✗ Error processing ${file}:`, err);
      }
    }
  }

  return rules;
}

/**
 * Main execution
 */
function main() {
  console.log("Extracting OPSIN rules...\n");

  const rules = extractAllRules();

  // Write output
  const outputPath = path.join(__dirname, "../opsin-rules.json");
  fs.writeFileSync(outputPath, JSON.stringify(rules, null, 2), "utf-8");

  console.log(`\n✓ Successfully extracted rules to ${outputPath}`);
  console.log("\nExtracted data:");
  console.log(`  Alkanes: ${Object.keys(rules.alkanes).length} entries`);
  console.log(
    `  Multipliers (basic): ${Object.keys(rules.multipliers.basic).length} entries`,
  );
  console.log(
    `  Multipliers (group): ${Object.keys(rules.multipliers.group).length} entries`,
  );
  console.log(`  Suffixes: ${Object.keys(rules.suffixes).length} entries`);
  console.log(
    `  Substituents: ${Object.keys(rules.substituents).length} entries`,
  );
  console.log(
    `  Functional groups: ${Object.keys(rules.functionalGroups).length} entries`,
  );
  console.log(
    `  Ring systems: ${Object.keys(rules.ringSystems).length} entries`,
  );
}

main();
