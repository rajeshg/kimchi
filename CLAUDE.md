# kimchi Development Guide

This document describes conventions, workflows, and important commands for maintaining the kimchi cheminformatics library.

## Build & Test Commands

### Running Tests
```bash
# Run unit and integration tests
bun test

# Run full test suite including RDKit comparisons
bun run test:full
```

### Type Checking
```bash
# TypeScript strict mode type checking (required before publish)
bun run typecheck
```

### Building
```bash
# Full build (browser bundle + TypeScript declarations)
bun run build

# Browser bundle only (ESM, minified)
bun run build:browser

# TypeScript declarations (.d.ts files) only
bun run build:types
```

### Development Server
```bash
# Build and serve the interactive playground
bun run serve

# Then open http://localhost:3000/smiles-playground.html
```

## NPM Publishing Workflow

### Before Publishing

1. **Update version in package.json** — Follow semantic versioning (MAJOR.MINOR.PATCH)
   ```json
   "version": "0.2.0"
   ```

2. **Update CHANGELOG.md** — Document all changes under new version heading
   ```markdown
   ## [0.2.0] - YYYY-MM-DD
   ### Added
   - Feature description
   ### Fixed
   - Bug fix description
   ```

3. **Run type checking and tests**
   ```bash
   bun run typecheck
   bun run test
   ```

4. **Build the distribution**
   ```bash
   bun run build
   ```

### Publishing to npm

1. **Login to npm** (if not already logged in)
   ```bash
   npm login
   ```

2. **Test with dry-run** (recommended)
   ```bash
   npm publish --dry-run
   ```
   This will:
   - Run `prepublishOnly` hook (typecheck + test + build)
   - Show what files will be published
   - Verify package.json configuration
   - Ensure .npmignore is working correctly

3. **Publish to npm**
   ```bash
   npm publish
   ```
   This will:
   - Run `prepublishOnly` hook (same as dry-run)
   - Upload package to npm registry
   - Publish with "latest" tag by default

4. **Create git tag** for the release
   ```bash
   git tag -a v0.2.0 -m "Release version 0.2.0"
   git push origin v0.2.0
   ```

### After Publishing

1. **Verify package on npm**
   ```bash
   npm view kimchi@0.2.0
   npm view kimchi dist-tags
   ```

2. **Test installation from npm**
   ```bash
   mkdir test-install && cd test-install
   npm init -y
   npm install kimchi
   ```

3. **Create GitHub Release** with changelog and download link
   - Go to https://github.com/sst/kimchi/releases
   - Create new release from the git tag
   - Include CHANGELOG.md section for this version

## Package Configuration

### Key Files for Publishing

- **package.json**
  - `"version"` — Current version (updated for each release)
  - `"main"` — Points to `dist/index.js` (browser/Node.js bundle)
  - `"types"` — Points to `dist/index.d.ts` (TypeScript declarations)
  - `"files"` — Array of files to include in npm package (see below)
  - `"prepublishOnly"` — Hook that runs typecheck, test, and build before publishing

