# Agent Guidelines for openchem

## Build/Test/Deploy Commands

### Testing
- **Run all tests**: `bun test`
- **Run single test file**: `bun test test/smiles/smiles-parser-basic.test.ts`
- **Run full test suite with RDKit**: `bun test:full` or `RUN_RDKIT_BULK=1 bun test`
- **Run tests matching pattern**: `bun test --grep "benzene"`
- **Type check**: `bun run tsc --noEmit` or `bun run typecheck`

### Building
- **Full build** (browser bundle + TypeScript declarations): `bun run build`
- **Browser bundle only** (ESM, minified): `bun run build:browser`
- **TypeScript declarations only** (.d.ts files): `bun run build:types`

### Development Server
- **Build and serve**: `bun run serve` → then open http://localhost:3000/smiles-playground.html

### Publishing to npm
1. **Before publishing**:
   - Update version in `package.json` (follow semantic versioning)
   - Update `CHANGELOG.md` with changes
   - Run `bun run typecheck && bun run test && bun run build`

2. **Dry-run publish** (recommended):
   ```bash
   npm publish --dry-run
   ```

3. **Actual publish**:
   ```bash
   npm login  # if not logged in
   npm publish
   ```

4. **After publish**:
   - Create git tag: `git tag -a v0.2.0 -m "Release version 0.2.0" && git push origin v0.2.0`
   - Verify: `npm view openchem@0.2.0` and `npm view openchem dist-tags`

## Code Style Guidelines

### Imports
- Separate type imports: `import type { Atom, Bond } from 'types';`
- Group imports: types first, then external packages, then internal modules
- **Use path aliases** (not relative paths):
  - `types` for `types.ts` (e.g., `import { BondType } from 'types'`)
  - `index` for `index.ts` (e.g., `import { parseSMILES } from 'index'`)
  - `src/*` for source files (e.g., `import { isOrganicAtom } from 'src/utils/atom-utils'`)
  - `test/*` for test utilities (e.g., `import { helper } from 'test/utils/helper'`)
- Note: Codebase currently has mixed usage; prefer aliases for new code

### Types & Naming
- TypeScript strict mode with full type safety (`noUncheckedIndexedAccess`, `noImplicitOverride`)
- Interfaces for data structures, enums for constants
- camelCase for variables/functions, PascalCase for types/enums
- Non-null assertions (`!`) used judiciously in tests when type safety is guaranteed

### Error Handling
- Return error arrays instead of throwing exceptions
- Validate inputs early and collect all errors

### Formatting
- 2-space indentation
- Consistent spacing around operators
- Reasonable line length, break long lines logically

### Testing
- Use bun:test with describe/it blocks
- Test both success and error cases
- Compare with RDKit where possible for validation

### Comments
- DO NOT ADD COMMENTS unless explicitly requested
- Code should be self-documenting with clear naming

## File Locations

### Core Functionality
- **SMILES Parser**: `src/parsers/smiles-parser.ts`
- **SMILES Generator**: `src/generators/smiles-generator.ts`
- **MOL Generator**: `src/generators/mol-generator.ts`
- **MOL Parser**: `src/parsers/molfile-parser.ts`
- **SDF Parser**: `src/parsers/sdf-parser.ts`
- **SDF Writer**: `src/generators/sdf-writer.ts`
- **Types**: `types.ts`

### Utilities
- **Atom utilities**: `src/utils/atom-utils.ts`
- **Bond utilities**: `src/utils/bond-utils.ts`
- **Molecular properties**: `src/utils/molecular-properties.ts`
- **Ring analysis**: `src/utils/ring-utils.ts`
- **Ring finding**: `src/utils/ring-finder.ts`
- **Aromaticity perception**: `src/utils/aromaticity-perceiver.ts`
- **Symmetry detection**: `src/utils/symmetry-detector.ts`
- **Valence calculation**: `src/utils/valence-calculator.ts`

### Validators
- **Aromaticity validator**: `src/validators/aromaticity-validator.ts`
- **Stereo validator**: `src/validators/stereo-validator.ts`
- **Valence validator**: `src/validators/valence-validator.ts`

