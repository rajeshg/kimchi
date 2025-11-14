import { parseSMILES, generateSMILES } from './index';
import { IUPACTokenizer } from './src/parsers/iupac-tokenizer';
import { IUPACGraphBuilder } from './src/parsers/iupac-graph-builder';
import opsinRulesData from './opsin-rules.json';
import type { OPSINRules } from './src/parsers/iupac-types';
import datasetRaw from './test/unit/iupac-engine/smiles-to-iupac-realistic-dataset.json';

const dataset = datasetRaw as Array<{ smiles: string; iupac: string }>;
const rules = opsinRulesData as unknown as OPSINRules;

const nearMatches: Array<{name: string, atomDiff: number}> = [];

for (const testCase of dataset) {
  const { smiles: expectedSmiles, iupac } = testCase;
  
  if (expectedSmiles.length > 100) continue;
  
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
    
    const atomDiff = Math.abs(generatedMol.atoms.length - expectedMol.atoms.length);
    
    if (atomDiff >= 1 && atomDiff <= 2 && generateSMILES(expectedMol) !== generateSMILES(generatedMol)) {
      nearMatches.push({ name: iupac, atomDiff });
    }
  } catch (e) {
    // Skip
  }
}

console.log(`Near matches (off by 1-2 atoms): ${nearMatches.length}\n`);
for (const match of nearMatches.slice(0, 15)) {
  console.log(`  ${match.name} (${match.atomDiff} atoms off)`);
}
