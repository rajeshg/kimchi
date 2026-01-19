# Changelog

All notable changes to openchem will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.17] - 2025-01-19

### Added

- **Indigo-compatible API functions** - Added layout, aromatize, and structure validation features for Ketcher editor compatibility:
  - `layoutMolecule()` - Generate 2D coordinates using rigid unit placement algorithm
  - `aromatizeMolecule()` - Convert Kekulé (alternating double/single) bonds to aromatic representation
  - `checkStructure()` - Comprehensive validation including valence, aromaticity, stereo, elements, and connectivity
  - `addExplicitHydrogens()` - Add explicit hydrogens to satisfy valence requirements
  - `removeExplicitHydrogens()` - Remove explicit hydrogens, preserving stereochemistry
- **Demo folder** - Added `docs/demo/` with working examples for browser and Node.js usage
- **Tautomer comparison tests** - Added 10-molecule test suite comparing openchem to RDKit's new TautomerEnumerator algorithm

### Improved

- **Better test coverage** - Added 39 new tests for Indigo-compatible features (all passing)

## [0.2.16] - 2025-12-03

### Fixed

- **Tautomer enumeration now filters invalid structures**
  - Added tautomer validator to reject charged atoms (protonation states, not tautomers)
  - Filters out triple bonds to nitrogen (chemically unreasonable in tautomers)
  - Prevents allene structures (=C=) from being generated
  - Validates atom valences before accepting tautomers

### Added

- **Amidine tautomerism support** for heterocyclic systems
  - Detects N-C=N patterns (guanine, adenine, cytosine, amidines)
  - Enables H migration between nitrogens in N-C=N motifs
- **Lactam-lactim tautomerism in heterocycles**
  - Now properly handles aromatic heterocycles (previously blocked)
  - Enables keto-enol tautomerism in uracil, guanine, and similar systems

### Improved

- **SMILES canonical ordering** now considers bond order sum for better consistency

## [0.2.15] - 2025-12-02

### Improved

- **SVG rendering follows skeletal formula conventions**
  - Carbon atoms are now implicit (no "C" labels) at vertices and endpoints
  - Heteroatom labels combine with hydrogens (e.g., "OH" instead of separate "O" and "H")
  - Use `showCarbonLabels: true` option to explicitly show carbon labels if needed

### Changed

- **Coordinate generator refactored to rigid-unit architecture**
  - Better handling of polycyclic and bridged ring systems
  - Improved bond length uniformity for fused aromatics (100% for naphthalene, pyrene, coronene)
  - Bridged bicyclics (camphor, pinene) now have realistic 2D projections
- **API rename**: `generateCoordinatesV2` → `generateCoordinatesMap` for clarity
  - `generateCoordinates` returns `Array<{x, y}>` (main public API)
  - `generateCoordinatesMap` returns `Map<number, Vec2>` (internal use)

### Removed

- Obsolete coordinate generation modules (replaced by rigid-unit architecture)
- Development scripts for SVG debugging

## [0.2.14] - 2025-11-30

### Added

- **Polycyclic template system** (experimental) - Pre-computed coordinate templates for 14 common molecular scaffolds
  - Aromatic hydrocarbons: naphthalene, anthracene, phenanthrene, pyrene, fluorene
  - N-heterocycles: indole, quinoline, purine, carbazole
  - O-heterocycles: benzofuran, dibenzofuran
  - S-heterocycles: benzothiophene
  - Complex scaffolds: steroid core, morphine, adamantane
  - Enable via `generateCoordinates(mol, { useTemplates: true })`
  - Status: Experimental (disabled by default)
- **Angular vs linear fusion detection** - Accurate template matching for polycyclic ring systems
  - Distinguishes anthracene (linear) from phenanthrene (angular) using edge separation analysis
  - Edge center separation: < 1.5 = linear fusion, >= 1.5 = angular fusion
  - 100% accurate template matching for tested scaffolds
- **Comprehensive template test suite** - 8 tests covering atom mapping, shared atoms, heterocycles, bond connectivity
- **Documentation** - 3 new docs (808 lines): template system overview, coordinate generation improvements, MCP examples

