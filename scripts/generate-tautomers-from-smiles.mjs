#!/usr/bin/env node
import { parseSMILES } from 'index';
import { enumerateTautomers } from 'src/utils/tautomer/tautomer-enumerator';

async function main() {
  // larger tautomeric molecule: barbituric acid
  const smi = 'O=C1NC(=O)NC(=O)N1';
  console.log(`Input SMILES: ${smi}`);
  const parsed = parseSMILES(smi);
  if (!parsed || !parsed.molecules || parsed.molecules.length === 0) {
    console.error('Failed to parse SMILES');
    process.exit(1);
  }
  const mol = parsed.molecules[0];

  const opts = {
    maxTautomers: 1024,
    maxTransforms: 10000,
    maxPerPhase: 2000,
    phases: [1,2,3],
    removeStereo: false,
    useFingerprintDedup: false,
  };

  const results = enumerateTautomers(mol, opts);

  // print original explicitly
  const { generateSMILES } = await import('index');
  const inputSmiles = generateSMILES(mol);
  console.log(`\nOriginal (explicit): ${inputSmiles}\n`);

  if (!results || results.length === 0) {
    console.log('No tautomers generated.');
    return;
  }
  console.log(`Generated ${results.length} tautomers:`);
  for (const r of results) {
    console.log(`- SMILES: ${r.smiles} | score=${r.score} | rules=${(r.ruleIds||[]).join(',')}`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
