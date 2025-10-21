import type { Atom, Bond, ParseError } from 'types';
import { DEFAULT_VALENCES } from 'src/constants';
import { getBondsForAtom, hasMultipleBond } from 'src/utils/bond-utils';

/**
 * Validate that all atoms have valid valences according to their element
 */
export function validateValences(atoms: readonly Atom[], bonds: readonly Bond[], errors: ParseError[]): void {
  for (const atom of atoms) {
    if (atom.symbol === '*') {
      continue;
    }
    
    if (atom.aromatic) {
      continue;
    }

    if (atom.chiral && (atom.chiral.startsWith('@SP') || atom.chiral.startsWith('@TB') || atom.chiral.startsWith('@OH'))) {
      continue;
    }

    const atomBonds = getBondsForAtom(bonds, atom.id);
    const hasMultiple = hasMultipleBond(bonds, atom.id);
    
    const effectiveHydrogens = (atom.chiral && hasMultiple) ? 0 : atom.hydrogens;
    
    let valence = effectiveHydrogens || 0;
    for (const bond of atomBonds) {
      switch (bond.type) {
        case 'single':
          valence += 1;
          break;
        case 'double':
          valence += 2;
          break;
        case 'triple':
          valence += 3;
          break;
        case 'quadruple':
          valence += 4;
          break;
        case 'aromatic':
          valence += 1;
          break;
      }
    }

    const allowedValences = DEFAULT_VALENCES[atom.symbol];

    if (!allowedValences) {
      continue;
    }

    const maxAllowed = Math.max(...allowedValences);
    if (valence > maxAllowed) {
      errors.push({
        message: `Atom ${atom.symbol} (id: ${atom.id}) has invalid valence ${valence}, maximum allowed is ${maxAllowed}`,
        position: -1
      });
    }
  }
}