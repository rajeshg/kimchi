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

**IMPORTANT**: Don't ever publish without explicit instruction to publish a package to npm
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
- Avoid verbose method documentation (e.g., JSDoc). Limit to 3 lines maximum if needed.
- Do not add comments unless explicitly requested.
- Ensure code is self-documenting through clear and descriptive naming.

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

### Morgan Fingerprints

Morgan fingerprints (ECFP-like) are computed in `src/utils/morgan-fingerprint.ts` for molecular similarity searching and compound classification.

**Implementation Details:**
- Algorithm: Extended-Connectivity Fingerprints (ECFP) via Morgan algorithm
- Radius: Configurable (default = 2, equivalent to ECFP4)
- Bit length: Configurable (default = 512 bits, supports 2048 for large libraries)
- Hash method: SMARTS-inspired atom typing with XOR folding
- Performance: < 1 ms for molecules up to 1000 atoms

**Key Functions:**
- `computeMorganFingerprint(mol, radius?, fpSize?)` — Generate Morgan fingerprint
- `tanimotoSimilarity(fp1, fp2)` — Compute Tanimoto similarity between two fingerprints
- `getBitsSet(fingerprint)` — Count number of bits set to 1

**Realistic Bit Density:**

From validation on 28 diverse drug-like molecules:

| Molecule Type | Typical Density | Examples |
|---|---|---|
| Small aliphatic | 0.59%–1.17% | Cyclohexane, n-pentane |
| Aromatic | 1.47%–2.15% | Benzene, toluene, naphthalene |
| Drug-like | 2.00%–3.50% | Aspirin, ibuprofen, caffeine |
| Complex polycyclic | 3.00%–5.27% | Steroids, alkaloids, camphor |

**Practical Guidelines:**
- Average bit density: **2.49% (13 bits out of 512)**
- For 2048-bit fingerprints: multiply by ~4× (52 bits typical)
- Simple molecules: expect < 1.5% density
- Complex molecules: expect 3.0%–5.5% density
- Highly substituted/heteroatom-rich: may exceed 5.5%

**Usage Example:**
```typescript
import { parseSMILES, computeMorganFingerprint, tanimotoSimilarity } from 'index';

const mol1 = parseSMILES('CC(=O)Oc1ccccc1C(=O)O').molecules[0];  // Aspirin
const mol2 = parseSMILES('CC(C)Cc1ccc(cc1)C(C)C(=O)O').molecules[0];  // Ibuprofen

const fp1 = computeMorganFingerprint(mol1, 2, 512);
const fp2 = computeMorganFingerprint(mol2, 2, 512);

const similarity = tanimotoSimilarity(fp1, fp2);
console.log(`Tanimoto similarity: ${(similarity * 100).toFixed(1)}%`);
```

**Applications:**
- Compound library screening and deduplication
- Similarity-based searching in chemical databases
- Clustering compounds by structural similarity
- Virtual screening for drug discovery
- Assessing molecular diversity

**Accuracy & Validation:**
- **Internally consistent**: same molecule always produces identical fingerprint
- **Structurally similar molecules have similar fingerprints**
- **Tanimoto similarity validated** against diverse compound sets
- **Matches RDKit C++ exactly**: validated in `test/rdkit-comparison/morgan-fingerprint-comparison.test.ts` (75 molecules)
- **Tested on 28 diverse molecules**: consistent fingerprints with correct structural differentiation (`test/rdkit-comparison/morgan-fingerprint-diverse.test.ts`)
- Performance comparable to RDKit for similarity searching

**Test Files (Authoritative Reference):**
- `test/rdkit-comparison/morgan-fingerprint-comparison.test.ts` — Main validation against RDKit C++ (75 molecules)
- `test/rdkit-comparison/morgan-fingerprint-diverse.test.ts` — Diverse molecule testing (28 molecules, fingerprint stability)

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

## Ring Analysis and SSSR

### Overview

openchem provides comprehensive ring detection via `src/utils/ring-analysis.ts`, including:
- **Elementary ring detection** via depth-first search (DFS) cycle detection
- **SSSR (Smallest Set of Smallest Rings)** computation (also called Minimum Cycle Basis, MCB)
- **Ring classification** (isolated, fused, spiro, bridged)
- **Ring queries** (which rings contain an atom, aromatic rings, etc.)

### Mathematical Basis

**SSSR Count Formula** (for connected graphs):
```
rank = M - N + 1
where:
  M = number of bonds (edges)
  N = number of atoms (vertices)
  rank = minimum number of independent cycles
```

**Examples:**
- **Cyclohexane** (C₆H₁₂): M=6, N=6 → rank=1 (one 6-membered ring)
- **Bicyclo[2.2.1]heptane** (C₇H₁₂): M=7, N=7 → rank=1 (fused 5+6 membered rings share edge)
- **Adamantane** (C₁₀H₁₆): M=12, N=10 → rank=3 (three independent 6-membered rings)

