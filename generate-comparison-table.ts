
import { parseSMILES } from './src/parsers/smiles-parser';
import { renderSVG } from './src/generators/svg-renderer';
import { initializeRDKit } from './test/smarts/rdkit-comparison/rdkit-smarts-api';
import { promises as fs } from 'fs';

const smilesList = [
  'c1ccccc1', // Benzene
  'CCO', // Ethanol
  'CC(=O)Oc1ccccc1C(=O)O', // Aspirin
  'Cn1cnc2c1c(=O)n(C)c(=O)n2C', // Caffeine
  'C[C@H](O)C(=O)O', // L-Lactic Acid
  'C1CC1', // Cyclopropane
];

async function generateComparisonTable() {
  const rdkit = await initializeRDKit();
  let html = `
<html>
<head>
  <title>Kimchi vs RDKit SVG Comparison</title>
  <style>
    body { font-family: sans-serif; }
    table { border-collapse: collapse; }
    th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
    th { background-color: #f2f2f2; }
    td { vertical-align: top; }
    svg { width: 250px; height: 200px; }
  </style>
</head>
<body>
  <h1>Kimchi vs RDKit SVG Comparison</h1>
  <table>
    <tr>
      <th>SMILES</th>
      <th>RDKit</th>
      <th>Kimchi</th>
    </tr>
`;

  for (const smiles of smilesList) {
    // Generate Kimchi SVG
    const kimchiResult = parseSMILES(smiles);
    const kimchiMolecule = kimchiResult.molecules[0];
    let kimchiSVG = '';
    if (kimchiMolecule) {
      const { svg } = renderSVG(kimchiMolecule);
      kimchiSVG = svg;
    }

    // Generate RDKit SVG
    const rdkitMolecule = rdkit.get_mol(smiles);
    const rdkitSVG = rdkitMolecule.get_svg();
    rdkitMolecule.delete();

    html += `
    <tr>
      <td><pre>${smiles}</pre></td>
      <td>${rdkitSVG}</td>
      <td>${kimchiSVG}</td>
    </tr>
`;
  }

  html += `
  </table>
</body>
</html>
`;

  await fs.writeFile('comparison.html', html);
  console.log('Generated comparison.html');
}

generateComparisonTable().catch(console.error);
