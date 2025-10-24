#!/usr/bin/env node

/**
 * Smoke-test example for InChI WASM integration.
 * Demonstrates initialization and basic API usage in Node/Bun.
 */

import { init, molDataToInChI, getInChIKeyFromInChI } from '../dist/third-party/inchi-wasm/index.js';

async function main() {
  try {
    console.log('Initializing InChI module...');
    await init();
    console.log('InChI module initialized successfully.');

    // Example MOL data for ethanol
    const molData = `
  -OEChem-08102414552D

  3  2  0     0  0  0  0  0  0999 V2000
    1.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    2.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    3.0000    0.0000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0
  2  3  1  0
M  END
`;

    console.log('Generating InChI for ethanol...');
    const inchiResult = await molDataToInChI(molData);
    console.log('InChI Result:', inchiResult);

    if (inchiResult.inchi) {
      console.log('Generating InChIKey...');
      const keyResult = await getInChIKeyFromInChI(inchiResult.inchi);
      console.log('InChIKey Result:', keyResult);
    }

  } catch (error) {
    console.error('Error:', error.message);
    console.error('\nTo use real InChI functionality:');
    console.error('1. Add the Emscripten-generated inchi.js file to src/third-party/inchi-wasm/');
    console.error('2. Rebuild the project: bun run build');
    console.error('3. Run this example again.');
    process.exit(1);
  }
}

main();