### Drug-Likeness Assessment
- **Lipinski Rule of Five**: `checkLipinskiRuleOfFive()` in `src/utils/molecular-properties.ts`
- **Veber Rules**: `checkVeberRules()` in `src/utils/molecular-properties.ts`
- **BBB Penetration**: `checkBBBPenetration()` in `src/utils/molecular-properties.ts`
- **LogP Calculation**: `computeLogP()` in `src/utils/logp.ts`

### Generators & SVG Rendering
- **SMILES generator**: `src/generators/smiles-generator.ts`
- **MOL generator**: `src/generators/mol-generator.ts`
- **SVG renderer**: `src/generators/svg-renderer.ts` (main module)
- **SVG rendering support**: `src/generators/svg-renderer/` (coordinate-utils, stereo-bonds, double-bond-renderer, etc.)

## Dependencies
- **Runtime**: `es-toolkit` for utility functions (prefer over lodash)
- **Dev/Testing**: `bun:test` for testing, `@rdkit/rdkit` for validation
- Avoid adding new dependencies without explicit need

## Performance Optimizations

### LogP Caching

The LogP (octanol-water partition coefficient) computation is now cached using a WeakMap to dramatically improve performance for repeated calculations on the same molecule object.

**Implementation Details:**
- Cache storage: `WeakMap<Molecule, LogPCache>` in `src/utils/logp.ts`
- Entry point: `calcCrippenDescriptors(mol, includeHs?)` checks cache before SMARTS pattern matching
- Automatic cleanup: WeakMap ensures cache is garbage collected when molecule is no longer referenced
- Zero memory leaks: No need to manually clear cache

**Performance Impact:**

| Molecule | First Call | Cached Call | Speedup |
|----------|-----------|-----------|---------|
| Methane (CH₄) | 14.6 ms | 0.004 ms | 4,171× |
| Ethanol (C₂H₆O) | 24.4 ms | 0.002 ms | 10,614× |
| Aspirin (C₉H₈O₄) | 138 ms | 0.001 ms | 92,064× |
| Caffeine (C₈H₁₀N₄O₂) | 191 ms | 0.002 ms | 83,193× |
| Strychnine (C₂₁H₂₂N₂O₂) | 12.1 s | 0.003 ms | **4.6 million ×** |

**Why This Matters:**
- Bottleneck is Wildman-Crippen atom type matching (68 SMARTS patterns per atom)
- Cache hit is just a WeakMap lookup: < 0.01 ms
- Direct benefit for drug-likeness assessment (`checkLipinskiRuleOfFive()`)
- Typical drug discovery workflows process same molecules multiple times

**Usage (transparent - no code changes needed):**
```typescript
import { parseSMILES, checkLipinskiRuleOfFive } from 'index';

const aspirin = parseSMILES('CC(=O)Oc1ccccc1C(=O)O').molecules[0];

// First call: 138 ms (SMARTS pattern matching)
const result1 = checkLipinskiRuleOfFive(aspirin);

// Second call: 0.001 ms (cache hit)
const result2 = checkLipinskiRuleOfFive(aspirin);
```

## Known Issues & Workarounds

### Aromaticity Perception
- openchem uses strict Hückel's rule (4n+2 π electrons, ring-based)
- RDKit uses extended aromaticity perception (conjugated systems)
- Expected differences in complex heterocycles
- Reference: `docs/SMARTS_AROMATICITY_ANALYSIS.md`

### LogP Differences
- openchem uses published Wildman-Crippen parameters exactly
- RDKit may use modified parameters for complex heterocycles
- Typical differences: 0.2-1.15 LogP units for complex molecules
- Reference: `docs/logp-implementation-notes.md`

### Ring Membership Counting
- openchem uses all-rings (all simple cycles) for SMARTS `[Rn]` primitive
- This matches RDKit behavior but deviates from strict SMARTS spec (SSSR only)
- SSSR rings still computed and stored in `molecule.rings`
- Reference: `docs/SMARTS_RING_MEMBERSHIP_ANALYSIS.md`