- **CHANGELOG.md** — Semantic version history for users
- **.npmignore** — Files excluded from npm package (test files, docs, etc.)
- **LICENSE** — MIT license required for npm publishing
- **dist/** — Distribution directory with compiled/bundled output
  - `index.js` — Minified ESM bundle (~196 KB)
  - `index.d.ts` — TypeScript type definitions
  - `src/` — Source maps and declaration files for debugging

### Files Published to npm

The `"files"` array in package.json controls what gets published:
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

## Code Style & Conventions

### TypeScript
- Strict mode enabled (`tsconfig.json`)
- Path aliases: `types`, `src/*`, `index`, `test/*`
- No comments unless explicitly requested
- Use interfaces for data structures, enums for constants
- Full type safety with `noUncheckedIndexedAccess` and `noImplicitOverride`

### Naming
- camelCase for variables/functions
- PascalCase for types/interfaces/enums
- Prefix private with `_` if needed

### Error Handling
- Return error arrays instead of throwing (SMILES/MOL parser convention)
- Validate inputs early and collect all errors

### Testing
- Use `bun:test` with `describe`/`it` blocks
- Test both success and error cases
- Include RDKit comparisons where applicable
- Place tests near source files (e.g., `test/` mirrors `src/`)

### Dependencies
- Prefer existing libraries over new dependencies
- Current minimal set: `webcola` (layout), `es-toolkit` (utilities)
- Never commit secrets or keys

## Known Issues & Workarounds

### Aromaticity Perception
- kimchi uses strict Hückel's rule (4n+2 π electrons)
- RDKit uses extended aromaticity perception
- This causes expected differences in complex heterocycles
- See `docs/SMARTS_AROMATICITY_ANALYSIS.md` for details

### LogP Differences
- kimchi uses published Wildman-Crippen parameters
- RDKit may use modified parameters or special cases
- Differences typically 0.2-1.15 LogP units for complex molecules
- See `docs/logp-implementation-notes.md` for validation data

### Ring Membership Counting
- kimchi follows SMARTS spec (uses SSSR only)
- RDKit deviates with extended ring sets
- See `docs/SMARTS_RING_MEMBERSHIP_ANALYSIS.md` for analysis

## Common Tasks

### Adding a New Feature
1. Create feature branch: `git checkout -b feature/description`
2. Add/modify source files in `src/`
3. Add tests in corresponding `test/` directory
4. Run `bun run typecheck && bun run test`
5. Commit with clear message
6. Create pull request

### Fixing a Bug
1. Create bug branch: `git checkout -b fix/description`
2. Write failing test first (if not already exists)
3. Fix the bug in `src/`
4. Verify test passes and no regressions
5. Run full test suite with `bun run test:full`
6. Commit and create pull request

### Running Specific Tests
```bash
# Run single test file
bun test test/smiles/smiles-parser-basic.test.ts

# Run tests matching pattern
bun test --grep "benzene"

# Run with RDKit comparisons
RUN_RDKIT_BULK=1 bun test test/rdkit-comparison/rdkit-bulk.test.ts
```

### Debugging
```bash
# Run with verbose output
bun test --verbose

# Run a single test
bun test test/file.test.ts -t "test name"
```

## Project Structure

```
kimchi/
├── src/
│   ├── generators/          # SMILES, MOL, SDF generation + SVG rendering
│   ├── parsers/             # SMILES, MOL, SDF, SMARTS parsing
│   ├── matchers/            # SMARTS pattern matching
│   ├── utils/               # Molecular properties, descriptors, analysis
│   ├── validators/          # Aromaticity, stereo, valence validation
│   ├── constants.ts
│   └── types/
├── test/
│   ├── smiles/              # SMILES parsing & generation tests
│   ├── molfile/             # MOL file tests
│   ├── sdf/                 # SDF file tests
│   ├── smarts/              # SMARTS pattern matching tests
│   ├── svg/                 # SVG rendering tests
│   ├── unit/                # Unit tests for utilities
│   └── rdkit-comparison/    # RDKit validation tests
├── docs/                    # Technical documentation
├── scripts/                 # Utility scripts for analysis
├── index.ts                 # Main entry point
├── types.ts                 # Type definitions
├── package.json
├── CHANGELOG.md             # Version history for users
├── CLAUDE.md               # This file - for developers
└── README.md               # User-facing documentation
```

## Resources

- [OpenSMILES Specification](https://www.opensmiles.org/)
- [Daylight SMARTS Specification](http://www.daylight.com/dayhtml/doc/theory/theory.smarts.html)
- [RDKit Documentation](https://www.rdkit.org/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)

## Contact & Issues

- Report bugs: https://github.com/sst/kimchi/issues
- See README.md for user documentation
- See docs/ folder for technical deep-dives
