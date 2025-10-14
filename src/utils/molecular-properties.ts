import type { Molecule } from 'types';
import { MONOISOTOPIC_MASSES, ISOTOPE_MASSES } from 'src/constants';

export interface MolecularOptions {
  includeImplicitH?: boolean; // default true
  tolerance?: number;
  includeIsotopeLabels?: boolean; // default false
}

export function getMolecularFormula(mol: Molecule, opts: MolecularOptions = {}): string {
  const includeImplicitH = opts.includeImplicitH ?? true;
  const includeIsotopeLabels = opts.includeIsotopeLabels ?? false;
  const counts: Record<string, number> = Object.create(null);
  const isotopeLabels: string[] = [];

  function addElement(sym: string, n = 1) {
    if (!sym || sym === '*') return;
    counts[sym] = (counts[sym] || 0) + n;
  }

  for (const atom of mol.atoms) {
    const sym = atom.symbol;
    if (!sym || sym === '*') continue;

    if (includeIsotopeLabels && atom.isotope) {
      isotopeLabels.push(`${atom.isotope}${sym}`);
    }

    if (sym === 'H') {
      addElement('H', 1);
    } else {
      addElement(sym, 1);
      if (includeImplicitH && (atom.hydrogens ?? 0) > 0) {
        addElement('H', atom.hydrogens ?? 0);
      }
    }
  }

  for (const k of Object.keys(counts)) {
    if (!counts[k]) delete counts[k];
  }

  const hasC = counts['C'] !== undefined;
  const parts: string[] = [];

  function formatPart(symbol: string, count: number) {
    return count === 1 ? symbol : `${symbol}${count}`;
  }

  if (hasC) {
    if (counts['C']) {
      parts.push(formatPart('C', counts['C']));
      delete counts['C'];
    }
    if (counts['H']) {
      parts.push(formatPart('H', counts['H']));
      delete counts['H'];
    }
    const rest = Object.keys(counts).sort();
    for (const el of rest) parts.push(formatPart(el, counts[el] ?? 0));
  } else {
    const elts = Object.keys(counts).sort();
    for (const el of elts) parts.push(formatPart(el, counts[el] ?? 0));
  }

  const formula = parts.join('');
  if (includeIsotopeLabels && isotopeLabels.length) {
    // Prepend isotopic labels in square brackets e.g. [13C]CH4 -> 13C C H4 -> we will append labels in front
    return `${isotopeLabels.join(' ')} ${formula}`.trim();
  }
  return formula;
}

export function getMolecularMass(mol: Molecule): number {
  let mass = 0;
  for (const atom of mol.atoms) {
    const sym = atom.symbol;
    if (!sym || sym === '*') continue;
    const baseMass = getAtomMass(sym, atom.isotope ?? null);
    if (sym === 'H') {
      mass += baseMass;
    } else {
      mass += baseMass;
      if ((atom.hydrogens ?? 0) > 0) {
        mass += ((atom.hydrogens ?? 0) * (MONOISOTOPIC_MASSES['H'] || 1.007825032));
      }
    }
  }
  return mass;
}

export function getExactMass(mol: Molecule): number {
  // Exact mass is the monoisotopic mass (sum of the most abundant isotope masses)
  return getMolecularMass(mol);
}

function getAtomMass(symbol: string, isotope: number | null): number {
  if (isotope && ISOTOPE_MASSES[symbol] && ISOTOPE_MASSES[symbol][isotope]) {
    return ISOTOPE_MASSES[symbol][isotope];
  }
  const base = MONOISOTOPIC_MASSES[symbol];
  if (base !== undefined) return base;
  return Math.max(1, Math.round((symbol.length > 0 ? symbol.charCodeAt(0) % 100 : 12)));
}
