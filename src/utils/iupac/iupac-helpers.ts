import type { Molecule } from 'types';
import { ruleEngine } from './iupac-rule-engine';

export function getAlkaneName(carbonCount: number): string {
  // Use declarative rule engine for alkane names (handles C1-C11 direct lookup, C12+ construction)
  const name = ruleEngine.getAlkaneName(carbonCount);
  if (name) return name;

  // Fallback for unmapped carbon counts
  return `alkane_C${carbonCount}ane`;
}

export function combineName(baseName: string, functionalGroup: string): string {
  // Use rule engine for vowel elision
  return ruleEngine.applyVowelElision(baseName, functionalGroup);
}

export function getGreekNumeral(n: number): string {
  const numerals: Record<number, string> = {
    1: 'mono',
    2: 'di',
    3: 'tri',
    4: 'tetra',
    5: 'penta',
    6: 'hexa',
    7: 'hepta',
    8: 'octa',
    9: 'nona',
    10: 'deca',
    11: 'undeca',
    12: 'dodeca',
  };
  return numerals[n] || `${n}`;
}

export function generateSimpleNameFromFormula(
  elementCounts: Record<string, number>
): string {
  const elements = Object.keys(elementCounts).sort((a, b) => {
    if (a === 'C') return -1;
    if (b === 'C') return 1;
    if (a === 'H') return -1;
    if (b === 'H') return 1;
    return a.localeCompare(b);
  });

  const parts: string[] = [];
  for (const element of elements) {
    const count = elementCounts[element] ?? 0;
    if (count === 1) {
      parts.push(element);
    } else if (count > 1) {
      const prefix = getGreekNumeral(count) ?? `${count}`;
      parts.push(`${prefix}${element}`);
    }
  }

  return parts.join('');
}

export function identifyPrincipalFunctionalGroup(
  molecule: Molecule,
  _options?: any
): string | null {
  // Use rule engine to find principal functional group
  const fgRule = ruleEngine.findPrincipalFunctionalGroup(molecule);
  if (fgRule) {
    return fgRule.suffix;
  }
  return null;
}
