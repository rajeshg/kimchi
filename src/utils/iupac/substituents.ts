import { readFileSync } from 'fs';
import path from 'path';

/**
 * Loads and indexes substituent rules from opsin-rules.json
 */
export interface SubstituentRule {
  pattern: string; // SMARTS/SMILES fragment
  aliases: string[];
}

let substituentRules: SubstituentRule[] = [];

function loadSubstituentRules(): SubstituentRule[] {
  if (substituentRules.length > 0) return substituentRules;
  const rulesPath = path.resolve(__dirname, '../../../opsin-rules.json');
  const json = JSON.parse(readFileSync(rulesPath, 'utf8'));
  const rules: SubstituentRule[] = [];
  for (const [pattern, data] of Object.entries(json.substituents)) {
    const aliases = (data as { aliases: string[] }).aliases;
    rules.push({ pattern, aliases });
  }
  substituentRules = rules;
  return substituentRules;
}

/**
 * Finds the best matching substituent rule for a given fragment
 * @param fragment SMILES or SMARTS string
 * @returns aliases or null if not found
 */
export function findSubstituentAliases(fragment: string): string[] | null {
  const rules = loadSubstituentRules();
  // Exact match first
  for (const rule of rules) {
    if (rule.pattern === fragment) {
      return rule.aliases;
    }
  }
  // Fallback: try normalized forms (strip leading/trailing dashes)
  const norm = fragment.replace(/^[-=#+]/, '').replace(/-$/, '');
  for (const rule of rules) {
    const ruleNorm = rule.pattern.replace(/^[-=#+]/, '').replace(/-$/, '');
    if (ruleNorm === norm) {
      return rule.aliases;
    }
  }
  return null;
}

// For testing/debugging
export function getAllSubstituentRules(): SubstituentRule[] {
  return loadSubstituentRules();
}
