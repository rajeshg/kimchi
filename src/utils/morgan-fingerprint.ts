 import type { Molecule, Atom, Bond } from 'types';

// Adapter: openchem Atom -> IMorganAtom
class OC_MorganAtom implements IMorganAtom {
  private atom: Atom;
  private mol: Molecule;
  private atomIdx: number;
  private atoms: Atom[];
  private bonds: Bond[];
  constructor(atom: Atom, mol: Molecule, atomIdx: number, atoms: Atom[], bonds: Bond[]) {
    this.atom = atom;
    this.mol = mol;
    this.atomIdx = atomIdx;
    this.atoms = atoms;
    this.bonds = bonds;
  }
  getAtomicNum(): number { return this.atom.atomicNumber; }
  getDegree(): number {
    if (typeof this.atom.degree === 'number') return this.atom.degree;
    let d = 0;
    for (const b of this.bonds) if (b.atom1 === this.atom.id || b.atom2 === this.atom.id) d++;
    return d;
  }
  getFormalCharge(): number { return this.atom.charge; }
  getTotalNumHs(): number { return this.atom.hydrogens; }
  getIsAromatic(): boolean { return !!this.atom.aromatic; }
  isInRing(): boolean { return !!this.atom.isInRing; }
  getValence(): number {
    const standardValences: Record<string, number> = {
      'H': 1, 'He': 0, 'Li': 1, 'Be': 2, 'B': 3, 'C': 4, 'N': 3, 'O': 2, 'F': 1, 'Ne': 0,
      'Na': 1, 'Mg': 2, 'Al': 3, 'Si': 4, 'P': 3, 'S': 2, 'Cl': 1, 'Ar': 0,
      'K': 1, 'Ca': 2, 'Sc': 3, 'Ti': 4, 'V': 5, 'Cr': 6, 'Mn': 7, 'Fe': 8, 'Co': 9, 'Ni': 10, 'Cu': 11, 'Zn': 12,
      'Ga': 3, 'Ge': 4, 'As': 3, 'Se': 2, 'Br': 1, 'Kr': 0,
      'Rb': 1, 'Sr': 2, 'Y': 3, 'Zr': 4, 'Nb': 5, 'Mo': 6, 'Tc': 7, 'Ru': 8, 'Rh': 9, 'Pd': 10, 'Ag': 11, 'Cd': 12,
      'In': 3, 'Sn': 4, 'Sb': 3, 'Te': 2, 'I': 1, 'Xe': 0,
      'Cs': 1, 'Ba': 2, 'La': 3, 'Ce': 3, 'Pr': 3, 'Nd': 3, 'Pm': 3, 'Sm': 3, 'Eu': 3, 'Gd': 3, 'Tb': 3, 'Dy': 3, 'Ho': 3, 'Er': 3, 'Tm': 3, 'Yb': 3, 'Lu': 3,
      'Hf': 4, 'Ta': 5, 'W': 6, 'Re': 7, 'Os': 8, 'Ir': 9, 'Pt': 10, 'Au': 11, 'Hg': 12, 'Tl': 3, 'Pb': 4, 'Bi': 3, 'Po': 2, 'At': 1, 'Rn': 0,
      'Fr': 1, 'Ra': 2, 'Ac': 3, 'Th': 4, 'Pa': 5, 'U': 6, 'Np': 7, 'Pu': 8, 'Am': 9, 'Cm': 10, 'Bk': 11, 'Cf': 12, 'Es': 13, 'Fm': 14, 'Md': 15, 'No': 16, 'Lr': 17,
      'Rf': 4, 'Db': 5, 'Sg': 6, 'Bh': 7, 'Hs': 8, 'Mt': 9, 'Ds': 10, 'Rg': 11, 'Cn': 12, 'Nh': 13, 'Fl': 14, 'Mc': 15, 'Lv': 16, 'Ts': 17, 'Og': 18,
    };
    return standardValences[this.atom.symbol] || 0;
  }
  getBonds(): IMorganBond[] {
    return this.bonds.filter(b => b.atom1 === this.atom.id || b.atom2 === this.atom.id).map(b => new OC_MorganBond(b, this));
  }
  getNeighbors(): IMorganAtom[] {
    const neighbors: IMorganAtom[] = [];
    for (const b of this.bonds) {
      if (b.atom1 === this.atom.id) {
        const idx = this.atoms.findIndex(a => a.id === b.atom2);
        if (idx !== -1 && this.atoms[idx]) neighbors.push(new OC_MorganAtom(this.atoms[idx]!, this.mol, idx, this.atoms, this.bonds));
      } else if (b.atom2 === this.atom.id) {
        const idx = this.atoms.findIndex(a => a.id === b.atom1);
        if (idx !== -1 && this.atoms[idx]) neighbors.push(new OC_MorganAtom(this.atoms[idx]!, this.mol, idx, this.atoms, this.bonds));
      }
    }
    return neighbors;
  }
}

