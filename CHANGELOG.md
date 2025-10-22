# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1] - 2025-10-22

### Added
- `publishConfig.access: "public"` to ensure public npm package visibility
- Comprehensive documentation for npm publishing workflow

### Fixed
- Scoped package name updated to `@rajgolla/kimchi` for public registry

## [0.1.0] - 2024-10-21

### Added
- Initial public release of kimchi cheminformatics library
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
