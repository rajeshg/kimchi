import { parseSMILES } from './index';
import { renderSVG } from './src/generators/svg-renderer';
import * as fs from 'fs';

const testMolecules = [
  // Simple aromatics and rings
  'c1ccccc1', // benzene
  'c1ccncc1', // pyridine
  'c1cc2ccccc2cc1', // naphthalene
  'C1CC1', // cyclopropane
  'C1CCCCC1', // cyclohexane
  'C1CC2CC1CC2', // bicyclo
  'C1=CC=C2C(=C1)C=CC=C2', // naphthalene (alt)

  // Alkanes, alkenes, alkynes
  'CCO', // ethanol
  'CC(C)=O', // acetone
  'CC(C)C', // isobutane
  'C#N', // hydrogen cyanide
  'C(CO)O', // ethylene glycol
  'CCCCCCCCCCc1ccccc1', // decylbenzene
  'C/C=C/C', // (E)-2-butene

  // Functional groups
  'CC(=O)Oc1ccccc1C(=O)O', // aspirin
  'Cn1cnc2c1c(=O)n(C)c(=O)n2C', // caffeine
  'CC(=O)NCCC1=CNc2c1cc(OC)cc2', // melatonin
  'CC(=O)NC1=CC=C(O)C=C1', // paracetamol
  'CC(=O)O', // acetic acid
  'CCN(CC)CC', // triethylamine
  'CC(=O)N', // acetamide
  'CCS', // ethanethiol
  'CCCl', // chloroethane
  'CCBr', // bromoethane
  'CC(=O)C', // acetone
  'CC[N+](C)(C)C', // tetramethylammonium
  'CC[N-](C)(C)C', // hypothetical anion
  'CC[NH2+]C', // protonated amine
  'CC[NH]C', // secondary amine
  'CC[NH2]C', // primary amine
  'CC[NH3+]C', // ammonium
  'CC[N+](C)(C)C', // quaternary ammonium
  'CC(=O)[O-]', // acetate anion
  'C[N+](C)(C)C', // tetramethylammonium
  'C[N+](C)(C)C.[Cl-]', // tetramethylammonium chloride
  '[Na+].[Cl-]', // sodium chloride
  '[NH4+]', // ammonium
  'C[N+](C)(C)C', // tetramethylammonium
  'C[N+](C)(C)C.[Br-]', // tetramethylammonium bromide
  'C[N+](C)(C)C.[I-]', // tetramethylammonium iodide
  'C[N+](C)(C)C.[F-]', // tetramethylammonium fluoride
  'C[N+](C)(C)C.[NO3-]', // tetramethylammonium nitrate
  'C[N+](C)(C)C.[HSO4-]', // tetramethylammonium hydrogen sulfate
  'C[N+](C)(C)C.[PF6-]', // tetramethylammonium hexafluorophosphate

  // Stereochemistry
  'C[C@H](O)C(=O)O', // lactic acid (R)
  'N[C@@H](C)C(=O)O', // alanine (S)
  'F/C=C/F', // (E)-1,2-difluoroethene
  'F/C=C\F', // (Z)-1,2-difluoroethene
  'C1=CC[C@H](C)CC1', // chiral cyclohexene
  'C[C@H](N)C(=O)O', // alanine
  'C[C@@H](N)C(=O)O', // alanine (enantiomer)

  // Macrocycles, bridged, fused
  'C1CCCCCCCCCCCC1', // cyclododecane
  'C1CC2CCC1C2', // bicyclo[3.3.0]octane
  'C1=CC2=CC=CC=C2C=C1', // phenanthrene
  'C1=CC2=C3C=CC=CC3=CC=C2C=C1', // triphenylene
  'C1CC2C3CC1CC(C2)C3', // adamantane

  // Biologically relevant
  'CC(C)CC1=CC=C(C=C1)C(C)C(=O)O', // ibuprofen
  'CC(C)C1=CC(=C(C=C1)O)C(C)C(=O)O', // naproxen
  'CC1=C(C(=O)NC(=O)N1)N', // cytosine
  'C1=NC2=C(N1)N=CN2C', // adenine
  'C1=NC=CN1', // imidazole
  'C1=CC(=O)NC(=O)N1', // uracil
  'C1=CC(=O)NC(=O)N1', // thymine
  'C1=CC(=O)NC(=O)N1', // guanine
  'C1=CC(=O)NC(=O)N1', // xanthine
  'CC(C)C(C(=O)O)N', // valine
  'CC(C)CC(C(=O)O)N', // leucine
  'CC(C)C(C(=O)O)N', // isoleucine
  'C(C(=O)O)N', // glycine
  'CC(C)C(C(=O)O)N', // proline

  // Tautomers, zwitterions
  'C1=CC=CC=C1C(=O)C(=O)O', // benzoylformic acid
  'C1=CC=CC=C1C(=O)C(=O)[O-]', // benzoylformate anion
  'C1=CC=CC=C1C(=O)C(=O)[O-].[Na+]', // sodium benzoylformate
  'C1=CC=CC=C1C(=O)C(=O)[O-].[K+]', // potassium benzoylformate
  'C1=CC=CC=C1C(=O)C(=O)[O-].[Li+]', // lithium benzoylformate
  'C1=CC=CC=C1C(=O)C(=O)[O-].[NH4+]', // ammonium benzoylformate

  // Edge cases
  'C=C=C', // allene
  'C#CC#C', // diacetylene
  'C1=CC=CC=C1[O-]', // phenoxide
  'C1=CC=CC=C1[N+](=O)[O-]', // nitrobenzene
  'C1=CC=CC=C1C(=O)N', // benzamide
  'C1=CC=CC=C1C(=O)Cl', // benzoyl chloride
  'C1=CC=CC=C1C(=O)Br', // benzoyl bromide
  'C1=CC=CC=C1C(=O)I', // benzoyl iodide
  'C1=CC=CC=C1C(=O)F', // benzoyl fluoride
  'C1=CC=CC=C1C(=O)S', // benzoyl thiol
  'C1=CC=CC=C1C(=O)Se', // benzoyl selenol
  'C1=CC=CC=C1C(=O)Te', // benzoyl tellurol
  'C1=CC=CC=C1C(=O)Si', // benzoyl silanol
  'C1=CC=CC=C1C(=O)Ge', // benzoyl germanol
  'C1=CC=CC=C1C(=O)Sn', // benzoyl stannanol
  'C1=CC=CC=C1C(=O)Pb', // benzoyl plumbanol
];