// Adapter: openchem Bond -> IMorganBond
class OC_MorganBond implements IMorganBond {
  private bond: Bond;
  private atom: OC_MorganAtom;
  constructor(bond: Bond, atom: OC_MorganAtom) {
    this.bond = bond;
    this.atom = atom;
  }
  getOtherAtom(atom: IMorganAtom): IMorganAtom {
    const a = this.bond.atom1 === (this.atom as any).atom.id ? this.bond.atom2 : this.bond.atom1;
    const atoms = (this.atom as any).atoms as Atom[];
    const mol = (this.atom as any).mol as Molecule;
    const idx = atoms.findIndex(at => at.id === a);
  if (idx === -1 || !atoms[idx]) throw new Error('Invalid atom index in getOtherAtom');
  return new OC_MorganAtom(atoms[idx]!, mol, idx, atoms, (this.atom as any).bonds);
  }
  getBondType(): number {
    switch (this.bond.type) {
      case 'single': return 1;
      case 'double': return 2;
      case 'triple': return 3;
      case 'aromatic': return 4;
      default: return 1;
    }
  }
}

// Adapter: openchem Molecule -> IMorganMolecule
class OC_MorganMolecule implements IMorganMolecule {
  private mol: Molecule;
  private atoms: Atom[];
  private bonds: Bond[];
  private ocAtoms: OC_MorganAtom[];
  constructor(mol: Molecule) {
    this.mol = mol;
    this.atoms = Array.from(mol.atoms);
    this.bonds = (mol as any).bonds ? Array.from((mol as any).bonds) : [];
    this.ocAtoms = this.atoms.map((a, i) => new OC_MorganAtom(a, mol, i, this.atoms, this.bonds));
  }
  getAtoms(): IMorganAtom[] { return this.ocAtoms; }
  getNumAtoms(): number { return this.atoms.length; }
}

/**
 * Public API: Compute Morgan/ECFP fingerprint for an openchem Molecule.
 * @param mol openchem Molecule
 * @param radius fingerprint radius (default 2)
 * @param fpSize fingerprint bit length (default 2048)
 * @returns Uint8Array bit vector
 */
export function computeMorganFingerprint(mol: Molecule, radius = 2, fpSize = 512): Uint8Array {
  const morganMol = new OC_MorganMolecule(mol);
  return getMorganFingerprint(morganMol, radius, fpSize);
}
/**
 * Represents a single bond in the molecule.
 */
interface IMorganBond {
  getOtherAtom(atom: IMorganAtom): IMorganAtom;
  getBondType(): number; // 1=single, 2=double, 3=triple, 4=aromatic
}

/**
 * Represents a single atom in the molecule.
 * This interface defines the minimal properties needed by the ECFP
 * invariant generator.
 */
interface IMorganAtom {
  /** Returns the atomic number (e.g., 6 for Carbon). */
  getAtomicNum(): number;

  /** Returns the total number of connections (any bond type). */
  getDegree(): number;

  /** Returns the atom's formal charge (e.g., 0, 1, -1). */
  getFormalCharge(): number;

  /** Returns the total number of hydrogens (explicit + implicit). */
  getTotalNumHs(): number;

  /** Returns true if the atom is part of any aromatic ring. */
  getIsAromatic(): boolean;

  /** * Returns true if the atom is in a ring of any size.
   * Note: This is a key part of the ECFP invariant.
   */
  isInRing(): boolean;

  /** Returns the valence of the atom. */
  getValence(): number;

