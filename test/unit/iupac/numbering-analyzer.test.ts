import { describe, it, expect, beforeEach } from 'bun:test';
import type { Molecule } from 'types';
import { BondType, StereoType } from 'types';
import type { Chain } from 'src/utils/iupac/iupac-types';
import { NumberingAnalyzer, createNumberingAnalyzer } from 'src/utils/iupac/numbering-analyzer';

function createPropaneChain(): { molecule: Molecule; chain: Chain } {
  // Propane: C-C-C (atoms 0, 1, 2)
  const molecule: Molecule = {
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

  const chain: Chain = {
    atomIndices: [0, 1, 2],
    length: 3,
    substituents: [],
    functionalGroups: [],
    isCyclic: false,
    isAromatic: false,
  };

  return { molecule, chain };
}

function createPropeneMolecule(): { molecule: Molecule; chain: Chain } {
  // Propene: C=C-C (atoms 0, 1, 2)
  const molecule: Molecule = {
    atoms: [
      { id: 0, symbol: 'C', atomicNumber: 6, charge: 0, hydrogens: 2, isotope: null, aromatic: false, chiral: null, isBracket: false, atomClass: 0 },
      { id: 1, symbol: 'C', atomicNumber: 6, charge: 0, hydrogens: 1, isotope: null, aromatic: false, chiral: null, isBracket: false, atomClass: 0 },
      { id: 2, symbol: 'C', atomicNumber: 6, charge: 0, hydrogens: 3, isotope: null, aromatic: false, chiral: null, isBracket: false, atomClass: 0 },
    ],
    bonds: [
      { atom1: 0, atom2: 1, type: BondType.DOUBLE, stereo: StereoType.NONE },
      { atom1: 1, atom2: 2, type: BondType.SINGLE, stereo: StereoType.NONE },
    ],
  };

  const chain: Chain = {
    atomIndices: [0, 1, 2],
    length: 3,
    substituents: [],
    functionalGroups: [],
    isCyclic: false,
    isAromatic: false,
  };

  return { molecule, chain };
}

function createAlcoholMolecule(): { molecule: Molecule; chain: Chain } {
  // Propan-2-ol: C-C(OH)-C (atoms 0, 1, 2, and O at 3)
  const molecule: Molecule = {
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

  const chain: Chain = {
    atomIndices: [0, 1, 2],
    length: 3,
    substituents: [],
    functionalGroups: [],
    isCyclic: false,
    isAromatic: false,
  };

  return { molecule, chain };
}

describe('NumberingAnalyzer', () => {
  let analyzer: NumberingAnalyzer;

  beforeEach(() => {
    analyzer = createNumberingAnalyzer();
  });

  describe('constructor and factory', () => {
    it('should create analyzer instance', () => {
      expect(analyzer).toBeDefined();
      expect(analyzer).toBeInstanceOf(NumberingAnalyzer);
    });

    it('should create analyzer via factory function', () => {
      const newAnalyzer = createNumberingAnalyzer();
      expect(newAnalyzer).toBeInstanceOf(NumberingAnalyzer);
    });
  });

  describe('determineNumbering', () => {
    it('should return NumberingResult with all required properties', () => {
      const { molecule, chain } = createPropaneChain();
      const result = analyzer.determineNumbering(chain, molecule);

      expect(result).toHaveProperty('numbering');
      expect(result).toHaveProperty('direction');
      expect(result).toHaveProperty('score');
    });

    it('should create numbering map for simple chain', () => {
      const { molecule, chain } = createPropaneChain();
      const result = analyzer.determineNumbering(chain, molecule);

      expect(result.numbering).toBeInstanceOf(Map);
      expect(result.numbering.size).toBe(3);
    });

    it('should number atoms sequentially', () => {
      const { molecule, chain } = createPropaneChain();
      const result = analyzer.determineNumbering(chain, molecule);

      // Should have atoms 0, 1, 2 numbered 1, 2, 3 (or reverse)
      const locants = Array.from(result.numbering.values()).sort((a, b) => a - b);
      expect(locants).toEqual([1, 2, 3]);
    });

    it('should prefer numbering with double bond at lower locant', () => {
      const { molecule, chain } = createPropeneMolecule();
      const result = analyzer.determineNumbering(chain, molecule);

      // Double bond between atoms 0-1, should be numbered from atom 0
      // So direction should be 1 (forward)
      expect(result.direction).toBe(1);
    });

    it('should assign locants starting from preferred end', () => {
      const { molecule, chain } = createPropeneMolecule();
      const result = analyzer.determineNumbering(chain, molecule);

      // With direction = 1, atom 0 should be locant 1
      expect(result.numbering.get(0)).toBe(1);
      expect(result.numbering.get(1)).toBe(2);
      expect(result.numbering.get(2)).toBe(3);
    });

    it('should prefer numbering with OH at lower locant', () => {
      const { molecule, chain } = createAlcoholMolecule();
      const result = analyzer.determineNumbering(chain, molecule);

      // OH is on atom 1 (middle), which is position 1 in chain
      // From left: positions are [0, 1(OH), 2] - OH at position 1 gives locant 2
      // From right: positions are [2, 1(OH), 0] - OH at position 1 gives locant 2
      // Either direction works, but we should prefer consistent numbering
      expect(result.direction).toBeDefined();
    });

    it('should handle empty chain gracefully', () => {
      const molecule: Molecule = {
        atoms: [],
        bonds: [],
      };

      const chain: Chain = {
        atomIndices: [],
        length: 0,
        substituents: [],
        functionalGroups: [],
        isCyclic: false,
        isAromatic: false,
      };

      const result = analyzer.determineNumbering(chain, molecule);

      expect(result.numbering.size).toBe(0);
      expect(result.direction).toBe(1);
    });

    it('should handle single atom chain', () => {
      const molecule: Molecule = {
        atoms: [
          { id: 0, symbol: 'C', atomicNumber: 6, charge: 0, hydrogens: 4, isotope: null, aromatic: false, chiral: null, isBracket: false, atomClass: 0 },
        ],
        bonds: [],
      };

      const chain: Chain = {
        atomIndices: [0],
        length: 1,
        substituents: [],
        functionalGroups: [],
        isCyclic: false,
        isAromatic: false,
      };

      const result = analyzer.determineNumbering(chain, molecule);

      expect(result.numbering.get(0)).toBe(1);
    });
  });

  describe('scoring system', () => {
    it('should calculate non-negative score', () => {
      const { molecule, chain } = createPropaneChain();
      const result = analyzer.determineNumbering(chain, molecule);

      expect(result.score).toBeGreaterThanOrEqual(0);
    });

    it('should prefer lower scores', () => {
      const { molecule, chain } = createPropeneMolecule();
      const result = analyzer.determineNumbering(chain, molecule);

      // With double bond at position 0, forward numbering should score better
      expect(result.direction).toBe(1);
    });

    it('should handle complex molecules with multiple features', () => {
      const { molecule, chain } = createAlcoholMolecule();
      const result = analyzer.determineNumbering(chain, molecule);

      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.numbering.size).toBe(3);
    });
  });

  describe('direction handling', () => {
    it('should return valid direction (1 or -1)', () => {
      const { molecule, chain } = createPropaneChain();
      const result = analyzer.determineNumbering(chain, molecule);

      expect([1, -1]).toContain(result.direction);
    });

    it('should apply direction to numbering', () => {
      const { molecule, chain } = createPropaneChain();
      const result = analyzer.determineNumbering(chain, molecule);

      if (result.direction === 1) {
        expect(result.numbering.get(0)).toBe(1);
        expect(result.numbering.get(1)).toBe(2);
        expect(result.numbering.get(2)).toBe(3);
      } else {
        expect(result.numbering.get(0)).toBe(3);
        expect(result.numbering.get(1)).toBe(2);
        expect(result.numbering.get(2)).toBe(1);
      }
    });
  });

  describe('edge cases', () => {
    it('should handle chain with non-existent atom indices', () => {
      const molecule: Molecule = {
        atoms: [
          { id: 0, symbol: 'C', atomicNumber: 6, charge: 0, hydrogens: 3, isotope: null, aromatic: false, chiral: null, isBracket: false, atomClass: 0 },
          { id: 1, symbol: 'C', atomicNumber: 6, charge: 0, hydrogens: 3, isotope: null, aromatic: false, chiral: null, isBracket: false, atomClass: 0 },
        ],
        bonds: [],
      };

      const chain: Chain = {
        atomIndices: [0, 1],
        length: 2,
        substituents: [],
        functionalGroups: [],
        isCyclic: false,
        isAromatic: false,
      };

      const result = analyzer.determineNumbering(chain, molecule);

      expect(result.numbering.size).toBe(2);
      expect(result.numbering.get(0)).toBeDefined();
      expect(result.numbering.get(1)).toBeDefined();
    });

    it('should handle chain longer than 26 atoms', () => {
      const atoms = [];
      const bonds = [];

      // Create 30 carbon chain
      for (let i = 0; i < 30; i++) {
        atoms.push({
          id: i,
          symbol: 'C',
          atomicNumber: 6,
          charge: 0,
          hydrogens: i === 0 || i === 29 ? 3 : 2,
          isotope: null,
          aromatic: false,
          chiral: null,
          isBracket: false,
          atomClass: 0,
        });

        if (i < 29) {
          bonds.push({
            atom1: i,
            atom2: i + 1,
            type: BondType.SINGLE,
            stereo: StereoType.NONE,
          });
        }
      }

      const molecule: Molecule = { atoms, bonds };

      const chain: Chain = {
        atomIndices: Array.from({ length: 30 }, (_, i) => i),
        length: 30,
        substituents: [],
        functionalGroups: [],
        isCyclic: false,
        isAromatic: false,
      };

      const result = analyzer.determineNumbering(chain, molecule);

      expect(result.numbering.size).toBe(30);
      // All locants should be 1-30
      const locants = Array.from(result.numbering.values()).sort((a, b) => a - b);
      expect(locants[0]).toBe(1);
      expect(locants[29]).toBe(30);
    });
  });
});