### Key Functions

**Ring Detection:**
- `findRings(atoms, bonds)` — Detect all elementary (simple) cycles using DFS
- `findSSSR(rings)` — Compute SSSR from elementary rings
- `findMCB(atoms, bonds)` — Alias for `findSSSR` (MCB = SSSR)

**Ring Classification:**
- `classifyRingSystems(atoms, bonds, rings)` — Categorize rings as isolated/fused/spiro/bridged
- `isPartOfFusedSystem(ringIdx, classification)` — Check if ring is part of fused system

**Ring Queries:**
- `analyzeRings(molecule)` — Get comprehensive `RingInfo` query interface
- `getRingsContainingAtom(atom, rings)` — Which rings contain this atom?
- `getRingAtoms(ring, atoms)` — Get Atom objects for a ring
- `getRingBonds(ring, bonds)` — Get Bond objects for a ring
- `getAromaticRings(rings, atoms)` — Filter to aromatic rings only

### Performance Characteristics

| Operation | Time Complexity | Notes |
|-----------|------------------|-------|
| `findRings()` | O(N²) to O(N³) | DFS-based; worst case for dense graphs |
| `findSSSR()` | O(rank²) | Fast for simple molecules; rank ≈ 3-5 typical |
| `classifyRingSystems()` | O(rank²) | Analyzes relationships between rings |
| Ring queries | O(rank) or O(N) | Linear in ring count or atom count |

**Practical performance:**
- Simple molecules (< 30 atoms): < 1 ms
- Drug-like molecules (30-60 atoms): 1-5 ms
- Complex polycyclic (60+ atoms): 5-50 ms
- Caching ring analysis via `analyzeRings()` provides O(1) query access

### When to Use SSSR vs All Rings

**Use SSSR when:**
- Computing molecular properties (# rings, aromaticity)
- SMARTS `[Rn]` pattern matching (strict spec compliance)
- Need minimal representation of ring structure
- Memory efficiency is important

**Use all elementary rings when:**
- Need complete understanding of all possible cycles
- Analyzing ring similarity or resonance structures
- Debugging ring perception issues
- Chemical intuition requires all cycles (e.g., bridgehead analysis)

**Practical guideline:**
- For molecules < 20 atoms with up to 5 rings: both are equivalent
- For polycyclic systems (adamantane, cubane, basketane): SSSR is more efficient
- For fused aromatics (naphthalene, anthracene): both methods identify the same 2-3 core rings

### Implementation Details

**SSSR Algorithm (implemented in openchem):**
1. Find all elementary rings using DFS
2. Select minimal set that represents all bonds and atoms in rings
3. Verify mathematical rank constraint (M - N + 1 = number of SSSR rings)
4. Validate fused ring geometry

**Ring membership counting for `[Rn]` primitives:**
- Count how many SSSR rings contain each atom
- Atom in N SSSR rings → matches `[RN]` in SMARTS
- Example: adamantane atom #3 is in 3 SSSR rings → matches `[R3]`

### Known Differences with RDKit

**Adamantane ring membership:**
- openchem `[R3]`: 1 atom (atom #3, the bridgehead) — **correct per SMARTS spec**
- RDKit `[R3]`: 4 atoms (bridgehead carbons #1,3,5,7) — uses extended ring set

**Root cause:**
- openchem uses strict SSSR (3 rings for adamantane)
- RDKit uses extended ring detection (includes bridging cycles)

For compliance with SMARTS specification, openchem's approach is correct. RDKit's behavior is more chemically intuitive but deviates from the formal SMARTS definition.

See `docs/SMARTS_RING_MEMBERSHIP_ANALYSIS.md` for detailed analysis.

### Usage Examples

```typescript
import { parseSMILES, analyzeRings } from 'index';

const benzene = parseSMILES('c1ccccc1').molecules[0];
const ringInfo = analyzeRings(benzene);

// Query methods
console.log(ringInfo.ringCount);                    // 1
console.log(ringInfo.aromaticRings.length);        // 1
console.log(ringInfo.getRingsContainingAtom(0));   // [ring 0]

// Adamantane has 3 SSSR rings
const adamantane = parseSMILES('C1C2CC3CC1CC(C2)C3').molecules[0];
const adamRings = analyzeRings(adamantane);
console.log(adamRings.ringCount);                  // 3
console.log(adamRings.classifyRingSystems());      // bridged system
```

### References

- SSSR algorithm: Smallest Set of Smallest Rings (Horton 1987, SSSR uniqueness proof)
- Minimum Cycle Basis: Algebraic graph theory foundation (Whitney 1935)
- SMARTS `[Rn]`: `docs/SMARTS_RING_MEMBERSHIP_ANALYSIS.md`
- Ring analysis source: `src/utils/ring-analysis.ts` (19 functions, comprehensive JSDoc)

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
