# IUPAC Name Generation: Fragile Sections Guide

This document identifies fragile code sections in the IUPAC name generation engine that are prone to breakage and provides guidance for maintaining them.

## Overview

The IUPAC naming engine has several critical filtering steps that must execute in a specific order. Changes to data structures, filtering logic, or execution order can cause regression test failures.

## Critical Code Sections

### 1. Ring Atom Filtering for Heterocycles

**Location**: `src/iupac-engine/rules/name-assembly-layer.ts` (lines 905-993)

**Purpose**: Prevents heteroatoms in ring structures from being misidentified as functional group substituents.

**Example**: Diaziridin-3-one (`CCC(C)(C)N1C(=O)N1C(C)(C)CC`)
- Structure: N-C(=O)-N three-membered ring
- Without fix: N atoms incorrectly identified as "azetidide" substituents
- With fix: N atoms correctly recognized as part of ring

**Critical Dependencies**:
```typescript
// MUST extract atom.id from Atom objects
parentStructure.ring.atoms  // Array<Atom>, not Array<number>
fgSub.atoms                 // Array<Atom>, not Array<number>

// Comparison logic
parentRingAtomIds.add(atom.id);  // NOT: add(atom)
```

**Warning Signs**:
- Test failure: `test/unit/iupac-engine/regressions/heteroatom-groups.test.ts` (diaziridin-one)
- Symptom: Spurious heteroatom-based substituents in name
- Root cause: Atom ID extraction broken

**How to Fix**:
1. Verify `parentStructure.ring.atoms` contains Atom objects with `.id` property
2. Verify `fgSub.atoms` contains Atom objects with `.id` property
3. If structure changed, update ID extraction logic (lines 940-941, 973-974)

---

### 2. Name-Based Filtering for Duplicate FGs

**Location**: `src/iupac-engine/rules/name-assembly-layer.ts` (lines 995-1093)

**Purpose**: Prevents duplicate functional group names when FGs are already incorporated in parent structure or substituent names.

**Example**: Sulfonyl-sulfinyl (`CC(C)(C)CS(=O)S(=O)(=O)CC(C)(C)C`)
- Structure: Chain with S=O (sulfinyl) and S(=O)(=O) (sulfonyl)
- Without fix: "...sulfonylsulfinyl-5-sulfinyl-7-sulfonyl..." (duplicates)
- With fix: "1-(2,2-dimethylpropylsulfonylsulfinyl)-2,2-dimethylpropane"

**Critical Dependencies**:
```typescript
// Check BOTH parent structure name AND parent substituent names
parentStructure.assembledName
parentSubstituents[].name or .type

// Length threshold to avoid false positives
if (parentSubName.length > 10) {  // Arbitrary but necessary
  // Filter if FG type appears in name
}
```

**Warning Signs**:
- Test failure: `test/unit/iupac-engine/regressions/heteroatom-groups.test.ts` (sulfonyl-sulfinyl)
- Symptom: Duplicate FG names in final IUPAC name
- Root cause: Parent substituent names not checked, or threshold too high

**How to Fix**:
1. Verify both `parentStructureName` and `parentSubstituentNames` are checked
2. If too many false positives: increase length threshold (line 1073)
3. If too many false negatives: decrease length threshold (line 1073)
4. Current threshold: `> 10` characters (works for current test suite)

---

### 3. Locant-Based Deduplication Map

**Location**: `src/iupac-engine/rules/name-assembly-layer.ts` (lines 1095-1126)

**Purpose**: Builds a map of FG locants and types for deduplication AFTER filtering.

**Example**: Bicyclo compound (`CC1CC2C(=O)CCC(C1O)O2`)
- Expected: `6-hydroxy-7-methyl-9-oxabicyclo[3.3.1]nonan-2-one`
- Without fix: Missing "6-hydroxy" in name
- Root cause: Map built from unfiltered FG list, causing incorrect deduplication

**Critical Dependencies**:
```typescript
// MUST build from fgSubstituentsFinal (after filtering)
const fgLocantTypeMap = new Map<string, any>();
for (const fgSub of fgSubstituentsFinal) {  // NOT fgSubstituents!
  // Build map
}
```

**Execution Order**:
1. Atom-based filtering → `fgSubstituentFilteredByAtoms`
2. Name-based filtering → `fgSubstituentsFinal`
3. Build locant map from `fgSubstituentsFinal` ← **CRITICAL**
4. Deduplicate parent substituents using locant map

**Warning Signs**:
- Test failure: `test/unit/iupac-engine/regressions/duplicated-substituent.test.ts` (bicyclo)
- Symptom: Missing substituents (e.g., "hydroxy" not in final name)
- Root cause: Map built from wrong FG list, or built too early

**How to Fix**:
1. Verify map built from `fgSubstituentsFinal`, not `fgSubstituents`
2. Verify map building happens AFTER both filtering steps
3. Check execution order: atoms → names → map → deduplication

---

## Test Suite

### Regression Tests

**Location**: `test/unit/iupac-engine/regressions/heteroatom-groups.test.ts`

**Test Cases**:

