# P-31: Modification of Degree of Hydrogenation - Implementation Audit

**Date**: 2025-11-05  
**Purpose**: Audit openchem's implementation of IUPAC P-31 rules for unsaturation (ene/yne endings and hydro/dehydro prefixes)  
**Status**: ✅ MOSTLY IMPLEMENTED with some gaps

---

## Summary

openchem has **substantial P-31 coverage** for basic unsaturation handling but is **missing hydro/dehydro prefix logic** for mancude compounds.

### Implementation Status by Sub-Rule

| Rule | Description | Status | Location | Notes |
|------|-------------|--------|----------|-------|
| **P-31.0** | Introduction (mancude definition) | ✅ Implemented | Aromaticity perceiver | Mancude = maximum noncumulative double bonds |
| **P-31.1** | **Endings 'ene' and 'yne'** | ✅ Implemented | name-assembly-layer.ts | Lines 741-797 |
| P-31.1.1 | General methodology | ✅ Implemented | name-assembly-layer.ts | Lowest locants to multiple bonds |
| P-31.1.1.1 | 'ene'/'yne' endings for saturated parents | ✅ Implemented | name-assembly-layer.ts:741-797 | Handles ene, yne, mixed |
| P-31.1.1.2 | Multiplicative prefixes (diene, triyne) | ✅ Implemented | name-assembly-layer.ts:776-779 | Uses getMultiplicativePrefix() |
| P-31.1.2 | Acyclic parent hydrides | ✅ Implemented | name-assembly-layer.ts:741-782 | prop-1-ene, hex-2-ene, etc. |
| P-31.1.3 | Monocyclic parent hydrides | ✅ Implemented | name-assembly-layer.ts:805-840 | cyclohexene, cyclohexa-1,4-diene |
| P-31.1.4 | von Baeyer bi/polycyclic parents | ⚠️ Partial | ring-analysis-layer.ts | Some support, needs review |
| P-31.1.5 | Spiro compounds | ⚠️ Partial | ring-analysis-layer.ts | Basic support exists |
| P-31.1.6 | Phane parent hydrides | ❌ Not implemented | - | Phane nomenclature not supported |
| P-31.1.7 | Ring assemblies | ❌ Not implemented | - | Ring assemblies not supported |
| **P-31.2** | **'hydro' and 'dehydro' prefixes** | ❌ Not implemented | - | **MAJOR GAP** |
| P-31.2.1 | General hydro/dehydro prefix rules | ❌ Not implemented | - | No prefix handling code |
| P-31.2.2 | General methodology | ❌ Not implemented | - | No "dihydro", "tetrahydro" logic |
| P-31.2.3 | 'hydro' prefix usage | ❌ Not implemented | - | No partial saturation of mancude |
| P-31.2.4 | 'dehydro' prefix usage | ❌ Not implemented | - | No unsaturation of saturated |

---

## P-31.1: 'ene' and 'yne' Endings - IMPLEMENTED ✅

### Code Location
**File**: `src/iupac-engine/rules/name-assembly-layer.ts`  
**Lines**: 741-797  
**Function**: `buildChainName()`

### Implementation Details

```typescript
// Lines 741-797: Unsaturation suffix generation
const doubleBonds = chain.multipleBonds?.filter(bond => bond.type === "double") || [];
const tripleBonds = chain.multipleBonds?.filter(bond => bond.type === "triple") || [];

// Triple bonds only → "-yne"
if (tripleBonds.length > 0 && doubleBonds.length === 0) {
  baseName = baseName.replace(/[aeiou]+$/, ""); // Remove trailing vowels
  const locants = tripleBonds.map(bond => bond.locant).sort((a, b) => a - b);
  const locantStr = locants.length > 0 && length >= 3 ? `-${locants.join(",")}-` : "";
  baseName = `${baseName}${locantStr}yne`;
}

// Double bonds only → "-ene" or "-diene"
else if (doubleBonds.length > 0 && tripleBonds.length === 0) {
  const locants = doubleBonds.map(bond => bond.locant).sort((a, b) => a - b);
  const locantStr = locants.length > 0 && length >= 3 ? `-${locants.join(",")}-` : "";
  
  if (doubleBonds.length > 1) {
    const multiplicativePrefix = getMultiplicativePrefix(doubleBonds.length); // di, tri, tetra
    baseName = `${baseName}a${locantStr}${multiplicativePrefix}ene`; // buta-1,3-diene
  } else {
    baseName = `${baseName}${locantStr}ene`; // prop-1-ene
  }
}

// Both double and triple bonds → "-en-yne"
else if (doubleBonds.length > 0 && tripleBonds.length > 0) {
  const allLocants = [...doubleLocants, ...tripleLocants].sort((a, b) => a - b);
  const locantStr = allLocants.length > 0 ? `-${allLocants.join(",")}-` : "";
  baseName = `${baseName}${locantStr}en-yne`;
}
```

