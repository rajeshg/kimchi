import type { Atom, Bond, ParseError } from 'types';
import { calculateValence } from 'src/utils/valence-calculator';
import { DEFAULT_VALENCES } from 'src/constants';
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

    if (atom.chiral && (atom.chiral.startsWith('@SP') || atom.chiral.startsWith('@TB') || atom.chiral.startsWith('@OH'))) {
      continue;
    }

    // Check if atom has a double/triple bond (sp2/sp hybridization)
    const atomBonds = bonds.filter(b => b.atom1 === atom.id || b.atom2 === atom.id);
    const hasMultipleBond = atomBonds.some(b => b.type === 'double' || b.type === 'triple');
    
    // If atom has chirality AND a multiple bond, the chirality is invalid
    // (sp2/sp carbons cannot be chiral). Treat explicit H as 0 for valence calculation.
    const effectiveHydrogens = (atom.chiral && hasMultipleBond) ? 0 : atom.hydrogens;
    
    // Calculate valence with adjusted hydrogen count
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

    const maxAllowed = maxBy(allowedValences, (v) => v) ?? 0;
    if (valence > maxAllowed) {
      errors.push({
        message: `Atom ${atom.symbol} (id: ${atom.id}) has invalid valence ${valence}, maximum allowed is ${maxAllowed}`,
        position: -1
      });
    }
  }
}