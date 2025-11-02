# IUPAC Naming Engine - Rules Architecture

**Last Updated:** Nov 2, 2025

This document provides a comprehensive overview of the modular rule-based architecture for IUPAC systematic nomenclature in openchem.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture Principles](#architecture-principles)
3. [Layer Structure](#layer-structure)
4. [Layer Execution Order](#layer-execution-order)
5. [Data Flow](#data-flow)
6. [Module Organization](#module-organization)
7. [Blue Book Alignment](#blue-book-alignment)
8. [Adding New Rules](#adding-new-rules)
9. [Testing Strategy](#testing-strategy)
10. [References](#references)

---

## Overview

The IUPAC naming engine uses a **layered rule-based architecture** that mirrors the IUPAC Blue Book's systematic approach to nomenclature. Each layer is responsible for a specific phase of name generation, from atomic-level analysis to final name assembly.

### Key Design Goals

- **Modularity**: Each layer and rule module is independently testable
- **Blue Book Alignment**: Code structure directly maps to IUPAC sections (P-14, P-44, P-51, etc.)
- **Immutability**: Naming context is immutable; rules return new context objects
- **Traceability**: Full execution history for debugging and validation
- **Extensibility**: Easy to add new rules without modifying existing code

---

## Architecture Principles

### 1. Layered Processing

The engine processes molecules through **8 sequential layers**, each building upon the results of previous layers:

```
Atomic Layer → Ring Analysis → Initial Structure → Parent Chain Selection 
  → Nomenclature Method → Numbering → Functional Groups → Name Assembly
```

### 2. Rule-Based Execution

Each layer contains **multiple rules** that:
- Execute in priority order (0-100 scale, higher = earlier execution)
- Receive an immutable `ImmutableNamingContext`
- Return a new context with updated state
- Can add conflicts, traces, and decision points

### 3. Immutable Context Pattern

The `ImmutableNamingContext` ensures:
- No side effects from rule execution
- Complete execution history for debugging
- Safe parallel execution potential
- Clear data flow between layers

### 4. Blue Book Compliance

Every rule module directly references IUPAC Blue Book sections:
- **P-14**: Numbering (P-14.1 through P-14.4)
- **P-44**: Parent structure selection (P-44.1 through P-44.4)
- **P-51**: Nomenclature methods (P-51.1 through P-51.4)
- **P-2**: Ring systems (P-2.3 through P-2.5)
- **P-3**: Heteroatom substituents
- **P-25**: Aromatic systems

---

## Layer Structure

### Directory Organization

```
src/iupac-engine/rules/
├── atomic-layer/                      # Atomic properties & valence
│   ├── P-00-atomic-hybridization.ts
│   ├── P-00-atomic-valence.ts
│   ├── P-25.1-aromatic-parents.ts
│   ├── P-44.2-ring-seniority.ts
│   ├── P-44.2.2-heteroatom-seniority.ts
│   ├── P-44.3.2-3-multiple-bond-seniority.ts
│   └── index.ts
│
├── ring-analysis-layer/               # Ring system detection & seniority
│   ├── P-2.3-ring-assemblies.ts      # Ring assembly rules
│   ├── P-2.4-spiro-compounds.ts      # Spiro system detection
│   ├── P-2.5-fused-ring-systems.ts   # Fused ring nomenclature
│   ├── P-44.1.1-principal-characteristic-groups.ts
│   ├── P-44.2.1-ring-system-detection.ts
│   ├── P-44.2.2-heteroatom-seniority.ts
│   ├── P-44.2.3-ring-size-seniority.ts
│   ├── P-44.2.4-maximum-rings.ts
│   ├── ring-selection-complete.ts    # Main orchestration
│   ├── helpers.ts                     # Shared utilities
│   └── index.ts
│
├── initial-structure-layer/           # Parent structure identification
│   ├── P-2.1-heteroatom-parents.ts   # Heteroatom parent hydrides
│   ├── P-3-heteroatom-substituents.ts # Complex substituent detection
│   ├── P-44.3.1-initial-structure-analysis.ts
│   ├── P-44.4-ring-vs-chain.ts       # Ring vs chain preference
│   └── index.ts
│
├── parent-chain-selection-layer/     # Acyclic parent chain selection (P-44.3)
│   ├── P-44.3.1-maximum-length.ts    # Longest chain rule
│   ├── P-44.3.2-multiple-bonds.ts    # Maximum multiple bonds
│   ├── P-44.3.3-double-bonds.ts      # Maximum double bonds
│   ├── P-44.3.4-multiple-bond-locants.ts  # Lowest multiple bond locants
│   ├── P-44.3.5-double-bond-locants.ts    # Lowest double bond locants
│   ├── P-44.3.6-substituents.ts      # Maximum number of substituents
│   ├── P-44.3.7-substituent-locants.ts    # Lowest substituent locants
│   ├── P-44.3.8-alphabetical-locant.ts    # Alphabetical order tie-breaking
│   ├── P-44.4-ring-vs-chain-analysis.ts
│   ├── parent-chain-selection-complete.ts # Main orchestration
│   ├── helpers.ts                     # Shared utilities (chain analysis, scoring)
│   └── index.ts
│
├── nomenclature-method-layer/         # Method selection (P-51)
│   ├── P-51.1-substitutive-nomenclature.ts  # Substitutive method
│   ├── P-51.2-functional-class-nomenclature.ts # Functional class method
│   ├── P-51.3-skeletal-replacement-nomenclature.ts # "a" nomenclature
│   ├── P-51.4-multiplicative-nomenclature.ts
│   ├── conjunctive-nomenclature.ts   # Conjunctive method
│   └── index.ts
│
├── numbering-layer/                   # Atom numbering (P-14)
│   ├── p14-1-fixed-locants.ts        # P-14.1: Fixed numbering (heteroatoms)
│   ├── p14-2-lowest-locant-set.ts    # P-14.2: Lowest locant set
│   ├── p14-3-principal-group-numbering.ts # P-14.3: Principal groups priority
│   ├── p14-4-multiple-bonds-substituents.ts # P-14.4: Unsaturation & substituents
│   ├── ring-numbering.ts             # Ring system numbering logic
│   ├── substituent-numbering.ts      # Acyclic substituent numbering
│   ├── numbering-complete.ts         # Main orchestration
│   ├── helpers.ts                     # 11 shared utilities
│   └── index.ts
│
├── functional-groups-layer.ts         # Functional group detection & prioritization
└── name-assembly-layer.ts             # Final name construction
```

---

## Layer Execution Order

The engine executes layers in the following order (defined in `layer-config.ts`):

### 1. Atomic Layer
**Purpose**: Analyze atomic properties, hybridization, and valence  
**Outputs**: Atomic metadata, aromatic atom identification  
**Blue Book**: P-00 (atomic properties), P-25.1 (aromaticity)

### 2. Ring Analysis Layer
**Purpose**: Detect ring systems, classify by type (fused/spiro/assembly), establish seniority  
**Outputs**: Ring system identification, seniority order  
**Blue Book**: P-2.3-2.5 (ring systems), P-44.1-44.2 (ring seniority)

### 3. Initial Structure Layer
**Purpose**: Identify parent hydrides, detect complex substituents  
**Outputs**: Initial parent structure candidates  
**Blue Book**: P-2.1 (heteroatom parents), P-3 (substituents), P-44.3.1 (structure analysis)

### 4. Parent Chain Selection Layer
**Purpose**: Apply sequential criteria to select optimal parent chain for acyclic compounds  
**Outputs**: Selected parent chain, substituent assignments  
**Blue Book**: P-44.3.1-44.3.8 (chain selection criteria)  
**Criteria Order** (P-44.3):
1. Maximum chain length
2. Maximum number of multiple bonds
3. Maximum number of double bonds
4. Lowest locants for multiple bonds
5. Lowest locants for double bonds
6. Maximum number of substituents
7. Lowest locants for substituents
8. Earliest alphabetical locant at first difference

### 5. Nomenclature Method Layer
**Purpose**: Select naming method (substitutive, functional class, skeletal replacement, etc.)  
**Outputs**: Selected nomenclature method  
**Blue Book**: P-51.1-51.4 (nomenclature methods)

### 6. Numbering Layer
**Purpose**: Assign locants to atoms according to P-14 criteria  
**Outputs**: Atom numbering, locant assignments  
**Blue Book**: P-14.1-14.4 (numbering criteria)  
**Criteria Order** (P-14):
1. Fixed numbering (heteroatoms in heterocycles)
2. Lowest locant set for principal characteristic groups
3. Lowest locants for multiple bonds
4. Lowest locants for substituents (in order of citation)

### 7. Functional Groups Layer
**Purpose**: Detect and prioritize functional groups  
**Outputs**: Principal group, suffix groups, prefix groups  
**Blue Book**: P-44.1 (functional group seniority)

### 8. Name Assembly Layer
**Purpose**: Construct final IUPAC name from all components  
**Outputs**: Complete IUPAC name string  
**Blue Book**: P-14-P-68 (name construction rules)

---

## Data Flow

### Context Evolution Through Layers

```
Input: Molecule
  ↓
[Atomic Layer]
  → Context with atomic metadata, hybridization, valence
  ↓
[Ring Analysis Layer]
  → Context with ring systems, seniority order
  ↓
[Initial Structure Layer]
  → Context with parent structure candidates, substituents
  ↓
[Parent Chain Selection Layer]
  → Context with selected parent chain, chain scoring
  ↓
[Nomenclature Method Layer]
  → Context with selected nomenclature method
  ↓
[Numbering Layer]
  → Context with atom numbering, locant assignments
  ↓
[Functional Groups Layer]
  → Context with functional group classification
  ↓
[Name Assembly Layer]
  → Final IUPAC name string
```

### Key Context Properties

```typescript
interface ImmutableNamingContext {
  // Input molecule
  molecule: Molecule;
  
  // Execution state
  currentPhase: ExecutionPhase;
  executedRules: string[];
  
  // Structural analysis
  parentStructure?: ParentStructure;
  rings?: RingInfo;
  chainCandidates?: ChainCandidate[];
  
  // Naming components
  numbering?: AtomNumbering;
  functionalGroups?: FunctionalGroupInfo;
  substituents?: Substituent[];
  
  // Method selection
  nomenclatureMethod?: NomenclatureMethod;
  
  // History & debugging
  history: ExecutionTrace[];
  conflicts: Conflict[];
}
```

---

## Module Organization

### Pattern: Layer with Multiple Rules

Each modularized layer follows this pattern:

```typescript
// P-44.3.1-maximum-length.ts
import type { IUPACRule } from '../../types';

export const maximumLengthRule: IUPACRule = {
  id: 'P-44.3.1-maximum-length',
  name: 'Maximum Chain Length',
  description: 'Select chain with maximum number of skeletal atoms',
  phase: ExecutionPhase.PARENT_CHAIN_SELECTION,
  priority: 90,
  
  apply(context: ImmutableNamingContext): ImmutableNamingContext {
    // Rule implementation
    const candidates = context.chainCandidates || [];
    const filtered = candidates.filter(/* logic */);
    return context.withChainCandidates(filtered);
  }
};
```

### Pattern: Index File for Exports

```typescript
// parent-chain-selection-layer/index.ts
export { maximumLengthRule } from './P-44.3.1-maximum-length';
export { multipleBondsRule } from './P-44.3.2-multiple-bonds';
// ... 6 more rules

export const PARENT_CHAIN_SELECTION_RULES = [
  maximumLengthRule,
  multipleBondsRule,
  doubleBondsRule,
  multipleBondLocantsRule,
  doubleBondLocantsRule,
  substituentsRule,
  substituentLocantsRule,
  alphabeticalLocantRule
];
```

### Pattern: Helpers Module

Shared utilities are extracted to `helpers.ts`:

```typescript
// parent-chain-selection-layer/helpers.ts
export function analyzeChain(atoms: Atom[], bonds: Bond[]): ChainAnalysis {
  // Shared analysis logic
}

export function scoreChain(chain: ChainCandidate, criteria: string): number {
  // Shared scoring logic
}

export function compareChains(a: ChainCandidate, b: ChainCandidate): number {
  // Shared comparison logic
}
```

---

## Blue Book Alignment

### Direct Section Mapping

| File | Blue Book Section | Description |
|------|-------------------|-------------|
| **Numbering Layer** | | |
| `p14-1-fixed-locants.ts` | P-14.1 | Fixed numbering for heteroatom rings |
| `p14-2-lowest-locant-set.ts` | P-14.2 | Lowest locant set principle |
| `p14-3-principal-group-numbering.ts` | P-14.3 | Principal characteristic group priority |
| `p14-4-multiple-bonds-substituents.ts` | P-14.4 | Multiple bonds and substituent locants |
| **Parent Chain Selection** | | |
| `P-44.3.1-maximum-length.ts` | P-44.3.1 | Longest chain rule |
| `P-44.3.2-multiple-bonds.ts` | P-44.3.2 | Maximum multiple bonds |
| `P-44.3.3-double-bonds.ts` | P-44.3.3 | Maximum double bonds |
| `P-44.3.4-multiple-bond-locants.ts` | P-44.3.4 | Lowest multiple bond locants |
| `P-44.3.5-double-bond-locants.ts` | P-44.3.5 | Lowest double bond locants |
| `P-44.3.6-substituents.ts` | P-44.3.6 | Maximum substituents |
| `P-44.3.7-substituent-locants.ts` | P-44.3.7 | Lowest substituent locants |
| `P-44.3.8-alphabetical-locant.ts` | P-44.3.8 | Alphabetical order at first difference |
| **Ring Systems** | | |
| `P-2.3-ring-assemblies.ts` | P-2.3 | Ring assemblies (biphenyl, etc.) |
| `P-2.4-spiro-compounds.ts` | P-2.4 | Spiro compounds |
| `P-2.5-fused-ring-systems.ts` | P-2.5 | Fused ring systems |
| `P-44.2.1-ring-system-detection.ts` | P-44.2.1 | Ring system identification |
| `P-44.2.2-heteroatom-seniority.ts` | P-44.2.2 | Heteroatom seniority order |
| `P-44.2.3-ring-size-seniority.ts` | P-44.2.3 | Ring size preference |
| `P-44.2.4-maximum-rings.ts` | P-44.2.4 | Maximum number of rings |
| **Initial Structure** | | |
| `P-2.1-heteroatom-parents.ts` | P-2.1 | Heteroatom parent hydrides |
| `P-3-heteroatom-substituents.ts` | P-3 | Heteroatom substituent detection |
| **Nomenclature Methods** | | |
| `P-51.1-substitutive-nomenclature.ts` | P-51.1 | Substitutive nomenclature |
| `P-51.2-functional-class-nomenclature.ts` | P-51.2 | Functional class nomenclature |
| `P-51.3-skeletal-replacement-nomenclature.ts` | P-51.3 | Skeletal replacement ("a" nomenclature) |
| `P-51.4-multiplicative-nomenclature.ts` | P-51.4 | Multiplicative nomenclature |

---

## Adding New Rules

### Step-by-Step Guide

1. **Identify the Blue Book section** your rule implements
2. **Determine the appropriate layer** based on execution phase
3. **Create a new rule file** with naming pattern: `P-XX.Y-description.ts`
4. **Implement the rule** following the `IUPACRule` interface:

```typescript
import type { IUPACRule } from '../../types';
import { ExecutionPhase } from '../../immutable-context';

export const myNewRule: IUPACRule = {
  id: 'P-XX.Y-my-rule',
  name: 'Descriptive Rule Name',
  description: 'What this rule does according to Blue Book P-XX.Y',
  phase: ExecutionPhase.APPROPRIATE_PHASE,
  priority: 50, // 0-100, higher = earlier execution
  
  apply(context: ImmutableNamingContext): ImmutableNamingContext {
    // 1. Check preconditions
    if (!context.someRequiredData) {
      return context; // No-op if prerequisites not met
    }
    
    // 2. Perform analysis
    const result = analyzeStructure(context.molecule);
    
    // 3. Return new context with updates
    return context.withSomeData(result);
  }
};
```

5. **Add to layer index**:

```typescript
// layer/index.ts
export { myNewRule } from './P-XX.Y-my-rule';

export const LAYER_RULES = [
  existingRule1,
  myNewRule, // Add in priority order
  existingRule2
];
```

6. **Add tests**:

```typescript
// test/unit/iupac-engine/rules/layer/P-XX.Y-my-rule.test.ts
import { describe, it, expect } from 'bun:test';
import { myNewRule } from 'src/iupac-engine/rules/layer/P-XX.Y-my-rule';

describe('P-XX.Y My Rule', () => {
  it('should apply rule correctly', () => {
    const context = createTestContext();
    const result = myNewRule.apply(context);
    expect(result.someData).toEqual(expectedValue);
  });
});
```

### Rule Design Best Practices

- **Single Responsibility**: Each rule should implement exactly one Blue Book criterion
- **Immutability**: Always return a new context; never mutate input
- **Idempotency**: Running the same rule twice should produce the same result
- **Composability**: Rules should not depend on execution order within a layer (when possible)
- **Traceability**: Use `context.withTrace()` to record decision points
- **Error Handling**: Use `context.withConflict()` for ambiguous cases

---

## Testing Strategy

### Unit Tests

Test individual rules in isolation:

```typescript
describe('P-44.3.1 Maximum Length Rule', () => {
  it('should select longest chain', () => {
    const mol = parseSMILES('CCCCCC(CC)CC').molecules[0];
    const context = ImmutableNamingContext.create(mol);
    const result = maximumLengthRule.apply(context);
    expect(result.chainCandidates?.[0].length).toBe(8);
  });
});
```

### Integration Tests

Test layer execution with multiple rules:

```typescript
describe('Parent Chain Selection Layer', () => {
  it('should apply all criteria in order', () => {
    const mol = parseSMILES('CC(C)CCC(C)C').molecules[0];
    const result = selectParentChain(mol);
    expect(result.parentChain.atoms).toHaveLength(7);
  });
});
```

### Regression Tests

Use PubChem dataset for validation:

```typescript
describe('IUPAC Name Generation - PubChem 300', () => {
  it('should match expected names for diverse molecules', () => {
    const dataset = loadPubChemDataset();
    dataset.forEach(({ smiles, expectedName }) => {
      const result = generateIUPACName(smiles);
      expect(result.name).toBe(expectedName);
    });
  });
});
```

### Current Test Coverage

- **Total tests**: 1336 passing
- **Known failures**: 3 (ester handling, heteroatom groups)
- **Coverage**: ~70% (estimated)
- **Test files**: 66 across unit, integration, and comparison tests

---

## References

### IUPAC Blue Book
- [Nomenclature of Organic Chemistry - IUPAC Recommendations 2013](https://iupac.org/what-we-do/books/bluebook/)
- P-14: Numbering
- P-44: Seniority Order for Parent Structures
- P-51: Nomenclature Methods

### Internal Documentation
- `docs/iupac-rules.md` - Blue Book rule inventory
- `docs/iupac-refactor-phases.md` - Refactoring progress
- `docs/iupac-engine-implementation.md` - Implementation details
- `src/iupac-engine/types.ts` - Type definitions
- `src/iupac-engine/immutable-context.ts` - Context API

### Related Modules
- `src/utils/ring-analysis.ts` - Ring detection algorithms
- `src/utils/molecular-properties.ts` - Property calculations
- `src/parsers/smiles-parser.ts` - SMILES input parsing
- `src/generators/smiles-generator.ts` - SMILES output generation

---

## Changelog

### Nov 2, 2025
- ✅ Documented complete modular structure after Phase 7 and Phase 8
- ✅ Added Blue Book section mapping table
- ✅ Documented layer execution order and data flow
- ✅ Added guide for adding new rules

### Oct 2025
- ✅ Completed Phase 7: Numbering layer modularization (9 files)
- ✅ Completed Phase 8: Bluebook directory integration
- ✅ Completed Phase 6: Parent chain selection modularization (11 files)

---

For questions or contributions, see [CONTRIBUTING.md](../../../CONTRIBUTING.md) or open an issue on GitHub.
