import { parseSMILES } from './index';
import { RuleEngine } from './src/iupac-engine/engine';
import * as fs from 'fs';

const csv = fs.readFileSync('test/unit/iupac-engine/smiles-iupac-mismatches.csv', 'utf-8');
const lines = csv.split('\n').slice(1).filter(line => line.trim());

const engine = new RuleEngine();

const categories: Record<string, any[]> = {
  'Whitespace only': [],
  'Acetic acid bug': [],
  'Complex ester': [],
  'Aromatic/Ring naming': [],
  'Heteroatom groups': [],
  'Stereochemistry': [],
  'Other': [],
};

for (const line of lines) {
  const match = line.match(/^([^,]+),"([^"]+)","([^"]+)"$/);
  if (!match) continue;
  
  const [, smiles, expected, actual] = match;
  
  // Check if it's just whitespace difference
  const normalizedExpected = expected.toLowerCase().replace(/\s+/g, '');
  const normalizedActual = actual.toLowerCase().replace(/\s+/g, '');
  
  if (normalizedExpected === normalizedActual) {
    categories['Whitespace only'].push({ smiles, expected, actual });
    continue;
  }
  
  // Check for acetic acid bug pattern
  if (actual.includes('hydroxypropen') && actual.includes('oic acid')) {
    categories['Acetic acid bug'].push({ smiles, expected, actual });
    continue;
  }
  
  // Check for complex ester issues
  if ((expected.includes('yl]') && expected.includes('oate')) || 
      (expected.includes('oxy)propyl') && expected.includes('oate'))) {
    categories['Complex ester'].push({ smiles, expected, actual });
    continue;
  }
  
  // Check for heteroatom issues (N, Si, P, B, S)
  if (smiles.includes('Si(') || smiles.includes('P(') || smiles.includes('B(') || 
      smiles.includes('N(') && !smiles.includes('C#N')) {
    categories['Heteroatom groups'].push({ smiles, expected, actual });
    continue;
  }
  
  // Check for aromatic/ring naming issues
  if (smiles.match(/c\d/) || actual.includes('cyclo') || expected.includes('cyclo') ||
      actual.includes('aromatic') || expected.includes('phenyl')) {
    categories['Aromatic/Ring naming'].push({ smiles, expected, actual });
    continue;
  }
  
  categories['Other'].push({ smiles, expected, actual });
}

console.log('=== Failure Categories ===\n');

for (const [category, items] of Object.entries(categories)) {
  if (items.length === 0) continue;
  console.log(`${category}: ${items.length} cases`);
  items.slice(0, 3).forEach(({ smiles, expected, actual }) => {
    console.log(`  • ${smiles.slice(0, 30)}...`);
    console.log(`    Expected: ${expected.slice(0, 60)}...`);
    console.log(`    Got: ${actual.slice(0, 60)}...`);
  });
  if (items.length > 3) {
    console.log(`  ... and ${items.length - 3} more\n`);
  } else {
    console.log();
  }
}