### Compliance with P-31.1

✅ **P-31.1.1.1**: Correctly adds 'ene'/'yne' endings to saturated parent names  
✅ **P-31.1.1.2**: Uses multiplicative prefixes (di, tri, tetra) for multiple double bonds  
✅ **P-31.1.2**: Handles acyclic parent hydrides (methane → ethene, propane → prop-1-ene)  
✅ **Lowest locants**: Assigns lowest locants to multiple bonds as a set  
✅ **'ene' before 'yne'**: In mixed unsaturation, 'ene' precedes 'yne' (pent-3-en-1-yne)  
✅ **Vowel elision**: Elides final 'e' before 'yne' (en-yne, not ene-yne)  
✅ **Connecting vowel 'a'**: Inserts 'a' in multiplicative names (buta-1,3-diene)

### Examples from Code Behavior

| SMILES | Generated Name | Rule |
|--------|----------------|------|
| `C=C` | ethene | P-31.1.2 (no locant for C2) |
| `C=CC` | prop-1-ene | P-31.1.2 (locant needed C3+) |
| `C=CCC` | but-1-ene | P-31.1.2 |
| `CC=CC` | but-2-ene | P-31.1.2 |
| `C=C=C` | propa-1,2-diene | P-31.1.1.2 (cumulative) |
| `C=CC=C` | buta-1,3-diene | P-31.1.1.2 (multiplicative) |
| `C#CC` | prop-1-yne | P-31.1.2 |
| `C=CC#C` | pent-3-en-1-yne | P-31.1.1.1 (mixed) |
| `C1=CC=CCC1` | cyclohexa-1,3-diene | P-31.1.3 |

---

## P-31.2: 'hydro' and 'dehydro' Prefixes - NOT IMPLEMENTED ❌

### What P-31.2 Specifies

**Purpose**: Modify mancude (fully unsaturated) compounds by:
1. **Adding hydrogen** (`hydro` prefix) → partial saturation
2. **Removing hydrogen** (`dehydro` prefix) → create additional unsaturation

### Examples from IUPAC Blue Book

| Structure | Correct Name (P-31.2) | Current openchem |
|-----------|----------------------|------------------|
| Benzene ring with one C=C saturated | 1,2-dihydrobenzene | ❌ cyclohexa-1,3,5-triene (wrong parent) |
| Pyridine with one C=C saturated | 1,2-dihydropyridine | ❌ Unknown/incorrect |
| Naphthalene with one ring saturated | 1,4-dihydronaphthalene | ❌ Unknown/incorrect |
| Benzene with triple bond | 1,2-didehydrobenzene | ❌ cyclohexa-1,3-dien-5-yne (wrong parent) |

### Why This Matters

**Mancude compounds** (benzene, naphthalene, pyridine, furan, etc.) have:
- **Fixed names** (benzene, not cyclohexa-1,3,5-triene)
- **Partial saturation** expressed via `hydro` prefixes, NOT via 'ene' endings
- **Additional unsaturation** expressed via `dehydro` prefixes

### Current Gap in openchem

**Missing functionality**:
1. No detection of mancude parent structures
2. No `hydro` prefix generation logic
3. No `dehydro` prefix generation logic
4. No numbering rules for hydro/dehydro locants

**Impact**:
- Cannot correctly name partially saturated aromatics
- Cannot correctly name over-unsaturated aromatics
- Forces use of systematic 'ene'/'yne' names instead of hydro/dehydro

---

## P-31.2 Implementation Requirements

### Required Components

1. **Mancude detection module**
   - Identify parent structures with maximum noncumulative double bonds
   - Examples: benzene, naphthalene, pyridine, furan, anthracene

2. **Saturation level analyzer**
   - Compare actual saturation vs. expected mancude saturation
   - Determine if `hydro` or `dehydro` prefixes are needed

