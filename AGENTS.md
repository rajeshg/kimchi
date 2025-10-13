# Agent Guidelines for chemkit

## Build/Test Commands
- **Run all tests**: `bun test`
- **Run single test file**: `bun test test/parser.test.ts` (replace with specific test file)
- **Type check**: `bun run tsc`

## Code Style Guidelines

### Imports
- Separate type imports: `import type { Atom, Bond } from './types';`
- Group imports by source, then alphabetically

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