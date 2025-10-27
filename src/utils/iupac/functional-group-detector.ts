import type { Molecule } from 'types';
import { BondType } from 'types';

// Functional group priority constants (IUPAC order of precedence)
// Higher values = higher priority as principal functional group
const FG_PRIORITY = {
  CARBOXYLIC_ACID: 6,
  SULFONIC_ACID: 6,
  PHOSPHONIC_ACID: 6,
  AMIDE: 5,
  ACID_CHLORIDE: 5,
  ESTER: 5,
  ALDEHYDE: 5,
  KETONE: 4,
  NITRILE: 4,
  ALCOHOL: 3,
  AMINE: 2,
  NONE: 0,
};

// Return small integer priority for principal functional group found on chain
// Higher number => higher precedence as principal group
export function getChainFunctionalGroupPriority(chain: number[], molecule: Molecule): number {
  let best = FG_PRIORITY.NONE;
  const chainSet = new Set(chain);
  for (const idx of chain) {
    const atom = molecule.atoms[idx];
    if (!atom) continue;

    if (atom.symbol === 'C') {
      const fgPriority = getCarbonFunctionalGroupPriority(idx, molecule);
      best = Math.max(best, fgPriority);
    }

    if (atom.symbol === 'S') {
      const fgPriority = getSulfurFunctionalGroupPriority(idx, molecule);
      best = Math.max(best, fgPriority);
    }

    if (atom.symbol === 'P') {
      const fgPriority = getPhosphorusFunctionalGroupPriority(idx, molecule);
      best = Math.max(best, fgPriority);
    }

    if (atom.symbol === 'N') {
      const fgPriority = getNitrogenFunctionalGroupPriority(idx, molecule);
      best = Math.max(best, fgPriority);
    }

    if (atom.symbol === 'O') {
      if ((atom as any).hydrogens && (atom as any).hydrogens > 0) {
        best = Math.max(best, FG_PRIORITY.ALCOHOL);
      }
    }
  }
  return best;
}

function getCarbonFunctionalGroupPriority(idx: number, molecule: Molecule): number {
  const bonds = molecule.bonds.filter(b => b.atom1 === idx || b.atom2 === idx);
  let best = FG_PRIORITY.NONE;

  let hasDoubleO = false;
  let hasSingleOwithH = false;
  let hasSingleO = false;
  let hasSingleN = false;
  let hasCl = false;
  let singleOConnectedToC = false;
  let hasTripleN = false;

  for (const b of bonds) {
    const neigh = b.atom1 === idx ? b.atom2 : b.atom1;
    const nat = molecule.atoms[neigh];
    if (!nat) continue;

    if (nat.symbol === 'O') {
      if (b.type === BondType.DOUBLE) hasDoubleO = true;
      if (b.type === BondType.SINGLE) {
        hasSingleO = true;
        if ((nat as any).hydrogens && (nat as any).hydrogens > 0) hasSingleOwithH = true;
        const oConnectedToC = molecule.bonds.some(
          ob =>
            (ob.atom1 === neigh && molecule.atoms[ob.atom2]?.symbol === 'C') ||
            (ob.atom2 === neigh && molecule.atoms[ob.atom1]?.symbol === 'C')
        );
        if (oConnectedToC) singleOConnectedToC = true;
      }
    }
    if (nat.symbol === 'N' && b.type === BondType.SINGLE) hasSingleN = true;
    if (nat.symbol === 'N' && b.type === BondType.TRIPLE) hasTripleN = true;
    if (nat.symbol === 'Cl' && b.type === BondType.SINGLE) hasCl = true;
  }

  // Nitrile (C≡N)
  if (hasTripleN) best = Math.max(best, FG_PRIORITY.NITRILE);

  // Carboxylic acid (C(=O)OH)
  if (hasDoubleO && hasSingleOwithH) best = Math.max(best, FG_PRIORITY.CARBOXYLIC_ACID);
  // Amide (C(=O)N)
  else if (hasDoubleO && hasSingleN) best = Math.max(best, FG_PRIORITY.AMIDE);
  // Acid chloride (C(=O)Cl)
  else if (hasDoubleO && hasCl) best = Math.max(best, FG_PRIORITY.ACID_CHLORIDE);
  // Ester (C(=O)O-R)
  else if (hasDoubleO && hasSingleO) {
    // Could be ester or anhydride - use same priority
    best = Math.max(best, FG_PRIORITY.ESTER);
  }
  // Ether or alcohol with C=O nearby
  else if (hasDoubleO && singleOConnectedToC) best = Math.max(best, FG_PRIORITY.ESTER);
  // Aldehyde/Ketone (C=O)
  else if (hasDoubleO) best = Math.max(best, FG_PRIORITY.KETONE);

  return best;
}