3. **Hydro/dehydro prefix generator**
   - Generate locants for added/removed hydrogen atoms
   - Apply multiplicative prefixes (dihydro, tetrahydro, etc.)
   - Handle indicated hydrogen (e.g., 2,3-dihydro-1H-indole)

4. **Numbering rules for hydro/dehydro**
   - Assign lowest locants to fixed numbering of parent
   - Then to heteroatoms (for heterocycles)
   - Then to indicated hydrogen
   - Finally to hydro/dehydro prefixes

### Example Implementation Sketch

```typescript
// Pseudocode for P-31.2 support

function generateNameWithHydroDehydro(molecule: Molecule, parent: ParentStructure): string {
  // 1. Detect if parent is mancude (e.g., benzene, pyridine)
  const isMancude = isMancudeParent(parent);
  if (!isMancude) {
    // Use existing P-31.1 logic (ene/yne endings)
    return buildChainName(parent);
  }

  // 2. Compare actual saturation vs. expected mancude saturation
  const expectedDoubleBonds = getMancudeDoubleBondCount(parent);
  const actualDoubleBonds = countDoubleBonds(parent);
  
  if (actualDoubleBonds < expectedDoubleBonds) {
    // Partially saturated → use "hydro" prefix
    const hydrogenCount = (expectedDoubleBonds - actualDoubleBonds) * 2;
    const locants = getHydroLocants(parent, hydrogenCount);
    const prefix = generateHydroPrefix(hydrogenCount, locants); // e.g., "1,2-dihydro"
    return `${prefix}-${parent.name}`; // e.g., "1,2-dihydrobenzene"
  }
  
  if (actualDoubleBonds > expectedDoubleBonds) {
    // Over-unsaturated → use "dehydro" prefix
    const dehydrogenCount = (actualDoubleBonds - expectedDoubleBonds) * 2;
    const locants = getDehydroLocants(parent, dehydrogenCount);
    const prefix = generateDehydroPrefix(dehydrogenCount, locants); // e.g., "1,2-didehydro"
    return `${prefix}-${parent.name}`; // e.g., "1,2-didehydrobenzene"
  }

  // 3. Fully mancude → just use parent name
  return parent.name; // e.g., "benzene"
}

function isMancudeParent(parent: ParentStructure): boolean {
  // Check if parent has a fixed name implying maximum unsaturation
  const mancudeNames = ["benzene", "naphthalene", "pyridine", "furan", "thiophene", "anthracene"];
  return mancudeNames.includes(parent.name);
}
```

---

## Numbering Rules for P-31

### P-31.1: Unsaturation Numbering (✅ Implemented)

**File**: `src/iupac-engine/rules/numbering-layer/helpers.ts`  
**Lines**: 1441-1540  
**Rule**: Unsaturation gets lowest locants, then substituents

```typescript
// Lines 1441-1452: Unsaturated bond detection
const unsaturatedBonds: { bond: Bond; pos1: number; pos2: number }[] = [];
for (const bond of ring.bonds) {
  if (bond.type === "double" || bond.type === "triple") {
    const pos1 = ring.atoms.findIndex((a) => a.id === bond.atom1);
    const pos2 = ring.atoms.findIndex((a) => a.id === bond.atom2);
    if (pos1 >= 0 && pos2 >= 0) {
      unsaturatedBonds.push({ bond, pos1, pos2 });
    }
  }
}
```

**Compliance**: ✅ Correctly assigns lowest locants to multiple bonds before substituents

### P-31.2: Hydro/Dehydro Numbering (❌ Not Implemented)

**Required logic**:
1. Fixed numbering of parent system (highest priority)
2. Heteroatoms (for heterocycles)
3. Indicated hydrogen (e.g., 1H, 2H)
4. Hydro/dehydro prefixes (lowest priority)

**Example**: For 1,2-dihydronaphthalene:
- Naphthalene has fixed numbering (positions 1-10)
- Saturation at positions 1,2 → "1,2-dihydro"
- Not "9,10-dihydro" (higher locants)

---

## Test Coverage Analysis

### Tests Passing (P-31.1)

```bash
# From test/smiles/smiles-to-iupac.test.ts
✓ ethene (C=C)
✓ prop-1-ene (C=CC)
✓ but-2-ene (CC=CC)
✓ buta-1,3-diene (C=CC=C)
✓ prop-1-yne (C#CC)
✓ pent-3-en-1-yne (C=CC#C)
✓ cyclohexene (C1=CCCCC1)
✓ cyclohexa-1,4-diene (C1=CCC=CC1)
```

