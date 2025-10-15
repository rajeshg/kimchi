import type { Molecule } from 'types';
import { MONOISOTOPIC_MASSES, ISOTOPE_MASSES } from 'src/constants';
import { findRings } from 'src/utils/ring-finder';

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

export function getHeavyAtomCount(mol: Molecule): number {
  return mol.atoms.filter(a => a.symbol !== 'H' && a.symbol !== '*').length;
}

export function getHeteroAtomCount(mol: Molecule): number {
  return mol.atoms.filter(a => {
    const sym = a.symbol;
    return sym !== 'C' && sym !== 'H' && sym !== '*';
  }).length;
}

export function getRingCount(mol: Molecule): number {
  const rings = findRings(mol.atoms, mol.bonds);
  return rings.length;
}

export function getAromaticRingCount(mol: Molecule): number {
  const rings = findRings(mol.atoms, mol.bonds);
  return rings.filter((ring: number[]) => {
    return ring.every((atomId: number) => {
      const atom = mol.atoms.find(a => a.id === atomId);
      return atom?.aromatic === true;
    });
  }).length;
}

export function getFractionCSP3(mol: Molecule): number {
  const carbons = mol.atoms.filter(a => a.symbol === 'C');
  if (carbons.length === 0) return 0;
  
  const sp3Carbons = carbons.filter(c => {
    if (c.aromatic) return false;
    
    const bonds = mol.bonds.filter(b => b.atom1 === c.id || b.atom2 === c.id);
    const hasMultipleBond = bonds.some(b => b.type === 'double' || b.type === 'triple');
    
    if (hasMultipleBond) return false;
    
    const explicitBonds = bonds.length;
    const totalValence = explicitBonds + (c.hydrogens ?? 0);
    
    return totalValence === 4;
  });
  
  return sp3Carbons.length / carbons.length;
}

export function getHBondAcceptorCount(mol: Molecule): number {
  return mol.atoms.filter(a => a.symbol === 'N' || a.symbol === 'O').length;
}

export function getHBondDonorCount(mol: Molecule): number {
  let count = 0;
  for (const atom of mol.atoms) {
    if (atom.symbol === 'N' || atom.symbol === 'O') {
      count += atom.hydrogens ?? 0;
    }
  }
  return count;
}

export function getTPSA(mol: Molecule): number {
  let tpsa = 0;
  
  for (const atom of mol.atoms) {
    const symbol = atom.symbol;
    if (symbol !== 'N' && symbol !== 'O' && symbol !== 'S' && symbol !== 'P') {
      continue;
    }
    
    const hydrogens = atom.hydrogens ?? 0;
    const bonds = mol.bonds.filter(b => b.atom1 === atom.id || b.atom2 === atom.id);
    const heavyNeighbors = bonds.length;
    
    const doubleBonds = bonds.filter(b => b.type === 'double').length;
    const tripleBonds = bonds.filter(b => b.type === 'triple').length;
    
    const contribution = getTPSAContribution(
      symbol,
      hydrogens,
      heavyNeighbors,
      doubleBonds,
      tripleBonds,
      atom.aromatic ?? false
    );
    
    tpsa += contribution;
  }
  
  return Math.round(tpsa * 100) / 100;
}

function getTPSAContribution(
  symbol: string,
  hydrogens: number,
  heavyNeighbors: number,
  doubleBonds: number,
  tripleBonds: number,
  aromatic: boolean
): number {
  if (symbol === 'N') {
    if (aromatic) {
      if (hydrogens === 1) return 15.79;
      if (hydrogens === 0) return 12.89;
    }
    
    if (tripleBonds === 1) {
      return 23.79;
    }
    
    if (doubleBonds >= 1) {
      if (hydrogens === 0 && heavyNeighbors === 1) return 23.79;
      if (hydrogens === 0 && heavyNeighbors === 2) return 12.36;
    }
    
    if (hydrogens === 3) return 26.02;
    if (hydrogens === 2) return 26.02;
    if (hydrogens === 1) return 12.03;
    if (hydrogens === 0 && heavyNeighbors === 3) return 3.24;
    if (hydrogens === 0) return 12.03;
    
    return 12.03;
  }
  
  if (symbol === 'O') {
    if (aromatic) {
      return 13.14;
    }
    
    if (doubleBonds === 1) {
      return 17.07;
    }
    
    if (hydrogens >= 1) return 20.23;
    if (hydrogens === 0 && heavyNeighbors === 2) return 9.23;
    
    return 17.07;
  }
  
  if (symbol === 'S') {
    if (doubleBonds >= 2) {
      return 32.09;
    }
    if (doubleBonds === 1) {
      return 25.30;
    }
    if (hydrogens === 1) return 38.80;
    if (hydrogens === 0) return 25.30;
    
    return 25.30;
  }
  
  if (symbol === 'P') {
    if (doubleBonds === 1) {
      return 34.14;
    }
    return 13.59;
  }
  
  return 0;
}

