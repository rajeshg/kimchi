import type { Atom, Bond, Molecule, BondType } from 'types';
import { BondType as BondTypeEnum } from 'types';

/**
 * Mutable molecule builder for constructing molecules from IUPAC tokens
 * Uses graph-based approach instead of string manipulation
 */
export class MoleculeGraphBuilder {
  private atoms: Array<{
    id: number;
    symbol: string;
    atomicNumber: number;
    charge: number;
    hydrogens: number;
    isotope: number | null;
    aromatic: boolean;
    chiral: string | null;
    isBracket: boolean;
    atomClass: number;
  }> = [];

  private bonds: Array<{
    atom1: number;
    atom2: number;
    type: BondType;
    stereo: 'none' | 'up' | 'down' | 'either';
  }> = [];

  private atomicNumbers: Record<string, number> = {
    'H': 1, 'C': 6, 'N': 7, 'O': 8, 'F': 9, 'P': 15, 'S': 16, 'Cl': 17, 'Br': 35, 'I': 53,
  };

  /**
   * Add a carbon atom to the molecule
   * @returns atom index
   */
  addCarbon(): number {
    const id = this.atoms.length;
    this.atoms.push({
      id,
      symbol: 'C',
      atomicNumber: 6,
      charge: 0,
      hydrogens: 0, // Will be computed later
      isotope: null,
      aromatic: false,
      chiral: null,
      isBracket: false,
      atomClass: 0,
    });
    return id;
  }

  /**
   * Add an atom with specified element
   * @param element Element symbol (C, N, O, etc.)
   * @returns atom index
   */
  addAtom(element: string, aromatic = false): number {
    const id = this.atoms.length;
    const atomicNumber = this.atomicNumbers[element] ?? 6;
    this.atoms.push({
      id,
      symbol: element,
      atomicNumber,
      charge: 0,
      hydrogens: 0,
      isotope: null,
      aromatic,
      chiral: null,
      isBracket: false,
      atomClass: 0,
    });
    return id;
  }

  /**
   * Add a single bond between two atoms
   */
  addBond(atom1: number, atom2: number, type: BondType = BondTypeEnum.SINGLE): void {
    this.bonds.push({
      atom1,
      atom2,
      type,
      stereo: 'none',
    });
  }

  /**
   * Create a linear carbon chain
   * @param length Number of carbons
   * @returns Array of atom indices
   */
  createLinearChain(length: number): number[] {
    const atomIndices: number[] = [];
    
    for (let i = 0; i < length; i++) {
      const atomIdx = this.addCarbon();
      atomIndices.push(atomIdx);
      
      // Bond to previous carbon
      if (i > 0) {
        this.addBond(atomIndices[i - 1]!, atomIdx);
      }
    }
    
    return atomIndices;
  }

  /**
   * Create a cyclic carbon chain (ring)
   * @param size Ring size (3 for cyclopropane, 6 for cyclohexane, etc.)
   * @param aromatic Whether ring is aromatic
   * @returns Array of atom indices
   */
  createCyclicChain(size: number, aromatic = false): number[] {
    const atomIndices: number[] = [];
    
    for (let i = 0; i < size; i++) {
      const atomIdx = aromatic ? this.addAtom('C', true) : this.addCarbon();
      atomIndices.push(atomIdx);
      
      // Bond to previous carbon
      if (i > 0) {
        const bondType = aromatic ? BondTypeEnum.AROMATIC : BondTypeEnum.SINGLE;
        this.addBond(atomIndices[i - 1]!, atomIdx, bondType);
      }
    }
    
    // Close the ring
    if (atomIndices.length > 2) {
      const bondType = aromatic ? BondTypeEnum.AROMATIC : BondTypeEnum.SINGLE;
      this.addBond(atomIndices[atomIndices.length - 1]!, atomIndices[0]!, bondType);
    }
    
    return atomIndices;
  }
  
  /**
   * Create a benzene ring (6-membered aromatic ring)
   * @returns Array of atom indices
   */
  createBenzeneRing(): number[] {
    return this.createCyclicChain(6, true);
  }

  /**
   * Add a hydroxyl group (-OH) to a specific atom
   */
  addHydroxyl(atomIdx: number): void {
    const oxygenIdx = this.addAtom('O');
    this.addBond(atomIdx, oxygenIdx);
  }

