import { parseSMILES, generateSMILES } from '../index';

const cases = [
  'CC(C)C(/C)=C(/C)C(C)C',
  'CC(C)C(=C(/C)C(C)C)/C',
  'C/C(=C\\C(C)C)C(C)C',
  'F/C=C/C=C\\C',
  'F/C=C\\C=C/C',
  'C1=CC(=C1)/C=C/F',
  'C1CC=C1/C=C/F',
  '[13C]/C(=C\\(F)Cl)C',
  'C[/2H]=C(\\Cl)Br',
  'C\\C=C/C\\C=C/C',
  'F/C=C/F',
  'F\\C=C\\F'
];

(async function main() {
  const rdkitModule = await import('@rdkit/rdkit').catch(() => null);
  if (!rdkitModule) {
    console.log('RDKit module not available in this environment.');
    process.exit(0);
  }
  const init = rdkitModule.default;
  const RDKit: any = await (init as any)();

  for (const input of cases) {
    console.log('---');
    console.log('Input: ', input);
    const parsed = parseSMILES(input);
    if (parsed.errors.length > 0) {
      console.log('Parse errors:', parsed.errors.map(e => e.message || e));
      continue;
    }
    const our = generateSMILES(parsed.molecules);
    console.log('Our SMILES: ', our);

    let rdkitCanonical = '';
    try {
      const mol = RDKit.get_mol(input);
      if (mol && mol.is_valid()) rdkitCanonical = mol.get_smiles();
    } catch (e) {
      rdkitCanonical = '';
    }

    if (!rdkitCanonical) {
      console.log('RDKit could not parse input.');
      continue;
    }

    console.log('RDKit SMILES:', rdkitCanonical);
    const exact = our === rdkitCanonical;

    let ourFromRdkit = '';
    try {
      const parsedRdkit = parseSMILES(rdkitCanonical);
      if (parsedRdkit.errors.length === 0) ourFromRdkit = generateSMILES(parsedRdkit.molecules);
    } catch (e) {
      ourFromRdkit = '';
    }

    const equivalent = ourFromRdkit && our === ourFromRdkit;

    console.log('Exact match:', exact);
    console.log('Equivalent after reparsing RDKit:', equivalent);
  }

  RDKit._free();
})();
