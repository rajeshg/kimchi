# SMARTS Pattern Matching

**Audience:** Users and developers working with SMARTS pattern matching and substructure search  
**Related:** [Molecular Properties](./molecular-properties.md) | [README](../README.md)

---

## Overview

openchem provides comprehensive SMARTS (SMiles ARbitrary Target Specification) pattern matching for substructure searching. The implementation follows the official [Daylight SMARTS specification](http://www.daylight.com/dayhtml/doc/theory/theory.smarts.html) closely, with some known differences from RDKit in aromaticity perception and ring membership counting.

**Key Features:**

- ✅ Full SMARTS syntax support (atoms, bonds, logical operators)
- ✅ Recursive SMARTS patterns
- ✅ Ring membership primitives (`[R]`, `[Rn]`)
- ✅ Aromaticity detection (`[a]`, `[A]`)
- ✅ Strict adherence to SMARTS specification

---

## Quick Start

### Basic Usage

```typescript
import { parseSMILES, matchSMARTS } from "index";

// Parse molecule
const molecule = parseSMILES("c1ccccc1").molecules[0];

// Match aromatic 6-membered ring
const pattern = "c1ccccc1";
const matches = matchSMARTS(molecule, pattern);

console.log(`Found ${matches.length} matches`);
```

### Common Patterns

```typescript
// Hydroxyl group
matchSMARTS(molecule, "[OH]");

// Carboxylic acid
matchSMARTS(molecule, "C(=O)O");

// Primary amine
matchSMARTS(molecule, "[NH2]");

// Aromatic nitrogen
matchSMARTS(molecule, "[n]");

// Atom in 3 rings
matchSMARTS(molecule, "[R3]");
```

---

## Known Differences with RDKit

openchem's SMARTS implementation strictly follows the Daylight specification, which sometimes differs from RDKit's implementation. These differences are intentional and documented below.

### 1. Aromaticity Perception

**Root Cause:** Fundamental differences in aromaticity models

#### openchem's Model (Conservative, Ring-Based)

- Uses strict **Hückel's rule** (4n+2 π electrons)
- Only considers atoms **within aromatic rings** as aromatic
- Filters to elementary rings of size 5-7
- Does NOT extend aromaticity to conjugated exocyclic atoms

#### RDKit's Model (Extended, System-Based)

- Uses **extended aromaticity perception**
- Considers conjugated atoms connected to aromatic systems as aromatic
- More inclusive for cheminformatics/drug discovery purposes
- Treats fused and conjugated systems holistically

#### Example: Complex Lactone System

**SMILES:** `O1C=C[C@H]([C@H]1O2)c3c2cc(OC)c4c3OC(=O)C5=C4CCC(=O)5`

**Atom 15 (Carbonyl Carbon in C(=O)):**

- **openchem**: Aliphatic (not in aromatic ring) ✅ Hückel
- **RDKit**: Aromatic (conjugated with aromatic system) ✅ Extended

**Atoms 17, 18 (C=C in Lactone Ring):**

- **openchem**: Aliphatic (lactone ring has C=O, not aromatic by Hückel) ✅ Strict
- **RDKit**: Aromatic (part of extended conjugated aromatic system) ✅ Extended

RDKit canonical SMILES shows lowercase `c` for these atoms: `...c3oc(=O)c4c(c13)...`

#### Chemical Validity

**Both models are chemically valid** but serve different purposes:

**openchem's approach:**

- Traditional organic chemistry definition
- Clear, predictable behavior
- Suitable for educational purposes and basic cheminformatics
- Follows textbook aromaticity rules

**RDKit's approach:**

- More sophisticated for drug discovery
- Captures electronic delocalization better
- Better for similarity searching and pharmacophore matching
- Industry-standard behavior for cheminformatics tools

#### Test Results

**Current status:** 4 passing, 6 failing in `rdkit-smarts-failures.test.ts`

The 6 failures are **expected differences** due to aromaticity model, not bugs in the SMARTS matcher.

**Implementation:** `src/utils/aromaticity-perceiver.ts`

---

### 2. Ring Membership (`[Rn]` Primitive)

**Root Cause:** openchem follows SMARTS spec (SSSR), RDKit uses extended ring set

#### SMARTS Specification

According to the [Daylight SMARTS specification](http://www.daylight.com/dayhtml/doc/theory/theory.smarts.html):

> **R<n>**: ring membership - in <n> SSSR rings

The specification explicitly states that `[Rn]` should count atoms in **<n> SSSR rings** (Smallest Set of Smallest Rings).

#### openchem's Approach (SSSR-based) ✅ Spec Compliant

- Uses SSSR (Smallest Set of Smallest Rings)
- Also known as MCB (Minimum Cycle Basis)
- Count = edges - nodes + 1 (for connected graph)
- Computationally efficient
- Deterministic and predictable

#### RDKit's Approach (Extended rings) ⚠️ Deviates from Spec

- Uses extended ring set (possibly all relevant cycles)
- More chemically intuitive for bridged systems
- Recognizes bridgehead atoms correctly
- Computationally more expensive
- More useful for drug discovery applications

---

### Example: Adamantane

**SMILES:** `C1C2CC3CC1CC(C2)C3`  
**Structure:** C₁₀H₁₆ with 4 bridgehead carbons

#### SSSR Rings

- Mathematical minimum: 12 edges - 10 nodes + 1 = **3 rings**
- Unique minimal representation

#### openchem (SSSR-based)

```
Atom 0: in 1 ring
Atom 1: in 2 rings
Atom 2: in 2 rings
Atom 3: in 3 rings  ← Only atom in all 3 SSSR rings
Atom 4: in 2 rings
Atom 5: in 2 rings
Atom 6: in 1 ring
Atom 7: in 2 rings
Atom 8: in 1 ring
Atom 9: in 2 rings
```

**Pattern `[R3]` matches:** 1 atom (atom 3) ✅ **Correct per SMARTS spec**

#### RDKit (Extended ring set)

```
[R2]: 6 matches (atoms 0, 2, 4, 6, 8, 9)
[R3]: 4 matches (atoms 1, 3, 5, 7) ← 4 bridgehead carbons
```

**Pattern `[R3]` matches:** 4 atoms ⚠️ **Deviates from SMARTS spec**

RDKit identifies the 4 bridgehead carbons (1, 3, 5, 7) as being in 3 rings, which is structurally intuitive but does not match the SSSR-based definition in the SMARTS spec.

---

### Example: Other Polycyclic Systems

#### Bicyclo[2.2.1]heptane (Norbornane)

**SMILES:** `C1CC2CCC1C2`  
**SSSR:** 2 rings  
**Result:** ✅ Both openchem and RDKit agree

#### Basketane

**SMILES:** `C12C3C4C5C1C6C2C5C3C46`  
**SSSR:** 6 rings

- **openchem `[R3]`:** 4 atoms (2, 3, 6, 9) ✅ Correct per spec
- **RDKit `[R3]`:** 2 atoms (0, 1) ⚠️ Incorrect per spec

#### Cubane

**SMILES:** `C12C3C4C1C5C2C3C45`  
**SSSR:** 5 rings

- **openchem `[R3]`:** 4 atoms ✅ Correct per spec
- **RDKit `[R3]`:** 8 atoms (all atoms) ⚠️ Incorrect per spec

---

## SMARTS Syntax Reference

### Atom Primitives

```typescript
// Element symbols
"C"; // Carbon
"N"; // Nitrogen
"[OH]"; // Oxygen with hydrogen

// Aromaticity
"c"; // Aromatic carbon
"n"; // Aromatic nitrogen
"[a]"; // Any aromatic atom
"[A]"; // Any aliphatic atom

// Ring membership
"[R]"; // Any ring atom
"[R2]"; // Atom in exactly 2 rings
"[R3]"; // Atom in exactly 3 rings

// Degree (connectivity)
"[D2]"; // Degree 2 (2 neighbors)
"[D3]"; // Degree 3 (3 neighbors)

// Hydrogen count
"[H0]"; // No hydrogens
"[H1]"; // One hydrogen
"[H2]"; // Two hydrogens

// Charge
"[+]"; // Positive charge
"[+1]"; // +1 charge
"[-]"; // Negative charge
"[−1]"; // -1 charge
```

### Bond Primitives

```typescript
// Bond types
"-"; // Single bond
"="; // Double bond
"#"; // Triple bond
":"; // Aromatic bond
"~"; // Any bond

// Examples
"C-C"; // Single bond between carbons
"C=O"; // Double bond (carbonyl)
"C#N"; // Triple bond (nitrile)
"c:c"; // Aromatic bond
```

### Logical Operators

```typescript
// AND
"[C,N]"; // Carbon OR nitrogen
"[!C]"; // NOT carbon
"[C&R]"; // Carbon AND in ring
"[c&R2]"; // Aromatic carbon in 2 rings

// OR
"[C,N,O]"; // Carbon OR nitrogen OR oxygen

// NOT
"[!C]"; // Not carbon
"[!R]"; // Not in ring
```

---

## Advanced Usage

### Recursive SMARTS

```typescript
// Find benzene rings with substituents
const pattern = "c1ccc([!H])cc1";

// Find tertiary amines
const pattern = "[NX3;H0]";

// Find carboxylic acids or esters
const pattern = "C(=O)[O;H1,C]";
```

### Substructure Counting

```typescript
import { parseSMILES, matchSMARTS } from "index";

const molecule = parseSMILES("c1cc(O)c(O)cc1").molecules[0];
const hydroxyls = matchSMARTS(molecule, "[OH]");

console.log(`Found ${hydroxyls.length} hydroxyl groups`);
// Output: Found 2 hydroxyl groups
```

### Multiple Pattern Matching

```typescript
const patterns = {
  hydroxyl: "[OH]",
  carboxyl: "C(=O)O",
  amine: "[NH2]",
  aromatic: "[a]",
};

const results = Object.entries(patterns).map(([name, pattern]) => ({
  name,
  count: matchSMARTS(molecule, pattern).length,
}));

console.table(results);
```

---

## Performance Considerations

### Complexity

| Operation              | Complexity | Notes                        |
| ---------------------- | ---------- | ---------------------------- |
| Pattern compilation    | O(P)       | P = pattern length           |
| Substructure search    | O(N × M)   | N = atoms, M = pattern atoms |
| Ring analysis          | O(N²)      | Cached per molecule          |
| Aromaticity perception | O(N)       | Cached per molecule          |

### Optimization Tips

1. **Cache aromaticity** — Perception is cached automatically per molecule
2. **Simple patterns first** — Use simpler patterns when possible
3. **Pre-compile patterns** — Reuse compiled patterns for batch processing
4. **Limit pattern complexity** — Very complex recursive patterns can be slow

---

## Testing

### Run SMARTS Tests

```bash
# All SMARTS tests
bun test test/smarts/

# RDKit comparison tests
bun test test/smarts/rdkit-comparison/

# Specific test files
bun test test/smarts/aromatic-ring-primitives.test.ts
bun test test/smarts/rdkit-smarts-failures.test.ts
```

### Test Coverage

- **Unit tests:** 20+ test files
- **RDKit comparisons:** 6 test files with known differences documented
- **Primitive tests:** Complete coverage of all SMARTS primitives

---

## Recommendations for Users

### When openchem's Behavior is Preferred

- Educational applications teaching traditional organic chemistry
- Applications requiring strict SMARTS specification compliance
- Predictable, deterministic aromaticity behavior
- Performance-critical applications (SSSR is faster)

### When RDKit's Behavior is Preferred

- Drug discovery and cheminformatics pipelines
- Similarity searching and pharmacophore matching
- Working with extended conjugated systems
- Need to match industry-standard tool behavior

### Migration from RDKit

If you're migrating from RDKit and encounter differences:

1. **Document expected differences** in your tests
2. **Use SMILES canonicalization** to compare molecules structurally
3. **Adjust SMARTS patterns** if needed for openchem's aromaticity model
4. **Consider both interpretations** as chemically valid

---

## Implementation Files

### Core SMARTS Matcher

- **Entry point:** `src/matchers/smarts-matcher.ts`
- **Main function:** `matchSMARTS(molecule, pattern)`

### Supporting Modules

- **Aromaticity:** `src/utils/aromaticity-perceiver.ts`
- **Ring analysis:** `src/utils/ring-analysis.ts`
- **Ring finding:** `src/utils/ring-finder.ts`
- **Atom utilities:** `src/utils/atom-utils.ts`

---

## Related Documentation

- **[Molecular Properties](./molecular-properties.md)** — LogP calculation uses SMARTS patterns
- **[IUPAC Generation](./iupac-generation.md)** — Functional group detection uses SMARTS
- **[README](../README.md)** — Library overview

### External References

- [Daylight SMARTS Specification](http://www.daylight.com/dayhtml/doc/theory/theory.smarts.html)
- [Hückel's Rule for Aromaticity](https://en.wikipedia.org/wiki/H%C3%BCckel%27s_rule)
- [SSSR Algorithm (Minimum Cycle Basis)](https://en.wikipedia.org/wiki/Cycle_basis)

---

**Last Updated:** 2025-11-20  
**Maintainer:** openchem team