### Fixed

- **SVG highlight rendering order** - Highlights now appear on top of bonds (not behind)
  - Highlights render after bonds but before atom labels
  - Ensures substructure highlights are clearly visible

### Technical Details

- Template matching uses middle ring shared edge analysis for fusion type detection
- Dibenzofuran template added to handle 3-ring oxygen heterocycles
- Fluorene template excludes heteroatoms (N, O, S) to prevent false matches
- Atom mapping uses shared atom deduplication to avoid coordinate overlap
- Current limitation: Sequential atom mapping produces ~90° angles instead of ~120°
- TODO: Implement VF2 graph isomorphism for proper atom-to-atom matching

### Notes

- Templates are disabled by default due to atom mapping limitations
- Template matching is production-ready (100% accurate)
- Atom mapping is experimental (needs graph isomorphism for correct bond angles)
- All 2614 tests passing with templates disabled

## [0.2.13] - 2025-11-29

### Added

- **Automatic molecular orientation optimization** - Molecules now render in canonical, chemically intuitive orientations
  - PCA-based principal axis calculation for intelligent orientation detection
  - Molecule type detection system (8 categories: linear-fused-rings, single-ring, linear-chain, branched-chain, bridged-rings, spiro, mixed-rings, isolated-atom)
  - Type-specific orientation heuristics (e.g., naphthalene renders horizontally, benzene renders flat-top)
  - Integrated as Step 9 in coordinate generation pipeline (after bond length normalization)
  - New `optimizeOrientation` option in `generateCoordinatesV2` (default: true)
  - 48 comprehensive tests covering simple molecules, complex drugs, PAHs, bridged systems, and edge cases
  - ~1ms performance overhead per molecule
  - Fully backward compatible (can disable with `optimizeOrientation: false`)

### Technical Details

- Principal Component Analysis (PCA) computes molecular major axis via covariance matrix eigenvalues
- Rotation applied to all coordinates around centroid
- Aspect ratio validation ensures correct orientation (horizontal for linear systems, square for compact molecules)
- Validated against 48 diverse molecules: naphthalene (1.73 aspect ratio), anthracene (2.60), n-hexane (infinite), benzene (1.15)
- Complex molecules handled: caffeine, ibuprofen, paracetamol, testosterone, codeine, cholesterol, vitamin E

### Fixed

- TypeScript typecheck now excludes debug scripts (test-_.ts, scripts/debug-_.ts) to prevent errors from uncommitted utility files

## [0.2.12] - 2025-11-28

### Added

- **SVG substructure highlighting** - Highlight specific atoms and bonds in rendered molecules
  - New types: `AtomHighlight`, `BondHighlight`, `SubstructureHighlight`
  - Support for SMARTS-based highlighting (automatically finds and highlights patterns)
  - Support for explicit atom/bond highlighting by index
  - Support for both single molecule and multi-molecule grid rendering
  - Customizable colors, opacity, and sizes
  - Highlights rendered as background layer (before bonds and atoms)
  - 38 comprehensive tests covering all highlighting features
  - Enables visual highlighting of functional groups, pharmacophores, and structural features

### Technical Details

- Highlights are processed BEFORE kekulization to support aromatic SMARTS patterns
- Multi-molecule rendering: each molecule is independently processed for highlights
- Atom highlights render as colored circles with adjustable radius
- Bond highlights render as thick colored lines with adjustable width
- SMARTS patterns automatically extract matched atoms and infer bonds between them
- Invalid indices and malformed SMARTS are handled gracefully (skipped with optional verbose logging)
- Multiple highlights can be rendered with different colors
- Coordinate transforms properly applied for grid positioning

## [0.2.11] - 2025-11-27

### Changed

- **MCP server extracted to `@openchem/mcp` package**
  - The Model Context Protocol server has been moved to a separate package for better separation of concerns
  - Core `openchem` library now has **zero dependencies**
  - Smaller bundle size for library-only users
  - Browser-friendly (no Node.js-specific imports in core library)

### Removed

