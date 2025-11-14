import { parseSMILES, generateSMILES } from './index';
import { IUPACTokenizer } from './src/parsers/iupac-tokenizer';
import { IUPACGraphBuilder } from './src/parsers/iupac-graph-builder';
import opsinRulesData from './opsin-rules.json';
import type { OPSINRules } from './src/parsers/iupac-types';
import datasetRaw from './test/unit/iupac-engine/smiles-to-iupac-realistic-dataset.json';

const dataset = datasetRaw as Array<{ smiles: string; iupac: string }>;
const rules = opsinRulesData as unknown as OPSINRules;

const simpleFailures: Array<{name: string, expected: string, got: string, atomDiff: number}> = [];

for (const testCase of dataset) {
  const { smiles: expectedSmiles, iupac } = testCase;
  
  if (expectedSmiles.length > 100) continue;
  if (expectedSmiles.length > 50) continue; // Focus on simple molecules
  
  try {
    const tokenizer = new IUPACTokenizer(rules);
    const tokenResult = tokenizer.tokenize(iupac);
    
    if (tokenResult.errors.length > 0) continue;
    
    const builder = new IUPACGraphBuilder(rules);
    const molecule = builder.build(tokenResult.tokens);
    
    const generatedSmiles = generateSMILES(molecule);
    const expectedMol = parseSMILES(expectedSmiles).molecules[0];
    const generatedMol = parseSMILES(generatedSmiles).molecules[0];
    
    if (!expectedMol || !generatedMol) continue;
    
    const atomDiff = generatedMol.atoms.length - expectedMol.atoms.length;
    
    if (atomDiff !== 0 || generateSMILES(expectedMol) !== generateSMILES(generatedMol)) {
      simpleFailures.push({
        name: iupac,
        expected: expectedSmiles,
        got: generatedSmiles,
        atomDiff
      });
    }
  } catch (e) {
    // Skip
  }
}

console.log(`Simple failures (${simpleFailures.length}):\n`);
for (const fail of simpleFailures.slice(0, 15)) {
  console.log(`${fail.name}`);
  console.log(`  Expected: ${fail.expected} (${fail.expected.length} chars)`);
  console.log(`  Got:      ${fail.got}`);
  console.log(`  AtomDiff: ${fail.atomDiff}\n`);
}
