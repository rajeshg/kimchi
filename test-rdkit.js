import initRDKitModule from '@rdkit/rdkit';

async function main() {
  try {
    // Try default loading
    const RDKit = await initRDKitModule();
    console.log('RDKit version:', RDKit.version());
    const mol = RDKit.get_mol('CC');
    if (mol) {
      console.log('Canonical SMILES:', mol.get_smiles());
    } else {
      console.log('Failed to create molecule.');
    }
  } catch (err) {
    console.error('Error loading RDKit:', err);
  }

  // Try with locateFile option
  try {
    const RDKit2 = await initRDKitModule({
      locateFile: (file) => `./node_modules/@rdkit/rdkit/dist/${file}`
    });
    console.log('RDKit (locateFile) version:', RDKit2.version());
    const mol2 = RDKit2.get_mol('CC');
    if (mol2) {
      console.log('Canonical SMILES (locateFile):', mol2.get_smiles());
    } else {
      console.log('Failed to create molecule (locateFile).');
    }
  } catch (err) {
    console.error('Error loading RDKit with locateFile:', err);
  }
}

main();
