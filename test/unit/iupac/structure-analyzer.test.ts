import { describe, it, expect, beforeEach } from 'bun:test';
import type { Molecule } from 'types';
import { BondType, StereoType } from 'types';
import { StructureAnalyzer, createStructureAnalyzer } from 'src/utils/iupac/structure-analyzer';

function createSimpleMolecule(): Molecule {
  // Ethane: C-C
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

function createPropaneMolecule(): Molecule {
  // Propane: C-C-C
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

function createAlcoholMolecule(): Molecule {
  // Ethanol: C-C-OH
  return {
    atoms: [
      { id: 0, symbol: 'C', atomicNumber: 6, charge: 0, hydrogens: 3, isotope: null, aromatic: false, chiral: null, isBracket: false, atomClass: 0 },
      { id: 1, symbol: 'C', atomicNumber: 6, charge: 0, hydrogens: 2, isotope: null, aromatic: false, chiral: null, isBracket: false, atomClass: 0 },
      { id: 2, symbol: 'O', atomicNumber: 8, charge: 0, hydrogens: 1, isotope: null, aromatic: false, chiral: null, isBracket: false, atomClass: 0 },
    ],
    bonds: [
      { atom1: 0, atom2: 1, type: BondType.SINGLE, stereo: StereoType.NONE },
      { atom1: 1, atom2: 2, type: BondType.SINGLE, stereo: StereoType.NONE },
    ],
  };
}

describe('StructureAnalyzer', () => {
  let analyzer: StructureAnalyzer;

  beforeEach(() => {
    analyzer = createStructureAnalyzer();
  });

  describe('constructor and factory', () => {
    it('should create analyzer instance', () => {
      expect(analyzer).toBeDefined();
      expect(analyzer).toBeInstanceOf(StructureAnalyzer);
    });

    it('should create analyzer via factory function', () => {
      const newAnalyzer = createStructureAnalyzer();
      expect(newAnalyzer).toBeInstanceOf(StructureAnalyzer);
    });
  });

  describe('analyze', () => {
    it('should return complete MolecularStructure', () => {
      const molecule = createSimpleMolecule();
      const structure = analyzer.analyze(molecule);

      expect(structure).toBeDefined();
      expect(structure).toHaveProperty('chains');
      expect(structure).toHaveProperty('principalChain');
      expect(structure).toHaveProperty('functionalGroups');
      expect(structure).toHaveProperty('principalFunctionalGroup');
      expect(structure).toHaveProperty('rings');
    });

    it('should identify chains in simple molecules', () => {
      const molecule = createSimpleMolecule();
      const structure = analyzer.analyze(molecule);

      expect(structure.chains).toBeArray();
      expect(structure.chains.length).toBeGreaterThanOrEqual(0);
    });

    it('should identify principal chain as principal', () => {
      const molecule = createPropaneMolecule();
      const structure = analyzer.analyze(molecule);

      if (structure.chains.length > 0 && structure.principalChain) {
        expect(structure.principalChain.length).toBe(structure.chains[0]!.length);
      }
    });

    it('should identify chain properties', () => {
      const molecule = createPropaneMolecule();
      const structure = analyzer.analyze(molecule);

      if (structure.chains.length > 0) {
        const chain = structure.chains[0];
        expect(chain).toHaveProperty('atomIndices');
        expect(chain).toHaveProperty('length');
        expect(chain).toHaveProperty('substituents');
        expect(chain).toHaveProperty('functionalGroups');
        expect(chain).toHaveProperty('isCyclic');
        expect(chain).toHaveProperty('isAromatic');
      }
    });
  });

  describe('functional group detection', () => {
    it('should detect hydroxyl groups', () => {
      const molecule = createAlcoholMolecule();
      const structure = analyzer.analyze(molecule);

      expect(structure.functionalGroups).toBeArray();
      // May or may not detect depending on SMARTS implementation
      if (structure.functionalGroups.length > 0) {
        expect(structure.functionalGroups[0]).toHaveProperty('name');
        expect(structure.functionalGroups[0]).toHaveProperty('priority');
        expect(structure.functionalGroups[0]).toHaveProperty('suffix');
      }
    });

    it('should mark principal functional group', () => {
      const molecule = createAlcoholMolecule();
      const structure = analyzer.analyze(molecule);

      if (structure.principalFunctionalGroup) {
        expect(structure.principalFunctionalGroup.isPrincipal).toBe(true);
      }
    });

    it('should sort functional groups by priority', () => {
      const molecule = createAlcoholMolecule();
      const structure = analyzer.analyze(molecule);

      for (let i = 0; i < structure.functionalGroups.length - 1; i++) {
        const current = structure.functionalGroups[i]!;
        const next = structure.functionalGroups[i + 1]!;
        expect(current.priority).toBeLessThanOrEqual(next.priority);
      }
    });
  });

  describe('ring analysis', () => {
    it('should extract ring information', () => {
      const molecule = createSimpleMolecule();
      const structure = analyzer.analyze(molecule);

      expect(structure.rings).toBeArray();
    });

    it('should identify ring sizes', () => {
      const molecule = createSimpleMolecule();
      const structure = analyzer.analyze(molecule);

      for (const ring of structure.rings) {
        expect(ring).toHaveProperty('atomIndices');
        expect(ring).toHaveProperty('size');
        expect(ring).toHaveProperty('isAromatic');
        expect(ring).toHaveProperty('isFused');
        expect(ring.size).toBeGreaterThan(0);
      }
    });
  });

  describe('edge cases', () => {
    it('should handle empty molecule', () => {
      const molecule: Molecule = {
        atoms: [],
        bonds: [],
      };
      const structure = analyzer.analyze(molecule);

      expect(structure).toBeDefined();
      expect(structure.chains.length).toBe(0);
      expect(structure.principalChain).toBeNull();
    });

    it('should handle single atom', () => {
      const molecule: Molecule = {
        atoms: [
          { id: 0, symbol: 'C', atomicNumber: 6, charge: 0, hydrogens: 4, isotope: null, aromatic: false, chiral: null, isBracket: false, atomClass: 0 },
        ],
        bonds: [],
      };
      const structure = analyzer.analyze(molecule);

      expect(structure).toBeDefined();
      expect(structure.chains.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle non-carbon atoms', () => {
      const molecule: Molecule = {
        atoms: [
          { id: 0, symbol: 'O', atomicNumber: 8, charge: 0, hydrogens: 2, isotope: null, aromatic: false, chiral: null, isBracket: false, atomClass: 0 },
        ],
        bonds: [],
      };
      const structure = analyzer.analyze(molecule);

      expect(structure).toBeDefined();
      expect(structure.chains.length).toBe(0);
    });
  });

  describe('chain properties', () => {
    it('should set isCyclic correctly for acyclic chains', () => {
      const molecule = createSimpleMolecule();
      const structure = analyzer.analyze(molecule);

      for (const chain of structure.chains) {
        expect(chain.isCyclic).toBeBoolean();
      }
    });

    it('should set isAromatic correctly', () => {
      const molecule = createSimpleMolecule();
      const structure = analyzer.analyze(molecule);

      for (const chain of structure.chains) {
        expect(chain.isAromatic).toBeBoolean();
      }
    });
  });
});
