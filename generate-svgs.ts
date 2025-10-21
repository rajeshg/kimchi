import { parseSMILES } from './index';
import { renderSVG } from './src/generators/svg-renderer';

const testMolecules = [
  'c1ccccc1',
  'CCO',
  'CC(=O)Oc1ccccc1C(=O)O',
  'Cn1cnc2c1c(=O)n(C)c(=O)n2C',
  'C[C@H](O)C(=O)O',
  'C1CC1',
  'CC(C)Cc1ccc(cc1)C(C)C(=O)O',
  'C1=CC=C(C=C1)C1=CC=CC=C1',
  'CC(C)(C)c1ccc(O)cc1',
  'CCCCCCCCCCc1ccccc1',
];

const results = [];

for (const smiles of testMolecules) {
  const result = parseSMILES(smiles);
  if (result.molecules.length > 0) {
    const mol = result.molecules[0]!;
    const svgResult = renderSVG(mol, { width: 250, height: 200 });
    results.push({ smiles, svg: svgResult.svg });
  }
}

console.log(JSON.stringify(results, null, 2));