## Common Development Tasks

### Adding a New Feature
1. Create feature branch: `git checkout -b feature/description`
2. Add/modify source files in `src/`
3. Add tests in corresponding `test/` directory
4. Run `bun run typecheck && bun run test`
5. Commit with clear message (use conventional commits format)
6. Create pull request

### Fixing a Bug
1. Create bug branch: `git checkout -b fix/description`
2. Write failing test first (if not already exists)
3. Fix the bug in `src/`
4. Verify test passes and check for regressions: `bun run test:full`
5. Commit and create pull request

### Running Specific Tests
```bash
# Run single test file
bun test test/smiles/smiles-parser-basic.test.ts

# Run tests matching pattern
bun test --grep "benzene"

# Run with RDKit comparisons
RUN_RDKIT_BULK=1 bun test test/rdkit-comparison/rdkit-bulk.test.ts

# Verbose output
bun test --verbose

# Run a single test by name
bun test test/file.test.ts -t "test name"
```

### Debugging
```bash
# Run with verbose output
bun test --verbose

# Run a single test
bun test test/file.test.ts -t "test name"

# Print debug info (add console.log to your code)
bun test test/file.test.ts 2>&1 | head -100

# Run specific test with pattern matching
bun test --grep "pattern"

# Run with test output captured
bun test test/file.test.ts 2>&1
```

## Project Structure Summary

```
openchem/
├── src/
│   ├── generators/          # SMILES, MOL, SDF generation
│   ├── parsers/             # SMILES, MOL, SDF, SMARTS parsing
│   ├── matchers/            # SMARTS pattern matching
│   ├── utils/               # Molecular properties, analysis, descriptors
│   ├── validators/          # Aromaticity, stereo, valence validation
│   ├── types/               # Type definitions
│   └── constants.ts
├── test/                    # Test suite (66 files, 1094 tests)
├── docs/                    # Technical documentation
├── scripts/                 # Utility scripts for analysis
├── AGENTS.md               # This file - for AI agents and developers
├── CHANGELOG.md            # Version history
├── README.md               # User documentation
├── package.json            # Package configuration
├── index.ts                # Main entry point
└── types.ts                # Core type definitions
```

## NPM Package Configuration

### Key Files for Publishing

- **package.json**
  - `"version"` — Current version (updated for each release)
  - `"main"` — Points to `dist/index.js` (browser/Node.js bundle)
  - `"types"` — Points to `dist/index.d.ts` (TypeScript declarations)
  - `"files"` — Array of files to include in npm package
  - `"prepublishOnly"` — Hook that runs typecheck, test, and build before publishing

- **CHANGELOG.md** — Semantic version history for users
- **.npmignore** — Files excluded from npm package (test files, docs, etc.)
- **LICENSE** — MIT license required for npm publishing
- **dist/** — Distribution directory with compiled/bundled output
  - `index.js` — Minified ESM bundle
  - `index.d.ts` — TypeScript type definitions

### Files Published to npm
```json
"files": [
  "dist",           // Compiled JavaScript and types
  "index.ts",       // Entry point
  "types.ts",       // Type definitions
  "README.md",      // Documentation
  "LICENSE"         // License file
]
```

Everything else (test/, docs/, scripts/, etc.) is excluded via .npmignore.

### After Publishing

1. **Verify package on npm**
   ```bash
   npm view openchem@0.2.0
   npm view openchem dist-tags
   ```

2. **Test installation from npm**
   ```bash
   mkdir test-install && cd test-install
   npm init -y
   npm install openchem
   ```

3. **Create GitHub Release**
   - Go to https://github.com/sst/openchem/releases
   - Create new release from the git tag
   - Include CHANGELOG.md section for this version

## Resources & References

- [OpenSMILES Specification](https://www.opensmiles.org/)
- [Daylight SMARTS Specification](http://www.daylight.com/dayhtml/doc/theory/theory.smarts.html)
- [RDKit Documentation](https://www.rdkit.org/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)

## Links

- Report bugs: https://github.com/sst/openchem/issues
- User docs: README.md
- Technical docs: docs/ folder
