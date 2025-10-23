# GitHub Copilot Instructions for openchem

## Project Overview
openchem is a TypeScript library for parsing and generating chemical structure formats (SMILES, MOL, SDF) with strict type safety and comprehensive validation.

## Build & Test Commands
- Run tests: `bun test`
- Run single test: `bun test test/smiles/smiles-parser-basic.test.ts`
- Full test suite with RDKit: `bun test:full`
- Type check: `bun run tsc --noEmit`

## Code Style

### Imports
- Separate type imports: `import type { Atom } from 'types';`
- Group: types first, external packages, then internal modules
- **Use path aliases** (not relative paths): `types`, `index`, `src/*`, `test/*`
- Example: `import { BondType } from 'types'` not `from '../../types'`

### TypeScript
- Strict mode enabled with `noUncheckedIndexedAccess`, `noImplicitOverride`
- Use interfaces for data structures, enums for constants
- camelCase for variables/functions, PascalCase for types/enums
- Non-null assertions (`!`) only in tests when type safety is guaranteed

### Error Handling
- Return error arrays instead of throwing exceptions
- Validate inputs early and collect all errors

### Formatting
- 2-space indentation
- Consistent spacing around operators
- Break long lines logically

### Testing
- Use `bun:test` with describe/it blocks
- Test both success and error cases
- Compare with RDKit where possible for validation

### Comments
- DO NOT ADD COMMENTS unless explicitly requested
- Code should be self-documenting with clear naming

## Dependencies
- Runtime: `es-toolkit` (prefer over lodash)
- Dev/Testing: `bun:test`, `@rdkit/rdkit`
- Avoid adding new dependencies without explicit need

## Key Files
- Types: `types.ts`
- SMILES: `src/parsers/smiles-parser.ts`, `src/generators/smiles-generator.ts`
- MOL: `src/parsers/molfile-parser.ts`, `src/generators/mol-generator.ts`
- SDF: `src/parsers/sdf-parser.ts`, `src/generators/sdf-writer.ts`
- Utils: `src/utils/` (aromaticity, rings, symmetry, valence, etc.)
- Validators: `src/validators/` (aromaticity, stereo, valence)
