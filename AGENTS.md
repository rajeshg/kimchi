# Agent Guidelines for chemkit

## Build/Test Commands
- **Run all tests**: `bun test`
- **Run single test file**: `bun test test/parser.test.ts` (replace with specific test file)
- **Type check**: `bun run tsc`

## Code Style Guidelines

### Imports
- Separate type imports: `import type { Atom, Bond } from './types';`
- Group imports by source, then alphabetically
- Use path aliases for cleaner imports:
  - `src/*` → `src/*` (e.g., `import { isOrganicAtom } from 'src/utils/atom-utils'`)
  - `test/*` → `test/*` (e.g., `import { helper } from 'test/utils/test-helper'`)
  - `types` → `types.ts` (e.g., `import { BondType } from 'types'`)
  - `parser` → `parser.ts` (e.g., `import { parseSMILES } from 'parser'`)
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