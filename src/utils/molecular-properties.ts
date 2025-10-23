import type { Molecule } from 'types';
import { MONOISOTOPIC_MASSES, ISOTOPE_MASSES } from 'src/constants';
import { analyzeRings, findRings } from 'src/utils/ring-analysis';
import { enrichMolecule } from 'src/utils/molecule-enrichment';
import { getBondsForAtom, getHeavyNeighborCount, hasMultipleBond, hasTripleBond, hasDoubleBond, hasCarbonylBond } from 'src/utils/bond-utils';
import { MoleculeGraph } from 'src/utils/molecular-graph';
import { computeLogP } from 'src/utils/logp';

/**
 * Options for molecular property calculations.
 * @property {boolean} [includeImplicitH=true] - Include implicit hydrogens in formula and counts
 * @property {number} [tolerance] - Tolerance for floating-point comparisons
 * @property {boolean} [includeIsotopeLabels=false] - Include isotope labels in formula (e.g., "13C")
 */
export interface MolecularOptions {
  includeImplicitH?: boolean; // default true
  tolerance?: number;
  includeIsotopeLabels?: boolean; // default false
}

/**
 * Compute the molecular formula of a molecule.
 * 
 * @param {Molecule} mol - The molecule to analyze
 * @param {MolecularOptions} [opts={}] - Calculation options
 * @returns {string} Molecular formula (e.g., "C6H12O" for cyclohexanol)
 * 
 * @example
 * const formula = getMolecularFormula(cyclohexane);
 * console.log(formula); // "C6H12"
 * 
 * @example
 * const formulaWithH = getMolecularFormula(cyclohexane, { includeImplicitH: true });
 * const formulaWithoutH = getMolecularFormula(cyclohexane, { includeImplicitH: false });
 * 
 * @complexity O(N) where N = number of atoms
 * @see getMolecularMass for atomic mass calculation
 */
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
  if (mol.rings) {
    return mol.rings.length;
  }
  const mg = new MoleculeGraph(mol);
  return mg.sssr.length;
}

export function getAromaticRingCount(mol: Molecule): number {
  if (mol.rings) {
    return mol.rings.filter((ring: readonly number[]) => {
      return ring.every((atomId: number) => {
        const atom = mol.atoms.find(a => a.id === atomId);
        return atom?.aromatic === true;
      });
    }).length;
  }
  const mg = new MoleculeGraph(mol);
  return mg.sssr.filter((ring: readonly number[]) => {
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
    if (c.hybridization) {
      return c.hybridization === 'sp3';
    }
    
    if (c.aromatic) return false;
    
    const bonds = getBondsForAtom(mol.bonds, c.id);
    const hasMultiple = hasMultipleBond(mol.bonds, c.id);
    
    if (hasMultiple) return false;
    
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
    const bonds = getBondsForAtom(mol.bonds, atom.id);
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
  // Enrich the molecule to ensure ring information is available
  const enriched = enrichMolecule(mol);
  if (enriched.bonds.some(b => b.isRotatable !== undefined)) {
    return enriched.bonds.filter(b => b.isRotatable).length;
  }

  let count = 0;

  // Use findRings to detect all rings for accurate bond-in-ring detection
  const rings = findRings(enriched.atoms, enriched.bonds);
  const isBondInRing = (a1: number, a2: number) => rings.some(ring => {
    const idx1 = ring.indexOf(a1);
    const idx2 = ring.indexOf(a2);
    if (idx1 === -1 || idx2 === -1) return false;
    const dist = Math.abs(idx1 - idx2);
    return dist === 1 || dist === ring.length - 1; // adjacent in ring
  });
  const isAtomInRing = (id: number) => rings.some(ring => ring.includes(id));

  for (const bond of mol.bonds) {
    if (bond.type !== 'single') continue;

    if (isBondInRing(bond.atom1, bond.atom2)) continue;

    const atom1 = mol.atoms.find(a => a.id === bond.atom1)!;
    const atom2 = mol.atoms.find(a => a.id === bond.atom2)!;

    if (atom1.symbol === 'H' && !atom1.isotope) continue;
    if (atom2.symbol === 'H' && !atom2.isotope) continue;

    const heavyNeighbors1 = getHeavyNeighborCount(mol.bonds, atom1.id, mol.atoms);
    const heavyNeighbors2 = getHeavyNeighborCount(mol.bonds, atom2.id, mol.atoms);

    if (heavyNeighbors1 < 2 || heavyNeighbors2 < 2) continue;

    const atom1InRing = isAtomInRing(atom1.id);
    const atom2InRing = isAtomInRing(atom2.id);
    
    if ((atom1InRing && heavyNeighbors2 === 1) || (atom2InRing && heavyNeighbors1 === 1)) continue;
    
    if (hasTripleBond(mol.bonds, atom1.id) || hasTripleBond(mol.bonds, atom2.id)) continue;
    
    const hasDoubleBond1 = !atom1.aromatic && hasDoubleBond(mol.bonds, atom1.id);
    const hasDoubleBond2 = !atom2.aromatic && hasDoubleBond(mol.bonds, atom2.id);
    
    if (heavyNeighbors1 >= 4 && !atom1InRing && !hasDoubleBond1) continue;
    if (heavyNeighbors2 >= 4 && !atom2InRing && !hasDoubleBond2) continue;
    
    const hasCarbonyl1 = hasCarbonylBond(mol.bonds, atom1.id, mol.atoms);
    const hasCarbonyl2 = hasCarbonylBond(mol.bonds, atom2.id, mol.atoms);
    
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
    logP: number;
  };
}

export function checkLipinskiRuleOfFive(mol: Molecule): LipinskiResult {
  const mw = getMolecularMass(mol);
  const donors = getHBondDonorCount(mol);
  const acceptors = getHBondAcceptorCount(mol);
  const logP = computeLogP(mol);

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

  if (logP > 5) {
    violations.push(`LogP ${logP.toFixed(2)} > 5`);
  }

  return {
    passes: violations.length === 0,
    violations,
    properties: {
      molecularWeight: mw,
      hbondDonors: donors,
      hbondAcceptors: acceptors,
      logP,
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