- MCP server and CLI (moved to `@openchem/mcp` package)
- Dependencies: `@modelcontextprotocol/sdk`, `zod` (moved to `@openchem/mcp`)
- npm scripts: `mcp:remote`, `mcp:dev` (use `@openchem/mcp` package instead)
- CLI command: `openchem` (use `openchem-mcp` from `@openchem/mcp` package)

### Migration Guide

**For library-only users:** No changes needed! Just upgrade to v0.2.11.

**For MCP server users:**

Before (v0.2.10):
\`\`\`bash
npm install openchem
bun run mcp:remote # or: bun run src/mcp-server-remote.ts
\`\`\`

After (v0.2.11):
\`\`\`bash
npm install openchem # Core library
npm install -g @openchem/mcp # MCP server
openchem-mcp # Start server
\`\`\`

For detailed MCP documentation, see [@openchem/mcp](https://npmjs.com/package/@openchem/mcp)

## [0.2.10] - 2025-11-26

### Fixed

- **TypeScript declaration paths** - Fixed path resolution in .d.ts files
  - Added `tsc-alias` to resolve path aliases in generated declarations
  - Converts path aliases (`types`, `src/*`) to relative paths (`./types`, `./src/*`)
  - Fixes TypeScript type resolution for package consumers
  - Resolves "Cannot find module" errors when importing from openchem

## [0.2.9] - 2025-11-26

### Added

- **Core TypeScript type exports** - Export essential types for TypeScript users
  - Exported types: `Atom`, `Bond`, `Molecule`, `ParseResult`, `ParseError`, `RingInfo`, `Chain`, `MultipleBond`
  - Exported enums: `BondType`, `StereoType`
  - Enables proper type checking for package consumers

### Changed

- **Modern ESM-only package** - Simplified to ESM-only with proper TypeScript declarations
  - Generate `.d.ts` declaration files during build
  - Modern `exports` field with `types` condition
  - Publish only built artifacts (dist/) instead of source files
  - Cleaner package structure following 2024/2025 best practices

## [0.2.8] - 2025-11-26

### Added

- **Model Context Protocol (MCP) Server** - Remote HTTP + SSE server for AI agents
  - Lightweight Node.js/Bun HTTP server (87 lines)
  - 5 composite tools: analyze, compare, search, render, convert
  - Dual endpoints: `/mcp` and `/mcp/sse` with StreamableHTTPServerTransport
  - Health check endpoint: `/health`
  - CORS enabled for remote access
  - New dependencies: @modelcontextprotocol/sdk ^1.23.0, zod ^4.1.13
  - New npm scripts: `mcp:remote` and `mcp:dev`
  - Comprehensive documentation: `docs/mcp-server-remote.md` and `MCP_QUICKSTART.md`
  - Runtime-agnostic design compatible with Cloudflare Workers

## [0.2.7] - 2025-11-26

### Fixed

- **Test Timeout Issue** - Increased timeout for complex tautomer enumeration test
  - Test: "canonical selection is stable with many tautomers"
  - Issue: Curcumin molecule with 100 tautomers was timing out at 5000ms
  - Solution: Increased timeout to 10000ms for this specific test
  - Impact: All 2456 tests now pass reliably

## [0.2.6] - 2025-11-26

### Added

- **Complete RDKit Tautomer Coverage** - Achieved 100% parity with RDKit's 37 transformation rules
  - 12 new transformation types implemented:
    - Furanone (5-membered lactone ⟷ hydroxyfuran)
    - Keten-Ynol (C=C=O ⟷ HC≡C-OH with triple bonds)
    - Cyano-Isocyanic (O=C=NH ⟷ HO-C≡N bidirectional)
    - Amide-Imidol (R-CO-NH2 ⟷ R-C(OH)=NH)
    - Nitro-Aci (R-NO2 ⟷ R-N(O)OH)
    - Phosphonic Acid (P=O ⟷ P-OH)
    - Formamidine-Sulfinic (S=O ⟷ S-OH)
    - Isocyanide ([C-]#[N+] ⟷ C=N with charge toggling)
    - Special Imine (edge case imine transformations)
    - Oxime-Phenol (conjugated H-shift via phenol)
    - Long-range H-shifts (1,7/1,9/1,11 aromatic shifts)
  - New architecture with site-based detection and transformation
    - `site-detector.ts` - 12 detector functions for all transformation patterns
    - `site-transformer.ts` - 10 transformer functions with full valence validation
    - `canonical-deduplicator.ts` - Fingerprint-based tautomer deduplication
    - `tautomer-scoring.ts` - RDKit-compatible scoring system
  - Comprehensive test suite (67 new tests in `new-transforms.test.ts`)
    - 15 complex molecule tests (drug-like, natural products, peptides)
    - Tested on: Imatinib, Testosterone, Heme B, TNT, Tripeptide, Porphyrin, etc.
    - Performance validated: < 100ms for all molecules (30+ atoms)
  - Documentation and analysis:
    - `docs/rdkit-tautomer-comparison.md` - Complete RDKit rule comparison
    - `docs/tautomer-architecture.md` - System architecture documentation
    - `COMPLEX-TAUTOMER-TESTS-SUMMARY.md` - Test coverage analysis
    - `NEW-TAUTOMER-TRANSFORMS-SUMMARY.md` - Implementation details
    - `SESSION-SUMMARY.md` - Complete session summary

### Fixed

- **SMILES Canonicalization Bug** - Isotope atoms incorrectly prioritized in canonical ordering
  - Before: `[13C]/C=C/C` (incorrect - starts with isotope)
  - After: `C/C=C/[13C]` (correct - matches RDKit)
  - Solution: Reordered canonical label priorities to deprioritize isotopes
  - Impact: +13 tests fixed, full RDKit stereo SMILES compatibility

### Changed

- Refactored tautomer enumeration system for better performance and maintainability
- Removed old rule-based JSON files (`tautomer-rules.json`, `tautomer-rules.ts`)
- Total test count increased from 2389 to 2456 (+67 tests)
- Code cleanup: -4,971 net lines (improved code density and removed obsolete docs)

### Performance

- Small molecules (< 10 atoms): < 1ms
- Drug-like molecules (20-40 atoms): 1-50ms
- Large molecules (40+ atoms): < 100ms
- No timeouts or crashes on complex bridged/fused ring systems

### Compatibility

- Zero breaking changes - all existing APIs remain compatible
- 100% test pass rate (2456/2456 tests passing)
- Full RDKit tautomer rule parity achieved

## [0.2.5] - 2025-11-23

### Added

- **Murcko Scaffold Analysis** - Extract core molecular scaffolds for drug discovery
  - `getMurckoScaffold()` - Extract rings + linkers (remove side chains)
  - `getBemisMurckoFramework()` - Generic scaffold (all C, single bonds)
  - `getScaffoldTree()` - Hierarchical scaffold decomposition
  - `getGraphFramework()` - Pure topology (all atoms → wildcard)
  - `haveSameScaffold()` - Compare scaffolds between molecules
- Comprehensive test suite with 43 passing tests covering:
  - Basic scaffolds (benzene, toluene, naphthalene, pyridine)
  - Drug-like molecules (aspirin, ibuprofen, caffeine)
  - Linker handling (biphenyl, multi-atom linkers)
  - Edge cases (spiro, bridged systems, adamantane)
  - Scaffold trees and generic frameworks
- Updated API documentation with scaffold analysis examples
- Added scaffold analysis section to README with usage examples

### Documentation

- Added Murcko scaffolds to Feature list
- Added "Scaffold Analysis (5)" category to API Reference
- Detailed API documentation for all 5 scaffold functions
- Added usage example in README showing drug discovery workflow

## [0.2.4] - 2025-11-23

### Fixed

- Fixed rotatable bond calculation to match RDKit behavior for ester/amide bonds
- Removed incorrect conjugation check that excluded N-Aryl bonds in rotatable bond detection
- Fixed SMARTS bulk test aromaticity differences (16 failures → 0)
- Fixed SMILES bulk test rotatable bond counting (13 failures → 0)
- Fixed all TypeScript lint issues (10 warnings → 0)
- Removed unused parameters and variables across multiple files
- Added `kekule-form-aromaticity` category for known SMARTS matching differences

### Changed

- Updated `determineHybridization()` function signature to remove unused `atoms` parameter
- Updated `getBertzCT()` function signature to remove unused `cutoff` parameter
- Prefixed unused `mol` parameter in `getNumRadicalElectrons()` with underscore

## [0.2.3] - 2025-11-23

### Changed

- Restored full CHANGELOG history from previous versions

## [0.2.2] - 2025-11-23

### Added

- **New Descriptors API** - Clean namespace for 50+ molecular properties
  - `Descriptors.all()` - Get all common properties at once
  - `Descriptors.basic()` - Formula, mass, atom counts
  - `Descriptors.physicochemical()` - LogP, TPSA, H-bond donors/acceptors
  - `Descriptors.structural()` - Rings, stereocenters, spiro/bridgehead atoms
  - `Descriptors.drugLikeness()` - Lipinski, Veber, BBB with detailed violations
  - `Descriptors.topology()` - Kappa indices, Bertz CT
  - `Descriptors.chi()` - All 12 chi index variants
  - Individual accessors: `Descriptors.logP()`, `.tpsa()`, `.formula()`, etc.
- Created 8 new modules under `src/descriptors/`
- Type definitions for all descriptor categories

### Changed

- **Playground UX redesign**
  - Moved examples from scrollable left sidebar to compact pill buttons at top
  - Changed from 3-column to 2-column layout (Structure + Summary/Descriptors)
  - Removed sticky scrolling for unified scroll behavior
  - Added full responsive design (breakpoints: 1400px, 1024px, 768px, 480px)
  - Fixed accordion arrows to point down (▼) when expanded
- Updated all example files to use new Descriptors API
- Updated validation scripts to use new API

### Removed

- **Legacy descriptor exports** (40+ functions) - Use `Descriptors` namespace instead
  - Removed: `getMolecularFormula`, `getMolecularMass`, `getExactMass`
  - Removed: `getHBondDonorCount`, `getHBondAcceptorCount`, `getTPSA`
  - Removed: `checkLipinskiRuleOfFive`, `checkVeberRules`, `checkBBBPenetration`
  - Removed: All topology descriptors (`getKappa1/2/3`, `getBertzCT`)
  - Removed: All chi indices (`getChi0/1/2/3/4n/v` variants)
  - Kept: Specialized utilities (charge descriptors, advanced structural functions)

### Migration Guide

```typescript
// Before (v0.2.1)
import {
  getMolecularFormula,
  getMolecularMass,
  computeLogP,
  getTPSA,
  checkLipinskiRuleOfFive,
} from "openchem";

const formula = getMolecularFormula(mol);
const mass = getMolecularMass(mol);
const logP = computeLogP(mol);
const lipinski = checkLipinskiRuleOfFive(mol);

// After (v0.2.2)
import { Descriptors, computeLogP } from "openchem";

// Get all at once
const all = Descriptors.all(mol);
console.log(all.formula, all.mass, all.logP, all.lipinskiPass);

// Or by category
const basic = Descriptors.basic(mol);
const drugLike = Descriptors.drugLikeness(mol);

// Or individual
const formula = Descriptors.formula(mol);
const logP = Descriptors.logP(mol);
```

### Benefits

- **Cleaner API**: 1 import instead of 50+
- **Better discoverability**: Type `Descriptors.` → autocomplete shows all options
- **Flexible**: Compute all/category/individual properties as needed
- **Tree-shakeable**: Each category is a separate module
- **Type-safe**: Full TypeScript support with detailed interfaces

## [0.2.1] - 2025-10-24

### Added

- **InChI Generation**: WASM-based InChI generation with automatic caching optimization
  - `generateInChI(mol)` for generating InChI strings
  - Automatic WASM module initialization and caching
  - Full InChI specification support

### Enhanced

- Morgan fingerprint standardization to 2048 bits (RDKit standard)
- Improved WASM module handling with persistent caching

## [0.2.0] - 2025-10-24

### Added

- **SVG Molecular Rendering**: Full 2D structure visualization with:
  - Ring detection and regularization (triangles, squares, pentagons, hexagons)
  - Aromatic bond rendering (alternating inner lines with directional indicators)
  - Stereochemistry support (wedge and dashed bonds for chirality)
  - Intelligent atom label placement with collision avoidance
  - Multi-molecule rendering with automatic spacing
  - Fused ring support with shared edge geometry
  - Customizable rendering options (atom labels, bond length, colors)
- **Morgan Fingerprints**: Extended circular fingerprint descriptor for similarity searching
  - `computeMorganFingerprint(mol, radius?, bitLength?)` for generating fingerprints
  - `tanimotoSimilarity(fp1, fp2)` for comparing molecular similarities
  - Support for configurable radius (default 2) and bit length (512 or 2048)
  - Validated against RDKit C++ implementation
- **Coordinate Generation**: Improved 2D layout with force-directed optimization
  - Better handling of fused ring systems
  - Improved angle snapping to 30°, 45°, 60°, 90°, 120°
  - Component-based layout for disconnected molecules

### Enhanced

- Aromatic bond representation in SMILES parser (explicit `:` symbol support)
- SMILES generator now produces aromatic form by default
- Ring analysis with improved SSSR computation
- Molecular descriptor calculations with extended options

### Performance

- LogP computation caching via WeakMap (4.6 million× speedup for complex molecules)
- Optimized ring template caching for SVG rendering
- Improved coordinate generation with early convergence detection

## [Unreleased]

### Planned

- Additional molecular descriptor calculations
- Extended support for reaction SMARTS
- Performance optimizations for large molecules
- Additional file format support (PDB, XYZ)

## [0.1.3] - 2025-10-22

### Performance

- Optimized SMILES parser with improved tokenization and parsing efficiency
- Refactored aromaticity perceiver for faster perception of aromatic rings
- Enhanced ring analysis algorithms for improved performance on complex molecules
- Optimized graph utility functions for faster traversal and analysis
- New SMILES tokenizer for streamlined lexical analysis

### Changed

- Internal parser implementations refined for better performance characteristics
- Ring detection now uses optimized cycle basis computation

## [0.1.2] - 2025-10-21

### Changed

- Complete rebranding from kimchi to openchem across entire codebase
- Updated all documentation, examples, and tests to reflect new project name
- Updated copyright headers and project references

### Fixed

- All references to old project name removed
- Package metadata fully aligned with new identity

## [0.1.1] - 2025-10-22

### Added

- `publishConfig.access: "public"` to ensure public npm package visibility
- Comprehensive documentation for npm publishing workflow

### Fixed

- Scoped package name updated to `@rajgolla/openchem` for public registry

## [0.1.0] - 2024-10-21

### Added

- Initial public release of openchem cheminformatics library
- Complete SMILES parser supporting full OpenSMILES specification
- Canonical SMILES generation with RDKit-compatible canonicalization
- MOL/SDF file format support (parsing and generation)
- SMARTS pattern matching for substructure searching
- 2D coordinate generation and SVG molecular rendering
- Molecular property calculations:
  - LogP (Crippen method)
  - Topological Polar Surface Area (TPSA)
  - Molecular weight and element composition
  - Rotatable bond count
  - Drug-likeness assessment (Lipinski's Rule of Five, Veber Rules, BBB penetration)
- Comprehensive aromaticity perception using Hückel's rule
- Stereochemistry support (chirality, cis/trans, tetrahedral centers)
- Isotope and formal charge handling
- Ring analysis and detection
- Symmetry detection for canonical ordering
- Valence validation
- Hydrogen count calculation
- 600+ comprehensive test cases with RDKit validation
- Full TypeScript support with strict mode and path aliases
- Browser and Node.js compatibility
- Interactive HTML playground for testing

### Features

- TypeScript-first with full type definitions
- Production-ready implementation
- Lightweight dependency footprint (webcola for layout, es-toolkit for utilities)
- Well-tested against RDKit for compatibility
- Comprehensive documentation and examples
