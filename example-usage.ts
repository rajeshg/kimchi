import { parseSMILES, generateSMILES } from './index';

console.log('ChemKit SMILES Generation Examples');
console.log('===================================\n');

const smiles = 'CC(C)CC';
const result = parseSMILES(smiles);

if (result.molecules.length > 0) {
  const mol = result.molecules[0];
  
  console.log('Input SMILES:', smiles);
  console.log();
  
  // Generate canonical SMILES (default)
  console.log('Canonical SMILES (default):');
  console.log('  generateSMILES(mol)       =', generateSMILES(mol));
  console.log('  generateSMILES(mol, true) =', generateSMILES(mol, true));
  console.log();
  
  // Generate simple (non-canonical) SMILES
  console.log('Simple SMILES:');
  console.log('  generateSMILES(mol, false) =', generateSMILES(mol, false));
  console.log();
  
  console.log('Note: Canonical SMILES uses iterative atom invariants');
  console.log('      and deterministic DFS traversal for reproducible output.');
  console.log('      Simple SMILES uses DFS with atom ID-based ordering.');
}
