# Agent Guidelines for chemkit

## Build/Test Commands
- **Run all tests**: `bun test`
- **Run single test file**: `bun test test/parser.test.ts` (replace with specific test file)
- **Type check**: `bun run tsc`
- **Run benchmarks**: `bun run benchmark-enrichment.ts` or `bun run benchmark-detailed.ts`

## Architecture Overview

### Molecule Enrichment System
The parser uses a post-processing enrichment system to pre-compute expensive molecular properties during parsing. This significantly improves performance for downstream property queries.

**Key Components:**
- `types.ts` - Extended with optional cached properties on Atom, Bond, and Molecule interfaces
- `src/utils/molecule-enrichment.ts` - Post-processing module that enriches molecules after parsing
- `src/parser.ts` - Calls `enrichMolecule()` after validation phase
- `src/utils/molecular-properties.ts` - Uses cached properties when available, falls back to computation

**Cached Properties:**
- **Atom**: `degree`, `isInRing`, `ringIds[]`, `hybridization`
- **Bond**: `isInRing`, `ringIds[]`, `isRotatable`
- **Molecule**: `rings[][]`, `ringInfo`

**Performance Benefits:**
- Ring finding happens once per molecule (during parsing) instead of multiple times
- Property queries reduced from O(n²) to O(n) via simple filters
- Rotatable bond calculation: ~3M ops/sec (was 47 lines of complex logic per query)
- Overall property query time: ~0.5% of parse time

### Important Notes for Development
- Ring analysis (`analyzeRings()`) should only be called during enrichment
- Downstream code should use cached properties when available
- Always maintain backward compatibility with fallback logic
- New properties should be optional to support incremental adoption

## Code Style Guidelines

### Imports
- Separate type imports: `import type { Atom, Bond } from './types';`
- Group imports by source, then alphabetically
- Use path aliases for cleaner imports:
  - `src/*` → `src/*` (e.g., `import { isOrganicAtom } from 'src/utils/atom-utils'`)
  - `test/*` → `test/*` (e.g., `import { helper } from 'test/utils/test-helper'`)
  - `types` → `types.ts` (e.g., `import { BondType } from 'types'`)
  - `parser` → `src/parser.ts` (e.g., `import { parseSMILES } from 'parser'`)
  - `index` → `index.ts` (e.g., `import { parseSMILES, generateSMILES } from 'index'`)

### Types & Naming
- TypeScript strict mode with full type safety
- Interfaces for data structures, enums for constants
- camelCase for variables/functions, PascalCase for types/enums
- Non-null assertions (`!!`) in tests only

### Error Handling
- Return error arrays instead of throwing exceptions
- Validate inputs early and collect all errors

### Formatting
- 2-space indentation
- Consistent spacing around operators
- Reasonable line length, break long lines logically

### Testing
- Use vitest with describe/it blocks
- Test both success and error cases
- Compare with RDKit where possible for validation