function getSulfurFunctionalGroupPriority(idx: number, molecule: Molecule): number {
  const bonds = molecule.bonds.filter(b => b.atom1 === idx || b.atom2 === idx);
  let best = FG_PRIORITY.NONE;

  let doubleOcount = 0;
  let singleOwithH = false;
  let hasSingleN = false;
  let hasCl = false;

  for (const b of bonds) {
    const neigh = b.atom1 === idx ? b.atom2 : b.atom1;
    const nat = molecule.atoms[neigh];
    if (!nat) continue;
    if (nat.symbol === 'O') {
      if (b.type === BondType.DOUBLE) doubleOcount++;
      if (b.type === BondType.SINGLE && (nat as any).hydrogens && (nat as any).hydrogens > 0) singleOwithH = true;
    }
    if (nat.symbol === 'N' && b.type === BondType.SINGLE) hasSingleN = true;
    if (nat.symbol === 'Cl' && b.type === BondType.SINGLE) hasCl = true;
  }

  // Sulfonic acid (S(=O)(=O)OH)
  if (doubleOcount >= 2 && singleOwithH) best = Math.max(best, FG_PRIORITY.SULFONIC_ACID);
  // Sulfonamide (S(=O)(=O)N)
  else if (doubleOcount >= 2 && hasSingleN) best = Math.max(best, FG_PRIORITY.AMIDE);
  // Sulfonyl chloride (S(=O)(=O)Cl)
  else if (doubleOcount >= 2 && hasCl) best = Math.max(best, FG_PRIORITY.ACID_CHLORIDE);
  // Sulfoxide or sulfone
  else if (doubleOcount >= 2) best = Math.max(best, FG_PRIORITY.KETONE);

  return best;
}

function getPhosphorusFunctionalGroupPriority(idx: number, molecule: Molecule): number {
  const bonds = molecule.bonds.filter(b => b.atom1 === idx || b.atom2 === idx);
  let best = FG_PRIORITY.NONE;

  let hasDoubleO = false;
  let singleOwithH = false;

  for (const b of bonds) {
    const neigh = b.atom1 === idx ? b.atom2 : b.atom1;
    const nat = molecule.atoms[neigh];
    if (!nat) continue;
    if (nat.symbol === 'O') {
      if (b.type === BondType.DOUBLE) hasDoubleO = true;
      if (b.type === BondType.SINGLE && (nat as any).hydrogens && (nat as any).hydrogens > 0) singleOwithH = true;
    }
  }

  // Phosphonic acid (P(=O)(OH)n)
  if (hasDoubleO && singleOwithH) best = Math.max(best, FG_PRIORITY.PHOSPHONIC_ACID);

  return best;
}

function getNitrogenFunctionalGroupPriority(idx: number, molecule: Molecule): number {
  const bonds = molecule.bonds.filter(b => b.atom1 === idx || b.atom2 === idx);
  let best = FG_PRIORITY.NONE;

  let oCount = 0;
  let hasDoubleO = false;

  for (const b of bonds) {
    const neigh = b.atom1 === idx ? b.atom2 : b.atom1;
    const nat = molecule.atoms[neigh];
    if (!nat) continue;
    if (nat.symbol === 'O') {
      oCount++;
      if (b.type === BondType.DOUBLE) hasDoubleO = true;
    }
  }

  // N-oxide or nitroso
  if (oCount >= 2 && hasDoubleO) best = Math.max(best, FG_PRIORITY.KETONE);

  // Check for N=C(=O) or N=C(=S) patterns (imines, etc.)
  for (const b of bonds) {
    if (b.type !== BondType.DOUBLE) continue;
    const neigh = b.atom1 === idx ? b.atom2 : b.atom1;
    const nat = molecule.atoms[neigh];
    if (!nat || nat.symbol !== 'C') continue;

    const cHasDoubleO = molecule.bonds.some(
      cb =>
        (cb.atom1 === neigh || cb.atom2 === neigh) &&
        ((cb.atom1 === neigh ? molecule.atoms[cb.atom2] : molecule.atoms[cb.atom1])?.symbol === 'O') &&
        cb.type === BondType.DOUBLE
    );
    const cHasDoubleS = molecule.bonds.some(
      cb =>
        (cb.atom1 === neigh || cb.atom2 === neigh) &&
        ((cb.atom1 === neigh ? molecule.atoms[cb.atom2] : molecule.atoms[cb.atom1])?.symbol === 'S') &&
        cb.type === BondType.DOUBLE
    );

    if (cHasDoubleO || cHasDoubleS) best = Math.max(best, FG_PRIORITY.AMIDE);
  }

  return best;
}

export default getChainFunctionalGroupPriority;
