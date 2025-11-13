import fs from 'fs';

const rulesPath = './opsin-rules.json';
const rules = JSON.parse(fs.readFileSync(rulesPath, 'utf-8'));

// Missing heterocycles with their SMILES and labels
const newRingSystems: Record<string, { smiles: string; aliases: string[]; labels: string }> = {
  // 3-membered rings
  'oxirane': { smiles: 'C1CO1', aliases: ['oxirane'], labels: '1/2/3' },
  'aziridine': { smiles: 'C1CN1', aliases: ['aziridine', 'aziridin'], labels: '1/2/3' },
  'thiirane': { smiles: 'C1CS1', aliases: ['thiirane', 'thiiran'], labels: '1/2/3' },
  
  // 4-membered rings
  'oxetane': { smiles: 'C1COC1', aliases: ['oxetane', 'oxetan'], labels: '1/2/3/4' },
  'azetidine': { smiles: 'C1CNC1', aliases: ['azetidine', 'azetidin'], labels: '1/2/3/4' },
  'thietane': { smiles: 'C1CSC1', aliases: ['thietane', 'thietan'], labels: '1/2/3/4' },
  
  // 5-membered saturated rings
  'oxolane': { smiles: 'C1CCOC1', aliases: ['oxolane', 'oxolan', 'tetrahydrofuran', 'thf'], labels: '1/2/3/4/5' },
  'thiolane': { smiles: 'C1CCSC1', aliases: ['thiolane', 'thiolan', 'tetrahydrothiophene'], labels: '1/2/3/4/5' },
  'pyrrolidine': { smiles: 'C1CCNC1', aliases: ['pyrrolidine', 'pyrrolidin'], labels: '1/2/3/4/5' },
  
  // 5-membered aromatic rings
  'thiophene': { smiles: 'c1ccsc1', aliases: ['thiophene', 'thiophen'], labels: '1/2/3/4/5' },
  'thiazole': { smiles: 'c1cncs1', aliases: ['thiazole', 'thiazol'], labels: '1/2/3/4/5' },
  'oxazole': { smiles: 'c1cnco1', aliases: ['oxazole', 'oxazol'], labels: '1/2/3/4/5' },
  'imidazole': { smiles: 'c1c[nH]cn1', aliases: ['imidazole', 'imidazol'], labels: '1/2/3/4/5' },
  'pyrazole': { smiles: 'c1cn[nH]c1', aliases: ['pyrazole', 'pyrazol'], labels: '1/2/3/4/5' },
  
  // 6-membered saturated rings
  'oxane': { smiles: 'C1CCOCC1', aliases: ['oxane', 'oxan', 'tetrahydropyran'], labels: '1/2/3/4/5/6' },
  'thiane': { smiles: 'C1CCSCC1', aliases: ['thiane', 'thian', 'tetrahydrothiopyran'], labels: '1/2/3/4/5/6' },
  'piperidine': { smiles: 'C1CCNCC1', aliases: ['piperidine', 'piperidin'], labels: '1/2/3/4/5/6' },
  
  // 6-membered aromatic rings
  'pyridine': { smiles: 'c1ccncc1', aliases: ['pyridine', 'pyridin'], labels: '1/2/3/4/5/6' },
  'pyrimidine': { smiles: 'c1cncnc1', aliases: ['pyrimidine', 'pyrimidin'], labels: '1/2/3/4/5/6' },
  'pyrazine': { smiles: 'c1cnccn1', aliases: ['pyrazine', 'pyrazin'], labels: '1/2/3/4/5/6' },
  'pyridazine': { smiles: 'c1ccnnc1', aliases: ['pyridazine', 'pyridazin'], labels: '1/2/3/4/5/6' },
  
  // Fused rings
  'quinoline': { smiles: 'c1ccc2ncccc2c1', aliases: ['quinoline', 'quinolin'], labels: '1/2/3/3a/4/5/6/7/7a/8' },
  'indole': { smiles: 'c1ccc2[nH]ccc2c1', aliases: ['indole', 'indol'], labels: '1/2/3/3a/7a/4/5/6/7' },
  'benzofuran': { smiles: 'c1ccc2occc2c1', aliases: ['benzofuran', 'benzofuran'], labels: '1/2/3/3a/7a/4/5/6/7' },
  'benzothiophene': { smiles: 'c1ccc2sccc2c1', aliases: ['benzothiophene', 'benzothiophen'], labels: '1/2/3/3a/7a/4/5/6/7' },
};

let added = 0;

for (const [name, data] of Object.entries(newRingSystems)) {
  // Check if SMILES already exists
  if (!rules.ringSystems[data.smiles]) {
    rules.ringSystems[data.smiles] = {
      aliases: data.aliases.sort((a, b) => b.length - a.length), // Longest first
      labels: data.labels
    };
    added++;
    console.log(`Added: ${name} (${data.smiles})`);
  } else {
    console.log(`Skipped: ${name} (already exists)`);
  }
}

console.log(`\nAdded ${added} new ring systems`);

// Write back
fs.writeFileSync(rulesPath, JSON.stringify(rules, null, 2));
console.log('Updated opsin-rules.json');
