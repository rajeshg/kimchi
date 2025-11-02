const fs = require('fs');
const path = require('path');

const csvPath = path.join(__dirname, '..', 'test', 'unit', 'iupac-engine', 'smiles-iupac-mismatches.csv');
if (!fs.existsSync(csvPath)) {
  console.error('mismatches CSV not found at', csvPath);
  process.exit(1);
}

const csv = fs.readFileSync(csvPath, 'utf8');
const lines = csv.split('\n').slice(1).filter(l => l.trim());

const categories = {
  'Whitespace only': [],
  'Complex ester': [],
  'Aromatic/Ring naming': [],
  'Heteroatom groups': [],
  'Diene/Multiple-bond parent': [],
  'Formatting (hyphens/commas)': [],
  'Other': [],
};

for (const line of lines) {
  const match = line.match(/^([^,]+),"([^"]+)","([^"]+)"$/);
  if (!match) continue;
  const [, smiles, expected, actual] = match;

  const normExp = expected.toLowerCase().replace(/\s+/g, '');
  const normAct = actual.toLowerCase().replace(/\s+/g, '');
  if (normExp === normAct) {
    categories['Whitespace only'].push({smiles, expected, actual});
    continue;
  }

  // Diene/multiple-bond parents
  if (/diene|triene/.test(expected.toLowerCase()) || /,\d+-/.test(expected)) {
    if (expected.includes('diene') || expected.includes('triene') || actual.includes('diene') || actual.includes('triene')) {
      categories['Diene/Multiple-bond parent'].push({smiles, expected, actual});
      continue;
    }
  }

  // Complex ester patterns
  if (expected.includes('oate') || expected.includes('yl]') || (expected.includes('oxy') && expected.includes('oate'))) {
    categories['Complex ester'].push({smiles, expected, actual});
    continue;
  }

  // Heteroatom-containing SMILES or expected containing heteroatom terms
  if (smiles.includes('Si') || smiles.includes('P') || smiles.includes('B') || smiles.includes('N') || smiles.includes('S')) {
    categories['Heteroatom groups'].push({smiles, expected, actual});
    continue;
  }

  // Aromatic / ring naming
  if (/c1|cyc|benz|phenyl|cyclo/.test(smiles) || expected.includes('cyclo') || actual.includes('cyclo') || expected.includes('phenyl') || actual.includes('phenyl')) {
    categories['Aromatic/Ring naming'].push({smiles, expected, actual});
    continue;
  }

  // Formatting issues: stray hyphens, leading hyphens or '2-,2-' patterns
  if (actual.includes('-,') || actual.match(/\d-,\d|-,\d/)) {
    categories['Formatting (hyphens/commas)'].push({smiles, expected, actual});
    continue;
  }

  categories['Other'].push({smiles, expected, actual});
}

console.log('=== MISMATCH CATEGORIES ===');
for (const [k, v] of Object.entries(categories)) {
  if (v.length === 0) continue;
  console.log(`\n${k}: ${v.length}`);
  v.slice(0, 5).forEach(item => {
    console.log(`  • ${item.smiles} \n    Expected: ${item.expected} \n    Actual:   ${item.actual}`);
  });
}

console.log('\nDone.');
