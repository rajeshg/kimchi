# Next Features for ChemKit

Based on the OpenSMILES specification (smiles.md), here are the recommended next steps for the chemkit project.

## Priority 1: Core Feature Completeness

### 1. Isotope Support (Section 3.1.4) ✅
- Add isotope parsing in bracket atoms (e.g., `[13CH4]`, `[2H+]`, `[238U]`)
- Generate isotopes in SMILES output
- Store isotope information in Atom type
- **Status**: ✅ **COMPLETED** - Isotope support fully implemented with comprehensive tests

### 2. Atom Class Support (Section 3.1.7) ✅
- Parse atom class notation (e.g., `[CH4:2]`, `[NH4+:005]`)
- Store atom class as arbitrary integer in Atom type
- Output atom class information in generated SMILES
- **Status**: ✅ **COMPLETED** - Atom class support fully implemented with 36 comprehensive tests

### 3. Quadruple Bonds (Section 3.2) ✅
- Add support for `$` bond symbol
- Example: `[Rh-](Cl)(Cl)(Cl)(Cl)$[Rh-](Cl)(Cl)(Cl)Cl` (octachlorodirhenate III)
- Update bond order type to include quadruple bonds
- **Status**: ✅ **COMPLETED** - Parser supports `$` for quadruple bonds

### 4. Extended Stereo Support (Sections 3.8.5-3.8.7) ✅
- **Square Planar** (`@SP1`, `@SP2`, `@SP3`)
  - Three shapes: U, 4, Z
  - For tetravalent stereocenters
- **Trigonal Bipyramidal** (`@TB1` through `@TB20`)
  - For pentavalent stereocenters (e.g., `S[As@TB1](F)(Cl)(Br)N`)
  - 20 primitives to represent all viewing axes and orientations
- **Octahedral** (`@OH1` through `@OH30`)
  - For hexavalent stereocenters (e.g., `C[Co@](F)(Cl)(Br)(I)S`)
  - 30 primitives for all axis/shape combinations
- **Status**: ✅ **COMPLETED** - All extended stereo forms fully supported with parsing, generation, validation, and comprehensive tests (35/35 pass)

## Priority 2: Robustness & Standards Compliance

### 5. Nonstandard SMILES Parsing (Section 5)
Add optional "relaxed" parsing mode for common malformed SMILES:
- **Extra parentheses**: `C((C))O` → `C(C)O`
- **Misplaced dots**: `[Na+]..[Cl-]` → `[Na+].[Cl-]`
- **Mismatched ring bonds**: `C1CCC` → `CCCC` (warn user)
- **Invalid cis/trans**: `C/C=C` → `CC=C` (ignore incomplete specs)
- **Conflicting cis/trans**: `C/C(\F)=C/C` → `CC(F)=CC` (ignore conflicts)
- **D and T shortcuts**: `D[CH3]` → `[2H][CH3]`, `T[CH3]` → `[3H][CH3]`
- **Lowercase as sp2**: `CccccC` → `CC=CC=CC` (outside rings)
- **Status**: Parser is currently strict-only

### 6. Extended Valence States (Section 3.1.5)
- Better handling of hypervalent atoms:
  - Sulfur: valence 2, 4, or 6
  - Nitrogen: valence 3 or 5
  - Phosphorus: valence 3 or 5
- Improve implicit hydrogen calculation for these cases
- Add comprehensive valence validation tests
- **Status**: Basic support exists, needs expansion

## Priority 3: Output Quality & Standard Form

### 7. Canonical SMILES Generation (Section 4.4) ✅
- Implement full canonical ordering algorithm
- Consistent atom numbering regardless of input order
- Graph canonicalization using Morgan algorithm or similar
- Enables use as database key and exact-structure search
- **Status**: ✅ **COMPLETED** - Modified Morgan algorithm implemented (src/generators/smiles-generator.ts:380-441), achieves 100% RDKit parity (325/325 molecules)

### 21. Aromaticity Perception (Section 4.3.5) ✅
**Impact**: HIGH - Critical for Standard Form compliance
- Detect aromatic rings from Kekule forms (alternating double bonds)
- Apply Hückel's 4n+2 rule (validator exists, need perceiver)
- Convert `C1=CC=CC=C1` → `c1ccccc1`
- Mark atoms/bonds as aromatic automatically
- **Status**: ✅ **COMPLETED** - Implemented in `src/utils/aromaticity-perceiver.ts`, integrated into canonical SMILES generator
- **Complexity**: MEDIUM
- **Files**: `src/utils/aromaticity-perceiver.ts`, `src/generators/smiles-generator.ts:26`

