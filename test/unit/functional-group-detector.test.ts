import { describe, it, expect } from 'bun:test';
import { parseSMILES } from 'index';
import { findLongestCarbonChain } from 'src/utils/iupac/iupac-chains';
import { getChainFunctionalGroupPriority } from 'src/utils/iupac/functional-group-detector';

describe('functional group detector', () => {
  it('detects carboxylic acid priority (6) for CC(=O)O', () => {
    const res = parseSMILES('CC(=O)O');
    const mol = res.molecules[0]!;
    const chain = findLongestCarbonChain(mol);
    expect(getChainFunctionalGroupPriority(chain, mol)).toBeGreaterThanOrEqual(6);
  });

  it('detects sulfonic acid priority (6) for CCS(=O)(=O)O', () => {
    const res = parseSMILES('CCS(=O)(=O)O');
    const mol = res.molecules[0]!;
    // ensure chain includes the sulfur atom for detection
    const sIdx = mol.atoms.findIndex(a => a && a.symbol === 'S');
    const neighBond = mol.bonds.find(b => b.atom1 === sIdx || b.atom2 === sIdx);
    const cIdx = neighBond ? (neighBond.atom1 === sIdx ? neighBond.atom2 : neighBond.atom1) : -1;
    const chain = cIdx >= 0 ? [cIdx, sIdx] : findLongestCarbonChain(mol);
    expect(getChainFunctionalGroupPriority(chain, mol)).toBeGreaterThanOrEqual(6);
  });

  it('detects ester/amide/acid-chloride priority (5) for CC(=O)OC / CC(=O)N / CC(=O)Cl', () => {
    const est = parseSMILES('CC(=O)OC');
    const am = parseSMILES('CC(=O)N');
    const ac = parseSMILES('CC(=O)Cl');
    expect(getChainFunctionalGroupPriority(findLongestCarbonChain(est.molecules[0]!), est.molecules[0]!)).toBeGreaterThanOrEqual(5);
    expect(getChainFunctionalGroupPriority(findLongestCarbonChain(am.molecules[0]!), am.molecules[0]!)).toBeGreaterThanOrEqual(5);
    expect(getChainFunctionalGroupPriority(findLongestCarbonChain(ac.molecules[0]!), ac.molecules[0]!)).toBeGreaterThanOrEqual(5);
  });

  it('detects nitrile/nitro/carbonyl priority (>=4) for CC#N, CC[N+](=O)[O-], C(C)=O', () => {
    const nitr = parseSMILES('CC#N');
    const nitro = parseSMILES('CC[N+](=O)[O-]');
    const carbonyl = parseSMILES('CC(=O)C');
    // include the nitrogen for nitrile/nitro detection
    const nitrMol = nitr.molecules[0]!;
    const nIdx = nitrMol.atoms.findIndex(a => a && a.symbol === 'N');
    const nitrChain = nIdx >= 0 ? [nIdx, nitrMol.bonds.find(b => b.atom1 === nIdx || b.atom2 === nIdx)!.atom1 === nIdx ? nitrMol.bonds.find(b => b.atom1 === nIdx || b.atom2 === nIdx)!.atom2 : nitrMol.bonds.find(b => b.atom1 === nIdx || b.atom2 === nIdx)!.atom1] : findLongestCarbonChain(nitrMol);

    const nitroMol = nitro.molecules[0]!;
    const nitroN = nitroMol.atoms.findIndex(a => a && a.symbol === 'N');
    const nitroChain = nitroN >= 0 ? [nitroN, nitroMol.bonds.find(b => b.atom1 === nitroN || b.atom2 === nitroN)!.atom1 === nitroN ? nitroMol.bonds.find(b => b.atom1 === nitroN || b.atom2 === nitroN)!.atom2 : nitroMol.bonds.find(b => b.atom1 === nitroN || b.atom2 === nitroN)!.atom1] : findLongestCarbonChain(nitro.molecules[0]!);

    expect(getChainFunctionalGroupPriority(nitrChain, nitrMol)).toBeGreaterThanOrEqual(4);
    expect(getChainFunctionalGroupPriority(nitroChain, nitroMol)).toBeGreaterThanOrEqual(4);
    expect(getChainFunctionalGroupPriority(findLongestCarbonChain(carbonyl.molecules[0]!), carbonyl.molecules[0]!)).toBeGreaterThanOrEqual(4);
  });

  it('detects alcohol priority (3) for CCO', () => {
    const res = parseSMILES('CCO');
    const mol = res.molecules[0]!;
    // include the oxygen atom to detect alcohol
    const oIdx = mol.atoms.findIndex(a => a && a.symbol === 'O');
    const bond = mol.bonds.find(b => b.atom1 === oIdx || b.atom2 === oIdx);
    const cIdx = bond ? (bond.atom1 === oIdx ? bond.atom2 : bond.atom1) : -1;
    const chain = cIdx >= 0 ? [cIdx, oIdx] : findLongestCarbonChain(mol);
    expect(getChainFunctionalGroupPriority(chain, mol)).toBeGreaterThanOrEqual(3);
  });
});
