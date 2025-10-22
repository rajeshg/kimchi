// TODO: stick-diagram generator not implemented
// import { renderStickDiagramFromMolfile, renderStickDiagramFromSMILES } from 'src/generators/stick-diagram';

// Small ethanol molfile (V2000) used as an example
const ethanolMol = `ethanol
  opencode

  3  2  0  0  0  0  0  0  0  0999 V2000
    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0
    1.5000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0
    2.2500    1.2990    0.0000 O   0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0  0  0  0
  2  3  1  0  0  0  0
M  END
`;

console.log('\n--- Stick diagram from MOL file (ethanol) ---\n');
// console.log(renderStickDiagramFromMolfile(ethanolMol, { width: 60, height: 12, labelMode: 'symbol' })); // TODO: stick-diagram generator missing

// SMILES fallback example (benzene)
const benzeneSmiles = 'c1ccccc1';
console.log('\n--- Stick diagram from SMILES (fallback schematic) ---\n');
// console.log(renderStickDiagramFromSMILES(benzeneSmiles)); // TODO: stick-diagram generator missing

console.log('\nExample complete.');
