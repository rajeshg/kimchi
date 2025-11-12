# IUPAC Naming Engine - Rules Reference

This document provides a comprehensive reference to IUPAC Blue Book rules implemented in openchem's naming engine.

**Audience:** Rule implementers, chemistry domain experts, contributors  
**Related docs:** [Implementation Guide](./iupac-implementation.md) | [Capabilities](./iupac-capabilities.md) | [Documentation Hub](./iupac-readme.md)

---

## Table of Contents

1. [IUPAC Blue Book Overview](#iupac-blue-book-overview)
2. [Implementation Status Matrix](#implementation-status-matrix)
3. [P-14: Numbering and Locants](#p-14-numbering-and-locants)
4. [P-31: Unsaturated Hydrocarbons](#p-31-unsaturated-hydrocarbons)
5. [P-44: Parent Structure Selection](#p-44-parent-structure-selection)
6. [P-45: Preferred IUPAC Name Selection](#p-45-preferred-iupac-name-selection)
7. [P-51: Nomenclature Methods](#p-51-nomenclature-methods)
8. [P-63 to P-68: Functional Groups](#p-63-to-p-68-functional-groups)
9. [P-91 to P-93: Stereochemistry](#p-91-to-p-93-stereochemistry)
10. [Rule Priorities and Interactions](#rule-priorities-and-interactions)

---

## IUPAC Blue Book Overview

The **IUPAC Blue Book** (Nomenclature of Organic Chemistry - IUPAC Recommendations and Preferred Names 2013) is the authoritative source for organic compound naming.

### Blue Book Structure

| Section | Topic | Coverage in openchem |
|---------|-------|---------------------|
| **P-1** | General principles, rules, and conventions | ✅ Core concepts implemented |
| **P-2** | Parent hydrides | ✅ Acyclic, cyclic, fused systems |
| **P-3** | Characteristic and substituent groups | ⚠️ Partial (common groups) |
| **P-4** | Rules for name construction | ✅ Core construction logic |
| **P-5** | Selecting PINs and constructing names | ⚠️ Basic PIN support |
| **P-6** | Applications to specific classes | ⚠️ Limited coverage |
| **P-7** | Radicals, ions, and related species | ❌ Not yet implemented |
| **P-8** | Isotopically modified compounds | ❌ Not yet implemented |
| **P-9** | Stereochemistry | ⚠️ E/Z only, R/S in progress |

### Official Resources

- **Blue Book 2013**: https://iupac.org/what-we-do/books/bluebook/
- **IUPAC Gold Book**: https://goldbook.iupac.org/
- **PIN Guidelines**: https://iupac.org/project/2001-043-1-800/

---

## Implementation Status Matrix

### Summary Statistics

- **Total rules tracked**: 50+ distinct rule implementations
- **Total lines in rule files**: 8,006 lines
- **Test coverage**: 1094+ tests (66 test files)
- **Comparison validation**: RDKit and OPSIN

### By Rule Category

| Category | Total Rules | Implemented | Partial | Not Started |
|----------|-------------|-------------|---------|-------------|
| P-14 (Numbering) | 5 | 5 | 0 | 0 |
| P-31 (Unsaturation) | 4 | 3 | 1 | 0 |
| P-44 (Parent selection) | 20+ | 15 | 5 | 2 |
| P-45 (PIN selection) | 6 | 3 | 2 | 1 |
| P-51 (Methods) | 5 | 4 | 1 | 0 |
| P-63-P-68 (Functional groups) | 10+ | 7 | 3 | 5 |
| P-91-P-93 (Stereo) | 8 | 2 | 1 | 5 |

---

## P-14: Numbering and Locants

**Purpose:** Assign locant numbers to atoms according to the lowest locant principle.

### P-14.1: Fixed Numbering

**Status:** ✅ Fully implemented  
**Location:** `src/iupac-engine/numbering-layer.ts`  
**Tests:** `test/unit/iupac-engine/p14-numbering.test.ts`

Fixed numbering applies to certain parent structures where numbering is predetermined:

- **Fused ring systems**: Naphthalene (1-8), anthracene (1-14), etc.
- **Bridged systems**: Bicyclo[2.2.1]heptane (numbered by von Baeyer rules)
- **Spiro systems**: Spiro junction numbered before other atoms

**Example:**
```
Naphthalene numbering:
    8  1
   7    2
   6    3
    5  4
```

### P-14.2: Lowest Locant Set Principle

**Status:** ✅ Fully implemented  
**Location:** `src/iupac-engine/numbering-layer.ts`

When multiple numbering directions are possible, select the one giving the lowest locant set when compared term-by-term.

**Algorithm:**
1. Try both directions (1→N and N→1)
2. Extract locant sets for key features (heteroatoms, multiple bonds, substituents)
3. Compare lexicographically: `[2,3,5]` < `[2,4,5]` (first difference at position 2)

**Example:**
```
CC(C)C(C)CC
Direction 1: 1-2-3-4-5-6-7  → Substituents at 3,5
Direction 2: 7-6-5-4-3-2-1  → Substituents at 3,5
Result: Choose direction 1 (equivalent, choose first)
```

**Implementation:**
```typescript
function compareLocantSets(a: number[], b: number[]): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return a.length - b.length;
}
```

### P-14.3: Principal Group Numbering

**Status:** ✅ Fully implemented  
**Location:** `src/iupac-engine/numbering-layer.ts`

Priority order for assigning lowest locants:

1. **Fixed numbering** (if applicable)
2. **Heteroatoms** in the main chain (N, O, S, P)
3. **Principal characteristic group** (suffix: -OH, -COOH, etc.)
4. **Multiple bonds** (double, triple)
5. **Substituents** (alkyl, halo, etc.)

**Example:**
```
HOCH₂CH₂CH₂CH₃
Principal group: -OH (suffix -ol)
Numbering: 1-2-3-4 (OH at position 1)
Name: butan-1-ol
```

### P-14.4: Indicated Hydrogen

**Status:** ⚠️ Partially implemented  
**Location:** `src/iupac-engine/numbering-layer.ts`

Indicated hydrogen (H) used when hydrogen must be explicitly stated (e.g., in tautomeric forms or unsaturated rings).

**Example:**
```
Pyrrole: 1H-pyrrole (hydrogen on N at position 1)
Imidazole: 1H-imidazole
```

**Current limitation:** Indicated hydrogen only for basic heterocycles; extended systems pending.

### P-14.5: Alphabetization of Substituents

**Status:** ✅ Fully implemented  
**Location:** `src/iupac-engine/naming/iupac-name-assembler.ts`

Substituents are alphabetized by their **first letter**, ignoring:
- Multiplicative prefixes (di-, tri-, etc.)
- Stereodescriptors (R-, S-, E-, Z-)
- Locants (numbers)

**Example:**
```
5-ethyl-2-methylheptane
  'e' (ethyl) before 'm' (methyl)
  
4-chloro-2-fluorobutane
  'c' (chloro) before 'f' (fluoro)
```

**Implementation:**
```typescript
function alphabetizeSubstituents(substituents: Substituent[]): Substituent[] {
  return substituents.sort((a, b) => {
    const nameA = stripPrefixes(a.name); // Remove "di-", "tri-", etc.
    const nameB = stripPrefixes(b.name);
    return nameA.localeCompare(nameB);
  });
}
```

---

## P-31: Unsaturated Hydrocarbons

**Purpose:** Naming hydrocarbons with double and triple bonds.

### P-31.1: Alkenes (Double Bonds)

**Status:** ✅ Fully implemented  
**Location:** `src/iupac-engine/rules/initial-structure-layer/`  
**Tests:** `test/unit/iupac-engine/p31-unsaturation.test.ts`

**Rules:**
- Suffix: `-ene` for one double bond, `-diene` for two, etc.
- Locants: Position of double bond (use lower number)
- Priority: Double bonds given priority in numbering

**Examples:**
```
CH₂=CH-CH₃       → propene (or prop-1-ene)
CH₃-CH=CH-CH₃    → but-2-ene
CH₂=CH-CH=CH₂    → buta-1,3-diene
```

### P-31.2: Alkynes (Triple Bonds)

**Status:** ✅ Fully implemented  
**Location:** `src/iupac-engine/rules/initial-structure-layer/`

**Rules:**
- Suffix: `-yne` for one triple bond, `-diyne` for two, etc.
- Priority: Triple bonds senior to double bonds

**Examples:**
```
HC≡CH              → ethyne (acetylene)
HC≡C-CH₃           → propyne
HC≡C-C≡CH          → buta-1,3-diyne
CH₂=CH-C≡CH        → but-3-en-1-yne (yne > ene)
```

### P-31.2.3: E/Z Stereochemistry

**Status:** ⚠️ Partially implemented  
**Location:** `src/iupac-engine/rules/stereo-layer/`

**Rules:**
- **E (entgegen)**: Higher priority groups on opposite sides
- **Z (zusammen)**: Higher priority groups on same side
- Use Cahn-Ingold-Prelog (CIP) priority rules

**Examples:**
```
C/C=C/C    → (E)-but-2-ene (trans)
C/C=C\C    → (Z)-but-2-ene (cis)
```

**Current limitation:** E/Z detection works; multiple stereocenters partially supported.

---

## P-44: Parent Structure Selection

**Purpose:** Select the most senior parent structure when multiple choices exist.

### P-44.1: Principal Characteristic Groups

**Status:** ✅ Fully implemented  
**Location:** `src/iupac-engine/rules/functional-groups-layer.ts`

**Seniority order (highest to lowest):**

| Priority | Class | Suffix | Example |
|----------|-------|--------|---------|
| 1 | Carboxylic acids | -oic acid | CH₃COOH (ethanoic acid) |
| 2 | Sulfonic acids | -sulfonic acid | CH₃SO₃H |
| 3 | Esters | -oate | CH₃COOCH₃ (methyl ethanoate) |
| 4 | Acid halides | -oyl halide | CH₃COCl (ethanoyl chloride) |
| 5 | Amides | -amide | CH₃CONH₂ (ethanamide) |
| 6 | Nitriles | -nitrile | CH₃CN (ethanenitrile) |
| 7 | Aldehydes | -al | CH₃CHO (ethanal) |
| 8 | Ketones | -one | CH₃COCH₃ (propan-2-one) |
| 9 | Alcohols | -ol | CH₃CH₂OH (ethanol) |
| 10 | Thiols | -thiol | CH₃SH (methanethiol) |
| 11 | Amines | -amine | CH₃NH₂ (methanamine) |

**Implementation:**
```typescript
const FUNCTIONAL_GROUP_PRIORITY = [
  'carboxylicAcid',
  'sulfonicAcid',
  'ester',
  'acidHalide',
  'amide',
  'nitrile',
  'aldehyde',
  'ketone',
  'alcohol',
  'thiol',
  'amine'
];

function selectPrincipalGroup(groups: FunctionalGroup[]): FunctionalGroup {
  return groups.sort((a, b) => {
    return FUNCTIONAL_GROUP_PRIORITY.indexOf(a.type) 
         - FUNCTIONAL_GROUP_PRIORITY.indexOf(b.type);
  })[0];
}
```

### P-44.2: Ring System Seniority

**Status:** ⚠️ Partially implemented  
**Location:** `src/iupac-engine/rules/ring-analysis-layer.ts`

**Rules (in priority order):**

1. **Heteroatom content**: Rings with heteroatoms (N, O, S) senior to pure hydrocarbons
2. **Ring size**: Larger rings preferred
3. **Number of rings**: Fused systems with more rings preferred
4. **Degree of unsaturation**: More aromatic rings preferred

**Examples:**
```
Pyridine (C₅H₅N) > Benzene (C₆H₆)  [heteroatom wins]
Naphthalene (2 rings) > Benzene (1 ring)  [more rings wins]
```

**Current limitation:** Complex fused systems with multiple heteroatom types not fully validated.

### P-44.3: Acyclic Chain Selection (Principal Chain)

**Status:** ✅ Fully implemented  
**Location:** `src/iupac-engine/main-chain-selection.ts`

**Seniority order for chains:**

1. **Maximum number of heteroatoms** (N, O, S, P in chain)
2. **Greatest chain length** (number of atoms)
3. **Maximum unsaturation** (double + triple bonds)
4. **Maximum number of double bonds**
5. **Lowest locants for multiple bonds**
6. **Greatest number of substituents**
7. **Lowest locants for substituents**
8. **Alphabetical order** of substituent names

**Example:**
```
     CH₃
      |
CH₃-CH-CH₂-CH₂-CH₃

Candidate chains:
1. C-C-C-C-C (5 carbons) ✓ longest
2. C-C-C-C   (4 carbons) 
3. C-C-C     (3 carbons)

Main chain: pentane (5 carbons)
Substituent: methyl at position 2
Name: 2-methylpentane
```

**Algorithm notes** (from `IUPAC_CHAIN_SELECTION.md`):
- Graph traversal via DFS to enumerate all chains
- Pruning: Stop exploring chains that can't beat current best
- Ring handling: Chains can pass through rings (e.g., cyclohexanecarboxylic acid)
- Performance: O(N²) for simple molecules, O(N³) for highly branched

### P-44.4: Ring vs Chain Selection

**Status:** ✅ Fully implemented  
**Location:** `src/iupac-engine/rules/initial-structure-layer.ts`

**General rule:** Rings are preferred over chains as parent structures (P-52.2.8).

**Exception:** When principal group is part of an acyclic chain attached to a ring, the chain may be selected.

**Examples:**
```
Cyclohexanecarboxylic acid:
  Ring: cyclohexane (parent)
  Chain: -COOH attached
  
Benzoic acid:
  Ring: benzene (parent, special name)
  Functional group: carboxylic acid as suffix
```

---

## P-45: Preferred IUPAC Name Selection

**Status:** ⚠️ Partially implemented  
**Location:** `src/iupac-engine/naming/iupac-name-assembler.ts`

**Purpose:** Select the Preferred IUPAC Name (PIN) when multiple valid names exist for the same structure.

### P-45.1: Multiplicative Nomenclature

**Status:** ⚠️ Limited support

Preferred when multiple identical parent structures are connected by a symmetrical linking group.

**Example:**
```
HO-CH₂-CH₂-O-CH₂-CH₂-OH
Multiplicative: ethane-1,2-diyldioxybis(ethanol)
Simple: 2-(2-hydroxyethoxy)ethanol (preferred in openchem currently)
```

**Current limitation:** Multiplicative nomenclature not yet prioritized for PIN selection.

### P-45.2: Substitutive Nomenclature

**Status:** ✅ Implemented (default method)

Substitutive nomenclature is the primary method used by openchem.

---

## P-51: Nomenclature Methods

### P-51.1: Substitutive Nomenclature

**Status:** ✅ Fully implemented (default)  
**Location:** `src/iupac-engine/rules/nomenclature-method-layer.ts`

The default naming method: parent structure + substituents + functional groups.

**Pattern:** `[locants]-[prefixes]-[parent]-[suffixes]`

**Example:**
```
2-chloro-3-methylbutane
  Prefixes: chloro, methyl
  Parent: butane
  Locants: 2, 3
```

### P-51.2: Functional Class Nomenclature

**Status:** ⚠️ Partially implemented  
**Location:** `src/iupac-engine/rules/nomenclature-method-layer.ts`

Used for certain classes where the functional group is named as a separate word.

**Examples:**
```
CH₃Cl         → methyl chloride (functional class)
              vs. chloromethane (substitutive, preferred)
              
(CH₃)₂O       → dimethyl ether (functional class)
              vs. methoxymethane (substitutive, preferred)
```

**Current support:**
- ✅ Ethers (as "alkyl alkyl ether")
- ✅ Esters (as "alkyl alkanoate")
- ❌ Ketones (as "alkyl alkyl ketone") - not yet
- ❌ Acid halides (as "acyl halide") - not yet

### P-51.3: Skeletal Replacement Nomenclature

**Status:** ⚠️ Partially implemented  
**Location:** `src/iupac-engine/rules/nomenclature-method-layer.ts`

Uses "a" prefixes (oxa-, aza-, thia-) to replace carbon atoms with heteroatoms.

**Examples:**
```
CH₃-O-CH₃     → 2-oxapropane (or dimethyl ether)
CH₃-NH-CH₃    → 2-azapropane (or dimethylamine)
CH₃-S-CH₃     → 2-thiapropane (or dimethyl sulfide)
```

**Current limitation:** Basic support for simple cases; complex skeletal replacement pending.

---

## P-63 to P-68: Functional Groups

### P-63: Ethers

**Status:** ✅ Implemented  
**Naming:** As prefix (alkoxy-) or functional class (alkyl ether)

**Examples:**
```
CH₃OCH₂CH₃    → methoxyethane (substitutive)
              or ethyl methyl ether (functional class)
```

### P-64: Peroxides

**Status:** ❌ Not yet implemented

### P-65: Ketones

**Status:** ✅ Implemented  
**Suffix:** `-one`  
**Location:** `src/iupac-engine/rules/functional-groups-layer.ts`

**Examples:**
```
CH₃COCH₃           → propan-2-one (acetone)
CH₃COCH₂CH₃        → butan-2-one
CH₃COCH₂COCH₃      → pentane-2,4-dione
```

### P-66: Carboxylic Acids and Derivatives

**Status:** ✅ Implemented (acids, esters, amides)  
**Suffixes:** `-oic acid`, `-oate`, `-amide`

**Examples:**
```
CH₃COOH            → ethanoic acid (acetic acid)
CH₃COOCH₃          → methyl ethanoate
CH₃CONH₂           → ethanamide
HOOC-COOH          → ethanedioic acid (oxalic acid)
```

**Special case: Lactones**

**Status:** ⚠️ Partially implemented  
**Location:** `src/iupac-engine/rules/functional-groups-layer.ts` (P-66.1.1.4)

Lactones (cyclic esters) named as heterocycles:

**Example:**
```
γ-butyrolactone → oxolan-2-one
```

**Current limitation:** Basic lactone recognition; complex lactones pending.

### P-67: Aldehydes

**Status:** ✅ Implemented  
**Suffix:** `-al` or `-carbaldehyde`

**Examples:**
```
CH₃CHO             → ethanal (acetaldehyde)
OHCCHO             → ethanedial (glyoxal)
C₆H₅CHO            → benzaldehyde (retained name)
```

### P-68: Alcohols and Phenols

**Status:** ✅ Implemented  
**Suffix:** `-ol` (alcohols), `-phenol` (phenols)

**Examples:**
```
CH₃OH              → methanol
CH₃CH₂OH           → ethanol
HOCH₂CH₂OH         → ethane-1,2-diol (ethylene glycol)
C₆H₅OH             → phenol (retained name)
```

---

## P-91 to P-93: Stereochemistry

### P-91: Stereoisomer Representation

**Status:** ⚠️ E/Z only  
**Location:** `src/iupac-engine/rules/stereo-layer/`

Stereodescriptors added to names:
- **(E)** and **(Z)** for double bonds
- **(R)** and **(S)** for chiral centers (in progress)

### P-92: CIP Priority Rules

**Status:** ⚠️ Partially implemented

Cahn-Ingold-Prelog sequence rules for assigning priorities:

1. **Atomic number** (higher wins)
2. **Atomic mass** (heavier isotope wins)
3. **Double bond configuration** (Z > E)
4. **Chiral configuration** (R/R or S/S > R/S)

**Current implementation:** Rules 1-2 implemented for E/Z; full CIP for R/S pending.

### P-93: Specification of Configuration

**Status:** ⚠️ E/Z only

#### P-93.4: E/Z Notation

**Status:** ✅ Implemented  
**Tests:** `test/unit/iupac-engine/p31-unsaturation.test.ts`

**Examples:**
```
(E)-but-2-ene:  C/C=C/C  (trans)
(Z)-but-2-ene:  C/C=C\C  (cis)

(2E,4Z)-hexa-2,4-diene:
  Double bond at C2: E configuration
  Double bond at C4: Z configuration
```

**Implementation:**
```typescript
function determineEZConfiguration(bond: Bond, mol: Molecule): 'E' | 'Z' | null {
  const [high1, low1] = getCIPPriorities(bond.atom1, mol);
  const [high2, low2] = getCIPPriorities(bond.atom2, mol);
  
  if (areCis(high1, high2, bond)) {
    return 'Z'; // Zusammen (same side)
  } else {
    return 'E'; // Entgegen (opposite sides)
  }
}
```

#### P-93.5: R/S Notation

**Status:** ⚠️ In progress  
**Location:** `src/iupac-engine/rules/stereo-layer/` (partial)

**Example (not yet supported):**
```
(R)-butan-2-ol
(S)-2-chlorobutane
(2R,3S)-2,3-dihydroxybutanedioic acid (tartaric acid)
```

**Current limitation:** R/S detection and assignment in progress; not yet integrated with name assembly.

---

## Rule Priorities and Interactions

### Numbering Priority Hierarchy

When multiple features compete for lowest locants, apply in this order:

1. **Fixed numbering** (fused rings, bridged systems)
2. **Heteroatoms** in main chain (N, O, S, P)
3. **Principal characteristic group** (suffix)
4. **Multiple bonds** (all types)
5. **Double bonds** (if distinguishing needed)
6. **Substituents** (alkyl, halo, etc.)
7. **Alphabetical order** (when equivalent positions)

### Parent Structure Selection Hierarchy

When choosing between multiple parent structures:

1. **Principal group maximization** (P-44.1)
2. **Ring vs chain** (generally prefer ring, P-52.2.8)
3. **Ring seniority** (P-44.2: heteroatoms > size > number)
4. **Chain seniority** (P-44.3: heteroatoms > length > unsaturation)
5. **Alphabetical order** (last resort)

### Known Rule Conflicts

#### 1. P-44.2.2 (Heteroatom Seniority) Duplicates

**Issue:** Rule appears in multiple files with slightly different implementations:
- `src/iupac-engine/rules/atomic-layer.ts` (50 lines)
- `src/iupac-engine/rules/ring-analysis-layer.ts` (50 lines)

**Resolution:** Ring-analysis version is canonical; atomic-layer version is helper.

#### 2. P-44.4 (Ring vs Chain) Variants

**Issue:** Two implementations:
- `initial-structure-layer.ts` (100 lines) - structural decision
- `parent-chain-selection-layer.ts` (60 lines) - chain-specific analysis

**Resolution:** Both are correct for different contexts; initial-structure is primary.

#### 3. P-51.2 (Functional Class) Split

**Issue:** Logic split across files:
- `nomenclature-method-layer.ts` (70 lines) - decision logic
- `functional-groups-layer.ts` (50 lines) - detection logic

**Resolution:** Both needed; clear separation of concerns.

---

## Testing and Validation

### Test Files by Rule

| Rule | Test File | Test Count |
|------|-----------|-----------|
| P-14 | `p14-numbering.test.ts` | 25+ |
| P-31 | `p31-unsaturation.test.ts` | 30+ |
| P-44.1 | `functional-groups.test.ts` | 40+ |
| P-44.3 | `p44-chain-selection.test.ts` | 50+ |
| P-44.4 | `p44-1-comprehensive.test.ts` | 35+ |
| P-45 | `p45-parent-hydrides.test.ts` | 20+ |
| P-66 | `functional-groups.test.ts` | 15+ |
| P-93 | `p31-unsaturation.test.ts` (E/Z) | 12+ |

### Realistic Dataset Validation

**File:** `test/unit/iupac-engine/realistic-iupac-test.test.ts`  
**Data:** `docs/pubchem-iupac-name-300.json` (300+ molecules from PubChem)

**Coverage:**
- Diverse functional groups
- Ring systems (monocyclic, fused, bridged)
- Stereochemistry (E/Z)
- Complex substituents
- Multi-functional molecules

**Run with:**
```bash
bun test test/unit/iupac-engine/realistic-iupac-test.test.ts
```

### Comparison with Other Tools

**RDKit comparison:**
```bash
RUN_RDKIT_BULK=1 bun test
```

**OPSIN comparison:**
- OPSIN data integrated for nomenclature rules
- See `opsin-iupac-data/` for source data

---

## References

### Blue Book Chapters

Direct links to IUPAC Blue Book 2013 sections:

- **P-14** (Numbering): https://iupac.qmul.ac.uk/BlueBook/P1.html#14
- **P-31** (Unsaturation): https://iupac.qmul.ac.uk/BlueBook/P3.html#31
- **P-44** (Parent selection): https://iupac.qmul.ac.uk/BlueBook/P4.html#44
- **P-45** (PIN selection): https://iupac.qmul.ac.uk/BlueBook/P4.html#45
- **P-51** (Nomenclature methods): https://iupac.qmul.ac.uk/BlueBook/P5.html#51
- **P-63** (Ethers): https://iupac.qmul.ac.uk/BlueBook/P6.html#63
- **P-66** (Carboxylic acids): https://iupac.qmul.ac.uk/BlueBook/P6.html#66
- **P-91-P-93** (Stereochemistry): https://iupac.qmul.ac.uk/BlueBook/P9.html

### Implementation Files

| Rule | Primary Location | Helper Files |
|------|-----------------|--------------|
| P-14 | `numbering-layer.ts` | `ring-analysis.ts` |
| P-31 | `initial-structure-layer/` | `bond-utils.ts` |
| P-44 | `functional-groups-layer.ts`, `ring-analysis-layer.ts`, `main-chain-selection.ts` | `chain-utils.ts` |
| P-45 | `name-assembly-layer.ts` | `iupac-name-assembler.ts` |
| P-51 | `nomenclature-method-layer.ts` | Various |
| P-63-P-68 | `functional-groups-layer.ts` | `functional-group-detector.ts` |
| P-91-P-93 | `stereo-layer/` | `symmetry-detector.ts` |

---

**Next:** [Capabilities & Roadmap](./iupac-capabilities.md) for current status and future plans