export function getRotatableBondCount(mol: Molecule): number {
  let count = 0;
  
  const rings = findRings(mol.atoms, mol.bonds);
  const ringAtomSet = new Set<number>();
  
  for (const ring of rings) {
    for (const atomId of ring) {
      ringAtomSet.add(atomId!);
    }
  }
  
  const ringBondSet = new Set<string>();
  
  for (const bond of mol.bonds) {
    let inSameRing = false;
    
    for (const ring of rings) {
      const atom1InThisRing = ring.includes(bond.atom1);
      const atom2InThisRing = ring.includes(bond.atom2);
      
      if (atom1InThisRing && atom2InThisRing) {
        inSameRing = true;
        break;
      }
    }
    
    if (inSameRing) {
      const key = `${Math.min(bond.atom1, bond.atom2)}-${Math.max(bond.atom1, bond.atom2)}`;
      ringBondSet.add(key);
    }
  }
  
  for (const bond of mol.bonds) {
    if (bond.type !== 'single') continue;
    
    const bondKey = `${Math.min(bond.atom1, bond.atom2)}-${Math.max(bond.atom1, bond.atom2)}`;
    if (ringBondSet.has(bondKey)) continue;
    
    const atom1 = mol.atoms.find(a => a.id === bond.atom1)!;
    const atom2 = mol.atoms.find(a => a.id === bond.atom2)!;
    
    if (atom1.symbol === 'H' && !atom1.isotope) continue;
    if (atom2.symbol === 'H' && !atom2.isotope) continue;
    
    const bondsAtom1 = mol.bonds.filter(b => b.atom1 === atom1.id || b.atom2 === atom1.id);
    const bondsAtom2 = mol.bonds.filter(b => b.atom1 === atom2.id || b.atom2 === atom2.id);
    
    const heavyNeighbors1 = bondsAtom1.filter(b => {
      const otherId = b.atom1 === atom1.id ? b.atom2 : b.atom1;
      const other = mol.atoms.find(a => a.id === otherId)!;
      return other.symbol !== 'H' || other.isotope;
    }).length;
    
    const heavyNeighbors2 = bondsAtom2.filter(b => {
      const otherId = b.atom1 === atom2.id ? b.atom2 : b.atom1;
      const other = mol.atoms.find(a => a.id === otherId)!;
      return other.symbol !== 'H' || other.isotope;
    }).length;
    
    if (heavyNeighbors1 < 2 || heavyNeighbors2 < 2) continue;
    
    const atom1InRing = ringAtomSet.has(atom1.id);
    const atom2InRing = ringAtomSet.has(atom2.id);
    
    if ((atom1InRing && heavyNeighbors2 === 1) || (atom2InRing && heavyNeighbors1 === 1)) continue;
    
    const hasTripleBond1 = bondsAtom1.some(b => b.type === 'triple');
    const hasTripleBond2 = bondsAtom2.some(b => b.type === 'triple');
    
    if (hasTripleBond1 || hasTripleBond2) continue;
    
    const hasDoubleBond1 = !atom1.aromatic && bondsAtom1.some(b => b.type === 'double');
    const hasDoubleBond2 = !atom2.aromatic && bondsAtom2.some(b => b.type === 'double');
    
    if (heavyNeighbors1 >= 4 && !atom1InRing && !hasDoubleBond1) continue;
    if (heavyNeighbors2 >= 4 && !atom2InRing && !hasDoubleBond2) continue;
    
    const hasCarbonyl1 = !atom1.aromatic && atom1.symbol === 'C' && bondsAtom1.some(b => {
      if (b.type !== 'double') return false;
      const otherId = b.atom1 === atom1.id ? b.atom2 : b.atom1;
      const other = mol.atoms.find(a => a.id === otherId);
      return other?.symbol === 'O';
    });
    
    const hasCarbonyl2 = !atom2.aromatic && atom2.symbol === 'C' && bondsAtom2.some(b => {
      if (b.type !== 'double') return false;
      const otherId = b.atom1 === atom2.id ? b.atom2 : b.atom1;
      const other = mol.atoms.find(a => a.id === otherId);
      return other?.symbol === 'O';
    });
    
    const isHeteroatom1 = atom1.symbol !== 'C' && atom1.symbol !== 'H';
    const isHeteroatom2 = atom2.symbol !== 'C' && atom2.symbol !== 'H';
    
    if ((hasCarbonyl1 && isHeteroatom2) || (hasCarbonyl2 && isHeteroatom1)) continue;
    
    count++;
  }
  
  return count;
}

export interface LipinskiResult {
  passes: boolean;
  violations: string[];
  properties: {
    molecularWeight: number;
    hbondDonors: number;
    hbondAcceptors: number;
  };
}

export function checkLipinskiRuleOfFive(mol: Molecule): LipinskiResult {
  const mw = getMolecularMass(mol);
  const donors = getHBondDonorCount(mol);
  const acceptors = getHBondAcceptorCount(mol);
  
  const violations: string[] = [];
  
  if (mw > 500) {
    violations.push(`Molecular weight ${mw.toFixed(2)} > 500 Da`);
  }
  
  if (donors > 5) {
    violations.push(`H-bond donors ${donors} > 5`);
  }
  
  if (acceptors > 10) {
    violations.push(`H-bond acceptors ${acceptors} > 10`);
  }
  
  return {
    passes: violations.length === 0,
    violations,
    properties: {
      molecularWeight: mw,
      hbondDonors: donors,
      hbondAcceptors: acceptors,
    },
  };
}

export interface VeberResult {
  passes: boolean;
  violations: string[];
  properties: {
    rotatableBonds: number;
    tpsa: number;
  };
}

export function checkVeberRules(mol: Molecule): VeberResult {
  const rotatableBonds = getRotatableBondCount(mol);
  const tpsa = getTPSA(mol);
  
  const violations: string[] = [];
  
  if (rotatableBonds > 10) {
    violations.push(`Rotatable bonds ${rotatableBonds} > 10`);
  }
  
  if (tpsa > 140) {
    violations.push(`TPSA ${tpsa.toFixed(2)} Ų > 140 Ų`);
  }
  
  return {
    passes: violations.length === 0,
    violations,
    properties: {
      rotatableBonds,
      tpsa,
    },
  };
}

export interface BBBResult {
  likelyPenetration: boolean;
  tpsa: number;
}

export function checkBBBPenetration(mol: Molecule): BBBResult {
  const tpsa = getTPSA(mol);
  
  return {
    likelyPenetration: tpsa < 90,
    tpsa,
  };
}
