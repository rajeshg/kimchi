# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

## [Unreleased]

### Planned
- Additional molecular descriptor calculations
- Extended support for reaction SMARTS
- Performance optimizations for large molecules
- Additional file format support (PDB, XYZ)
