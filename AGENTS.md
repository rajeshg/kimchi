# Agent Guidelines for openchem

## Build/Test Commands
- **Run all tests**: `bun test`
- **Run single test file**: `bun test test/smiles/smiles-parser-basic.test.ts` (replace with specific test file)
- **Run full test suite with RDKit**: `bun test:full` or `RUN_RDKIT_BULK=1 bun test`
- **Type check**: `bun run tsc --noEmit`

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

### Generators
- **SMILES generator**: `src/generators/smiles-generator.ts`
- **MOL generator**: `src/generators/mol-generator.ts`

## Dependencies
- **Runtime**: `es-toolkit` for utility functions (prefer over lodash)
- **Dev/Testing**: `bun:test` for testing, `@rdkit/rdkit` for validation
- Avoid adding new dependencies without explicit need