  /** Returns a list of bonds connected to this atom. */
  getBonds(): IMorganBond[];

  /** Returns a list of neighboring atoms. */
  getNeighbors(): IMorganAtom[];
}

/**
 * Represents the entire molecule.
 */
interface IMorganMolecule {
  getAtoms(): IMorganAtom[];
  getNumAtoms(): number;
}


/**
 * A namespace for RDKit-compatible hashing functions.
 * All operations are performed using 32-bit unsigned integer semantics,
 * mimicking C++'s uint32_t.
 */
namespace RDKitHash {
  // 0x9e3779b9 is the 32-bit fractional part of the golden ratio
  // (sqrt(5)-1)/2 * 2^32, used in boost::hash_combine
  const K_GOLDEN_RATIO_32: number = 0x9e3779b9 >>> 0;

  /**
   * Implements the 32-bit unsigned boost::hash_combine function.
   * This is the RDKit implementation from Code/RDGeneral/hash/hash.hpp
   * * C++: seed ^= val + 0x9e3779b9 + (seed << 6) + (seed >> 2);
   * * @param seed The current 32-bit unsigned hash seed.
   * @param v The 32-bit unsigned value to combine.
   * @returns The new 32-bit unsigned hash.
   */
  export function hashCombine(seed: number, v: number): number {
    // Ensure inputs are 32-bit unsigned
    seed = seed >>> 0;
    v = v >>> 0;

    // (v + K_GOLDEN_RATIO_32)
    // All additions are (mod 2^32)
    const term1 = (v + K_GOLDEN_RATIO_32) >>> 0;
    
    // (seed << 6)
    const term2 = (seed << 6) >>> 0;

    // (seed >>> 2) (logical right shift)
    const term3 = seed >>> 2;
    
    // Combine terms with 32-bit unsigned addition
    // (term1 + term2 + term3)
    let combined = (term1 + term2) >>> 0;
    combined = (combined + term3) >>> 0;
    
    // return (seed ^ combined)
    return (seed ^ combined) >>> 0;
  }

  /**
   * Implements the 32-bit unsigned boost::hash_range function.
   * Iteratively applies hashCombine to a list of values.
   * * @param seed The initial 32-bit unsigned hash seed.
   * @param items An array of 32-bit unsigned numbers.
   * @returns The final 32-bit unsigned hash.
   */
  export function hashRange(seed: number, items: number[]): number {
    let currentSeed = seed >>> 0;
    for (const item of items) {
      currentSeed = hashCombine(currentSeed, item);
    }
    return currentSeed;
  }
}


/**
 * Generates the initial (radius 0) atom invariants, equivalent to
 * RDKit's MorganFingerprintAtomInvGenerator.
 * * @param mol The molecule to process.
 * @returns A Uint32Array where each index corresponds to an atom
 * and the value is its radius 0 invariant (hash).
 */
function getAtomInvariants(mol: IMorganMolecule): Uint32Array {
  const numAtoms = mol.getNumAtoms();
  const atoms = mol.getAtoms();
  const invariants = new Uint32Array(numAtoms);

  for (let i = 0; i < numAtoms; i++) {
    const atom = atoms[i];
    if (!atom) continue;
    let seed = 0; // Start with a seed of 0 for each atom
    // The order of these operations is critical to match RDKit
    seed = RDKitHash.hashCombine(seed, atom.getAtomicNum());
    seed = RDKitHash.hashCombine(seed, atom.getDegree());
    seed = RDKitHash.hashCombine(seed, atom.getTotalNumHs());
    seed = RDKitHash.hashCombine(seed, atom.getFormalCharge());
    seed = RDKitHash.hashCombine(seed, atom.getIsAromatic() ? 1 : 0);
    seed = RDKitHash.hashCombine(seed, atom.isInRing() ? 1 : 0);
    invariants[i] = seed;
  }
  return invariants;
}

/**
 * Generates a Morgan fingerprint (ECFP-like) for a molecule.
 * * @param mol The input molecule (must implement IMorganMolecule).
 * @param radius The maximum radius of the fingerprint (e.g., 2 for ECFP4).
 * @param fpSize The size of the bit vector (e.g., 2048).
 * @returns A Uint8Array bit vector of length fpSize.
 */