async function generateComparison() {
  let rdkit: any = null;

  try {
    const rdkitModule = await import('@rdkit/rdkit').catch(() => null);
    if (rdkitModule) {
      const initRDKitModule = rdkitModule.default;
      rdkit = await (initRDKitModule as any)();
    }
  } catch (e) {
    console.warn('RDKit not available:', e);
  }

  function escapeHtml(s: string) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  const rows: Array<{
    smiles: string;
    rdkitSvg: string;
    openchemSvg: string;
  }> = [];

  for (const smiles of testMolecules) {
    let rdkitSvg = '';

    if (rdkit) {
      try {
        const mol = rdkit.get_mol(smiles);
        if (mol) {
          rdkitSvg = mol.get_svg();
          mol.delete();
        }
      } catch (e) {
        console.warn(`Error rendering ${smiles} with RDKit:`, e);
        rdkitSvg = '<svg><text x="10" y="20">RDKit Error</text></svg>';
      }
    } else {
      rdkitSvg = '<svg><text x="10" y="20">RDKit not available</text></svg>';
    }

    let openchemSvg = '';

    try {
      const result = parseSMILES(smiles);
      if (result.molecules.length > 0) {
        try {
          const rendered = renderSVG(result, { width: 250, height: 200 });
          openchemSvg = rendered.svg;
        } catch (e) {
          openchemSvg = `<svg><text x=\"10\" y=\"20\">openchem Error: ${String(e).substring(0, 80)}</text></svg>`;
        }
      }
    } catch (e) {
      openchemSvg = `<svg><text x=\"10\" y=\"20\">openchem Error: ${String(e).substring(0, 80)}</text></svg>`;
    }

    rows.push({ smiles, rdkitSvg, openchemSvg });
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SMILES Rendering Comparison - RDKit vs openchem</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 20px; background-color: #f5f5f5; }
    h1 { color: #333; text-align: center; margin-bottom: 20px; }
    table { width: 100%; border-collapse: collapse; background-color: white; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    th { background-color: #2c3e50; color: white; padding: 12px; text-align: left; font-weight: 600; border-bottom: 2px solid #34495e; }
    td { padding: 12px; border-bottom: 1px solid #ecf0f1; vertical-align: top; }
    tr:hover { background-color: #f9f9f9; }
    .smiles-cell { font-family: 'Courier New', monospace; font-size: 12px; background-color: #f8f9fa; padding: 8px; border-radius: 4px; word-break: break-all; max-width: 180px; }
    .svg-container { display: flex; justify-content: center; align-items: center; min-height: 160px; background-color: #fafafa; border-radius: 4px; }
    svg { max-width: 100%; height: auto; }
  </style>
</head>
<body>
   <h1>SMILES Rendering Comparison: RDKit vs openchem</h1>
   <table>
     <thead>
       <tr>
         <th>SMILES</th>
         <th>RDKit</th>
         <th>openchem</th>
       </tr>
     </thead>
     <tbody>
${rows
     .map(
       (r) => `      <tr>
         <td class="smiles-cell">${r.smiles}</td>
         <td><div class="svg-container">${r.rdkitSvg}</div></td>
         <td><div class="svg-container">${r.openchemSvg}</div></td>
       </tr>`
     )
     .join('\n')}
     </tbody>
   </table>
</body>
</html>`;

  fs.writeFileSync('./comparison.html', html);
  console.log('Generated comparison.html');
}

generateComparison().catch(console.error);
