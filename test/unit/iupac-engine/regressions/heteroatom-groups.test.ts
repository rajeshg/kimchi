import { describe, it, expect } from 'bun:test';
import { parseSMILES } from 'index';
import { RuleEngine } from '../../../../src/iupac-engine/engine';

// ============================================================================
// REGRESSION TEST SUITE: Heteroatom-Containing Molecules
// ============================================================================
// These tests cover fragile edge cases in IUPAC name generation for molecules
// with heteroatoms (N, O, S) in rings or complex substituents.
//
// CRITICAL IMPLEMENTATION DETAILS (src/iupac-engine/rules/name-assembly-layer.ts):
//   1. Ring Atom Filtering (lines 905-993)
//      - Prevents ring heteroatoms from being misidentified as substituents
//      - Relies on parentStructure.ring.atoms containing Atom objects with .id
//      - Relies on fgSub.atoms containing Atom objects with .id
//
//   2. Name-Based Filtering (lines 995-1093)
//      - Prevents duplicate FG names in complex substituents
//      - Checks both parent structure AND parent substituent names
//      - Uses length threshold (> 10) to avoid false positives
//
//   3. Locant Deduplication Map (lines 1095-1126)
//      - MUST be built from fgSubstituentsFinal (after filtering)
//      - Building from unfiltered list causes missing substituents
//
// FRAGILITY WARNINGS:
//   - If Atom structure changes (e.g., id becomes _id), tests will fail
//   - If filtering order changes, tests will fail
//   - If length threshold changes, sulfonyl-sulfinyl test may fail
//
// WHEN THESE TESTS FAIL:
//   1. Check that parentStructure.ring.atoms still contains Atom objects with .id
//   2. Check that fgSub.atoms still contains Atom objects with .id
//   3. Check that fgLocantTypeMap is built from fgSubstituentsFinal, not fgSubstituents
//   4. Check that filtering order: atoms first, then names, then locant map
//   5. Run with VERBOSE=1 to see detailed filtering logs
// ============================================================================

describe('Regression: heteroatom-containing molecules', () => {
  // ============================================================================
  // TEST: Diaziridin-one
  // ============================================================================
  // SMILES: CCC(C)(C)N1C(=O)N1C(C)(C)CC
  // Structure: N-C(=O)-N three-membered ring with two 2-methylbutan-2-yl substituents
  //
  // PROBLEM WITHOUT FIX:
  //   - N atoms (part of ring) incorrectly identified as "azetidide" substituents
  //   - Generated name includes spurious "azetidide" prefix
  //
  // ROOT CAUSE:
  //   - parentStructure.ring.atoms contains Atom objects, not IDs
  //   - Atom overlap check compared object references instead of atom.id
  //
  // FIX (lines 937-941):
  //   - Extract atom.id when building parentRingAtomIds set
  //   - Check overlap using atom IDs, not object references
  //
  // FRAGILITY:
  //   - If Atom structure changes (e.g., .id becomes ._id), this will break
  //   - If ring.atoms becomes plain ID array, comparison logic needs update
  // ============================================================================
  it('handles diaziridin-one example', () => {
    const engine = new RuleEngine();
    const smiles = 'CCC(C)(C)N1C(=O)N1C(C)(C)CC';
    const expected = '1,2-bis(2-methylbutan-2-yl)diaziridin-3-one';

    const parsed = parseSMILES(smiles);
    expect(parsed.errors).toHaveLength(0);
    const mol = parsed.molecules[0]!;
    const gen = engine.generateName(mol).name?.trim().toLowerCase();
    expect(gen).toBe(expected.trim().toLowerCase());
  });

  // ============================================================================
  // TEST: Tert-butylamino-oxy N-phenylbutanamide
  // ============================================================================
  // SMILES: CC(C)(C)C(C(=O)NC1=CC=CC=C1)ONC(C)(C)C
  // Structure: Butanamide with tert-butylamino-oxy and phenyl substituents
  //
  // PURPOSE:
  //   - Tests handling of complex amino-oxy functional groups
  //   - Ensures proper ordering and nomenclature of multiple substituents
  //
  // EXPECTED OUTPUT:
  //   - 2-(tert-butylamino)oxy-3,3-dimethyl-N-phenylbutanamide
  // ============================================================================
  it('handles tert-butylamino-oxy N-phenylbutanamide', () => {
    const engine = new RuleEngine();
    const smiles = 'CC(C)(C)C(C(=O)NC1=CC=CC=C1)ONC(C)(C)C';
    const expected = '2-(tert-butylamino)oxy-3,3-dimethyl-N-phenylbutanamide';

    const parsed = parseSMILES(smiles);
    expect(parsed.errors).toHaveLength(0);
    const mol = parsed.molecules[0]!;
    const gen = engine.generateName(mol).name?.trim().toLowerCase();
    expect(gen).toBe(expected.trim().toLowerCase());
  });

  // ============================================================================
  // TEST: Sulfonyl-Sulfinyl
  // ============================================================================
  // SMILES: CC(C)(C)CS(=O)S(=O)(=O)CC(C)(C)C
  // Structure: Chain with both S=O (sulfinyl) and S(=O)(=O) (sulfonyl) groups
  //
  // PROBLEM WITHOUT FIX:
  //   - Generated name with duplicate "sulfinyl" and "sulfonyl"
  //   - FG names appeared both in parent substituent AND as standalone FGs
  //   - Example: "...sulfonylsulfinyl-5-sulfinyl-7-sulfonyl..."
  //
  // ROOT CAUSE:
  //   - Filtering only checked parent structure name, not parent substituent names
  //   - Parent substituent "2,2-dimethylpropylsulfonylsulfinyl" already contains both FG types
  //   - These FGs were then added again as standalone substituents
  //
  // FIX (lines 1057-1081):
  //   - Check parent substituent names for complex substituents (length > 10)
  //   - Filter out FG types that appear in parent substituent names
  //
  // FRAGILITY:
  //   - Length threshold (> 10) is somewhat arbitrary
  //   - If too low, false positives (e.g., "oxy" in "hydroxy")
  //   - If too high, may miss complex substituent matches
  //   - Relies on string matching (fgType/fgPrefix in substituent name)
  // ============================================================================
  it('handles sulfonyl-sulfinyl example', () => {
    const engine = new RuleEngine();
    const smiles = 'CC(C)(C)CS(=O)S(=O)(=O)CC(C)(C)C';
    const expected = '1-(2,2-dimethylpropylsulfonylsulfinyl)-2,2-dimethylpropane';

    const parsed = parseSMILES(smiles);
    expect(parsed.errors).toHaveLength(0);
    const mol = parsed.molecules[0]!;
    const gen = engine.generateName(mol).name?.trim().toLowerCase();
    expect(gen).toBe(expected.trim().toLowerCase());
  });
});
