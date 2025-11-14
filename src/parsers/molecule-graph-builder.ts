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
   * Create oxirane ring (3-membered ring with O)
   * SMILES: C1CO1
   * Numbering: C1-O-C2 (oxygen at position 2, but substituents only on carbons)
   * @returns Array of atom indices [C1, O, C2] ordered for IUPAC positions [1, 2, 3]
   */
  createOxiraneRing(): number[] {
    const c1 = this.addCarbon();
    const o = this.addAtom('O');
    const c2 = this.addCarbon();
    
    this.addBond(c1, o);
    this.addBond(o, c2);
    this.addBond(c2, c1);
    
    // Return atoms in IUPAC numbering order: C1(pos1), O(pos2), C2(pos3)
    return [c1, o, c2];
  }

  /**
   * Create oxolan ring (5-membered ring with O)
   * SMILES: C1CCOC1
   * @returns Array of atom indices [C, C, C, O, C]
   */
  createOxolanRing(): number[] {
    const c1 = this.addCarbon();
    const c2 = this.addCarbon();
    const c3 = this.addCarbon();
    const o = this.addAtom('O');
    const c4 = this.addCarbon();
    
    this.addBond(c1, c2);
    this.addBond(c2, c3);
    this.addBond(c3, o);
    this.addBond(o, c4);
    this.addBond(c4, c1);
    
    return [c1, c2, c3, o, c4];
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
   * Converts the atom into C(=O)O by adding double-bonded O and single-bonded OH
   */
  addCarboxyl(atomIdx: number): void {
    // Add =O
    const carbonylOxygenIdx = this.addAtom('O');
    this.addBond(atomIdx, carbonylOxygenIdx, BondTypeEnum.DOUBLE);
    
    // Add -OH
    const hydroxylOxygenIdx = this.addAtom('O');
    this.addBond(atomIdx, hydroxylOxygenIdx);
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
   * Add a nitrile group (-C#N) by adding triple-bonded nitrogen
   */
  addNitrile(atomIdx: number): void {
    const nitrogenIdx = this.addAtom('N');
    this.addBond(atomIdx, nitrogenIdx, BondTypeEnum.TRIPLE);
  }

  /**
   * Add a thiocyanate group (-S-C#N) to a specific atom
   */
  addThiocyanate(atomIdx: number): void {
    const sulfurIdx = this.addAtom('S');
    const carbonIdx = this.addCarbon();
    const nitrogenIdx = this.addAtom('N');
    
    this.addBond(atomIdx, sulfurIdx);
    this.addBond(sulfurIdx, carbonIdx);
    this.addBond(carbonIdx, nitrogenIdx, BondTypeEnum.TRIPLE);
  }

  /**
   * Add an ester group (-C(=O)O-R) to a specific atom
   * Creates carboxyl and attaches alkyl chain to the OH oxygen
   * @param atomIdx Carbon atom to attach ester to
   * @param alkylChainLength Length of alkyl chain (1 for methyl, 2 for ethyl, etc.)
   * @returns The oxygen atom index that connects to alkyl chain
   */
  addEster(atomIdx: number, alkylChainLength: number): number {
    // Add =O
    const carbonylOxygenIdx = this.addAtom('O');
    this.addBond(atomIdx, carbonylOxygenIdx, BondTypeEnum.DOUBLE);
    
    // Add -O-
    const etherOxygenIdx = this.addAtom('O');
    this.addBond(atomIdx, etherOxygenIdx);

    // Add alkyl chain to ether oxygen
    if (alkylChainLength > 0) {
      const firstAlkylCarbon = this.addCarbon();
      this.addBond(etherOxygenIdx, firstAlkylCarbon);

      let prevCarbon = firstAlkylCarbon;
      for (let i = 1; i < alkylChainLength; i++) {
        const nextCarbon = this.addCarbon();
        this.addBond(prevCarbon, nextCarbon);
        prevCarbon = nextCarbon;
      }
    }

    return etherOxygenIdx;
  }

  /**
   * Add an amide group (-C(=O)NH2) to a specific atom
   * @returns The nitrogen atom index
   */
  addAmide(atomIdx: number): number {
    // Add =O
    const carbonylOxygenIdx = this.addAtom('O');
    this.addBond(atomIdx, carbonylOxygenIdx, BondTypeEnum.DOUBLE);
    
    // Add -NH2
    const nitrogenIdx = this.addAtom('N');
    this.addBond(atomIdx, nitrogenIdx);

    return nitrogenIdx;
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
   * Add an isopropyl substituent (-CH(CH3)2) to a specific atom
   */
  addIsopropyl(atomIdx: number): void {
    const chIdx = this.addCarbon();
    const ch3_1 = this.addCarbon();
    const ch3_2 = this.addCarbon();
    this.addBond(atomIdx, chIdx);
    this.addBond(chIdx, ch3_1);
    this.addBond(chIdx, ch3_2);
  }

  /**
   * Add a tert-butyl substituent (-C(CH3)3) to a specific atom
   */
  addTertButyl(atomIdx: number): void {
    const centralC = this.addCarbon();
    const ch3_1 = this.addCarbon();
    const ch3_2 = this.addCarbon();
    const ch3_3 = this.addCarbon();
    this.addBond(atomIdx, centralC);
    this.addBond(centralC, ch3_1);
    this.addBond(centralC, ch3_2);
    this.addBond(centralC, ch3_3);
  }

  /**
   * Add a methoxy substituent (-OCH3) to a specific atom
   */
  addMethoxy(atomIdx: number): void {
    const oxygenIdx = this.addAtom('O');
    const methylIdx = this.addCarbon();
    this.addBond(atomIdx, oxygenIdx);
    this.addBond(oxygenIdx, methylIdx);
  }

  /**
   * Add an ethoxy substituent (-OCH2CH3) to a specific atom
   */
  addEthoxy(atomIdx: number): void {
    const oxygenIdx = this.addAtom('O');
    const ch2Idx = this.addCarbon();
    const ch3Idx = this.addCarbon();
    this.addBond(atomIdx, oxygenIdx);
    this.addBond(oxygenIdx, ch2Idx);
    this.addBond(ch2Idx, ch3Idx);
  }

  /**
   * Add a propoxy substituent (-O-CH2CH2CH3) to a specific atom
   */
  addPropoxy(atomIdx: number): void {
    const oxygenIdx = this.addAtom('O');
    this.addBond(atomIdx, oxygenIdx);
    
    const propylChain = this.addAlkylSubstituent(oxygenIdx, 3);
  }

  /**
   * Add a butoxy substituent (-O-CH2CH2CH2CH3) to a specific atom
   */
  addButoxy(atomIdx: number): void {
    const oxygenIdx = this.addAtom('O');
    this.addBond(atomIdx, oxygenIdx);
    
    const butylChain = this.addAlkylSubstituent(oxygenIdx, 4);
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
   * Add an alkoxy group (-O-R) to a specific atom
   * Creates an ether linkage
   * @param atomIdx Target atom to attach to
   * @param alkylChainAtoms Array of atom indices for the alkyl part
   * @returns The oxygen atom index
   */
  addAlkoxyGroup(atomIdx: number, alkylChainAtoms: number[]): number {
    const oxygenIdx = this.addAtom('O');
    this.addBond(atomIdx, oxygenIdx);
    
    // Bond oxygen to first carbon of alkyl chain
    if (alkylChainAtoms.length > 0 && alkylChainAtoms[0] !== undefined) {
      this.addBond(oxygenIdx, alkylChainAtoms[0]);
    }
    
    return oxygenIdx;
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
