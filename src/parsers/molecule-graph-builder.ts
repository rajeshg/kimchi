import type { Atom, Bond, Molecule, BondType } from "types";
import { BondType as BondTypeEnum } from "types";

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
    stereo: "none" | "up" | "down" | "either";
  }> = [];

  private atomicNumbers: Record<string, number> = {
    H: 1,
    C: 6,
    N: 7,
    O: 8,
    F: 9,
    P: 15,
    S: 16,
    Cl: 17,
    Br: 35,
    I: 53,
  };

  /**
   * Add a carbon atom to the molecule
   * @returns atom index
   */
  addCarbon(): number {
    const id = this.atoms.length;
    this.atoms.push({
      id,
      symbol: "C",
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
   * Set explicit hydrogen count for an atom
   */
  setHydrogens(atomIdx: number, hydrogens: number): void {
    if (atomIdx >= 0 && atomIdx < this.atoms.length) {
      this.atoms[atomIdx]!.hydrogens = hydrogens;
    }
  }

  /**
   * Add a single bond between two atoms
   */
  addBond(
    atom1: number,
    atom2: number,
    type: BondType = BondTypeEnum.SINGLE,
  ): void {
    this.bonds.push({
      atom1,
      atom2,
      type,
      stereo: "none",
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
      const atomIdx = aromatic ? this.addAtom("C", true) : this.addCarbon();
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
      this.addBond(
        atomIndices[atomIndices.length - 1]!,
        atomIndices[0]!,
        bondType,
      );
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
    const o = this.addAtom("O");
    const c2 = this.addCarbon();

    this.addBond(c1, o);
    this.addBond(o, c2);
    this.addBond(c2, c1);

    // Return all atoms in IUPAC numbering order
    // In Hantzsch-Widman nomenclature, heteroatom gets position 1
    // Position 1 = O, Position 2 = C1, Position 3 = C2
    return [o, c1, c2];
  }

  /**
   * Create oxetane ring (4-membered saturated ring with O)
   * SMILES: C1COC1
   * Hantzsch-Widman numbering: O at position 1
   * @returns Array of atom indices [O, C, C, C]
   */
  createOxetaneRing(): number[] {
    const o = this.addAtom("O");
    const c2 = this.addCarbon();
    const c3 = this.addCarbon();
    const c4 = this.addCarbon();

    this.addBond(o, c2);
    this.addBond(c2, c3);
    this.addBond(c3, c4);
    this.addBond(c4, o);

    return [o, c2, c3, c4];
  }

  /**
   * Create azetidine ring (4-membered saturated ring with N)
   * SMILES: C1CNC1
   * Hantzsch-Widman numbering: N at position 1
   * @returns Array of atom indices [N, C, C, C]
   */
  createAzetidineRing(): number[] {
    const n = this.addAtom("N");
    const c2 = this.addCarbon();
    const c3 = this.addCarbon();
    const c4 = this.addCarbon();

    this.addBond(n, c2);
    this.addBond(c2, c3);
    this.addBond(c3, c4);
    this.addBond(c4, n);

    return [n, c2, c3, c4];
  }

  /**
   * Create oxolan ring (5-membered ring with O)
   * SMILES: C1CCOC1
   * @returns Array of atom indices [O, C, C, C, C]
   */
  createOxolanRing(): number[] {
    const o = this.addAtom("O");
    const c2 = this.addCarbon();
    const c3 = this.addCarbon();
    const c4 = this.addCarbon();
    const c5 = this.addCarbon();

    this.addBond(o, c2);
    this.addBond(c2, c3);
    this.addBond(c3, c4);
    this.addBond(c4, c5);
    this.addBond(c5, o);

    // IUPAC numbering: O gets position 1, carbons 2,3,4,5
    return [o, c2, c3, c4, c5];
  }

  /**
   * Create pyridine ring (6-membered aromatic ring with N)
   * SMILES: c1ccncc1 (N at position 1)
   * @returns Array of atom indices [N, C, C, C, C, C]
   */
  createPyridineRing(): number[] {
    const n = this.addAtom("N", true);
    const c2 = this.addAtom("C", true);
    const c3 = this.addAtom("C", true);
    const c4 = this.addAtom("C", true);
    const c5 = this.addAtom("C", true);
    const c6 = this.addAtom("C", true);

    this.addBond(n, c2, BondTypeEnum.AROMATIC);
    this.addBond(c2, c3, BondTypeEnum.AROMATIC);
    this.addBond(c3, c4, BondTypeEnum.AROMATIC);
    this.addBond(c4, c5, BondTypeEnum.AROMATIC);
    this.addBond(c5, c6, BondTypeEnum.AROMATIC);
    this.addBond(c6, n, BondTypeEnum.AROMATIC);

    return [n, c2, c3, c4, c5, c6];
  }

  /**
   * Create 1,2,4-triazine ring (6-membered aromatic with 3 N atoms)
   * SMILES: c1ncncn1 (canonical form with alternating pattern)
   * Ring structure: C-N-C-N-C-N (alternating)
   * @returns Array of atom indices [C, N, C, N, C, N]
   */
  createTriazineRing(): number[] {
    const c1 = this.addAtom("C", true);
    const n1 = this.addAtom("N", true);
    const c2 = this.addAtom("C", true);
    const n2 = this.addAtom("N", true);
    const c3 = this.addAtom("C", true);
    const n3 = this.addAtom("N", true);

    this.addBond(c1, n1, BondTypeEnum.AROMATIC);
    this.addBond(n1, c2, BondTypeEnum.AROMATIC);
    this.addBond(c2, n2, BondTypeEnum.AROMATIC);
    this.addBond(n2, c3, BondTypeEnum.AROMATIC);
    this.addBond(c3, n3, BondTypeEnum.AROMATIC);
    this.addBond(n3, c1, BondTypeEnum.AROMATIC);

    return [c1, n1, c2, n2, c3, n3];
  }

  /**
   * Create benzene ring (6-membered aromatic ring)
   * SMILES: c1ccccc1
   * @returns Array of atom indices [6 carbons]
   */
  createFuranRing(): number[] {
    const o = this.addAtom("O", true);
    const c2 = this.addAtom("C", true);
    const c3 = this.addAtom("C", true);
    const c4 = this.addAtom("C", true);
    const c5 = this.addAtom("C", true);

    this.addBond(o, c2, BondTypeEnum.AROMATIC);
    this.addBond(c2, c3, BondTypeEnum.AROMATIC);
    this.addBond(c3, c4, BondTypeEnum.AROMATIC);
    this.addBond(c4, c5, BondTypeEnum.AROMATIC);
    this.addBond(c5, o, BondTypeEnum.AROMATIC);

    return [o, c2, c3, c4, c5];
  }

  /**
   * Create thiophene ring (5-membered aromatic ring with S)
   * SMILES: s1cccc1 (S at position 1)
   * @returns Array of atom indices [S, C, C, C, C]
   */
  createThiopheneRing(): number[] {
    const s = this.addAtom("S", true);
    const c2 = this.addAtom("C", true);
    const c3 = this.addAtom("C", true);
    const c4 = this.addAtom("C", true);
    const c5 = this.addAtom("C", true);

    if (process.env.VERBOSE) {
      console.log(
        `[createThiopheneRing] Created atoms: S=${s}, C2=${c2}, C3=${c3}, C4=${c4}, C5=${c5}`,
      );
    }

    this.addBond(s, c2, BondTypeEnum.AROMATIC);
    this.addBond(c2, c3, BondTypeEnum.AROMATIC);
    this.addBond(c3, c4, BondTypeEnum.AROMATIC);
    this.addBond(c4, c5, BondTypeEnum.AROMATIC);
    this.addBond(c5, s, BondTypeEnum.AROMATIC);

    const result = [s, c2, c3, c4, c5];
    if (process.env.VERBOSE) {
      console.log(`[createThiopheneRing] Returning array:`, result);
    }
    return result;
  }

  /**
   * Create pyrrole ring (5-membered aromatic ring with NH)
   * SMILES: n1cccc1 (N at position 1)
   * @returns Array of atom indices [N, C, C, C, C]
   */
  createPyrroleRing(): number[] {
    const n = this.addAtom("N", true);
    const c2 = this.addAtom("C", true);
    const c3 = this.addAtom("C", true);
    const c4 = this.addAtom("C", true);
    const c5 = this.addAtom("C", true);

    this.setHydrogens(n, 1);

    this.addBond(n, c2, BondTypeEnum.AROMATIC);
    this.addBond(c2, c3, BondTypeEnum.AROMATIC);
    this.addBond(c3, c4, BondTypeEnum.AROMATIC);
    this.addBond(c4, c5, BondTypeEnum.AROMATIC);
    this.addBond(c5, n, BondTypeEnum.AROMATIC);

    return [n, c2, c3, c4, c5];
  }

  /**
   * Create thiazole ring (5-membered aromatic ring with S and N)
   * SMILES: c1cscn1 (canonical form)
   * Hantzsch-Widman numbering: S at position 1, N at position 3
   * @returns Array of atom indices [S, C, N, C, C]
   */
  createThiazoleRing(): number[] {
    const s = this.addAtom("S", true);
    const c2 = this.addAtom("C", true);
    const n = this.addAtom("N", true);
    const c4 = this.addAtom("C", true);
    const c5 = this.addAtom("C", true);

    this.addBond(s, c2, BondTypeEnum.AROMATIC);
    this.addBond(c2, n, BondTypeEnum.AROMATIC);
    this.addBond(n, c4, BondTypeEnum.AROMATIC);
    this.addBond(c4, c5, BondTypeEnum.AROMATIC);
    this.addBond(c5, s, BondTypeEnum.AROMATIC);

    return [s, c2, n, c4, c5];
  }

  /**
   * Create oxazole ring (5-membered aromatic ring with O and N)
   * SMILES: c1cocn1 (canonical form)
   * Hantzsch-Widman numbering: O at position 1, N at position 3
   * @returns Array of atom indices [O, C, N, C, C]
   */
  createOxazoleRing(): number[] {
    const o = this.addAtom("O", true);
    const c2 = this.addAtom("C", true);
    const n = this.addAtom("N", true);
    const c4 = this.addAtom("C", true);
    const c5 = this.addAtom("C", true);

    this.addBond(o, c2, BondTypeEnum.AROMATIC);
    this.addBond(c2, n, BondTypeEnum.AROMATIC);
    this.addBond(n, c4, BondTypeEnum.AROMATIC);
    this.addBond(c4, c5, BondTypeEnum.AROMATIC);
    this.addBond(c5, o, BondTypeEnum.AROMATIC);

    return [o, c2, n, c4, c5];
  }

  /**
   * Create naphthalene (fused benzene rings)
   * SMILES: c1ccc2ccccc2c1
   * @returns Array of atom indices [10 carbons]
   */
  createNaphthaleneRing(): number[] {
    const atoms: number[] = [];
    for (let i = 0; i < 10; i++) {
      atoms.push(this.addAtom("C", true));
    }

    // First ring: 0-1-2-3-8-9
    this.addBond(atoms[0]!, atoms[1]!, BondTypeEnum.AROMATIC);
    this.addBond(atoms[1]!, atoms[2]!, BondTypeEnum.AROMATIC);
    this.addBond(atoms[2]!, atoms[3]!, BondTypeEnum.AROMATIC);
    this.addBond(atoms[3]!, atoms[8]!, BondTypeEnum.AROMATIC);
    this.addBond(atoms[8]!, atoms[9]!, BondTypeEnum.AROMATIC);
    this.addBond(atoms[9]!, atoms[0]!, BondTypeEnum.AROMATIC);

    // Second ring: 3-4-5-6-7-8
    this.addBond(atoms[3]!, atoms[4]!, BondTypeEnum.AROMATIC);
    this.addBond(atoms[4]!, atoms[5]!, BondTypeEnum.AROMATIC);
    this.addBond(atoms[5]!, atoms[6]!, BondTypeEnum.AROMATIC);
    this.addBond(atoms[6]!, atoms[7]!, BondTypeEnum.AROMATIC);
    this.addBond(atoms[7]!, atoms[8]!, BondTypeEnum.AROMATIC);

    return atoms;
  }

  /**
   * Create morpholine ring (6-membered saturated ring with O and N)
   * SMILES: C1CNCCO1
   * @returns Array of atom indices [C, C, N, C, C, O]
   */
  createMorpholineRing(): number[] {
    const c1 = this.addCarbon();
    const c2 = this.addCarbon();
    const n = this.addAtom("N");
    const c4 = this.addCarbon();
    const c5 = this.addCarbon();
    const o = this.addAtom("O");

    this.addBond(c1, c2);
    this.addBond(c2, n);
    this.addBond(n, c4);
    this.addBond(c4, c5);
    this.addBond(c5, o);
    this.addBond(o, c1);

    return [c1, c2, n, c4, c5, o];
  }

  /**
   * Create piperidine ring (6-membered saturated ring with N)
   * SMILES: C1CCNCC1
   * @returns Array of atom indices [C, C, C, N, C, C]
   */
  createPiperidineRing(): number[] {
    const c1 = this.addCarbon();
    const c2 = this.addCarbon();
    const c3 = this.addCarbon();
    const n = this.addAtom("N");
    const c5 = this.addCarbon();
    const c6 = this.addCarbon();

    this.addBond(c1, c2);
    this.addBond(c2, c3);
    this.addBond(c3, n);
    this.addBond(n, c5);
    this.addBond(c5, c6);
    this.addBond(c6, c1);

    return [c1, c2, c3, n, c5, c6];
  }

  /**
   * Create pyrrolidine ring (5-membered saturated ring with N)
   * SMILES: C1CCNC1
   * @returns Array of atom indices [C, C, C, N, C]
   */
  createPyrrolidineRing(): number[] {
    const c1 = this.addCarbon();
    const c2 = this.addCarbon();
    const c3 = this.addCarbon();
    const n = this.addAtom("N");
    const c5 = this.addCarbon();

    this.addBond(c1, c2);
    this.addBond(c2, c3);
    this.addBond(c3, n);
    this.addBond(n, c5);
    this.addBond(c5, c1);

    return [c1, c2, c3, n, c5];
  }

  /**
   * Create piperazine ring (6-membered saturated ring with 2 N)
   * SMILES: C1CNCCN1
   * @returns Array of atom indices [C, C, N, C, C, N]
   */
  createPiperazineRing(): number[] {
    const c1 = this.addCarbon();
    const c2 = this.addCarbon();
    const n3 = this.addAtom("N");
    const c4 = this.addCarbon();
    const c5 = this.addCarbon();
    const n6 = this.addAtom("N");

    this.addBond(c1, c2);
    this.addBond(c2, n3);
    this.addBond(n3, c4);
    this.addBond(c4, c5);
    this.addBond(c5, n6);
    this.addBond(n6, c1);

    return [c1, c2, n3, c4, c5, n6];
  }

  /**
   * Create oxane ring (6-membered saturated ring with O, tetrahydropyran)
   * SMILES: C1CCOCC1
   * Hantzsch-Widman numbering: O at position 1
   * @returns Array of atom indices [O, C, C, C, C, C]
   */
  createOxaneRing(): number[] {
    const o = this.addAtom("O");
    const c2 = this.addCarbon();
    const c3 = this.addCarbon();
    const c4 = this.addCarbon();
    const c5 = this.addCarbon();
    const c6 = this.addCarbon();

    this.addBond(o, c2);
    this.addBond(c2, c3);
    this.addBond(c3, c4);
    this.addBond(c4, c5);
    this.addBond(c5, c6);
    this.addBond(c6, o);

    return [o, c2, c3, c4, c5, c6];
  }

  /**
   * Create thiane ring (6-membered saturated ring with S, tetrahydrothiopyran)
   * SMILES: C1CCSCC1
   * Hantzsch-Widman numbering: S at position 1
   * @returns Array of atom indices [S, C, C, C, C, C]
   */
  createThianeRing(): number[] {
    const s = this.addAtom("S");
    const c2 = this.addCarbon();
    const c3 = this.addCarbon();
    const c4 = this.addCarbon();
    const c5 = this.addCarbon();
    const c6 = this.addCarbon();

    this.addBond(s, c2);
    this.addBond(c2, c3);
    this.addBond(c3, c4);
    this.addBond(c4, c5);
    this.addBond(c5, c6);
    this.addBond(c6, s);

    return [s, c2, c3, c4, c5, c6];
  }

  /**
   * Create thiolane ring (5-membered saturated ring with S, tetrahydrothiophene)
   * SMILES: C1CCSC1
   * Hantzsch-Widman numbering: S at position 1
   * @returns Array of atom indices [S, C, C, C, C]
   */
  createThiolaneRing(): number[] {
    const s = this.addAtom("S");
    const c2 = this.addCarbon();
    const c3 = this.addCarbon();
    const c4 = this.addCarbon();
    const c5 = this.addCarbon();

    this.addBond(s, c2);
    this.addBond(c2, c3);
    this.addBond(c3, c4);
    this.addBond(c4, c5);
    this.addBond(c5, s);

    return [s, c2, c3, c4, c5];
  }

  /**
   * Create quinoline ring (fused pyridine + benzene)
   * SMILES: c1ccc2ncccc2c1
   * @returns Array of atom indices [10 atoms: N + 9 carbons]
   */
  createQuinolineRing(): number[] {
    const atoms: number[] = [];

    // First ring (pyridine part): 0(N)-1-2-3-8-9
    atoms.push(this.addAtom("N", true)); // 0: N
    for (let i = 1; i < 9; i++) {
      atoms.push(this.addAtom("C", true));
    }
    atoms.push(this.addAtom("C", true)); // 9

    // Pyridine ring: N(0)-C(1)-C(2)-C(3)-C(8)-C(9)-N(0)
    this.addBond(atoms[0]!, atoms[1]!, BondTypeEnum.AROMATIC);
    this.addBond(atoms[1]!, atoms[2]!, BondTypeEnum.AROMATIC);
    this.addBond(atoms[2]!, atoms[3]!, BondTypeEnum.AROMATIC);
    this.addBond(atoms[3]!, atoms[8]!, BondTypeEnum.AROMATIC);
    this.addBond(atoms[8]!, atoms[9]!, BondTypeEnum.AROMATIC);
    this.addBond(atoms[9]!, atoms[0]!, BondTypeEnum.AROMATIC);

    // Benzene ring: C(3)-C(4)-C(5)-C(6)-C(7)-C(8)
    this.addBond(atoms[3]!, atoms[4]!, BondTypeEnum.AROMATIC);
    this.addBond(atoms[4]!, atoms[5]!, BondTypeEnum.AROMATIC);
    this.addBond(atoms[5]!, atoms[6]!, BondTypeEnum.AROMATIC);
    this.addBond(atoms[6]!, atoms[7]!, BondTypeEnum.AROMATIC);
    this.addBond(atoms[7]!, atoms[8]!, BondTypeEnum.AROMATIC);

    return atoms;
  }

  /**
   * Create indole ring (fused pyrrole + benzene)
   * SMILES: c1ccc2[nH]ccc2c1 (input) → c1ccc2nccc2c1 (canonical, N not bracketed)
   * @returns Array of atom indices [9 atoms: N + 8 carbons]
   */
  createIndoleRing(): number[] {
    const atoms: number[] = [];

    // Create all atoms: C0-C1-C2-C3(fused)-N4-C5-C6-C7(fused)-C8
    for (let i = 0; i < 4; i++) {
      atoms.push(this.addAtom("C", true));
    }
    const n = this.addAtom("N", true); // 4: N with H
    atoms.push(n);
    this.setHydrogens(n, 1);

    for (let i = 5; i < 9; i++) {
      atoms.push(this.addAtom("C", true));
    }

    // Benzene ring: 0-1-2-3-8-back to 0
    this.addBond(atoms[0]!, atoms[1]!, BondTypeEnum.AROMATIC);
    this.addBond(atoms[1]!, atoms[2]!, BondTypeEnum.AROMATIC);
    this.addBond(atoms[2]!, atoms[3]!, BondTypeEnum.AROMATIC);
    this.addBond(atoms[3]!, atoms[8]!, BondTypeEnum.AROMATIC);
    this.addBond(atoms[8]!, atoms[0]!, BondTypeEnum.AROMATIC);

    // Pyrrole ring: N(4)-C(5)-C(6)-C(7)-C(3)-C(8) forms the 5-membered ring
    // Actually: 3-N(4)-C(5)-C(6)-C(7)-3 forms pyrrole fused to benzene at 3-8
    // Correct structure: C3 is fused point
    // Pyrrole part: C(3)-N(4)-C(5)-C(6)-C(7) and C(7) connects back to C(8)
    // Wait, let me reconsider: indole is benzene fused to pyrrole
    // Benzene: C0-C1-C2-C3-C8-C0 (but C8 is also part of pyrrole)
    // Pyrrole: C3-N4-C5-C6-C7-back to C8
    
    // Let me fix: benzene is C0-C1-C2-C3-C8-C0, pyrrole is C3-N4-C5-C6-C7-C8
    // So we need: C3 connects to both C8 (benzene) and N4 (pyrrole)
    // And C8 connects to C0, C3, and C7

    // Pyrrole ring bonds:
    this.addBond(atoms[3]!, atoms[4]!, BondTypeEnum.AROMATIC); // C3-N4
    this.addBond(atoms[4]!, atoms[5]!, BondTypeEnum.AROMATIC); // N4-C5
    this.addBond(atoms[5]!, atoms[6]!, BondTypeEnum.AROMATIC); // C5-C6
    this.addBond(atoms[6]!, atoms[7]!, BondTypeEnum.AROMATIC); // C6-C7
    this.addBond(atoms[7]!, atoms[8]!, BondTypeEnum.AROMATIC); // C7-C8 (fusion bond)

    return atoms;
  }

  /**
   * Build a molecule from the internal atom and bond lists
   * @returns Molecule object
   */
  addHydroxyl(atomIdx: number): void {
    const oxygenIdx = this.addAtom("O");
    this.addBond(atomIdx, oxygenIdx);
  }

  /**
   * Add a carbonyl group (=O) to a specific atom
   */
  addCarbonyl(atomIdx: number): void {
    const oxygenIdx = this.addAtom("O");
    this.addBond(atomIdx, oxygenIdx, BondTypeEnum.DOUBLE);
  }

  /**
   * Add a carboxyl group (-COOH) to a specific atom
   * Converts the atom into C(=O)O by adding double-bonded O and single-bonded OH
   */
  addCarboxyl(atomIdx: number): void {
    // Add =O
    const carbonylOxygenIdx = this.addAtom("O");
    this.addBond(atomIdx, carbonylOxygenIdx, BondTypeEnum.DOUBLE);

    // Add -OH
    const hydroxylOxygenIdx = this.addAtom("O");
    this.addBond(atomIdx, hydroxylOxygenIdx);
  }

  /**
   * Add an amine group (-NH2) to a specific atom
   */
  addAmine(atomIdx: number): void {
    const nitrogenIdx = this.addAtom("N");
    this.addBond(atomIdx, nitrogenIdx);
  }

  /**
   * Add an aldehyde group (-CHO) by converting terminal carbon to C=O
   */
  addAldehyde(atomIdx: number): void {
    const oxygenIdx = this.addAtom("O");
    this.addBond(atomIdx, oxygenIdx, BondTypeEnum.DOUBLE);
  }

  /**
   * Add a nitrile group (-C#N) by adding triple-bonded nitrogen
   */
  addNitrile(atomIdx: number): void {
    const nitrogenIdx = this.addAtom("N");
    this.addBond(atomIdx, nitrogenIdx, BondTypeEnum.TRIPLE);
  }

  /**
   * Add a thiocyanate group (-S-C#N) to a specific atom
   */
  addThiocyanate(atomIdx: number): void {
    const sulfurIdx = this.addAtom("S");
    const carbonIdx = this.addCarbon();
    const nitrogenIdx = this.addAtom("N");

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
    const carbonylOxygenIdx = this.addAtom("O");
    this.addBond(atomIdx, carbonylOxygenIdx, BondTypeEnum.DOUBLE);

    // Add -O-
    const etherOxygenIdx = this.addAtom("O");
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
    const carbonylOxygenIdx = this.addAtom("O");
    this.addBond(atomIdx, carbonylOxygenIdx, BondTypeEnum.DOUBLE);

    // Add -NH2
    const nitrogenIdx = this.addAtom("N");
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
   * Add an isobutyl substituent (-CH2CH(CH3)2) to a specific atom
   */
  addIsobutyl(atomIdx: number): void {
    const ch2 = this.addCarbon();
    const ch = this.addCarbon();
    const ch3_1 = this.addCarbon();
    const ch3_2 = this.addCarbon();
    this.addBond(atomIdx, ch2);
    this.addBond(ch2, ch);
    this.addBond(ch, ch3_1);
    this.addBond(ch, ch3_2);
  }

  /**
   * Add a sec-butyl substituent (-CH(CH3)CH2CH3) to a specific atom
   */
  addSecButyl(atomIdx: number): void {
    const ch = this.addCarbon();
    const ch3_branch = this.addCarbon();
    const ch2 = this.addCarbon();
    const ch3_end = this.addCarbon();
    this.addBond(atomIdx, ch);
    this.addBond(ch, ch3_branch);
    this.addBond(ch, ch2);
    this.addBond(ch2, ch3_end);
  }

  /**
   * Add a methoxy substituent (-OCH3) to a specific atom
   */
  addMethoxy(atomIdx: number): void {
    const oxygenIdx = this.addAtom("O");
    const methylIdx = this.addCarbon();
    this.addBond(atomIdx, oxygenIdx);
    this.addBond(oxygenIdx, methylIdx);
  }

  /**
   * Add an ethoxy substituent (-OCH2CH3) to a specific atom
   */
  addEthoxy(atomIdx: number): void {
    const oxygenIdx = this.addAtom("O");
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
    const oxygenIdx = this.addAtom("O");
    this.addBond(atomIdx, oxygenIdx);

    const _propylChain = this.addAlkylSubstituent(oxygenIdx, 3);
  }

  /**
   * Add a butoxy substituent (-O-CH2CH2CH2CH3) to a specific atom
   */
  addButoxy(atomIdx: number): void {
    const oxygenIdx = this.addAtom("O");
    this.addBond(atomIdx, oxygenIdx);

    const _butylChain = this.addAlkylSubstituent(oxygenIdx, 4);
  }

  /**
   * Add an amino substituent (-NH2) to a specific atom
   */
  addAmino(atomIdx: number): void {
    const nitrogenIdx = this.addAtom("N");
    this.addBond(atomIdx, nitrogenIdx);
  }

  /**
   * Add a trifluoromethyl substituent (-CF3) to a specific atom
   */
  addTrifluoromethyl(atomIdx: number): void {
    const carbonIdx = this.addCarbon();
    const f1 = this.addAtom("F");
    const f2 = this.addAtom("F");
    const f3 = this.addAtom("F");
    this.addBond(atomIdx, carbonIdx);
    this.addBond(carbonIdx, f1);
    this.addBond(carbonIdx, f2);
    this.addBond(carbonIdx, f3);
  }

  /**
   * Add a benzyl substituent (-CH2-Ph) to a specific atom
   */
  addBenzyl(atomIdx: number): void {
    const ch2Idx = this.addCarbon();
    this.addBond(atomIdx, ch2Idx);
    const benzeneAtoms = this.createBenzeneRing();
    if (benzeneAtoms[0] !== undefined) {
      this.addBond(ch2Idx, benzeneAtoms[0]);
    }
  }

  /**
   * Add a phenethyl substituent (-CH2CH2-Ph) to a specific atom
   */
  addPhenethyl(atomIdx: number): void {
    const ch2_1 = this.addCarbon();
    const ch2_2 = this.addCarbon();
    this.addBond(atomIdx, ch2_1);
    this.addBond(ch2_1, ch2_2);
    const benzeneAtoms = this.createBenzeneRing();
    if (benzeneAtoms[0] !== undefined) {
      this.addBond(ch2_2, benzeneAtoms[0]);
    }
  }

  /**
   * Add a cyclopropyl substituent (3-membered ring) to a specific atom
   */
  addCyclopropyl(atomIdx: number): void {
    const c1 = this.addCarbon();
    const c2 = this.addCarbon();
    const c3 = this.addCarbon();
    this.addBond(atomIdx, c1);
    this.addBond(c1, c2);
    this.addBond(c2, c3);
    this.addBond(c3, c1);
  }

  /**
   * Add a cyclobutyl substituent (4-membered ring) to a specific atom
   */
  addCyclobutyl(atomIdx: number): void {
    const c1 = this.addCarbon();
    const c2 = this.addCarbon();
    const c3 = this.addCarbon();
    const c4 = this.addCarbon();
    this.addBond(atomIdx, c1);
    this.addBond(c1, c2);
    this.addBond(c2, c3);
    this.addBond(c3, c4);
    this.addBond(c4, c1);
  }

  /**
   * Add a cyclopentyl substituent (5-membered ring) to a specific atom
   */
  addCyclopentyl(atomIdx: number): void {
    const c1 = this.addCarbon();
    const c2 = this.addCarbon();
    const c3 = this.addCarbon();
    const c4 = this.addCarbon();
    const c5 = this.addCarbon();
    this.addBond(atomIdx, c1);
    this.addBond(c1, c2);
    this.addBond(c2, c3);
    this.addBond(c3, c4);
    this.addBond(c4, c5);
    this.addBond(c5, c1);
  }

  /**
   * Add a cyclohexyl substituent (6-membered ring) to a specific atom
   */
  addCyclohexyl(atomIdx: number): void {
    const c1 = this.addCarbon();
    const c2 = this.addCarbon();
    const c3 = this.addCarbon();
    const c4 = this.addCarbon();
    const c5 = this.addCarbon();
    const c6 = this.addCarbon();
    this.addBond(atomIdx, c1);
    this.addBond(c1, c2);
    this.addBond(c2, c3);
    this.addBond(c3, c4);
    this.addBond(c4, c5);
    this.addBond(c5, c6);
    this.addBond(c6, c1);
  }

  /**
   * Add an acetyl substituent (-C(=O)CH3) to a specific atom
   */
  addAcetyl(atomIdx: number): void {
    const carbonylC = this.addCarbon();
    const oxygenIdx = this.addAtom("O");
    const methylIdx = this.addCarbon();

    this.addBond(atomIdx, carbonylC);
    this.addBond(carbonylC, oxygenIdx, BondTypeEnum.DOUBLE);
    this.addBond(carbonylC, methylIdx);
  }

  /**
   * Add a propanoyl substituent (-C(=O)CH2CH3) to a specific atom
   */
  addPropanoyl(atomIdx: number): void {
    const carbonylC = this.addCarbon();
    const oxygenIdx = this.addAtom("O");
    const ch2Idx = this.addCarbon();
    const ch3Idx = this.addCarbon();

    this.addBond(atomIdx, carbonylC);
    this.addBond(carbonylC, oxygenIdx, BondTypeEnum.DOUBLE);
    this.addBond(carbonylC, ch2Idx);
    this.addBond(ch2Idx, ch3Idx);
  }

  /**
   * Add a butanoyl substituent (-C(=O)CH2CH2CH3) to a specific atom
   */
  addButanoyl(atomIdx: number): void {
    const carbonylC = this.addCarbon();
    const oxygenIdx = this.addAtom("O");

    this.addBond(atomIdx, carbonylC);
    this.addBond(carbonylC, oxygenIdx, BondTypeEnum.DOUBLE);

    // Add propyl chain
    this.addAlkylSubstituent(carbonylC, 3);
  }

  /**
   * Add a pentanoyl substituent (-C(=O)CH2CH2CH2CH3) to a specific atom
   */
  addPentanoyl(atomIdx: number): void {
    const carbonylC = this.addCarbon();
    const oxygenIdx = this.addAtom("O");

    this.addBond(atomIdx, carbonylC);
    this.addBond(carbonylC, oxygenIdx, BondTypeEnum.DOUBLE);

    // Add butyl chain
    this.addAlkylSubstituent(carbonylC, 4);
  }

  /**
   * Add a hexanoyl substituent (-C(=O)CH2CH2CH2CH2CH3) to a specific atom
   */
  addHexanoyl(atomIdx: number): void {
    const carbonylC = this.addCarbon();
    const oxygenIdx = this.addAtom("O");

    this.addBond(atomIdx, carbonylC);
    this.addBond(carbonylC, oxygenIdx, BondTypeEnum.DOUBLE);

    // Add pentyl chain
    this.addAlkylSubstituent(carbonylC, 5);
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
      (b) =>
        (b.atom1 === atom1 && b.atom2 === atom2) ||
        (b.atom1 === atom2 && b.atom2 === atom1),
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
      (b) =>
        (b.atom1 === atom1 && b.atom2 === atom2) ||
        (b.atom1 === atom2 && b.atom2 === atom1),
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
    const oxygenIdx = this.addAtom("O");
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