### 22. Starting Atom Selection (Section 4.3.4) 
**Impact**: MEDIUM - Improves readability and Standard Form compliance
- Prefer heteroatoms (O, N, S, etc.) over carbon
- Prefer terminal atoms (degree 1) over non-terminal  
- Among ties, use canonical label
- Example: `CCCO` → `OCCC`
- **Status**: Not implemented - uses canonical label only
- **Complexity**: LOW
- **Files**: `src/generators/smiles-generator.ts:140-187`

### 23. Symmetry Detection for Stereochemistry (Section 4.3.6) ✅
**Impact**: MEDIUM - Correctness of stereochemistry output
- Detect identical substituents on chiral centers: `Br[C@H](Br)C` → `BrC(Br)C`
- Detect geminal groups on double bonds: `F/C(/F)=C/F` → `FC(F)=CF`
- Use canonical labels or graph isomorphism for symmetry detection
- **Status**: ✅ **COMPLETED** - Implemented in `src/utils/symmetry-detector.ts`, validates all 325 RDKit molecules correctly
- **Complexity**: MEDIUM-HIGH
- **Files**: `src/utils/symmetry-detector.ts`, `src/generators/smiles-generator.ts:27`

### 24. Aromatic-Aromatic Single Bonds (Section 4.3.2)
**Impact**: LOW - Only affects ring-ring connections
- Write explicit `-` between aromatic rings
- Example: Biphenyl `c1ccccc1-c2ccccc2`
- **Status**: Not implemented
- **Complexity**: LOW
- **Files**: `src/generators/smiles-generator.ts:453-491` (bondSymbolForOutput)

### 8. Standard Form Normalization (Section 4.3) - SUMMARY
Improve SMILES output formatting:

**Atoms (✅ IMPLEMENTED):**
- ✅ Use organic subset (bare symbols) whenever possible
- ✅ Omit `1` in charges/H-counts: `[CH3-]` not `[CH3-1]`
- ✅ Order properties: chirality, H-count, charge
- ✅ Implicit hydrogens over explicit: `C` not `[H][C]([H])([H])[H]`

**Bonds (⚠️ PARTIAL):**
- ✅ Omit `'-'` except between aromatic atoms (omits correctly)
- ✅ Never write `':'` (aromatic bond symbol)
- ❌ **Missing**: Explicit single bond between aromatic rings (e.g., biphenyl should be `c1ccccc1-c2ccccc2`)

**Cycles (✅ IMPLEMENTED):**
- ✅ Don't reuse ring-closure digits
- ✅ Begin ring numbering with 1
- ✅ Prefer single bonds for ring closures: `CC1=CCCCC1` not `CC=1CCCCC=1`
- ✅ Use single-digit form for rnums < 10

**Starting Atom and Branches (❌ NEEDS WORK):**
- ❌ **Not implemented**: Start on heteroatom if possible (currently starts on canonical label)
- ❌ **Not implemented**: Start on terminal atom if possible
- ❌ **Not implemented**: Longest chains as main branch
- ✅ Only use dots for disconnected components

**Aromaticity (✅ IMPLEMENTED):**
- ✅ **Implemented**: Perceive aromatic rings from Kekule form and convert to aromatic notation
- Converts `C1=CC=CC=C1` → `c1ccccc1` automatically during canonical SMILES generation
- Uses Hückel's rule 4n+2 for aromaticity detection

