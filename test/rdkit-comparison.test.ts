import { describe, expect, it } from 'vitest';
import { parseSMILES, generateSMILES } from '../index';
// RDKit's module export typing is not callable in this environment; cast to any where used

describe('RDKit Comparison', () => {
  it('compares CC with rdkit', async () => {
    const rdkitModule = await import('@rdkit/rdkit').catch(() => null);
    if (!rdkitModule) {
      console.warn('RDKit not available for CC');
      return;
    }
    const initRDKitModule = rdkitModule.default;
    const RDKit: any = await (initRDKitModule as any)();
    const mol = RDKit.get_mol('CC');
    expect(mol.get_num_atoms()).toBe(2);
    expect(mol.get_num_bonds()).toBe(1);

    const result = parseSMILES('CC');
    expect(result.errors).toHaveLength(0);
    expect(result.molecules[0]!.atoms).toHaveLength(2);
    expect(result.molecules[0]!.bonds).toHaveLength(1);
  });

  it('compares C1CCCCC1 with rdkit', async () => {
    const rdkitModule = await import('@rdkit/rdkit').catch(() => null);
    if (!rdkitModule) {
      console.warn('RDKit not available for C1CCCCC1');
      return;
    }
    const initRDKitModule = rdkitModule.default;
    const RDKit: any = await (initRDKitModule as any)();
    const mol = RDKit.get_mol('C1CCCCC1');
    expect(mol.get_num_atoms()).toBe(6);
    expect(mol.get_num_bonds()).toBe(6);

    const result = parseSMILES('C1CCCCC1');
    expect(result.errors).toHaveLength(0);
    expect(result.molecules[0]!.atoms).toHaveLength(6);
    expect(result.molecules[0]!.bonds).toHaveLength(6);
  });
});