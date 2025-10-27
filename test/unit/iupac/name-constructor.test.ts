import { describe, it, expect, beforeEach } from 'bun:test';
import type { Molecule } from 'types';
import { BondType, StereoType } from 'types';
import type { Chain, FunctionalGroup, MolecularStructure, NumberingResult } from 'src/utils/iupac/iupac-types';
import { NameConstructor, createNameConstructor } from 'src/utils/iupac/name-constructor';

function createSimpleChain(atomIndices: number[]): Chain {
  return {
    atomIndices,
    length: atomIndices.length,
    substituents: [],
    functionalGroups: [],
    isCyclic: false,
    isAromatic: false,
  } as unknown as Chain;
}

function createSimpleFunctionalGroup(
  name: string,
  atomIndices: number[],
  suffix: string = name
): FunctionalGroup {
  return {
    name,
    priority: 5,
    smarts: '',
    suffix,
    parenthesized: false,
    atomIndices,
    isPrincipal: true,
  };
}

function createNumbering(mappings: [number, number][]): NumberingResult {
  return {
    direction: 1 as const,
    numbering: new Map(mappings),
    score: 100,
  };
}

function createPropaneMolecule(): Molecule {
  // Propane: C-C-C (atoms 0, 1, 2)
  return {
    atoms: [
      { id: 0, symbol: 'C', atomicNumber: 6, charge: 0, hydrogens: 3, isotope: null, aromatic: false, chiral: null, isBracket: false, atomClass: 0 },
      { id: 1, symbol: 'C', atomicNumber: 6, charge: 0, hydrogens: 2, isotope: null, aromatic: false, chiral: null, isBracket: false, atomClass: 0 },
      { id: 2, symbol: 'C', atomicNumber: 6, charge: 0, hydrogens: 3, isotope: null, aromatic: false, chiral: null, isBracket: false, atomClass: 0 },
    ],
    bonds: [
      { atom1: 0, atom2: 1, type: BondType.SINGLE, stereo: StereoType.NONE },
      { atom1: 1, atom2: 2, type: BondType.SINGLE, stereo: StereoType.NONE },
    ],
  };
}

function createMethaneMolecule(): Molecule {
  return {
    atoms: [
      { id: 0, symbol: 'C', atomicNumber: 6, charge: 0, hydrogens: 4, isotope: null, aromatic: false, chiral: null, isBracket: false, atomClass: 0 },
    ],
    bonds: [],
  };
}

function createEthaneMolecule(): Molecule {
  return {
    atoms: [
      { id: 0, symbol: 'C', atomicNumber: 6, charge: 0, hydrogens: 3, isotope: null, aromatic: false, chiral: null, isBracket: false, atomClass: 0 },
      { id: 1, symbol: 'C', atomicNumber: 6, charge: 0, hydrogens: 3, isotope: null, aromatic: false, chiral: null, isBracket: false, atomClass: 0 },
    ],
    bonds: [
      { atom1: 0, atom2: 1, type: BondType.SINGLE, stereo: StereoType.NONE },
    ],
  };
}

function createPropeneWithAlcoholMolecule(): Molecule {
  // Propan-2-ol: C-C(OH)-C (atoms 0, 1, 2, and O at 3)
  return {
    atoms: [
      { id: 0, symbol: 'C', atomicNumber: 6, charge: 0, hydrogens: 3, isotope: null, aromatic: false, chiral: null, isBracket: false, atomClass: 0 },
      { id: 1, symbol: 'C', atomicNumber: 6, charge: 0, hydrogens: 1, isotope: null, aromatic: false, chiral: null, isBracket: false, atomClass: 0 },
      { id: 2, symbol: 'C', atomicNumber: 6, charge: 0, hydrogens: 3, isotope: null, aromatic: false, chiral: null, isBracket: false, atomClass: 0 },
      { id: 3, symbol: 'O', atomicNumber: 8, charge: 0, hydrogens: 1, isotope: null, aromatic: false, chiral: null, isBracket: false, atomClass: 0 },
    ],
    bonds: [
      { atom1: 0, atom2: 1, type: BondType.SINGLE, stereo: StereoType.NONE },
      { atom1: 1, atom2: 2, type: BondType.SINGLE, stereo: StereoType.NONE },
      { atom1: 1, atom2: 3, type: BondType.SINGLE, stereo: StereoType.NONE },
    ],
  };
}