1. **Diaziridin-one** (`CCC(C)(C)N1C(=O)N1C(C)(C)CC`)
   - Tests: Ring atom filtering
   - Expected: `1,2-bis(2-methylbutan-2-yl)diaziridin-3-one`
   - Failure indicates: Atom ID extraction broken

2. **Sulfonyl-sulfinyl** (`CC(C)(C)CS(=O)S(=O)(=O)CC(C)(C)C`)
   - Tests: Name-based filtering
   - Expected: `1-(2,2-dimethylpropylsulfonylsulfinyl)-2,2-dimethylpropane`
   - Failure indicates: Parent substituent name checking broken

3. **Bicyclo** (`CC1CC2C(=O)CCC(C1O)O2`)
   - Tests: Locant deduplication map
   - Expected: `6-hydroxy-7-methyl-9-oxabicyclo[3.3.1]nonan-2-one`
   - Failure indicates: Map built from wrong source or wrong order

### Running Tests

```bash
# Run all regression tests
bun test test/unit/iupac-engine/regressions/

# Run specific test file
bun test test/unit/iupac-engine/regressions/heteroatom-groups.test.ts

# Run with verbose logging
VERBOSE=1 bun test test/unit/iupac-engine/regressions/heteroatom-groups.test.ts

# Run single test by name
bun test test/unit/iupac-engine/regressions/heteroatom-groups.test.ts -t "diaziridin-one"
```

---

## Debugging Guide

### When Tests Fail

1. **Check verbose logs**:
   ```bash
   VERBOSE=1 bun test test/unit/iupac-engine/regressions/heteroatom-groups.test.ts
   ```

2. **Look for filtering messages**:
   - `[buildSubstitutiveName] Filtering out FG` - Atom overlap detected
   - `[buildSubstitutiveName] FG type "X" already in parent` - Name-based filtering
   - `[buildSubstitutiveName] deduplicating parent substituent` - Locant deduplication

3. **Check data structures**:
   ```typescript
   console.log('[buildSubstitutiveName] parentRingAtomIds:', Array.from(parentRingAtomIds));
   console.log('[buildSubstitutiveName] fgSubstituents:', fgSubstituents.map(s => s.type));
   console.log('[buildSubstitutiveName] fgSubstituentsFinal:', fgSubstituentsFinal.map(s => s.type));
   ```

4. **Verify execution order**:
   - Check that atom filtering happens first
   - Check that name filtering happens second
   - Check that locant map is built from `fgSubstituentsFinal`

### Common Issues

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Spurious heteroatom substituents | Atom ID extraction broken | Check `.id` extraction in lines 940-941, 973-974 |
| Duplicate FG names | Parent substituent names not checked | Verify lines 1057-1081 |
| Missing substituents | Locant map built from wrong source | Check line 1117: use `fgSubstituentsFinal` |
| False positive filtering | Length threshold too low | Increase threshold on line 1073 (currently `> 10`) |
| False negative filtering | Length threshold too high | Decrease threshold on line 1073 |

---

## Data Structure Dependencies

### Critical Object Structures

```typescript
// Atom object (used in ring.atoms and fgSub.atoms)
interface Atom {
  id: number;        // CRITICAL: must be present
  symbol: string;
  // ... other properties
}

// Parent structure
interface ParentStructure {
  type: 'ring' | 'chain' | 'heteroatom';
  assembledName?: string;
  ring?: {
    atoms: Atom[];   // CRITICAL: Array of Atom objects, not IDs
  };
}

// Functional group substituent
interface FgSubstituent {
  type: string;      // CRITICAL: FG type name
  prefix?: string;   // Alternative name for matching
  atoms?: Atom[];    // CRITICAL: Array of Atom objects, not IDs
  locant?: number;
  // ... other properties
}
```

### Breaking Changes to Watch For

1. **Atom structure changes**:
   - If `.id` becomes `._id` or `.atomId`, update extraction logic
   - If `Atom` becomes a plain number, update comparison logic

2. **Ring structure changes**:
   - If `ring.atoms` becomes `Array<number>`, remove `.id` extraction
   - If `ring` structure changes, update validation guards

3. **FG substituent changes**:
   - If `.type` becomes `.fgType`, update all references
   - If `.atoms` becomes `Array<number>`, remove `.id` extraction

---

## Maintenance Checklist

When modifying IUPAC name generation code:

- [ ] Run all regression tests: `bun test test/unit/iupac-engine/regressions/`
- [ ] Check execution order: atoms → names → locant map → deduplication
- [ ] Verify Atom objects still have `.id` property
- [ ] Verify `fgLocantTypeMap` built from `fgSubstituentsFinal`
- [ ] Test with VERBOSE=1 to see filtering logs
- [ ] Check for new edge cases that might need similar fixes

---

## References

- Main implementation: `src/iupac-engine/rules/name-assembly-layer.ts`
- Regression tests: `test/unit/iupac-engine/regressions/heteroatom-groups.test.ts`
- Related tests: `test/unit/iupac-engine/regressions/duplicated-substituent.test.ts`
- Session notes: Previous implementation session (Session 2)

---

## Version History

- **v1.0** (Current): Initial documentation after Session 2 fixes
  - Ring atom filtering (diaziridin-one fix)
  - Name-based filtering (sulfonyl-sulfinyl fix)
  - Locant deduplication (bicyclo fix)
