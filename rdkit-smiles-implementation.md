# RDKit SMILES Parsing Implementation

## Overview
RDKit's SMILES parsing is implemented in C++ using a combination of lexical analysis (via Flex) and syntactic parsing (via Bison), with incremental molecule construction and post-processing steps. The core logic resides in the `Code/GraphMol/SmilesParse/` directory of the RDKit repository. This document outlines the key components, process, data structures, and algorithms based on the source code.

## Key Files and Structure
- **`SmilesParse.h` and `SmilesParse.cpp`**: High-level interfaces for SMILES parsing. Entry points like `MolFromSmiles` handle parameters (e.g., sanitization, CXSMILES support) and orchestrate the process.
- **`smiles.yy`**: Bison grammar file defining SMILES syntax rules (e.g., atoms, bonds, branches, rings). Generates the parser (`smiles.tab.cpp.cmake`).
- **`smiles.ll`**: Flex lexer file for tokenization (e.g., atoms like `C` or `[C@H]`, bonds like `-`, digits for rings). Generates the lexer (`lex.yysmiles.cpp.cmake`).
- **`SmilesParseOps.h` and `SmilesParseOps.cpp`**: Utility functions for post-parsing operations like ring closure, bond type resolution, and chirality adjustment.
- **`CXSmilesOps.cpp`**: Handles CXSMILES extensions (e.g., 3D coordinates, enhanced stereochemistry).
- **`CanonicalizeStereoGroups.cpp`**: Manages stereochemistry canonicalization.
- Other files: `SmilesParseOps.cpp` for core ops, `SmilesWrite.cpp` for output (not parsing).

The architecture separates syntax (lexer/parser) from semantics (ops), using RAII for resource management.

## SMILES Parsing Process
Parsing follows a left-to-right, incremental approach, building an `RWMol` (read-write molecule) object. It's multi-stage: preprocessing, lexical/syntactic analysis, construction, and post-processing.

### 1. Preprocessing
- Apply string replacements (macros) via a `replacements` map.
- Split input for molecule names or CXSMILES (e.g., `CCO |atomProp:1.pKa=4.5|`).
- For SMARTS, label recursive patterns.

### 2. Tokenization (Lexical Analysis)
- Flex breaks the string into tokens: organic/aromatic atoms (e.g., `C`, `c`), bracketed atoms (e.g., `[C@H]`), bonds (e.g., `-`, `=`, `#`, `/`, `\`), digits (ring closures), parentheses (branches), etc.
- Tracks positions for error reporting.

### 3. Syntactic Parsing
- Bison's LALR(1) shift-reduce parser enforces grammar rules, building the molecule incrementally.
- Key elements:
  - **Atoms**: `simple_atom` (organic/aromatic) or `atomd` (bracketed with charge, isotope, H-count, chirality).
  - **Bonds**: Default to single; explicit types or directional for stereo.
  - **Branches**: Parentheses; parser uses a stack for branch points.
  - **Ring Closures**: Digits (1-9, %10+) bookmark atoms/bonds for later resolution.
  - **Stereochemistry**: `@`/`@@` for tetrahedral; extended for allene, square planar, etc.
- Errors (e.g., unmatched parens) trigger exceptions with cleanup.

### 4. Post-Processing
- **Ring Closure** (`CloseMolRings`): Match bookmarks to form rings, resolve bond types/directions.
- **Bond Resolution** (`SetUnspecifiedBondTypes`): Set unspecified bonds to single/aromatic based on atom types.
- **Chirality Adjustment** (`AdjustAtomChiralityFlags`): Reorder bonds per SMILES semantics, invert if needed (e.g., for ring closures).
- **CXSMILES** (`parseCXExtensions`): Parse extensions for stereo, coords, properties.
- **Sanitization** (optional): Add H, perceive aromaticity, assign stereo.
- **Cleanup** (`CleanupAfterParsing`): Remove temp properties (bookmarks, ring closures).

## Notable Data Structures and Algorithms
### Data Structures
- `RWMol`: Core molecule; atoms/bonds added incrementally.
- Bookmarks: Map<int, list<atoms/bonds>> for rings/branches.
- `SmilesParserParams`: Options (sanitize, debug, replacements).
- Vectors for branch points, ring closures.

### Algorithms
- **Parsing**: LALR(1) with custom actions for molecule building.
- **Ring Closure**: Iterative bookmark matching; handles partial bonds and direction swapping.
- **Chirality**: Bond ordering via SMILES traversal; permutations for non-tetrahedral stereo.
- **Error Handling**: Position-based reporting; RAII cleanup.
- **Performance**: Incremental construction; caching for repeats.

This design ensures efficient, correct parsing of complex SMILES, including extensions. For SMARTS, it's similar but adds query logic. Refer to the RDKit repository for source code details.