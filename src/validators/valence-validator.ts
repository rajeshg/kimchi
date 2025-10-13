import type { Atom, Bond, ParseError } from '../../types';
import { calculateValence } from '../utils/valence-calculator';
import { DEFAULT_VALENCES } from '../constants';

/**
 * Validate that all atoms have valid valences according to their element
 */
export function validateValences(atoms: Atom[], bonds: Bond[], errors: ParseError[]): void {
  for (const atom of atoms) {
    // Skip wildcard atoms
    if (atom.symbol === '*') {
      continue;
    }
    
    // Skip aromatic atoms - they are validated by aromaticity validator
    if (atom.aromatic) {
      continue;
    }

    const valence = calculateValence(atom, bonds);
    const allowedValences = DEFAULT_VALENCES[atom.symbol];

    if (!allowedValences) {
      // Unknown element - skip validation
      continue;
    }

    // Check if the calculated valence is <= the maximum allowed valence
    const maxAllowed = Math.max(...allowedValences);
    if (valence > maxAllowed) {
      errors.push({
        message: `Atom ${atom.symbol} (id: ${atom.id}) has invalid valence ${valence}, maximum allowed is ${maxAllowed}`,
        position: -1
      });
    }
  }
}