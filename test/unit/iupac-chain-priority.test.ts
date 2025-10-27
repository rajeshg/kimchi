import { describe, it, expect } from 'bun:test';
import { parseSMILES } from 'index';
import { findMainChain, findSubstituents } from 'src/utils/iupac/iupac-chains';

describe('IUPAC chain priority (focused)', () => {
  it('prefers hydrocarbon parent when carbon-count equal (1-chloropropane)', () => {
    const result = parseSMILES('CCCCl');
    const mol = result.molecules[0]!;
    const main = findMainChain(mol);
    // Expect propane main chain (3 carbons)
    expect(main.length).toBe(3);
    const subs = findSubstituents(mol, main);
    // should have a chloro substituent
    expect(subs.some(s => s.name === 'chloro')).toBeTruthy();
  });

  it('detects sulfonic-acid-containing chain (CS(=O)(=O)O)', () => {
    const result = parseSMILES('CS(=O)(=O)O');
    const mol = result.molecules[0]!;
    const main = findMainChain(mol);
    // For small sulfonic acids we expect a heavy-atom main chain and at least one hetero atom
    expect(main.length).toBeGreaterThanOrEqual(2);
    const hasHetero = main.some(i => mol.atoms[i] && mol.atoms[i].symbol !== 'C');
    expect(hasHetero).toBeTruthy();
  });
});
