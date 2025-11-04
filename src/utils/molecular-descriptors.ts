import type { Molecule, DescriptorOptions, DescriptorResult } from "types";
import { getHeavyAtomCount } from "./molecular-properties";

/**
 * Compute basic molecular descriptors
 */
export function computeDescriptors(
  mol: Molecule,
  opts: DescriptorOptions = {},
): DescriptorResult {
  const atomCount = getAtomCount(mol);
  const bondCount = getBondCount(mol);
  const formalCharge = getFormalCharge(mol);
  const elementCounts = getElementCounts(mol, opts);
  const heavyAtomFraction = getHeavyAtomFraction(mol);

  return {
    atomCount,
    bondCount,
    formalCharge,
    elementCounts,
    heavyAtomFraction,
  };
}

/**
 * Get total number of atoms in molecule
 */
export function getAtomCount(mol: Molecule): number {
  return mol.atoms.length;
}

/**
 * Get total number of bonds in molecule
 */
export function getBondCount(mol: Molecule): number {
  return mol.bonds.length;
}

/**
 * Get formal charge of molecule (sum of all atomic charges)
 */
export function getFormalCharge(mol: Molecule): number {
  return mol.atoms.reduce((sum, atom) => sum + (atom.charge ?? 0), 0);
}

/**
 * Get counts of each element in molecule
 */
export function getElementCounts(
  mol: Molecule,
  opts: DescriptorOptions = {},
): Record<string, number> {
  const includeImplicitH = opts.includeImplicitH ?? true;
  const includeIsotopes = opts.includeIsotopes ?? false;
  const counts: Record<string, number> = Object.create(null);

  function addElement(sym: string, n = 1) {
    if (!sym || sym === "*") return;
    counts[sym] = (counts[sym] || 0) + n;
  }

  for (const atom of mol.atoms) {
    const sym = atom.symbol;
    if (!sym || sym === "*") continue;

    if (includeIsotopes && atom.isotope) {
      addElement(`${atom.isotope}${sym}`, 1);
    } else {
      addElement(sym, 1);
    }

    if (includeImplicitH && (atom.hydrogens ?? 0) > 0) {
      addElement("H", atom.hydrogens ?? 0);
    }
  }

  return counts;
}

/**
 * Get fraction of heavy atoms (non-hydrogen atoms) in molecule
 */
export function getHeavyAtomFraction(mol: Molecule): number {
  const heavyAtoms = getHeavyAtomCount(mol);
  if (heavyAtoms === 0) return 0;

  // Total atoms = explicit atoms + implicit hydrogens
  const implicitHydrogens = mol.atoms.reduce(
    (sum, atom) => sum + (atom.hydrogens ?? 0),
    0,
  );
  const totalAtoms = mol.atoms.length + implicitHydrogens;

  return heavyAtoms / totalAtoms;
}
