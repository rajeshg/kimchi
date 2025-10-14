import { it } from 'bun:test';

it('inspects RDKit mol API', async () => {
  const rdkitModule = await import('@rdkit/rdkit').catch(() => null);
  if (!rdkitModule) throw new Error('RDKit missing');
  const init = rdkitModule.default;
  const RDKit: any = await (init as any)();
  const mol = RDKit.get_mol('c1ccccc1');
  if (process.env.RUN_VERBOSE) {
    console.log('mol proto methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(mol)).sort().join(', '));
  }
  if (mol && mol.delete) mol.delete();
});
