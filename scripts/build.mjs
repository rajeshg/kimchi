#!/usr/bin/env node
import { execSync } from 'child_process';
import { rmSync, cpSync, readdirSync } from 'fs';
import { join } from 'path';

const cwd = process.cwd();
const distDir = join(cwd, 'dist');

console.log('🔨 Building openchem...\n');

// Clean dist
console.log('Cleaning dist directory...');
try {
  rmSync(distDir, { recursive: true, force: true });
} catch (e) {
  // ignore
}

// Generate type definitions
console.log('Generating type definitions...');
execSync('bunx tsc --noEmit false --declaration --emitDeclarationOnly --outDir dist --skipLibCheck', {
  cwd,
  stdio: 'inherit',
});

// Build bundle
console.log('Building JavaScript bundle...');
execSync('bun build index.ts --outdir ./dist --format esm', {
  cwd,
  stdio: 'inherit',
});

// Clean up unwanted .d.ts files
console.log('Cleaning up generated files...');
const distFiles = readdirSync(distDir, { recursive: true });
for (const file of distFiles) {
  const filePath = join(distDir, file);
  // Keep only index.d.ts, types.d.ts, and index.js
  if (
    (file.endsWith('.d.ts') && !file.includes('index.d.ts') && !file.includes('types.d.ts')) ||
    (typeof file === 'string' && (file.includes('src/') || file.includes('test/') || file.includes('docs/') || file.includes('scripts/')))
  ) {
    try {
      rmSync(filePath, { recursive: true, force: true });
    } catch (e) {
      // ignore
    }
  }
}

console.log('\n✅ Build complete!\n');
