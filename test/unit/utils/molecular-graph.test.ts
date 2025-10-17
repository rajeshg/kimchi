import { describe, it, expect } from 'bun:test';
import { buildGraphFromMolecule, computeMoleculeGraphInfo, clearGraphCache } from 'src/utils/molecular-graph';

import type { Molecule } from 'types';
import { BondType, StereoType } from 'types';

describe('Molecular Graph', () => {
  it('should build graph from simple molecule', () => {
    const mol: Molecule = {
      atoms: [
        { id: 1, symbol: 'C', atomicNumber: 6, charge: 0, hydrogens: 0, isotope: null, aromatic: false, chiral: null, isBracket: false, atomClass: 0 },
        { id: 2, symbol: 'C', atomicNumber: 6, charge: 0, hydrogens: 0, isotope: null, aromatic: false, chiral: null, isBracket: false, atomClass: 0 },
      ],
      bonds: [
  { atom1: 1, atom2: 2, type: BondType.SINGLE, stereo: StereoType.NONE }
      ]
    };

    const info = computeMoleculeGraphInfo(mol);
    expect(info.graph.nodeCount()).toBe(2);
    expect(info.graph.edgeCount()).toBe(1);
    expect(info.components.length).toBe(1);
    clearGraphCache();
  });

  it('should compute SSSR for benzene-like ring', () => {
    const mol: Molecule = {
      atoms: [
        { id: 1, symbol: 'C', atomicNumber: 6, charge: 0, hydrogens: 0, isotope: null, aromatic: true, chiral: null, isBracket: false, atomClass: 0 },
        { id: 2, symbol: 'C', atomicNumber: 6, charge: 0, hydrogens: 0, isotope: null, aromatic: true, chiral: null, isBracket: false, atomClass: 0 },
        { id: 3, symbol: 'C', atomicNumber: 6, charge: 0, hydrogens: 0, isotope: null, aromatic: true, chiral: null, isBracket: false, atomClass: 0 },
        { id: 4, symbol: 'C', atomicNumber: 6, charge: 0, hydrogens: 0, isotope: null, aromatic: true, chiral: null, isBracket: false, atomClass: 0 },
        { id: 5, symbol: 'C', atomicNumber: 6, charge: 0, hydrogens: 0, isotope: null, aromatic: true, chiral: null, isBracket: false, atomClass: 0 },
        { id: 6, symbol: 'C', atomicNumber: 6, charge: 0, hydrogens: 0, isotope: null, aromatic: true, chiral: null, isBracket: false, atomClass: 0 },
      ],
      bonds: [
  { atom1: 1, atom2: 2, type: BondType.AROMATIC, stereo: StereoType.NONE },
  { atom1: 2, atom2: 3, type: BondType.AROMATIC, stereo: StereoType.NONE },
  { atom1: 3, atom2: 4, type: BondType.AROMATIC, stereo: StereoType.NONE },
  { atom1: 4, atom2: 5, type: BondType.AROMATIC, stereo: StereoType.NONE },
  { atom1: 5, atom2: 6, type: BondType.AROMATIC, stereo: StereoType.NONE },
  { atom1: 6, atom2: 1, type: BondType.AROMATIC, stereo: StereoType.NONE },
      ]
    };

    const info = computeMoleculeGraphInfo(mol);
  expect(info.sssr.length).toBe(1);
  expect(info.sssr[0]!.length).toBe(6);
    clearGraphCache();
  });

  it('should compute SSSR for fused rings (naphthalene-like)', () => {
    // naphthalene-like: two fused 6-membered rings: atoms 1..10
    const atoms = [] as any[];
    for (let i = 1; i <= 10; i++) {
      atoms.push({ id: i, symbol: 'C', atomicNumber: 6, charge: 0, hydrogens: 0, isotope: null, aromatic: true, chiral: null, isBracket: false, atomClass: 0 });
    }

    const bonds = [
      // first ring 1-2-3-4-5-6-1
      { atom1: 1, atom2: 2 }, { atom1: 2, atom2: 3 }, { atom1: 3, atom2: 4 }, { atom1: 4, atom2: 5 }, { atom1: 5, atom2: 6 }, { atom1: 6, atom2: 1 },
      // second ring 6-7-8-9-10-5-6 (fused between 5-6)
      { atom1: 6, atom2: 7 }, { atom1: 7, atom2: 8 }, { atom1: 8, atom2: 9 }, { atom1: 9, atom2: 10 }, { atom1: 10, atom2: 5 },
    ] as any[];

    const mol: any = { atoms, bonds: bonds.map(b => ({ ...b, type: BondType.AROMATIC, stereo: StereoType.NONE })) };

    const info = computeMoleculeGraphInfo(mol);
    // Two smallest rings should be present
    expect(info.sssr.length).toBeGreaterThanOrEqual(2);
    // At least one atom (5 or 6) should be in two rings
    const ringsFor5 = info.nodeRings.get(5) || [];
    const ringsFor6 = info.nodeRings.get(6) || [];
    expect(ringsFor5.length + ringsFor6.length).toBeGreaterThan(1);
    clearGraphCache();
  });

  it('should handle disconnected fragments', () => {
    const mol: any = {
      atoms: [
        { id: 1, symbol: 'C', atomicNumber: 6, charge: 0, hydrogens: 0, isotope: null, aromatic: false, chiral: null, isBracket: false, atomClass: 0 },
        { id: 2, symbol: 'O', atomicNumber: 8, charge: 0, hydrogens: 0, isotope: null, aromatic: false, chiral: null, isBracket: false, atomClass: 0 },
        { id: 3, symbol: 'C', atomicNumber: 6, charge: 0, hydrogens: 0, isotope: null, aromatic: false, chiral: null, isBracket: false, atomClass: 0 },
        { id: 4, symbol: 'C', atomicNumber: 6, charge: 0, hydrogens: 0, isotope: null, aromatic: false, chiral: null, isBracket: false, atomClass: 0 },
      ],
      bonds: [ { atom1: 1, atom2: 2, type: BondType.SINGLE, stereo: StereoType.NONE }, { atom1: 3, atom2: 4, type: BondType.SINGLE, stereo: StereoType.NONE } ]
    };

    const info = computeMoleculeGraphInfo(mol);
    expect(info.components.length).toBe(2);
    clearGraphCache();
  });

  it('should detect bridges in a chain', () => {
    const mol: any = {
      atoms: [
        { id: 1, symbol: 'C', atomicNumber: 6, charge: 0, hydrogens: 0, isotope: null, aromatic: false, chiral: null, isBracket: false, atomClass: 0 },
        { id: 2, symbol: 'C', atomicNumber: 6, charge: 0, hydrogens: 0, isotope: null, aromatic: false, chiral: null, isBracket: false, atomClass: 0 },
        { id: 3, symbol: 'C', atomicNumber: 6, charge: 0, hydrogens: 0, isotope: null, aromatic: false, chiral: null, isBracket: false, atomClass: 0 },
      ],
      bonds: [ { atom1: 1, atom2: 2, type: BondType.SINGLE, stereo: StereoType.NONE }, { atom1: 2, atom2: 3, type: BondType.SINGLE, stereo: StereoType.NONE } ]
    };

    const info = computeMoleculeGraphInfo(mol);
    expect(info.bridges.length).toBe(2);
    clearGraphCache();
  });

  it('should cache and clear graph info correctly', () => {
    const mol: any = {
      atoms: [ { id: 1, symbol: 'C', atomicNumber: 6, charge: 0, hydrogens: 0, isotope: null, aromatic: false, chiral: null, isBracket: false, atomClass: 0 } ],
      bonds: []
    };

    const info1 = computeMoleculeGraphInfo(mol);
    const info2 = computeMoleculeGraphInfo(mol);
    // Should return same object from cache
    expect(info1).toBe(info2);
    clearGraphCache();
    const info3 = computeMoleculeGraphInfo(mol);
    expect(info3).not.toBe(info2);
    clearGraphCache();
  });

  it('should return fragment graphs for multi-fragment molecule', () => {
    const mol: any = {
      atoms: [
        { id: 1, symbol: 'C', atomicNumber: 6, charge: 0, hydrogens: 0, isotope: null, aromatic: false, chiral: null, isBracket: false, atomClass: 0 },
        { id: 2, symbol: 'O', atomicNumber: 8, charge: 0, hydrogens: 0, isotope: null, aromatic: false, chiral: null, isBracket: false, atomClass: 0 },
        { id: 3, symbol: 'N', atomicNumber: 7, charge: 0, hydrogens: 0, isotope: null, aromatic: false, chiral: null, isBracket: false, atomClass: 0 },
      ],
      bonds: [ { atom1: 1, atom2: 2, type: BondType.SINGLE, stereo: StereoType.NONE } ]
    };

    const graphs = require('src/utils/molecular-graph').getFragmentGraphs(mol);
    expect(graphs.length).toBe(2);
    clearGraphCache();
  });

  it('should handle spiro junction (two rings sharing one atom)', () => {
    // ring A: 1-2-3-1, ring B: 1-4-5-1 (atom 1 is spiro)
    const mol: any = {
      atoms: [1,2,3,4,5].map(i => ({ id: i, symbol: 'C', atomicNumber: 6, charge:0, hydrogens:0, isotope:null, aromatic:true, chiral:null, isBracket:false, atomClass:0 })),
      bonds: [
        { atom1:1, atom2:2 }, { atom1:2, atom2:3 }, { atom1:3, atom2:1 },
        { atom1:1, atom2:4 }, { atom1:4, atom2:5 }, { atom1:5, atom2:1 },
      ].map(b => ({ ...b, type: BondType.AROMATIC, stereo: StereoType.NONE }))
    };

    const info = computeMoleculeGraphInfo(mol);
    // Two rings should be present and atom 1 should be in two rings
    expect(info.sssr.length).toBeGreaterThanOrEqual(2);
    expect((info.nodeRings.get(1) || []).length).toBeGreaterThanOrEqual(2);
    clearGraphCache();
  });
});