describe('NameConstructor', () => {
  let constructor: NameConstructor;

  beforeEach(() => {
    constructor = createNameConstructor();
  });

  describe('constructor and factory', () => {
    it('should create constructor instance', () => {
      expect(constructor).toBeDefined();
      expect(constructor).toBeInstanceOf(NameConstructor);
    });

    it('should create constructor via factory function', () => {
      const instance = createNameConstructor();
      expect(instance).toBeInstanceOf(NameConstructor);
    });
  });

  describe('simple alkanes', () => {
    it('should construct name for propane (C3)', () => {
      const molecule = createPropaneMolecule();
      const chain = createSimpleChain([0, 1, 2]);

      const structure: MolecularStructure = {
        chains: [chain],
        principalChain: chain,
        functionalGroups: [],
        principalFunctionalGroup: null,
        rings: [],
      };

      const name = constructor.constructName(chain, structure, null, molecule);
      expect(name).toBe('propane');
    });

    it('should construct name for methane (C1)', () => {
      const molecule = createMethaneMolecule();
      const chain = createSimpleChain([0]);

      const structure: MolecularStructure = {
        chains: [chain],
        principalChain: chain,
        functionalGroups: [],
        principalFunctionalGroup: null,
        rings: [],
      };

      const name = constructor.constructName(chain, structure, null, molecule);
      expect(name).toBe('methane');
    });

    it('should construct name for ethane (C2)', () => {
      const molecule = createEthaneMolecule();
      const chain = createSimpleChain([0, 1]);

      const structure: MolecularStructure = {
        chains: [chain],
        principalChain: chain,
        functionalGroups: [],
        principalFunctionalGroup: null,
        rings: [],
      };

      const name = constructor.constructName(chain, structure, null, molecule);
      expect(name).toBe('ethane');
    });
  });

  describe('alcohols', () => {
    it('should construct name for propan-2-ol with numbering', () => {
      const molecule = createPropeneWithAlcoholMolecule();
      const chain = createSimpleChain([0, 1, 2]);
      const hydroxylFG = createSimpleFunctionalGroup('hydroxyl', [3], 'ol');

      const structure: MolecularStructure = {
        chains: [chain],
        principalChain: chain,
        functionalGroups: [hydroxylFG],
        principalFunctionalGroup: hydroxylFG,
        rings: [],
      };

      const numbering = createNumbering([
        [0, 1],
        [1, 2],
        [2, 3],
        [3, 2], // OH at position 2
      ]);

      const name = constructor.constructName(chain, structure, numbering, molecule);
      // Name should contain 'ol' suffix for alcohol
      expect(name.includes('ol')).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should return "unknown" for chain with no carbon atoms', () => {
      const molecule: Molecule = {
        atoms: [
          { id: 0, symbol: 'N', atomicNumber: 7, charge: 0, hydrogens: 3, isotope: null, aromatic: false, chiral: null, isBracket: false, atomClass: 0 },
        ],
        bonds: [],
      };

      const chain = createSimpleChain([0]);

      const structure: MolecularStructure = {
        chains: [chain],
        principalChain: chain,
        functionalGroups: [],
        principalFunctionalGroup: null,
        rings: [],
      };

      const name = constructor.constructName(chain, structure, null, molecule);
      expect(name).toBe('unknown');
    });

    it('should return "unknown" for empty chain', () => {
      const molecule: Molecule = {
        atoms: [],
        bonds: [],
      };

      const chain = createSimpleChain([]);

      const structure: MolecularStructure = {
        chains: [chain],
        principalChain: chain,
        functionalGroups: [],
        principalFunctionalGroup: null,
        rings: [],
      };

      const name = constructor.constructName(chain, structure, null, molecule);
      expect(name).toBe('unknown');
    });

    it('should handle undefined atom index gracefully', () => {
      const molecule = createMethaneMolecule();
      const chain = createSimpleChain([0]);

      const structure: MolecularStructure = {
        chains: [chain],
        principalChain: chain,
        functionalGroups: [],
        principalFunctionalGroup: null,
        rings: [],
      };

      const name = constructor.constructName(chain, structure, null, molecule);
      expect(name).toBe('methane');
    });
  });

  describe('carbon counting', () => {
    it('should correctly count carbons including atom index 0', () => {
      const molecule = createEthaneMolecule();
      const chain = createSimpleChain([0, 1]);

      const structure: MolecularStructure = {
        chains: [chain],
        principalChain: chain,
        functionalGroups: [],
        principalFunctionalGroup: null,
        rings: [],
      };

      const name = constructor.constructName(chain, structure, null, molecule);
      expect(name).toBe('ethane');
    });

    it('should skip non-carbon atoms when counting', () => {
      const molecule: Molecule = {
        atoms: [
          { id: 0, symbol: 'C', atomicNumber: 6, charge: 0, hydrogens: 3, isotope: null, aromatic: false, chiral: null, isBracket: false, atomClass: 0 },
          { id: 1, symbol: 'O', atomicNumber: 8, charge: 0, hydrogens: 1, isotope: null, aromatic: false, chiral: null, isBracket: false, atomClass: 0 },
          { id: 2, symbol: 'C', atomicNumber: 6, charge: 0, hydrogens: 3, isotope: null, aromatic: false, chiral: null, isBracket: false, atomClass: 0 },
        ],
        bonds: [
          { atom1: 0, atom2: 1, type: BondType.SINGLE, stereo: StereoType.NONE },
          { atom1: 1, atom2: 2, type: BondType.SINGLE, stereo: StereoType.NONE },
        ],
      };

      const chain = createSimpleChain([0, 1, 2]);

      const structure: MolecularStructure = {
        chains: [chain],
        principalChain: chain,
        functionalGroups: [],
        principalFunctionalGroup: null,
        rings: [],
      };

      const name = constructor.constructName(chain, structure, null, molecule);
      expect(name).toBe('ethane'); // Should count only the 2 carbons
    });
  });
});
