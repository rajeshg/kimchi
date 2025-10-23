import { parseSMILES } from 'index';
import { performance } from 'node:perf_hooks';
import * as fs from 'node:fs';

const INPUT = 'test/pubchem-10.txt';
const OUTPUT = 'smiles-parse-comparison.csv';

let RDKit: any = null;
async function initRDKit() {
  const rdkitModule = await import('@rdkit/rdkit').catch(() => null);
  if (!rdkitModule) {
    throw new Error('RDKit is not available. Install with: npm install @rdkit/rdkit');
  }
  const initRDKitModule = rdkitModule.default;
  RDKit = await (initRDKitModule as any)();
}


function parseWithTimeout<T>(fn: () => T, timeoutMs: number): Promise<{ result: T | null; timedOut: boolean; time: number }> {
  return new Promise((resolve) => {
    const start = performance.now();
    let finished = false;
    const timer = setTimeout(() => {
      if (!finished) {
        finished = true;
        resolve({ result: null, timedOut: true, time: performance.now() - start });
      }
    }, timeoutMs);
    Promise.resolve()
      .then(() => fn())
      .then((result) => {
        if (!finished) {
          finished = true;
          clearTimeout(timer);
          resolve({ result, timedOut: false, time: performance.now() - start });
        }
      })
      .catch(() => {
        if (!finished) {
          finished = true;
          clearTimeout(timer);
          resolve({ result: null, timedOut: false, time: performance.now() - start });
        }
      });
  });
}


function parseWithRDKit(smiles: string): { success: boolean; time: number; timedOut: boolean } {
  const start = performance.now();
  let success = false;
  try {
    const mol = RDKit.get_mol(smiles);
    success = !!mol && mol.is_valid();
    if (mol) mol.delete();
  } catch {
    success = false;
  }
  const end = performance.now();
  return { success, time: end - start, timedOut: false };
}

async function parseWithOpenchemTimeout(smiles: string, timeoutMs = 3000): Promise<{ success: boolean; time: number; timedOut: boolean }> {
  const { result, timedOut, time } = await parseWithTimeout(() => {
    let success = false;
    try {
      const result = parseSMILES(smiles);
      success = !Array.isArray(result) || result.length === 0;
    } catch {
      success = false;
    }
    return success;
  }, timeoutMs);
  return { success: result === true, time, timedOut };
}

async function main() {
  await initRDKit();
  const lines = fs.readFileSync(INPUT, 'utf8').split(/\r?\n/).filter(Boolean);
  fs.writeFileSync(OUTPUT, 'smiles,rdkit_success,openchem_success,rdkit_time_ms,openchem_time_ms,which_faster\n');
  for (let i = 0; i < lines.length; ++i) {
    if (i % 20 === 0 && i > 0) {
      console.log(`Processed ${i} of ${lines.length} lines...`);
    }
    const smileline = lines[i];
    if (!smileline) continue;
    const parts = smileline.trim().split(/\s+/);
    if (parts.length < 2) continue;
    const smiles = parts[1];
    if (!smiles) continue;
    const rdkit = parseWithRDKit(smiles);
    const openchem = await parseWithOpenchemTimeout(smiles, 3000);
    const which = rdkit.timedOut && openchem.timedOut
      ? 'timeout-both'
      : rdkit.timedOut
      ? 'openchem'
      : openchem.timedOut
      ? 'rdkit'
      : rdkit.time < openchem.time
      ? 'rdkit'
      : openchem.time < rdkit.time
      ? 'openchem'
      : 'equal';
    const line = [
      JSON.stringify(smiles),
      rdkit.timedOut ? 'timeout' : rdkit.success ? 'yes' : 'no',
      openchem.timedOut ? 'timeout' : openchem.success ? 'yes' : 'no',
      rdkit.time.toFixed(2),
      openchem.time.toFixed(2),
      which,
    ].join(',') + '\n';
    fs.appendFileSync(OUTPUT, line);
  }
  console.log(`Wrote results to ${OUTPUT}`);
}

main();