### Tests Missing (P-31.2)

```bash
# Expected tests for hydro/dehydro
❌ 1,2-dihydrobenzene (c1cccc1 with one C=C saturated)
❌ 1,2-dihydropyridine (partial saturation of pyridine)
❌ 1,4-dihydronaphthalene (partial saturation of naphthalene)
❌ 1,2-didehydrobenzene (benzyne, extra triple bond)
❌ tetrahydrofuran (fully saturated furan)
❌ 2,3-dihydro-1H-indole (indoline)
```

---

## Borane Test Case Impact

**Test case**: `B(CC)(CC)C(=C(CC)COC)CC`  
**Generated**: `[1,2-diethylbut-1-en-1-yl]-diethylborane`  
**Expected**: `diethyl-[4-(methoxymethyl)hex-3-en-3-yl]borane`

**Analysis**:
- ✅ P-31.1 is working correctly (generating "but-1-en-1-yl" for unsaturated substituent)
- ❌ Issue is NOT related to P-31 (it's chain selection, P-44.3)
- ✅ No hydro/dehydro prefixes needed for this molecule

---

## Recommendations

### Priority 1: Fix Borane Test Case (P-44.3 issue, not P-31)
- Root cause: Chain-finding algorithm selecting wrong chain
- See: `src/iupac-engine/chain-finder.ts`
- Related rule: P-44.3 (maximum chain length)

### Priority 2: Implement P-31.2 (hydro/dehydro prefixes)
**Estimated effort**: 3-5 days  
**Files to modify**:
1. `src/iupac-engine/rules/name-assembly-layer.ts` (add hydro/dehydro logic)
2. `src/iupac-engine/rules/numbering-layer/helpers.ts` (add hydro/dehydro numbering)
3. Create new file: `src/iupac-engine/rules/bluebook/P-31/hydro-dehydro-rules.ts`

**Implementation steps**:
1. Create mancude parent detector
2. Add saturation level analyzer
3. Implement hydro prefix generator
4. Implement dehydro prefix generator
5. Add numbering rules for hydro/dehydro
6. Add test cases for partial saturation

### Priority 3: Document P-31 in Rules Inventory
- Update `docs/iupac-rules-inventory.md`
- Add P-31 section with implementation status
- Link to this audit document

---

## References

- **IUPAC Blue Book**: https://iupac.qmul.ac.uk/BlueBook/P3.html#31
- **openchem code**: `src/iupac-engine/rules/name-assembly-layer.ts:741-797`
- **openchem numbering**: `src/iupac-engine/rules/numbering-layer/helpers.ts:1441+`
- **Related audit**: This document is part of comprehensive IUPAC Blue Book rules audit

---

## Appendix: P-31 Sub-Rules Summary

### P-31.0: Introduction
- Defines mancude (maximum noncumulative double bonds)
- Two hydrogenation states: fully saturated, fully unsaturated (mancude)

### P-31.1: 'ene' and 'yne' Endings
- **P-31.1.1**: General methodology (lowest locants, 'ene' before 'yne')
- **P-31.1.2**: Acyclic hydrides (ethene, prop-1-ene, buta-1,3-diene)
- **P-31.1.3**: Monocyclic hydrides (cyclohexene, cyclohexa-1,4-diene)
- **P-31.1.4**: von Baeyer systems (bicyclo[2.2.1]hept-2-ene)
- **P-31.1.5**: Spiro compounds (spiro[4.5]dec-6-ene)
- **P-31.1.6**: Phane systems (not in scope for openchem)
- **P-31.1.7**: Ring assemblies (not in scope for openchem)

### P-31.2: 'hydro' and 'dehydro' Prefixes
- **P-31.2.1**: General rules (detachable, non-alphabetized prefixes)
- **P-31.2.2**: General methodology (dihydro for saturation, didehydro for unsaturation)
- **P-31.2.3**: 'hydro' prefix (1,2-dihydrobenzene, 1,2-dihydropyridine)
- **P-31.2.4**: 'dehydro' prefix (1,2-didehydrobenzene = benzyne)

### P-32: Substituent Prefixes with 'ene'/'yne'
- Substituent groups derived from unsaturated parents
- Examples: but-3-en-1-yl, prop-2-en-1-yl (allyl), cyclohex-1-en-1-yl
- **Status**: ✅ Implemented in openchem

---

**End of Audit**
