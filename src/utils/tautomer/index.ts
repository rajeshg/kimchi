import type { Molecule } from 'types';
import { enumerateTautomers } from './tautomer-enumerator';

export { enumerateTautomers };

export function canonicalTautomer(input: Molecule) {
  const tautomers = enumerateTautomers(input, { maxTautomers: 128 });
  if (!tautomers || tautomers.length === 0) return input;
  // naive: return highest-scored (score currently 0), fallback to first
  return tautomers[0]?.molecule ?? input;
}
