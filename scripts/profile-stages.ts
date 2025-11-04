import * as fs from "node:fs";
import { performance } from "node:perf_hooks";

// Timing tracking
let timings = {
  tokenize: 0,
  buildGraph: 0,
  validateAromaticity: 0,
  validateValences: 0,
  validateStereo: 0,
  perceiveAromaticity: 0,
  enrichMolecule: 0,
  total: 0,
};

interface ProfilingResult {
  smiles: string;
  smilesLength: number;
  atoms: number;
  bonds: number;
  timings: typeof timings;
}

// We need to create a modified parser that tracks timings
// For now, let's profile at the whole-function level
function profileParseSMILES(smiles: string): ProfilingResult | null {
  // Create a fresh timings object for each parse
  const timingsObj = {
    tokenize: 0,
    buildGraph: 0,
    validateAromaticity: 0,
    validateValences: 0,
    validateStereo: 0,
    perceiveAromaticity: 0,
    enrichMolecule: 0,
    total: 0,
  };
  try {
    // Import dynamically to get fresh module
    const { parseSMILES } = require("../index");
    const result = parseSMILES(smiles, timingsObj);
    if (!result || !result.molecules || result.molecules.length === 0) {
      return null;
    }
    const mol = result.molecules[0];
    return {
      smiles: smiles.substring(0, 60),
      smilesLength: smiles.length,
      atoms: mol.atoms.length,
      bonds: mol.bonds.length,
      timings: { ...timingsObj },
    };
  } catch (error) {
    console.error(`Error parsing SMILES: ${smiles.substring(0, 60)}`);
    return null;
  }
}

async function main() {
  const INPUT = "test/pubchem-10.txt";

  if (!fs.existsSync(INPUT)) {
    console.error(`File not found: ${INPUT}`);
    process.exit(1);
  }

  const lines = fs.readFileSync(INPUT, "utf8").split(/\r?\n/).filter(Boolean);
  console.log(`Profiling ${lines.length} SMILES strings...\n`);

  const results: ProfilingResult[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    const parts = line.trim().split(/\s+/);
    if (parts.length < 2) continue;

    const smiles = parts[1];
    if (!smiles) continue;

    const result = profileParseSMILES(smiles);
    if (result) {
      results.push(result);
    }

    if ((i + 1) % 100 === 0) {
      console.log(`Processed ${i + 1} / ${lines.length}`);
    }
  }

  // Sort by total time
  results.sort((a, b) => b.timings.total - a.timings.total);
  console.log(
    "Timings (ms): tokenize, buildGraph, validateAromaticity, validateValences, validateStereo, perceiveAromaticity, enrichMolecule, total",
  );
  for (const r of results) {
    console.log(
      `${r.smiles} | ${r.timings.tokenize.toFixed(2)}, ${r.timings.buildGraph.toFixed(2)}, ${r.timings.validateAromaticity.toFixed(2)}, ${r.timings.validateValences.toFixed(2)}, ${r.timings.validateStereo.toFixed(2)}, ${r.timings.perceiveAromaticity.toFixed(2)}, ${r.timings.enrichMolecule.toFixed(2)}, ${r.timings.total.toFixed(2)}`,
    );
  }
  console.log("\n=== TOP 20 SLOWEST SMILES ===\n");
  console.log("Rank | Time (ms) | Atoms | Bonds | Length | SMILES");
  console.log("-".repeat(100));

  for (let i = 0; i < Math.min(20, results.length); i++) {
    const r = results[i];
    if (!r) continue;
    console.log(
      `${String(i + 1).padStart(4)} | ` +
        `${r.timings.total.toFixed(2).padStart(9)} | ` +
        `${String(r.atoms).padStart(5)} | ` +
        `${String(r.bonds).padStart(5)} | ` +
        `${String(r.smilesLength).padStart(6)} | ` +
        `${r.smiles}`,
    );
  }

  // Statistics
  const times = results.map((r) => r.timings.total);
  const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
  const maxTime = Math.max(...times);
  const minTime = Math.min(...times);

  console.log("\n=== STATISTICS ===");
  console.log(`Total molecules: ${results.length}`);
  console.log(`Average time: ${avgTime.toFixed(2)}ms`);
  console.log(`Min time: ${minTime.toFixed(2)}ms`);
  console.log(`Max time: ${maxTime.toFixed(2)}ms`);
  console.log(
    `Median time: ${times.sort((a, b) => a - b)[Math.floor(times.length / 2)]?.toFixed(2)}ms`,
  );

  // Analyze by size
  const bySize = [
    {
      label: "Small (<50 chars)",
      filter: (r: ProfilingResult) => r.smilesLength < 50,
    },
    {
      label: "Medium (50-100)",
      filter: (r: ProfilingResult) =>
        r.smilesLength >= 50 && r.smilesLength < 100,
    },
    {
      label: "Large (100-200)",
      filter: (r: ProfilingResult) =>
        r.smilesLength >= 100 && r.smilesLength < 200,
    },
    {
      label: "XLarge (200+)",
      filter: (r: ProfilingResult) => r.smilesLength >= 200,
    },
  ];

  console.log("\n=== BY SIZE ===");
  for (const category of bySize) {
    const subset = results.filter(category.filter);
    if (subset.length > 0) {
      const subTimes = subset.map((r) => r.timings.total);
      const subAvg = subTimes.reduce((a, b) => a + b, 0) / subTimes.length;
      const subMax = Math.max(...subTimes);
      console.log(`${category.label}: ${subset.length} molecules`);
      console.log(`  Avg: ${subAvg.toFixed(2)}ms, Max: ${subMax.toFixed(2)}ms`);
    }
  }
}

main().catch(console.error);
