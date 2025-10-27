import { describe, it, expect } from 'bun:test';
import { parseSMILES } from 'index';
import { findMainChain } from 'src/utils/iupac/iupac-chains';

describe('IUPAC ambiguous parent selection regressions', () => {
  it('prefers an all-carbon parent for 1-chloropropane (ClCCC)', () => {
    const res = parseSMILES('ClCCC');
    const mol = res.molecules[0]!;
    const main = findMainChain(mol);
    // Expect a 3-carbon hydrocarbon parent (propane)
    expect(main.length).toBe(3);
    for (const idx of main) {
      expect(mol.atoms[idx]!.symbol).toBe('C');
    }
  });

  it('selects the chain containing sulfonic acid as principal group (ClCCS(=O)(=O)O)', () => {
    const res = parseSMILES('ClCCS(=O)(=O)O');
    const mol = res.molecules[0]!;
    const main = findMainChain(mol);
    // Ensure the selected chain contains the sulfur (principal group should win)
    const containsS = main.some(i => mol.atoms[i] && mol.atoms[i].symbol === 'S');
    expect(containsS).toBe(true);
  });

  it('prefers an all-carbon parent for 1-chlorohexane (ClCCCCCC)', () => {
    const res = parseSMILES('ClCCCCCC');
    const mol = res.molecules[0]!;
    const main = findMainChain(mol);
    // Expect a 6-carbon hydrocarbon parent
    expect(main.length).toBe(6);
    for (const idx of main) {
      expect(mol.atoms[idx]!.symbol).toBe('C');
    }
  });
});
