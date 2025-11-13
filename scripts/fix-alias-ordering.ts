import fs from 'fs';

const rulesPath = './opsin-rules.json';
const rules = JSON.parse(fs.readFileSync(rulesPath, 'utf-8'));

let changesCount = 0;

// Fix ring systems
for (const [smiles, data] of Object.entries(rules.ringSystems)) {
  const sorted = [...data.aliases].sort((a, b) => b.length - a.length);
  if (JSON.stringify(sorted) !== JSON.stringify(data.aliases)) {
    data.aliases = sorted;
    changesCount++;
  }
}

// Fix substituents
for (const [smiles, data] of Object.entries(rules.substituents)) {
  const sorted = [...data.aliases].sort((a, b) => b.length - a.length);
  if (JSON.stringify(sorted) !== JSON.stringify(data.aliases)) {
    data.aliases = sorted;
    changesCount++;
  }
}

console.log(`Fixed ${changesCount} alias orderings`);

// Write back to file
fs.writeFileSync(rulesPath, JSON.stringify(rules, null, 2));
console.log('Updated opsin-rules.json');
