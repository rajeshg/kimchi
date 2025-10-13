import initRDKitModule from '@rdkit/rdkit';
// Cast to any when calling initRDKitModule in this environment


async function test() {
  try {
    const rdkit: any = await (initRDKitModule as any)();
    console.log('RDKit loaded');
    const mol = rdkit.get_mol('CC');
    console.log('Atoms:', mol.get_num_atoms());
  } catch (e) {
    console.error('Error:', e);
  }
}

test();