**Chirality (✅ IMPLEMENTED):**
- ✅ Removes chiral markings for atoms with < 3 neighbors
- ✅ **Implemented**: Remove `@` from achiral centers (e.g., `Br[C@H](Br)C` has two identical Br groups)
- ✅ **Implemented**: Remove `/` `\` from non-stereogenic double bonds (e.g., `F/C(/F)=C/F` has geminal F atoms)
- Uses canonical labels and graph isomorphism in `src/utils/symmetry-detector.ts`

**Status**: 
- Atoms/Cycles: ✅ Well implemented
- Bonds: ⚠️ Missing single bond between aromatic atoms
- Starting atom selection: ❌ Needs complete rewrite to prefer heteroatoms/terminals
- Aromaticity perception: ❌ Critical missing feature
- Stereochemistry validation: ❌ Needs symmetry detection

## Priority 4: Extended Features

### 9. Allene Stereochemistry (Section 3.8.4)
- Support tetrahedral allene-like systems with `@`/`@@` notation
- Extended tetrahedral for conjugated allenes with even number of double bonds
- Example: `NC(Br)=[C@]=C(O)C`
- Conceptually "collapse" allene into single chiral center
- **Status**: Not implemented

### 10. Disconnected Structures (Section 3.7)
- Improve handling of dot-separated components (`.`)
- Better support for salts and mixtures
- Examples: `[Na+].[Cl-]`, `Oc1ccccc1.NCCO`
- Validate that dot-bonds are used correctly
- **Status**: Basic support exists, needs testing and edge case handling

## Quick Wins

These could be implemented relatively quickly:

### 11. Wildcard Atom `*` (Section 3.1.6) ✅
- Unknown/unspecified atomic number
- Can be aromatic: `Oc1c(*)cccc1` (ortho-substituted phenol)
- No specific valence rules
- **Status**: ✅ **COMPLETED** - Fully implemented with comprehensive tests

### 12. Explicit Single Bonds Between Aromatic Atoms ✅
- Ensure `c1ccccc1-c2ccccc2` (biphenyl) works correctly
- Single bond must be explicit when connecting aromatic atoms
- **Status**: ✅ **COMPLETED** - Parser now tracks explicit bonds and preserves single bonds between aromatic atoms per OpenSMILES spec

### 13. Ring-closure Digit 0 ✅
- Ensure `C0CCCCC0` (cyclohexane) works
- Zero is valid ring closure number
- **Status**: ✅ **COMPLETED** - Verified working with tests

### 14. Two-digit Ring Numbers ✅
- Ensure `C%10CCCCC%10` works correctly
- Percent symbol followed by exactly two digits
- **Status**: ✅ **COMPLETED** - Verified working with comprehensive tests

## Testing & Quality Assurance

### 15. Expand Test Coverage
Test all features from specification:
- **Charge forms**: `+`, `++` (deprecated), `+2`, `-`, `--` (deprecated), `-15` to `+15`
- **Hydrogen counts**: `H`, `H1`, `H2` through `H9`
- **Edge cases from spec**:
  - 100 levels of branch nesting
  - 1000+ rings in molecule
  - 100,000 character SMILES strings
  - 10+ bonds per atom
- **Comparison with other toolkits**:
  - OpenBabel comparison tests
  - CDK comparison tests
  - Extend RDKit comparison coverage
- **Error messages**:
  - Clear, specific error messages for parse failures
  - Show exact character/phrase that triggered error

## Proposed Extensions (Section 6)

These are extensions beyond the core OpenSMILES spec that could be considered:

### 16. External R-Groups (Section 6.1)
- Ampersand `&` followed by ring-closure number
- Bonds to external, unspecified R-groups
- Example: `n1c(&1)c(&2)cccc1` (2,3-substituted pyridine)

### 17. Polymers and Crystals (Section 6.2)
- Repeating units using ampersand with repeated numbers
- Examples:
  - `c1ccccc1C&1&1` (polystyrene)
  - `C&1&1&1&1` (diamond)
  - `c&1&1&1` (graphite)

### 18. Atom-based Double Bond Configuration (Section 6.3)
- Alternative to `'/'` and `'\'` using `@`/`@@` on alkene carbons
- Solves theoretical flaw with cyclooctatetraene
- Example: `F[C@@H]=[C@H]F` (trans-difluoroethene)
- Simpler canonical SMILES generation

### 19. Radical Support (Section 6.4)
- Lowercase symbol for radical center
- `CCc` = 1-propyl radical (alternative to `CC[CH2]`)
- `CcC` = 2-propyl radical
- Delocalized conjugated radicals: `Cccccc`

### 20. Twisted SMILES (Section 6.5)
- Conformational information via bond dihedral angles and lengths
- Reference: [McLeod & Peters MUG03](http://www.daylight.com/meetings/mug03/McLeod/MUG03McLeodPeters.pdf)

## Implementation Notes

### SMILES Flavors to Avoid (Section 5.1)
The specification warns against using ambiguous terms like:
- "Isomeric SMILES" (different meanings in ChemAxon vs OEChem)
- "Absolute SMILES" (conflicts between toolkits)
- "Unique SMILES" (unclear definition)

Instead, clearly specify:
- Whether output is canonical or arbitrary
- Whether stereochemistry is included
- Whether isotopes are included
- Toolkit name, version, and options used

### Key Design Principles
1. **Parser should be permissive** (accept valid SMILES with minimal limits)
2. **Generator should follow standard form** (Section 4.3)
3. **Clear error messages** showing exact problem location
4. **No arbitrary limits** on:
   - SMILES length (support at least 100,000 chars)
   - Number of rings (support at least 1,000)
   - Branch nesting depth (support at least 100 levels)
   - Bonds per atom (support at least 10)
   - Disconnected fragments (unlimited)