  /**
   * Add a carbonyl group (=O) to a specific atom
   */
  addCarbonyl(atomIdx: number): void {
    const oxygenIdx = this.addAtom('O');
    this.addBond(atomIdx, oxygenIdx, BondTypeEnum.DOUBLE);
  }

  /**
   * Add a carboxyl group (-COOH) to a specific atom
   * This adds a carbon with double-bonded O and single-bonded OH
   */
  addCarboxyl(atomIdx: number): void {
    const carbonylCarbonIdx = this.addCarbon();
    this.addBond(atomIdx, carbonylCarbonIdx);
    
    // Add =O
    const carbonylOxygenIdx = this.addAtom('O');
    this.addBond(carbonylCarbonIdx, carbonylOxygenIdx, BondTypeEnum.DOUBLE);
    
    // Add -OH
    const hydroxylOxygenIdx = this.addAtom('O');
    this.addBond(carbonylCarbonIdx, hydroxylOxygenIdx);
  }

  /**
   * Add an amine group (-NH2) to a specific atom
   */
  addAmine(atomIdx: number): void {
    const nitrogenIdx = this.addAtom('N');
    this.addBond(atomIdx, nitrogenIdx);
  }

  /**
   * Add an aldehyde group (-CHO) by converting terminal carbon to C=O
   */
  addAldehyde(atomIdx: number): void {
    const oxygenIdx = this.addAtom('O');
    this.addBond(atomIdx, oxygenIdx, BondTypeEnum.DOUBLE);
  }

  /**
   * Add a methyl substituent (-CH3) to a specific atom
   */
  addMethyl(atomIdx: number): void {
    const methylIdx = this.addCarbon();
    this.addBond(atomIdx, methylIdx);
  }

  /**
   * Add an ethyl substituent (-CH2CH3) to a specific atom
   */
  addEthyl(atomIdx: number): void {
    const ch2Idx = this.addCarbon();
    const ch3Idx = this.addCarbon();
    this.addBond(atomIdx, ch2Idx);
    this.addBond(ch2Idx, ch3Idx);
  }

  /**
   * Add a substituent chain to a specific atom
   * @param atomIdx Target atom to attach to
   * @param chainLength Number of carbons in substituent
   */
  addAlkylSubstituent(atomIdx: number, chainLength: number): number[] {
    const substituentAtoms: number[] = [];
    
    for (let i = 0; i < chainLength; i++) {
      const carbonIdx = this.addCarbon();
      substituentAtoms.push(carbonIdx);
      
      if (i === 0) {
        // First carbon bonds to main chain
        this.addBond(atomIdx, carbonIdx);
      } else {
        // Subsequent carbons bond to previous
        this.addBond(substituentAtoms[i - 1]!, carbonIdx);
      }
    }
    
    return substituentAtoms;
  }

  /**
   * Add a double bond between two existing atoms
   */
  addDoubleBond(atom1: number, atom2: number): void {
    // Find and update existing bond or add new one
    const existingBond = this.bonds.find(
      b => (b.atom1 === atom1 && b.atom2 === atom2) || (b.atom1 === atom2 && b.atom2 === atom1)
    );
    
    if (existingBond) {
      existingBond.type = BondTypeEnum.DOUBLE;
    } else {
      this.addBond(atom1, atom2, BondTypeEnum.DOUBLE);
    }
  }

  /**
   * Add a triple bond between two existing atoms
   */
  addTripleBond(atom1: number, atom2: number): void {
    const existingBond = this.bonds.find(
      b => (b.atom1 === atom1 && b.atom2 === atom2) || (b.atom1 === atom2 && b.atom2 === atom1)
    );
    
    if (existingBond) {
      existingBond.type = BondTypeEnum.TRIPLE;
    } else {
      this.addBond(atom1, atom2, BondTypeEnum.TRIPLE);
    }
  }

  /**
   * Get the current atom count
   */
  getAtomCount(): number {
    return this.atoms.length;
  }

  /**
   * Get a specific atom by index
   */
  getAtom(index: number) {
    return this.atoms[index];
  }

  /**
   * Build the final immutable molecule
   */
  build(): Molecule {
    return {
      atoms: this.atoms as readonly Atom[],
      bonds: this.bonds as readonly Bond[],
      rings: [],
      ringInfo: {
        atomRings: new Map(),
        bondRings: new Map(),
        rings: [],
      },
    };
  }
}
