# IUPAC Naming Engine - Implementation Guide

This guide provides technical architecture and implementation details for contributors and maintainers of the openchem IUPAC naming engine.

**Audience:** Contributors, maintainers, developers extending the engine  
**Related docs:** [Rules Reference](./iupac-rules-reference.md) | [Capabilities](./iupac-capabilities.md) | [Documentation Hub](./iupac-readme.md)

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Core Components](#core-components)
3. [Main Chain Selection (P-44)](#main-chain-selection-p-44)
4. [Numbering System (P-14)](#numbering-system-p-14)
5. [State Management](#state-management)
6. [OPSIN Data Integration](#opsin-data-integration)
7. [Testing Strategy](#testing-strategy)
8. [Extending the Engine](#extending-the-engine)
9. [Performance Considerations](#performance-considerations)

---

## Architecture Overview

The IUPAC naming engine follows a **layered pipeline architecture**, where each layer progressively builds context and applies IUPAC rules:

```
Input (SMILES/MOL)
    ↓
Molecule Object (atoms, bonds, coordinates)
    ↓
Context Builder (ring analysis, aromaticity, functional groups)
    ↓
Main Chain Selection (P-44 seniority rules)
    ↓
Numbering Engine (P-14 lowest locant principle)
    ↓
Name Assembly (prefixes, parent, suffixes)
    ↓
Output (PIN / traditional name)
```

### Design Principles

1. **Immutable molecule representation**: Original molecule object never mutated
2. **Layered context**: Each stage adds information without modifying earlier layers
3. **Explicit state management**: `IUPACContext` tracks all decisions and intermediate results
4. **Declarative rules**: Rules defined as data structures, not hardcoded logic
5. **Testability**: Each component testable in isolation

### File Organization

```
src/iupac-engine/
├── base-context.ts                    # Core IUPACContext type
├── iupac-context-builder.ts          # Context initialization
├── main-chain-selection.ts           # P-44 implementation
├── numbering-engine.ts               # P-14 implementation
├── naming/
│   ├── iupac-name-assembler.ts       # Final name construction
│   ├── chains/                       # Chain naming logic
│   ├── functional-class/             # Functional class naming
│   └── iupac-rings/                  # Ring system naming
├── rules/
│   ├── initial-structure-layer/      # P-1 to P-3 (parent structures)
│   ├── functional-groups-layer.ts    # P-33 to P-68 (suffixes)
│   ├── name-assembly-layer/          # Final name construction rules
│   └── stereo-layer/                 # P-91 to P-93 (stereochemistry)
└── tests/                            # Unit tests for rules
```

---

## Core Components

### 1. IUPACContext

**Location:** `src/iupac-engine/base-context.ts`

The `IUPACContext` interface is the **central state object** that flows through the naming pipeline. It accumulates information at each stage without mutation.

**Key fields:**

```typescript
interface IUPACContext {
  molecule: Molecule;                  // Original molecule
  rings: Ring[];                       // SSSR rings
  aromaticRings: number[];             // Indices of aromatic rings
  fusedRingSystems: FusedRingSystem[]; // Detected fusion systems
  
  mainChain?: number[];                // Selected main chain atom IDs
  numbering?: Map<number, number>;     // Atom ID → locant number
  
  functionalGroups: FunctionalGroup[]; // Detected groups (alcohols, ketones, etc.)
  principalGroup?: FunctionalGroup;    // Highest priority group
  
  substituentTree?: SubstituentNode[]; // Tree of substituents
  
  // ... additional fields for stereo, tautomers, etc.
}
```

**Usage pattern:**

```typescript
// Context is built incrementally
let context = buildInitialContext(molecule);
context = selectMainChain(context);
context = assignNumbering(context);
context = detectFunctionalGroups(context);
const name = assembleName(context);
```

### 2. Context Builder

**Location:** `src/iupac-engine/iupac-context-builder.ts`

Responsible for initializing the context with structural analysis:

**Steps:**
1. **Ring analysis**: Compute SSSR using `findSSSR()` from `ring-analysis.ts`
2. **Aromaticity perception**: Apply Hückel's rule via `perceiveAromaticity()`
3. **Fusion detection**: Identify fused ring systems (naphthalene, anthracene, etc.)
4. **Heteroatom detection**: Locate N, O, S, P atoms for naming priority
5. **Stereochemistry initialization**: Detect chiral centers and double bonds

**Key function:**

```typescript
export function buildIUPACContext(molecule: Molecule): IUPACContext {
  const rings = findSSSR(molecule.atoms, molecule.bonds);
  const aromaticRings = perceiveAromaticity(molecule, rings);
  const fusedSystems = detectFusedSystems(rings, molecule);
  
  return {
    molecule,
    rings,
    aromaticRings,
    fusedRingSystems: fusedSystems,
    functionalGroups: [],
    // ... initialize other fields
  };
}
```

### 3. Main Chain Selection (P-44)

**Location:** `src/iupac-engine/main-chain-selection.ts`  
**IUPAC Rule:** P-44 (selection of preferred IUPAC names)

The main chain selection algorithm implements **IUPAC seniority rules** to choose the longest, most senior chain in the molecule.

#### Algorithm Overview

**Priority order (highest to lowest):**

1. **Heteroatom content**: Chains containing N, O, S preferred over pure hydrocarbons
2. **Length**: Longer chains preferred
3. **Unsaturation**: More double/triple bonds preferred
4. **Number of substituents**: Fewer substituents preferred
5. **Alphabetical order of substituents**: Earlier alphabetically preferred

**Implementation:**

```typescript
export function selectMainChain(context: IUPACContext): IUPACContext {
  const candidates = findAllChains(context.molecule);
  
  // Apply seniority rules in order
  let bestChain = candidates[0];
  
  for (const candidate of candidates.slice(1)) {
    if (compareChains(candidate, bestChain, context) > 0) {
      bestChain = candidate;
    }
  }
  
  return { ...context, mainChain: bestChain };
}

function compareChains(a: number[], b: number[], ctx: IUPACContext): number {
  // Rule 1: Heteroatom content
  const heteroA = countHeteroatoms(a, ctx);
  const heteroB = countHeteroatoms(b, ctx);
  if (heteroA !== heteroB) return heteroA - heteroB;
  
  // Rule 2: Length
  if (a.length !== b.length) return a.length - b.length;
  
  // Rule 3: Unsaturation
  const unsatA = countUnsaturation(a, ctx);
  const unsatB = countUnsaturation(b, ctx);
  if (unsatA !== unsatB) return unsatA - unsatB;
  
  // ... continue with remaining rules
}
```

#### Chain Selection Notes

**Source:** Former `IUPAC_CHAIN_SELECTION.md`

Key insights from implementation:

- **Graph traversal**: Use DFS to enumerate all possible chains
- **Pruning**: Stop exploring chains that can't beat current best
- **Ring handling**: Chains can pass through rings (e.g., cyclohexanecarboxylic acid)
- **Performance**: O(N²) for simple molecules, O(N³) for highly branched structures

**Edge cases:**

1. **Symmetric molecules**: Multiple equally valid chains (choose lexicographically first)
2. **Bridged systems**: Main chain may cross bridges
3. **Spiro centers**: Chain may traverse spiro junction

### 4. Numbering Engine (P-14)

**Location:** `src/iupac-engine/numbering-engine.ts`  
**IUPAC Rule:** P-14 (numbering)

The numbering engine assigns **locant numbers** to atoms in the main chain using the **lowest locant principle**.

#### Lowest Locant Principle

**Rule:** Assign numbers to give the lowest possible locants to:

1. **Heteroatoms** (N, O, S, P) in the main chain
2. **Multiple bonds** (double, triple)
3. **Substituents** attached to main chain
4. **Principal functional group** (suffix)

**Implementation:**

```typescript
export function assignNumbering(context: IUPACContext): IUPACContext {
  if (!context.mainChain) throw new Error('Main chain not selected');
  
  const chain = context.mainChain;
  
  // Try both directions (1→N and N→1)
  const forward = numberChain(chain, false);
  const reverse = numberChain(chain, true);
  
  // Compare using lowest locant sets
  const better = compareLocantSets(forward, reverse, context);
  
  const numbering = new Map<number, number>();
  const chosen = better === 'forward' ? forward : reverse;
  
  for (let i = 0; i < chosen.length; i++) {
    numbering.set(chosen[i], i + 1); // Locants start at 1
  }
  
  return { ...context, numbering };
}

function compareLocantSets(
  a: number[],
  b: number[],
  ctx: IUPACContext
): 'forward' | 'reverse' {
  // Get locant sets for important features
  const heteroA = getHeteroatomLocants(a, ctx);
  const heteroB = getHeteroatomLocants(b, ctx);
  
  // Compare lexicographically
  const cmp = lexicographicCompare(heteroA, heteroB);
  if (cmp !== 0) return cmp < 0 ? 'forward' : 'reverse';
  
  // Continue with multiple bonds, substituents, etc.
  // ...
}
```

#### Locant Comparison

**Example:** Choosing numbering direction for 3-methylhexane

```
Direction 1: CH₃-CH₂-CH(CH₃)-CH₂-CH₂-CH₃
Numbering:   1   2   3       4   5   6
Substituent at: 3

Direction 2: CH₃-CH₂-CH₂-CH(CH₃)-CH₂-CH₃
Numbering:   6   5   4   3       2   1
Substituent at: 4

Choose Direction 1 (locant 3 < locant 4) ✓
```

---

## State Management

### Immutability Pattern

The IUPAC engine uses **functional programming principles** to maintain clear state flow:

```typescript
// ❌ BAD: Mutating context
function addFunctionalGroups(context: IUPACContext) {
  context.functionalGroups.push(newGroup); // Mutation!
  return context;
}

// ✅ GOOD: Returning new context
function addFunctionalGroups(context: IUPACContext): IUPACContext {
  return {
    ...context,
    functionalGroups: [...context.functionalGroups, newGroup]
  };
}
```

### Why Immutability?

1. **Debugging**: Easy to compare context before/after each stage
2. **Testing**: Can test each function in isolation without side effects
3. **Parallel processing**: Future optimization for multi-core naming
4. **Rollback**: Easy to implement "what-if" scenarios

### Context Caching

For expensive operations (ring analysis, aromaticity), results are cached in the context:

```typescript
function getAromaticRings(context: IUPACContext): number[] {
  if (context.aromaticRings) {
    return context.aromaticRings; // Return cached
  }
  
  const aromatic = perceiveAromaticity(context.molecule, context.rings);
  return aromatic; // Will be cached by caller
}
```

---

## OPSIN Data Integration

**OPSIN** (Open Parser for Systematic IUPAC Nomenclature) provides a comprehensive database of IUPAC naming rules and nomenclature data.

**Location:** `opsin-iupac-data/` directory

### Data Files Used

| File | Purpose | Examples |
|------|---------|----------|
| `alkanes.xml` | Straight-chain hydrocarbon names | methane, ethane, propane |
| `simpleGroups.xml` | Acyclic parent structures | methyl, ethyl, propyl |
| `simpleCyclicGroups.xml` | Monocyclic parent structures | cyclopropane, cyclohexane |
| `suffixes.xml` | Functional group suffixes | -ol, -one, -oic acid |
| `multipliers.xml` | Numerical prefixes | di-, tri-, tetra- |
| `fusionComponents.xml` | Fused ring system names | naphthalene, anthracene |
| `heteroAtoms.xml` | Heteroatom replacement names | oxa-, aza-, thia- |

### Loading OPSIN Data

**Location:** `src/iupac-engine/rules/initial-structure-layer/P-2.1-heteroatom-parents.ts`

```typescript
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const opsinDataPath = join(__dirname, '../../../../opsin-iupac-data');
const LOOKUP = JSON.parse(
  readFileSync(join(opsinDataPath, 'LOOKUP.json'), 'utf-8')
);

// Access names
const alkaneName = LOOKUP.alkanes.methane; // "methane"
const suffixName = LOOKUP.suffixes.alcohol; // "ol"
```

### Citation Normalizer

**Location:** `src/iupac-engine/citation-normalizer.ts`

Converts OPSIN citations (e.g., `P-44.1.2.3`) to canonical format for cross-referencing with Blue Book.

```typescript
export function normalizeCitation(citation: string): string {
  // "P-44.1.2.3" → "P-44.1.2.3"
  // "P44.1" → "P-44.1"
  // Handles various citation formats from OPSIN data
}
```

---

## Testing Strategy

### Test Organization

```
test/unit/iupac-engine/
├── p14-numbering.test.ts              # P-14 numbering tests
├── p44-chain-selection.test.ts        # P-44 main chain tests
├── p31-unsaturation.test.ts           # P-31 alkenes/alkynes
├── p45-parent-hydrides.test.ts        # P-45 heteroatom parents
├── functional-groups.test.ts          # P-33 to P-68 suffixes
├── fusion-nomenclature.test.ts        # Fused ring systems
└── [25+ additional test files]
```

### Test Levels

#### 1. Unit Tests (Fast)

Test individual rules and functions in isolation:

```typescript
describe('P-44.1: Main chain selection', () => {
  it('selects longest chain in branched alkane', () => {
    const smiles = 'CC(C)CCC'; // 2-methylpentane
    const mol = parseSMILES(smiles).molecules[0];
    const context = buildIUPACContext(mol);
    const result = selectMainChain(context);
    
    expect(result.mainChain?.length).toBe(5); // Pentane chain
  });
});
```

#### 2. Integration Tests (Medium)

Test full name generation pipeline:

```typescript
describe('IUPAC name generation', () => {
  it('generates correct name for complex molecule', () => {
    const smiles = 'CC(=O)Oc1ccccc1C(=O)O'; // Aspirin
    const name = generateIUPACName(smiles);
    
    expect(name).toBe('2-acetoxybenzoic acid');
  });
});
```

#### 3. Comparison Tests (Validation)

Compare against RDKit and OPSIN:

```typescript
describe('RDKit comparison', () => {
  it('matches RDKit name for caffeine', () => {
    const smiles = 'CN1C=NC2=C1C(=O)N(C(=O)N2C)C';
    const ourName = generateIUPACName(smiles);
    const rdkitName = getRDKitName(smiles);
    
    expect(ourName).toBe(rdkitName);
  });
});
```

#### 4. Realistic Dataset (Coverage)

**Location:** `test/unit/iupac-engine/realistic-iupac-test.test.ts`  
**Data:** `docs/pubchem-iupac-name-300.json`

- 300+ molecules from PubChem
- Diverse functional groups, ring systems, stereochemistry
- Run with `bun test realistic-iupac-test`

### Running Tests

```bash
# All IUPAC tests
bun test test/unit/iupac-engine/

# Specific rule tests
bun test test/unit/iupac-engine/p44-chain-selection.test.ts

# With verbose output
bun test --verbose test/unit/iupac-engine/

# Run realistic dataset (slow)
bun test test/unit/iupac-engine/realistic-iupac-test.test.ts
```

### Test-Driven Development

**Recommended workflow:**

1. **Write failing test first**:
   ```typescript
   it('should name 3-ethyl-2-methylhexane', () => {
     const smiles = 'CCC(C)C(CC)CCC';
     const name = generateIUPACName(smiles);
     expect(name).toBe('3-ethyl-2-methylhexane'); // FAILS initially
   });
   ```

2. **Implement minimum code to pass**:
   - Add rule logic
   - Update context builder if needed
   - Verify test passes

3. **Refactor**:
   - Extract common patterns
   - Simplify complex functions
   - Maintain test coverage

4. **Validate against RDKit/OPSIN**:
   - Run comparison tests
   - Investigate discrepancies
   - Document known differences

---

## Extending the Engine

### Adding a New IUPAC Rule

**Example:** Implementing P-31.2 (alkene naming with E/Z stereochemistry)

#### Step 1: Identify the Rule

- **Rule:** P-31.2 - Naming alkenes with stereochemical descriptors
- **Blue Book section:** P-31.2.3.1 (E/Z notation)
- **Input:** Molecule with double bonds
- **Output:** Name with (E)- or (Z)- prefix

#### Step 2: Create Test Cases

```typescript
// test/unit/iupac-engine/p31-ez-stereo.test.ts
describe('P-31.2: E/Z stereochemistry', () => {
  it('assigns (E) to trans-but-2-ene', () => {
    const smiles = 'C/C=C/C'; // Trans
    const name = generateIUPACName(smiles);
    expect(name).toBe('(E)-but-2-ene');
  });
  
  it('assigns (Z) to cis-but-2-ene', () => {
    const smiles = 'C/C=C\\C'; // Cis
    const name = generateIUPACName(smiles);
    expect(name).toBe('(Z)-but-2-ene');
  });
  
  it('handles multiple stereocenters', () => {
    const smiles = 'C/C=C/C=C\\C'; // (2E,4Z)-hexa-2,4-diene
    const name = generateIUPACName(smiles);
    expect(name).toBe('(2E,4Z)-hexa-2,4-diene');
  });
});
```

#### Step 3: Implement the Rule

```typescript
// src/iupac-engine/rules/stereo-layer/ez-descriptor.ts
export function assignEZDescriptors(context: IUPACContext): IUPACContext {
  const doubleBonds = findDoubleBonds(context.molecule);
  const ezAssignments: EZAssignment[] = [];
  
  for (const bond of doubleBonds) {
    const descriptor = determineEZConfiguration(bond, context);
    if (descriptor) {
      const locant = context.numbering?.get(bond.atom1) ?? 0;
      ezAssignments.push({ locant, descriptor });
    }
  }
  
  return {
    ...context,
    ezDescriptors: ezAssignments
  };
}

function determineEZConfiguration(
  bond: Bond,
  context: IUPACContext
): 'E' | 'Z' | null {
  // Implement Cahn-Ingold-Prelog priority rules
  const [highPriority1, lowPriority1] = getPriorities(bond.atom1, context);
  const [highPriority2, lowPriority2] = getPriorities(bond.atom2, context);
  
  if (areOnSameSide(highPriority1, highPriority2, bond)) {
    return 'Z'; // Zusammen (together)
  } else {
    return 'E'; // Entgegen (opposite)
  }
}
```

#### Step 4: Integrate with Name Assembly

```typescript
// src/iupac-engine/naming/iupac-name-assembler.ts
function assembleFullName(context: IUPACContext): string {
  let name = '';
  
  // Add E/Z descriptors
  if (context.ezDescriptors && context.ezDescriptors.length > 0) {
    const descriptors = context.ezDescriptors
      .map(d => `${d.locant}${d.descriptor}`)
      .join(',');
    name += `(${descriptors})-`;
  }
  
  // Add parent name
  name += context.parentName;
  
  // Add suffixes
  if (context.principalGroup) {
    name += getSuffixName(context.principalGroup);
  }
  
  return name;
}
```

#### Step 5: Validate

```bash
# Run tests
bun test test/unit/iupac-engine/p31-ez-stereo.test.ts

# Compare with RDKit
bun test test/rdkit-comparison/ --grep "E/Z"

# Test on realistic dataset
bun test test/unit/iupac-engine/realistic-iupac-test.test.ts
```

#### Step 6: Document

Update `docs/iupac-rules-reference.md` with implementation status:

```markdown
### P-31.2: Alkene Stereochemistry

**Status:** ✅ Implemented  
**Coverage:** Full E/Z configuration support  
**Limitations:** None  
**Tests:** `test/unit/iupac-engine/p31-ez-stereo.test.ts`
```

### Common Extension Patterns

#### Adding Functional Group Support

1. Add group definition to `src/iupac-engine/rules/functional-groups-layer.ts`
2. Define suffix in OPSIN data or local mapping
3. Update seniority table for main chain selection
4. Write tests for group detection and naming

#### Adding Ring System Support

1. Add ring pattern to OPSIN `fusionComponents.xml` or local data
2. Implement ring detection in `src/iupac-engine/naming/iupac-rings/`
3. Handle numbering rules specific to the ring system
4. Test with fusion nomenclature tests

#### Adding Stereochemistry Support

1. Detect stereocenters in context builder
2. Implement configuration assignment (R/S, E/Z, etc.)
3. Add descriptor to name assembly
4. Validate against molecules with known stereochemistry

---

## Performance Considerations

### Algorithmic Complexity

| Operation | Complexity | Notes |
|-----------|-----------|-------|
| Ring finding (SSSR) | O(N²) | Bottleneck for large molecules |
| Main chain selection | O(N² log N) | All chains enumeration + sorting |
| Numbering | O(N) | Two passes (forward + reverse) |
| Functional group detection | O(N × G) | N = atoms, G = group patterns |
| Name assembly | O(N) | Linear string concatenation |

### Optimization Strategies

#### 1. Early Termination

Stop chain enumeration when no better chain possible:

```typescript
function findAllChains(molecule: Molecule, maxLength: number): number[][] {
  const chains: number[][] = [];
  let currentBest = 0;
  
  for (const startAtom of molecule.atoms) {
    const chain = growChain(startAtom, molecule);
    
    if (chain.length > currentBest) {
      currentBest = chain.length;
      chains.push(chain);
    } else if (chain.length + remainingAtoms < currentBest) {
      break; // Can't beat current best
    }
  }
  
  return chains;
}
```

#### 2. Caching Ring Analysis

Ring analysis is expensive - cache results:

```typescript
const ringCache = new WeakMap<Molecule, Ring[]>();

function getRings(molecule: Molecule): Ring[] {
  if (ringCache.has(molecule)) {
    return ringCache.get(molecule)!;
  }
  
  const rings = findSSSR(molecule.atoms, molecule.bonds);
  ringCache.set(molecule, rings);
  return rings;
}
```

#### 3. Lazy Evaluation

Defer expensive operations until needed:

```typescript
interface IUPACContext {
  molecule: Molecule;
  _rings?: Ring[]; // Cached lazily
  
  get rings(): Ring[] {
    if (!this._rings) {
      this._rings = findSSSR(this.molecule.atoms, this.molecule.bonds);
    }
    return this._rings;
  }
}
```

### Performance Targets

- **Small molecules (< 30 atoms)**: < 10ms
- **Medium molecules (30-60 atoms)**: < 100ms
- **Large molecules (60-100 atoms)**: < 1s
- **Very large (> 100 atoms)**: See [Large Molecule Analysis](./iupac-large-molecules.md)

---

## References

- [IUPAC Blue Book 2013](https://iupac.org/what-we-do/books/bluebook/)
- [OPSIN GitHub](https://github.com/dan2097/opsin)
- [RDKit Documentation](https://www.rdkit.org/docs/)
- [Rules Reference](./iupac-rules-reference.md) - Detailed rule specifications
- [Capabilities & Roadmap](./iupac-capabilities.md) - Current status and future plans

---

**Next:** [Rules Reference](./iupac-rules-reference.md) for detailed IUPAC rule specifications
