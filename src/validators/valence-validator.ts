import type { Atom, Bond, ParseError } from '../../types';
import { calculateValence } from '../utils/valence-calculator';
import { DEFAULT_VALENCES } from '../constants';
import { maxBy } from 'es-toolkit';

/**
 * Validate that all atoms have valid valences according to their element
 */
export function validateValences(atoms: Atom[], bonds: Bond[], errors: ParseError[]): void {
  for (const atom of atoms) {
    if (atom.symbol === '*') {
      continue;
    }
    
    if (atom.aromatic) {
      continue;
    }

    const valence = calculateValence(atom, bonds);
    const allowedValences = DEFAULT_VALENCES[atom.symbol];

    if (!allowedValences) {
      continue;
    }

    const maxAllowed = maxBy(allowedValences, (v) => v) ?? 0;
    if (valence > maxAllowed) {
      errors.push({
        message: `Atom ${atom.symbol} (id: ${atom.id}) has invalid valence ${valence}, maximum allowed is ${maxAllowed}`,
        position: -1
      });
    }
  }
}