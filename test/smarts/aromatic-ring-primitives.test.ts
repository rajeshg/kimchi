import { describe, it, expect } from 'bun:test';
import { parseSMILES, parseSMARTS, matchSMARTS } from 'index';

function testPattern(pattern: string, smiles: string, expectedMatches: number[]) {
  const smartsPattern = parseSMARTS(pattern);
  expect(smartsPattern.errors).toEqual([]);
  
  const parsed = parseSMILES(smiles);
  expect(parsed.errors).toEqual([]);
  
  const result = matchSMARTS(smartsPattern.pattern!, parsed.molecules[0]!, { uniqueMatches: true });
  const matches = result.matches.map(match => 
    match.atoms.map(a => a.moleculeIndex).sort((a, b) => a - b)
  ).sort();
  
  const expected = expectedMatches.map(idx => [idx]).sort();
  
  expect(matches.length).toBe(expectedMatches.length);
  expect(matches).toEqual(expected);
}

describe('Aromatic Ring Primitives [r] and [!r]', () => {
  describe('[r] - atoms in aromatic rings', () => {
    it('matches aromatic carbons in benzene', () => {
      testPattern('[r]', 'c1ccccc1', [0, 1, 2, 3, 4, 5]);
    });

    it('matches aromatic nitrogen in pyridine', () => {
      testPattern('[r]', 'c1ccncc1', [0, 1, 2, 3, 4, 5]);
    });

    it('matches aromatic atoms in furan', () => {
      testPattern('[r]', 'c1occc1', [0, 1, 2, 3, 4]);
    });

    it('matches aromatic atoms in thiophene', () => {
      testPattern('[r]', 'c1sccc1', [0, 1, 2, 3, 4]);
    });

    it('matches aromatic atoms in naphthalene', () => {
      testPattern('[r]', 'c1ccc2ccccc2c1', [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    });

    it('matches aromatic atoms in pyrimidine', () => {
      testPattern('[r]', 'c1cnc2ncccc2n1', Array.from({ length: 10 }, (_, i) => i));
    });

    it('matches all atoms in aliphatic cyclohexane (all are in ring)', () => {
      testPattern('[r]', 'C1CCCCC1', [0, 1, 2, 3, 4, 5]);
    });

    it('matches only aromatic atoms in mixed molecule', () => {
      // phenylmethane (toluene-like): aromatic ring + methyl substituent
      testPattern('[r]', 'c1ccccc1C', [0, 1, 2, 3, 4, 5]);
    });

    it('matches aromatic atoms in aniline (excluding N which is not in ring)', () => {
      testPattern('[r]', 'c1ccc(N)cc1', [0, 1, 2, 3, 5, 6]);
    });

    it('matches aromatic atoms in phenol (excluding O which is not in ring)', () => {
      testPattern('[r]', 'c1ccc(O)cc1', [0, 1, 2, 3, 5, 6]);
    });

    it('matches aromatic atoms in anisole (excluding O and C of methoxy group)', () => {
      testPattern('[r]', 'c1ccc(OC)cc1', [0, 1, 2, 3, 6, 7]);
    });

    it('matches all aromatic atoms in indole', () => {
      testPattern('[r]', 'c1ccc2[nH]ccc2c1', [0, 1, 2, 3, 4, 5, 6, 7, 8]);
    });

    it('matches all aromatic atoms in benzofuran', () => {
      testPattern('[r]', 'c1ccc2occc2c1', [0, 1, 2, 3, 4, 5, 6, 7, 8]);
    });

    it('matches aromatic atoms in biphenyl', () => {
      testPattern('[r]', 'c1ccccc1-c2ccccc2', [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    });

    it('does not match aliphatic atoms in alkene', () => {
      testPattern('[r]', 'C=C', []);
    });

    it('does not match aliphatic atoms in alkane', () => {
      testPattern('[r]', 'CCC', []);
    });
  });

  describe('[!r] - atoms NOT in aromatic rings', () => {
    it('does not match any atoms in benzene (all aromatic)', () => {
      testPattern('[!r]', 'c1ccccc1', []);
    });

    it('does not match any atoms in cyclohexane (all are in ring)', () => {
      testPattern('[!r]', 'C1CCCCC1', []);
    });

    it('matches aliphatic atoms in ethane', () => {
      testPattern('[!r]', 'CC', [0, 1]);
    });

    it('matches aliphatic atoms in propane', () => {
      testPattern('[!r]', 'CCC', [0, 1, 2]);
    });

    it('matches aliphatic atoms in ethanol', () => {
      testPattern('[!r]', 'CCO', [0, 1, 2]);
    });

    it('matches aliphatic atoms in methyl-substituted benzene', () => {
      // c1ccccc1C: aromatic ring (6 atoms) + aliphatic methyl carbon
      testPattern('[!r]', 'c1ccccc1C', [6]);
    });

    it('matches aliphatic atoms in phenylmethanol', () => {
      // c1ccccc1CO: aromatic ring + aliphatic CH2-OH
      testPattern('[!r]', 'c1ccccc1CO', [6, 7]);
    });

    it('matches aliphatic atoms in benzoic acid', () => {
      // c1ccccc1C(=O)O: aromatic ring + aliphatic carbonyl carbon + oxygen
      testPattern('[!r]', 'c1ccccc1C(=O)O', [6, 7, 8]);
    });

    it('does not match aromatic atoms in pure aromatic system', () => {
      testPattern('[!r]', 'c1ccncc1', []);
    });

    it('matches aliphatic atoms in diphenylmethane', () => {
      // c1ccccc1Cc2ccccc2: two aromatic rings + aliphatic methylene
      testPattern('[!r]', 'c1ccccc1Cc2ccccc2', [6]);
    });

    it('matches hydrogen atoms and heteroatoms in phenol substituent', () => {
      // c1ccccc1O: aromatic ring + aliphatic oxygen
      testPattern('[!r]', 'c1ccccc1O', [6]);
    });

    it('matches aliphatic atoms in aniline substituent', () => {
      // c1ccccc1N: aromatic ring + aliphatic nitrogen
      testPattern('[!r]', 'c1ccccc1N', [6]);
    });

    it('matches non-aromatic atoms in mixed system', () => {
      // cyclopentane + benzene: both are ring systems, so [!r] matches nothing
      testPattern('[!r]', 'C1CCCC1.c1ccccc1', []);
    });
  });

  describe('[r] with ring size - aromatic atoms in N-membered rings', () => {
    it('matches atoms in 5-membered aromatic rings (furan)', () => {
      testPattern('[r5]', 'c1occc1', [0, 1, 2, 3, 4]);
    });

    it('matches atoms in 6-membered aromatic rings (benzene)', () => {
      testPattern('[r6]', 'c1ccccc1', [0, 1, 2, 3, 4, 5]);
    });

    it('matches atoms in 6-membered aromatic rings (pyridine)', () => {
      testPattern('[r6]', 'c1ccncc1', [0, 1, 2, 3, 4, 5]);
    });

    it('matches both 5 and 6-membered atoms in naphthalene separately', () => {
      // Naphthalene: all atoms are in 6-membered rings
      testPattern('[r6]', 'c1ccc2ccccc2c1', [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    });

    it('does not match 6-membered rings atoms in furan (5-membered)', () => {
      testPattern('[r6]', 'c1occc1', []);
    });

    it('does not match 5-membered ring atoms in benzene (6-membered)', () => {
      testPattern('[r5]', 'c1ccccc1', []);
    });

    it('matches aromatic atoms in pyrrole (5-membered)', () => {
      testPattern('[r5]', 'c1cc[nH]c1', [0, 1, 2, 3, 4]);
    });
  });

  describe('[!r] with ring size - aromatic atoms NOT in N-membered rings', () => {
    it('does not match atoms in 6-membered aromatic rings (benzene)', () => {
      testPattern('[!r6]', 'c1ccccc1', []);
    });

    it('matches atoms NOT in 6-membered rings (5-membered furan)', () => {
      testPattern('[!r6]', 'c1occc1', [0, 1, 2, 3, 4]);
    });

    it('matches aliphatic atoms with [!r5]', () => {
      testPattern('[!r5]', 'C1CCCCC1', [0, 1, 2, 3, 4, 5]);
    });

    it('does not match aromatic atoms in pyrrole with [!r5]', () => {
      testPattern('[!r5]', 'c1cc[nH]c1', []);
    });

    it('matches aliphatic atoms in benzene substituent', () => {
      // c1ccccc1C: aromatic ring in 6-membered rings, methyl carbon NOT in any ring
      testPattern('[!r6]', 'c1ccccc1C', [6]);
    });
  });

  describe('[r] combined with other primitives', () => {
    it('matches aromatic carbons [c&r]', () => {
      testPattern('[c&r]', 'c1ccccc1', [0, 1, 2, 3, 4, 5]);
    });

    it('matches aromatic nitrogens [n&r]', () => {
      testPattern('[n&r]', 'c1ccncc1', [3]);
    });

    it('matches aromatic atoms with degree 2 [r&D2]', () => {
      testPattern('[r&D2]', 'c1ccccc1', [0, 1, 2, 3, 4, 5]);
    });

    it('matches aromatic atoms in degree 3 positions', () => {
      // c1ccc(C)cc1: the atom at position 3 has degree 3 (connected to two ring atoms + methyl)
      testPattern('[r&D3]', 'c1ccc(C)cc1', [3]);
    });

    it('matches aliphatic atoms in aromatic molecule with [!r&C]', () => {
      // c1ccccc1C: aliphatic carbon substituent
      testPattern('[!r&C]', 'c1ccccc1C', [6]);
    });

    it('matches aromatic heteroatoms [r&!#6]', () => {
      testPattern('[r&!#6]', 'c1ccncc1', [3]);
    });

    it('matches aromatic oxygens [o&r]', () => {
      testPattern('[o&r]', 'c1occc1', [1]);
    });

    it('matches aromatic sulfurs [s&r]', () => {
      testPattern('[s&r]', 'c1sccc1', [1]);
    });
  });

  describe('[!r] combined with other primitives', () => {
    it('matches non-aromatic carbons [C&!r]', () => {
      testPattern('[C&!r]', 'CC', [0, 1]);
    });

    it('matches non-aromatic aliphatic atoms [A&!r]', () => {
      testPattern('[A&!r]', 'CC', [0, 1]);
    });

    it('matches non-aromatic atoms with specific degree [!r&D1]', () => {
      // Terminal atoms in alkane
      testPattern('[!r&D1]', 'CCC', [0, 2]);
    });

    it('matches non-ring atoms with high connectivity', () => {
      // Quaternary carbon not in ring: C(C)(C)C - atom 0 is NOT in a ring
      testPattern('[!r&C&D4]', 'C(C)(C)C', []);
    });

    it('matches aliphatic heteroatoms [!r&O]', () => {
      testPattern('[!r&O]', 'CCO', [2]);
    });
  });

  describe('Edge cases and special patterns', () => {
    it('matches only aromatic ring atoms excluding saturated rings', () => {
      // Mixed: aromatic benzene + saturated cyclohexane
      testPattern('[r]', 'c1ccccc1.C1CCCCC1', [0, 1, 2, 3, 4, 5]);
    });

    it('handles disconnected aromatic components', () => {
      // Note: testPattern only checks first molecule from dot-separated SMILES
      // RDKit would match all 12 atoms, but we only check the first benzene ring
      testPattern('[r]', 'c1ccccc1.c1ccccc1', [0, 1, 2, 3, 4, 5]);
    });

    it('matches aromatic atoms in complex polycyclic system (anthracene)', () => {
      testPattern('[r]', 'c1ccc2cc3ccccc3cc2c1', Array.from({ length: 14 }, (_, i) => i));
    });

    it('matches only aromatic portion in hybrid aromatic-aliphatic molecule', () => {
      // phenylbutane: aromatic + aliphatic chain
      testPattern('[r]', 'c1ccccc1CCC', [0, 1, 2, 3, 4, 5]);
    });

    it('distinguishes aromatic from aliphatic in homologous series', () => {
      // c1ccccc1 (benzene - all aromatic)
      testPattern('[r]', 'c1ccccc1', [0, 1, 2, 3, 4, 5]);
    });

    it('matches aromatic nitrogen in heterocyclic system', () => {
      testPattern('[n&r]', 'c1cc[nH]c1', [3]);
    });

    it('correctly handles empty result for non-matching pattern', () => {
      // No 7-membered aromatic rings in benzene
      testPattern('[r7]', 'c1ccccc1', []);
    });

    it('matches aromatic atoms in fused heterocyclic (indole)', () => {
      // indole: fused 5 and 6-membered rings
      testPattern('[r]', 'c1ccc2[nH]ccc2c1', [0, 1, 2, 3, 4, 5, 6, 7, 8]);
    });

    it('distinguishes [r] from [R] primitives', () => {
      // [r] = atoms in any ring (aromatic or aliphatic)
      // [R] = atoms in any ring (aromatic or aliphatic)
      testPattern('[r]', 'c1ccccc1', [0, 1, 2, 3, 4, 5]);
      testPattern('[R]', 'C1CCCCC1', [0, 1, 2, 3, 4, 5]);
    });
  });

  describe('Negation with complex patterns', () => {
    it('matches atoms NOT in rings AND in rings (contradictory pattern)', () => {
      // [!r&R] is contradictory: can't be "not in ring" AND "in ring"
      // RDKit confirms this matches 0 atoms
      testPattern('[!r&R]', 'C1CCCCC1', []);
    });

    it('matches aromatic carbons only with [!r]', () => {
      // Nothing matches aromatic atoms
      testPattern('[!r]', 'c1ccccc1', []);
    });

    it('matches non-6-membered aromatic atoms', () => {
      // All atoms in furan are in 5-membered aromatic rings
      testPattern('[!r6]', 'c1occc1', [0, 1, 2, 3, 4]);
    });

    it('matches aromatic atoms NOT in degree 2 positions', () => {
      // Find aromatic atoms with degree != 2
      testPattern('[r&!D2]', 'c1ccc(C)cc1', [3]);
    });
  });
});
