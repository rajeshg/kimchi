import { parseSMILES } from 'index';
import { readFileSync } from 'fs';

// Read the complex SMILES from file
const lines = readFileSync('test/pubchem-10.txt', 'utf-8').split('\n').filter(l => l.trim());
console.log(`Testing ${lines.length} molecules...\n`);

// Test first 5 molecules with timing
for (let i = 0; i < Math.min(5, lines.length); i++) {
  const parts = lines[i]!.split('\t');
  const id = parts[0]!;
  const smiles = parts[1]!;
  
  console.log(`[${i + 1}] ID: ${id}, Length: ${smiles.length}`);
  
  const start = performance.now();
  try {
    const result = parseSMILES(smiles);
    const end = performance.now();
    
    if (result.molecules && result.molecules.length > 0) {
      const totalAtoms = result.molecules.reduce((sum, mol) => sum + mol.atoms.length, 0);
      console.log(`    ✓ Time: ${(end - start).toFixed(2)}ms, Atoms: ${totalAtoms}`);
    } else {
      console.log(`    ✗ No molecules parsed`);
    }
  } catch (e) {
    const end = performance.now();
    console.log(`    ✗ Failed after ${(end - start).toFixed(2)}ms`);
    console.log(`    Error: ${e instanceof Error ? e.message : String(e)}`);
  }
}