export function getMorganFingerprint(
  mol: IMorganMolecule, 
  radius: number, 
  fpSize: number = 512
): Uint8Array {
  const numAtoms = mol.getNumAtoms();
  if (numAtoms === 0) {
    return new Uint8Array(fpSize);
  }

  const atoms = mol.getAtoms();
  const fingerprint = new Uint8Array(fpSize);
  
  // Store the set of all unique features (invariants) found.
  // Using a Set ensures each feature only sets a bit once.
  const features = new Set<number>();

  // invariants[r][i] = invariant for atom i at radius r
  const atomInvariants: Uint32Array[] = [];
  
  // A map to quickly find an atom's index
  const atomIndexMap = new Map<IMorganAtom, number>();
  atoms.forEach((atom, idx) => atomIndexMap.set(atom, idx));

  // --- Radius 0 ---
  // Calculate and store initial invariants
  const r0Invariants = getAtomInvariants(mol);
  atomInvariants.push(r0Invariants);
  r0Invariants.forEach(inv => features.add(inv));

   // --- Radius 1 to N ---
   // Iteratively update invariants
   for (let r = 1; r <= radius; r++) {
     const prevInvariants = atomInvariants[r - 1]!;
     const newInvariants = new Uint32Array(numAtoms);
     for (let i = 0; i < numAtoms; i++) {
       const atom = atoms[i];
       if (!atom) continue;
       const prevInvariant = prevInvariants[i]!;
       // Get neighbor pairs (bond_type, neighbor_invariant) from the *previous* radius
       const neighborPairs: [number, number][] = [];
       for (const bond of atom.getBonds()) {
         const neighbor = bond.getOtherAtom(atom);
         const neighborIdx = atomIndexMap.get(neighbor);
         if (neighborIdx === undefined) continue;
         const bondType = bond.getBondType();
         neighborPairs.push([bondType, prevInvariants[neighborIdx]!]);
       }
       // Sort neighbor pairs to ensure canonical representation
       neighborPairs.sort((a, b) => {
         if (a[0] !== b[0]) return a[0] - b[0];
         return a[1] - b[1];
       });
       // The new invariant follows RDKit's logic: start with layer, hash_combine with prev, then each neighbor pair
       let invar = r - 1; // layer starts from 0
       invar = RDKitHash.hashCombine(invar, prevInvariant);
       for (const pair of neighborPairs) {
         invar = RDKitHash.hashCombine(invar, pair[0]); // bond type
         invar = RDKitHash.hashCombine(invar, pair[1]); // neighbor invariant
       }
       newInvariants[i] = invar;
       features.add(invar);
     }
     atomInvariants.push(newInvariants);
   }

  // --- Final Step: Fold all collected features into the fingerprint ---
  const numBytes = fpSize;
  const totalBits = numBytes * 8;
  for (const featureHash of features) {
    const bitIndex = Math.abs(featureHash) % totalBits;
    const byteIndex = Math.floor(bitIndex / 8);
    const bitOffset = bitIndex % 8;
    const byte = fingerprint[byteIndex];
    if (byte !== undefined) {
      fingerprint[byteIndex] = byte | (1 << bitOffset);
    }
  }

  return fingerprint;
}

export function tanimotoSimilarity(fp1: Uint8Array, fp2: Uint8Array): number {
  let intersection = 0;
  let union = 0;
  
  for (let i = 0; i < Math.min(fp1.length, fp2.length); i++) {
    const byte1 = fp1[i] ?? 0;
    const byte2 = fp2[i] ?? 0;
    
    for (let bit = 0; bit < 8; bit++) {
      const bit1 = (byte1 >> bit) & 1;
      const bit2 = (byte2 >> bit) & 1;
      if (bit1 === 1 && bit2 === 1) intersection++;
      if (bit1 === 1 || bit2 === 1) union++;
    }
  }
  
  if (union === 0) return 1.0;
  return intersection / union;
}

export function hammingDistance(fp1: Uint8Array, fp2: Uint8Array): number {
  let distance = 0;
  for (let i = 0; i < Math.min(fp1.length, fp2.length); i++) {
    if ((fp1[i] ?? 0) !== (fp2[i] ?? 0)) distance++;
  }
  return distance;
}