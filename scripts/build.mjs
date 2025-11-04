#!/usr/bin/env node
import { execSync } from "child_process";
import { rmSync, cpSync, readdirSync } from "fs";
import { join } from "path";

const cwd = process.cwd();
const distDir = join(cwd, "dist");

console.log("🔨 Building openchem...\n");

// Clean dist
console.log("Cleaning dist directory...");
try {
  rmSync(distDir, { recursive: true, force: true });
} catch (_e) {
  // ignore
}

// Generate type definitions
console.log("Generating type definitions...");
execSync(
  "bunx tsc -p tsconfig.decl.json --declaration --emitDeclarationOnly --outDir dist",
  {
    cwd,
    stdio: "inherit",
  },
);

// Build bundle
console.log("Building JavaScript bundle...");
execSync("bun build index.ts --outdir ./dist --format esm --minify", {
  cwd,
  stdio: "inherit",
});

// Build third-party modules (if index.ts exists)
import { existsSync } from "fs";
if (existsSync(join(cwd, "src/third-party/inchi-wasm/index.ts"))) {
  console.log("Building third-party modules...");
  execSync(
    "bun build src/third-party/inchi-wasm/index.ts --outdir ./dist/third-party/inchi-wasm --format esm --target node",
    {
      cwd,
      stdio: "inherit",
    },
  );
}

// Copy third-party directory
console.log("Copying third-party directory...");
cpSync(join(cwd, "src/third-party"), join(distDir, "third-party"), {
  recursive: true,
});

// Clean up unwanted .d.ts files
console.log("Cleaning up generated files...");
const distFiles = readdirSync(distDir, { recursive: true });
for (const file of distFiles) {
  const filePath = join(distDir, file);
  // Keep only index.d.ts, types.d.ts, index.js, and third-party
  if (
    (file.endsWith(".d.ts") &&
      !file.includes("index.d.ts") &&
      !file.includes("types.d.ts") &&
      !file.includes("third-party")) ||
    (typeof file === "string" &&
      (file.includes("src/") ||
        file.includes("test/") ||
        file.includes("docs/") ||
        file.includes("scripts/")))
  ) {
    try {
      rmSync(filePath, { recursive: true, force: true });
    } catch (_e) {
      // ignore
    }
  }
}

console.log("\n✅ Build complete!\n");
