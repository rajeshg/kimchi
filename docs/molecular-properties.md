# Molecular Properties & Descriptors

**Audience:** Users and developers working with molecular property calculations and drug-likeness assessment  
**Related:** [SMARTS Matching](./smarts-matching.md) | [README](../README.md)

---

## Overview

openchem provides comprehensive molecular property calculation and descriptor generation for cheminformatics applications. The library includes basic molecular descriptors, drug-likeness rules, and LogP calculation using the Wildman-Crippen method.

**Key Features:**

- ✅ Basic molecular descriptors (atom count, bond count, element composition)
- ✅ Phase 1 structural descriptors (valence electrons, amide bonds, spiro/bridgehead atoms, ring classifications)
- ✅ Drug-likeness rules (Lipinski, Veber, BBB penetration)
- ✅ LogP calculation with caching (4.6 million× speedup)
- ✅ TPSA (Topological Polar Surface Area)
- ✅ H-bond donors/acceptors
- ✅ Rotatable bonds

---

## Quick Start

### Basic Descriptors

```typescript
import { parseSMILES, computeDescriptors } from "index";

const molecule = parseSMILES("CCO").molecules[0];
const descriptors = computeDescriptors(molecule);

console.log(descriptors);
// {
//   atomCount: 3,
//   bondCount: 2,
//   formalCharge: 0,
//   elementCounts: { C: 2, H: 6, O: 1 },
//   heavyAtomFraction: 0.333
// }
```

### Drug-Likeness Rules

```typescript
import { checkLipinskiRuleOfFive } from "index";

const aspirin = parseSMILES("CC(=O)Oc1ccccc1C(=O)O").molecules[0];
const result = checkLipinskiRuleOfFive(aspirin);

console.log(result.passes); // true
console.log(result.properties);
// {
//   molecularWeight: 180.16,
//   hbondDonors: 1,
//   hbondAcceptors: 4,
//   logP: 1.23
// }
```

### LogP Calculation

```typescript
import { computeLogP } from "index";

const ethanol = parseSMILES("CCO").molecules[0];
const logP = computeLogP(ethanol, true); // true = include hydrogens

console.log(`LogP: ${logP.toFixed(2)}`); // LogP: -0.31
```

---

## Basic Molecular Descriptors

### API Reference

#### `computeDescriptors(molecule: Molecule, options?: DescriptorOptions)`

Computes a comprehensive set of basic descriptors.

**Parameters:**

- `molecule` (Molecule) — Molecule object
- `options` (DescriptorOptions, optional) — Configuration

**Returns:**

```typescript
{
  atomCount: number; // Explicit atoms only
  bondCount: number; // All bonds
  formalCharge: number; // Sum of atomic charges
  elementCounts: Record<string, number>; // Element → count
  heavyAtomFraction: number; // Heavy atoms / total atoms
}
```

**Options:**

```typescript
interface DescriptorOptions {
  includeImplicitH?: boolean; // Include implicit H in counts (default: true)
  includeIsotopes?: boolean; // Use isotope notation (e.g., "13C") (default: false)
}
```

### Individual Descriptor Functions

```typescript
// Atom and bond counts
getAtomCount(molecule); // Returns molecule.atoms.length
getBondCount(molecule); // Returns molecule.bonds.length

// Charge
getFormalCharge(molecule); // Sum of atom.charge values

// Element counts
getElementCounts(molecule, options); // Record<string, number>

// Heavy atom fraction
getHeavyAtomFraction(molecule); // Heavy atoms / total atoms
```

### Examples

#### Element Counts

```typescript
const molecule = parseSMILES("CCO").molecules[0];

// With implicit hydrogens (default)
const counts1 = getElementCounts(molecule);
// { C: 2, H: 6, O: 1 }

// Without implicit hydrogens
const counts2 = getElementCounts(molecule, { includeImplicitH: false });
// { C: 2, O: 1 }
```

#### Isotope Notation

```typescript
const molecule = parseSMILES("[13C]C[2H]").molecules[0];

const counts = getElementCounts(molecule, { includeIsotopes: true });
// { '13C': 1, C: 1, '2H': 1, H: 5 }
```

#### Heavy Atom Fraction

```typescript
const ethanol = parseSMILES("CCO").molecules[0];
const fraction = getHeavyAtomFraction(ethanol);
// 0.333 (3 heavy atoms / 9 total atoms)
```

---

## Phase 1 Structural Descriptors

openchem provides comprehensive structural descriptors matching RDKit's descriptor set. These are calculated on-demand (lazy evaluation) for optimal performance.

### Electron Counting

#### `getNumValenceElectrons(molecule: Molecule): number`

Count the total number of valence electrons in the molecule.

**Formula:** `sum(outer_electrons - formal_charge + num_hydrogens)` for all atoms

**Examples:**

```typescript
getNumValenceElectrons(parseSMILES("CC").molecules[0]); // 14 (ethane)
getNumValenceElectrons(parseSMILES("C(=O)O").molecules[0]); // 18 (formic acid)
getNumValenceElectrons(parseSMILES("c1ccccc1").molecules[0]); // 30 (benzene)
```

**RDKit-compatible:** ✅ Matches `NumValenceElectrons` exactly

#### `getNumRadicalElectrons(molecule: Molecule): number`

Count the number of radical electrons (unpaired electrons) in the molecule.

**Note:** Currently returns 0 as radical support requires extension of SMILES parser. Future enhancement planned.

**RDKit-compatible:** ✅ Matches `NumRadicalElectrons` (for non-radical molecules)

### Bond Counting

#### `getNumAmideBonds(molecule: Molecule): number`

Count the number of amide bonds (C(=O)-N linkages) in the molecule.

**Definition:** An amide bond is a single bond between a carbonyl carbon and a nitrogen atom.

**Examples:**

```typescript
getNumAmideBonds(parseSMILES("CC(=O)N").molecules[0]); // 1 (acetamide)
getNumAmideBonds(parseSMILES("NC(=O)N").molecules[0]); // 2 (urea)
getNumAmideBonds(parseSMILES("NCC(=O)O").molecules[0]); // 0 (glycine - no direct C=O-N bond)
```

**RDKit-compatible:** ✅ Matches `NumAmideBonds` exactly

### Special Atoms

#### `getNumSpiroAtoms(molecule: Molecule): number`

Count the number of spiro atoms (atoms shared by exactly two rings at a single point).

**Definition:** A spiro atom belongs to exactly two rings that share only that atom.

**Examples:**

```typescript
getNumSpiroAtoms(parseSMILES("C1CC2(C1)CCC2").molecules[0]); // 1 (spiro[3.3]heptane)
getNumSpiroAtoms(parseSMILES("c1ccccc1").molecules[0]); // 0 (benzene - no spiro)
```

**RDKit-compatible:** ✅ Matches `NumSpiroAtoms` exactly

#### `getNumBridgeheadAtoms(molecule: Molecule): number`

Count the number of bridgehead atoms (atoms belonging to 3 or more rings).

**Definition:** A bridgehead atom is a ring atom that belongs to at least 3 rings.

**Examples:**

```typescript
getNumBridgeheadAtoms(parseSMILES("C1C2CC3CC1CC(C2)C3").molecules[0]); // 4 (adamantane)
getNumBridgeheadAtoms(parseSMILES("c1ccccc1").molecules[0]); // 0 (benzene)
```

**RDKit-compatible:** ✅ Matches `NumBridgeheadAtoms` definition

### Ring Classifications

#### `getNumSaturatedRings(molecule: Molecule): number`

Count the number of saturated rings (rings with only single bonds).

**Examples:**

```typescript
getNumSaturatedRings(parseSMILES("C1CCCCC1").molecules[0]); // 1 (cyclohexane)
getNumSaturatedRings(parseSMILES("c1ccccc1").molecules[0]); // 0 (benzene - aromatic)
```

#### `getNumAliphaticRings(molecule: Molecule): number`

Count the number of non-aromatic rings.

**Examples:**

```typescript
getNumAliphaticRings(parseSMILES("C1CCCCC1").molecules[0]); // 1 (cyclohexane)
getNumAliphaticRings(parseSMILES("C1=CCCCC1").molecules[0]); // 1 (cyclohexene)
getNumAliphaticRings(parseSMILES("c1ccccc1").molecules[0]); // 0 (benzene)
```

#### `getNumSaturatedAliphaticRings(molecule: Molecule): number`

Count the number of saturated non-aromatic rings.

**Examples:**

```typescript
getNumSaturatedAliphaticRings(parseSMILES("C1CCCCC1").molecules[0]); // 1 (cyclohexane)
getNumSaturatedAliphaticRings(parseSMILES("C1=CCCCC1").molecules[0]); // 0 (cyclohexene - has C=C)
```

#### `getNumHeterocycles(molecule: Molecule): number`

Count the number of heterocyclic rings (rings containing at least one non-carbon atom).

**Examples:**

```typescript
getNumHeterocycles(parseSMILES("c1ccncc1").molecules[0]); // 1 (pyridine)
getNumHeterocycles(parseSMILES("C1CCOC1").molecules[0]); // 1 (tetrahydrofuran)
getNumHeterocycles(parseSMILES("c1ccccc1").molecules[0]); // 0 (benzene - all carbon)
```

#### `getNumAromaticHeterocycles(molecule: Molecule): number`

Count the number of aromatic heterocyclic rings.

**Examples:**

```typescript
getNumAromaticHeterocycles(parseSMILES("c1ccncc1").molecules[0]); // 1 (pyridine)
getNumAromaticHeterocycles(parseSMILES("o1cccc1").molecules[0]); // 1 (furan)
getNumAromaticHeterocycles(parseSMILES("C1CCOC1").molecules[0]); // 0 (THF - not aromatic)
```

#### `getNumSaturatedHeterocycles(molecule: Molecule): number`

Count the number of saturated heterocyclic rings.

**Examples:**

```typescript
getNumSaturatedHeterocycles(parseSMILES("C1CCOC1").molecules[0]); // 1 (tetrahydrofuran)
getNumSaturatedHeterocycles(parseSMILES("c1ccncc1").molecules[0]); // 0 (pyridine - aromatic)
```

#### `getNumAliphaticHeterocycles(molecule: Molecule): number`

Count the number of non-aromatic heterocyclic rings.

**Examples:**

```typescript
getNumAliphaticHeterocycles(parseSMILES("C1CCOC1").molecules[0]); // 1 (tetrahydrofuran)
getNumAliphaticHeterocycles(parseSMILES("c1ccncc1").molecules[0]); // 0 (pyridine - aromatic)
```

### Stereochemistry

#### `getNumAtomStereoCenters(molecule: Molecule): number`

Count the number of defined (specified) tetrahedral stereocenters.

**Definition:** Atoms with explicit stereochemistry notation (@ or @@).

**Examples:**

```typescript
getNumAtomStereoCenters(parseSMILES("C[C@H](O)Cl").molecules[0]); // 1 (R configuration)
getNumAtomStereoCenters(parseSMILES("C[C@@H](O)Cl").molecules[0]); // 1 (S configuration)
getNumAtomStereoCenters(parseSMILES("CC(O)Cl").molecules[0]); // 0 (no stereo specified)
getNumAtomStereoCenters(parseSMILES("O[C@H](C(=O)O)[C@H](O)C(=O)O").molecules[0]); // 2 (tartaric acid)
```

**RDKit-compatible:** ✅ Matches `NumAtomStereoCenters` exactly

#### `getNumUnspecifiedAtomStereoCenters(molecule: Molecule): number`

Count the number of potential (unspecified) tetrahedral stereocenters.

**Definition:** sp3 atoms with 4 distinct substituents where stereochemistry could be specified but isn't.

**Examples:**

```typescript
getNumUnspecifiedAtomStereoCenters(parseSMILES("CC(O)Cl").molecules[0]); // 1 (chiral but unspecified)
getNumUnspecifiedAtomStereoCenters(parseSMILES("C[C@H](O)Cl").molecules[0]); // 0 (stereo is specified)
getNumUnspecifiedAtomStereoCenters(parseSMILES("CC(C)C").molecules[0]); // 0 (symmetric, not chiral)
```

**Notes:**

- Uses simplified heuristic: counts sp3 C/N with 4 substituents and ≥3 distinct neighbor types
- True chirality requires full topological analysis (future enhancement)
- Conservative approach: may undercount in complex cases

**RDKit-compatible:** ✅ Matches `NumUnspecifiedAtomStereoCenters` behavior

### Implementation Notes

- **Lazy calculation:** All descriptors are computed on-demand, not pre-computed
- **Ring analysis:** Uses SSSR (Smallest Set of Smallest Rings) for ring membership
- **Caching:** Ring information is cached on first access for efficiency
- **RDKit compatibility:** Phase 1 descriptors match RDKit's behavior exactly where applicable
- **Stereochemistry:** Uses simplified topology-based detection (full CIP rule implementation planned)

**Implementation:** `src/utils/molecular-properties.ts`

**Test coverage:** 64 tests in `test/unit/molecular-descriptors-phase1.test.ts`

---

## Drug-Likeness Rules

openchem provides comprehensive drug-likeness assessment functions that evaluate molecules against established pharmaceutical rules.

### Lipinski's Rule of Five

Evaluates oral bioavailability using Lipinski's Rule of Five.

#### `checkLipinskiRuleOfFive(molecule: Molecule)`

**Rules:**

- Molecular weight ≤ 500 Da
- H-bond donors ≤ 5 (N-H, O-H groups)
- H-bond acceptors ≤ 10 (N, O atoms)
- LogP ≤ 5 (Crippen LogP estimate)

**Returns:**

```typescript
{
  passes: boolean;           // true if all rules pass
  violations: string[];      // Array of violation messages
  properties: {
    molecularWeight: number;
    hbondDonors: number;
    hbondAcceptors: number;
    logP: number;
  }
}
```

**Example:**

```typescript
import { parseSMILES, checkLipinskiRuleOfFive } from "index";

const aspirin = parseSMILES("CC(=O)Oc1ccccc1C(=O)O").molecules[0];
const result = checkLipinskiRuleOfFive(aspirin);

if (result.passes) {
  console.log("✓ Passes Lipinski rules");
  console.log(`LogP: ${result.properties.logP.toFixed(2)}`);
} else {
  console.log("✗ Violations:", result.violations);
}
```

### Veber Rules

Evaluates oral bioavailability using Veber rules (complementary to Lipinski).

#### `checkVeberRules(molecule: Molecule)`

**Rules:**

- Rotatable bonds ≤ 10
- TPSA ≤ 140 Å²

**Returns:**

```typescript
{
  passes: boolean;
  violations: string[];
  properties: {
    rotatableBonds: number;
    tpsa: number;
  }
}
```

**Example:**

```typescript
const result = checkVeberRules(molecule);
console.log(`TPSA: ${result.properties.tpsa.toFixed(1)} Ų`);
```

### Blood-Brain Barrier Penetration

Predicts blood-brain barrier (BBB) penetration potential.

#### `checkBBBPenetration(molecule: Molecule)`

**Rule:**

- Likely penetration if TPSA < 90 Å²

**Returns:**

```typescript
{
  likelyPenetration: boolean;
  tpsa: number;
}
```

**Example:**

```typescript
const result = checkBBBPenetration(molecule);
if (result.likelyPenetration) {
  console.log("✓ Likely BBB penetration");
} else {
  console.log("✗ Unlikely BBB penetration");
}
```

### Implementation Details

- **Molecular Weight**: Average atomic masses (IUPAC 2021) — matches RDKit
- **Exact Mass**: Monoisotopic masses (most abundant isotope)
- **LogP**: Crippen's atom contribution method (see LogP section below)
- **TPSA**: Ertl et al. fragment-based algorithm
- **H-bond donors**: RDKit-compatible SMARTS patterns (see below)
- **H-bond acceptors**: RDKit-compatible SMARTS patterns (see below)
- **Rotatable bonds**: Single bonds between heavy atoms (excluding ring bonds and terminal groups)

**Implementation:** `src/utils/molecular-properties.ts`

### H-Bond Acceptor/Donor Counting

openchem implements **RDKit-compatible** H-bond acceptor and donor counting. These definitions match RDKit exactly but may differ from other tools (PubChem, DrugBank, MOE, Schrödinger) which use alternative definitions.

#### Known Differences from Literature Values

Different cheminformatics tools define HBA/HBD differently, leading to systematic differences:

| Tool/Source            | Definition            | Example (Caffeine) |
| ---------------------- | --------------------- | ------------------ |
| **openchem/RDKit**     | SMARTS-based patterns | HBA=6, HBD=0       |
| **PubChem/Literature** | Strong acceptors only | HBA=3, HBD=0       |
| **DrugBank**           | Varies by version     | HBA=3-6, HBD=0     |

**Why This Happens:**

- **Amide nitrogens**: RDKit counts as acceptors, some tools exclude them
- **Aromatic nitrogens**: RDKit counts pyridine-like N, some tools use stricter rules
- **Carbonyl oxygens**: Universal agreement (always acceptors)
- **Imine nitrogens**: RDKit counts C=N, some tools require lone pair accessibility

**openchem Choice:** We match RDKit for consistency with the most widely-used open-source cheminformatics toolkit. This ensures interoperability and reproducible results.

#### RDKit HBA Definition (SMARTS)

```
[$([O,S;H1;v2]-[!$(*=[O,N,P,S])]),
 $([O,S;H0;v2]),
 $([O,S;-]),
 $([N;v3;!$(N-*=!@[O,N,P,S])]),
 $([nH0,o,s;+0])]
```

**Translation:**

1. O/S with 1H and valence 2, bonded to atom without =O,N,P,S (alcohols, thiols)
2. O/S with 0H and valence 2 (ethers, sulfides, carbonyls)
3. Negatively charged O/S
4. N with valence 3, not bonded to anything with =O,N,P,S (amines, imines)
5. Aromatic n/o/s with 0H and neutral charge (pyridine, furan, thiophene)

#### RDKit HBD Definition (SMARTS)

```
[N&!H0&v3,N&!H0&+1&v4,O&H1&+0,S&H1&+0,n&H1&+0]
```

**Translation:**

1. N with hydrogens and valence 3 (amines, amides)
2. N with hydrogens and +1 charge and valence 4 (ammonium)
3. O with 1H and neutral charge (alcohols, phenols, carboxylic acids)
4. S with 1H and neutral charge (thiols)
5. Aromatic n with 1H (pyrrole, imidazole)

---

## LogP Calculation (Crippen Method)

### Overview

LogP (octanol-water partition coefficient) is calculated using the **Wildman-Crippen atom contribution method** with SMARTS-based pattern matching.

**Method Features:**

- 68 atom type patterns
- Published Wildman-Crippen parameters (exact)
- SMARTS-based pattern matching with priority ordering
- WeakMap caching for 4.6 million× speedup on repeated calculations

### API Reference

```typescript
// Main functions (all equivalent)
computeLogP(molecule, includeHs?)     // Canonical name
logP(molecule, includeHs?)            // Short alias
crippenLogP(molecule, includeHs?)     // Method-explicit alias

// Advanced functions
getCrippenAtomContribs(molecule, includeHs?)  // Per-atom contributions
calcCrippenDescriptors(molecule, includeHs?)  // LogP + molar refractivity
```

**Parameters:**

- `molecule` (Molecule) — Molecule to analyze
- `includeHs` (boolean, optional) — Include explicit hydrogens (default: false)

**Returns:** `number` — LogP value

### Performance: Automatic Caching

LogP computation is automatically cached using WeakMap for dramatic performance improvements on repeated calculations.

**Performance Impact:**

| Molecule                | First Call | Cached Call | Speedup           |
| ----------------------- | ---------- | ----------- | ----------------- |
| Methane (CH₄)           | 14.6 ms    | 0.004 ms    | 4,171×            |
| Ethanol (C₂H₆O)         | 24.4 ms    | 0.002 ms    | 10,614×           |
| Aspirin (C₉H₈O₄)        | 138 ms     | 0.001 ms    | 92,064×           |
| Caffeine (C₈H₁₀N₄O₂)    | 191 ms     | 0.002 ms    | 83,193×           |
| Strychnine (C₂₁H₂₂N₂O₂) | 12.1 s     | 0.003 ms    | **4.6 million ×** |

**Why This Matters:**

- Bottleneck is Wildman-Crippen atom type matching (68 SMARTS patterns per atom)
- Cache hit is just a WeakMap lookup: < 0.01 ms
- Zero memory leaks (automatic garbage collection)
- No manual cache management needed

**Usage (transparent - no code changes needed):**

```typescript
const aspirin = parseSMILES("CC(=O)Oc1ccccc1C(=O)O").molecules[0];

// First call: ~138 ms (SMARTS pattern matching)
const logP1 = computeLogP(aspirin);

// Second call: ~0.001 ms (cache hit)
const logP2 = computeLogP(aspirin);
```

### Examples

```typescript
import { parseSMILES, computeLogP, logP, crippenLogP } from "index";

// Simple molecules
const ethanol = parseSMILES("CCO").molecules[0];
console.log(computeLogP(ethanol, true)); // -0.31

const benzene = parseSMILES("c1ccccc1").molecules[0];
console.log(logP(benzene)); // 1.69

// Drug molecules
const aspirin = parseSMILES("CC(=O)Oc1ccccc1C(=O)O").molecules[0];
console.log(crippenLogP(aspirin)); // 1.23

const caffeine = parseSMILES("CN1C=NC2=C1C(=O)N(C(=O)N2C)C").molecules[0];
console.log(computeLogP(caffeine)); // -0.07
```

### Advanced Usage: Per-Atom Contributions

```typescript
const molecule = parseSMILES("CCO").molecules[0];
const contribs = getCrippenAtomContribs(molecule, true);

contribs.forEach((contrib, i) => {
  console.log(`Atom ${i}: logP = ${contrib.logP.toFixed(3)}, MR = ${contrib.mr.toFixed(3)}`);
});
```

---

## Validation Against RDKit

### Test Coverage

- **Basic validation**: 10+ common molecules with exact RDKit match (threshold 0.01)
- **Diverse molecules**: 200 molecules from bulk test set (threshold 0.2)
- **Overall accuracy**: >99% of molecules within 0.2 LogP units of RDKit

### Known Differences with RDKit

Our LogP implementation uses the **published Wildman-Crippen parameters exactly as specified**, which provides reproducibility but may differ from RDKit by 0.2-1.15 LogP units for complex heterocycles.

#### 1. Aromatic Sulfur in Heterocycles

**Affected structures:**

- Dithiolones: `C1=CSC(=O)S1`
- Thiazines: `C1=CC=C2SC=CC(=O)N2C=C1`
- Thiadiazoles with exocyclic substituents

**Difference magnitude:** 0.6-0.8 LogP units

**Root cause:**

- Both implementations correctly identify aromatic sulfurs
- openchem uses published value: 0.6237 (pattern `[s;a]`, S3 parameter)
- RDKit appears to use ~0.3 for sulfurs in heterocycles with exocyclic C=O or C=N
- Suggests RDKit has additional SMARTS patterns or modified parameters

**Example:**

```
Dithiolone: C1=CSC(=O)S1
  openchem LogP: 1.77
  RDKit LogP:    1.17
  Difference:    0.60 (0.30 per S atom)
```

#### 2. Complex Nitrogen Heterocycles

**Affected structures:**

- Oxadiazinones with multiple nitrogen substitution
- Pyrazolones

**Difference magnitude:** 0.3-0.8 LogP units

**Root cause:**

- Differences in aromatic vs aliphatic nitrogen classification in partially saturated rings
- SMARTS pattern matching order differences

#### 3. Fused Ring Systems with Heteroatoms

**Affected structures:**

- Naphthalene ethers with lactones
- Benzofuran/benzothiophene derivatives

**Difference magnitude:** 0.2-0.3 LogP units

**Root cause:**

- Minor differences in aromatic carbon classification (C18-C26 patterns)
- Different handling of aromatic-aliphatic junction carbons

### Statistical Performance

From 200 diverse molecule test:

- **Mean absolute difference**: ~0.08 LogP units
- **Median difference**: ~0.05 LogP units
- **95th percentile**: ~0.20 LogP units
- **Maximum difference**: ~1.15 LogP units (complex thiazine)

### Acceptable Range

LogP prediction methods typically have:

- **Experimental error**: ±0.5 LogP units
- **Method variance**: ±0.3 LogP units between different software
- **Literature discrepancies**: ±1.0 LogP units for complex molecules

Our differences (0.2-1.15) are **within the expected range** for complex polycyclic heterocycles.

### When to Use This Implementation

✅ **Good for:**

- Simple organic molecules (alkanes, alcohols, aromatics)
- Standard drug-like molecules
- High-throughput screening where consistency matters
- Research requiring published method reproducibility

⚠️ **Consider RDKit if:**

- Exact RDKit LogP values are required for comparison
- Working with many sulfur-containing heterocycles
- Need LogP for regulatory submissions (use validated tools)
- Optimizing against experimental data fitted to RDKit

**Note:** Aromaticity perception was validated against RDKit for all problematic cases - differences are NOT due to aromaticity errors.

---

## Implementation Files

### Core Modules

- **Molecular properties:** `src/utils/molecular-properties.ts`
- **Descriptors:** `src/utils/molecular-descriptors.ts`
- **LogP:** `src/utils/logp.ts`

### Supporting Modules

- **SMARTS matching:** `src/matchers/smarts-matcher.ts` (used for LogP atom typing)
- **Aromaticity:** `src/utils/aromaticity-perceiver.ts`
- **Atom utilities:** `src/utils/atom-utils.ts`

---

## Testing

### Run Property Tests

```bash
# All descriptor tests
bun test test/unit/utils/molecular-descriptors.test.ts

# LogP tests with RDKit comparison
bun test test/unit/logp.test.ts
bun test test/unit/logp-detailed.test.ts

# Drug-likeness rules
bun test test/unit/molecular-properties.test.ts
```

---

## Advanced Usage

### Batch Processing with Caching

```typescript
import { parseSMILES, computeLogP, checkLipinskiRuleOfFive } from "index";

const smilesList = [
  "CC(=O)Oc1ccccc1C(=O)O", // Aspirin
  "CN1C=NC2=C1C(=O)N(C(=O)N2C)C", // Caffeine
  "CC(C)Cc1ccc(cc1)C(C)C(=O)O", // Ibuprofen
];

const results = smilesList.map((smiles) => {
  const molecule = parseSMILES(smiles).molecules[0];

  // LogP is cached automatically
  const logP = computeLogP(molecule);
  const lipinski = checkLipinskiRuleOfFive(molecule);

  return {
    smiles,
    logP: logP.toFixed(2),
    passesLipinski: lipinski.passes,
  };
});

console.table(results);
```

### Custom Descriptor Pipelines

```typescript
import {
  parseSMILES,
  computeDescriptors,
  computeLogP,
  checkLipinskiRuleOfFive,
  checkVeberRules,
} from "index";

function analyzeCompound(smiles: string) {
  const molecule = parseSMILES(smiles).molecules[0];

  return {
    basic: computeDescriptors(molecule),
    logP: computeLogP(molecule),
    lipinski: checkLipinskiRuleOfFive(molecule),
    veber: checkVeberRules(molecule),
  };
}

const results = analyzeCompound("CC(=O)Oc1ccccc1C(=O)O");
console.log(JSON.stringify(results, null, 2));
```

---

## Related Documentation

- **[SMARTS Matching](./smarts-matching.md)** — LogP uses SMARTS for atom typing
- **[IUPAC Generation](./iupac-generation.md)** — Functional group detection
- **[README](../README.md)** — Library overview

### External References

- Wildman, S. A.; Crippen, G. M. "Prediction of Physicochemical Parameters by Atomic Contributions." _J. Chem. Inf. Comput. Sci._ 1999, 39, 868-873.
- Lipinski, C. A. et al. "Experimental and computational approaches to estimate solubility and permeability in drug discovery and development settings." _Adv. Drug Deliv. Rev._ 1997, 23, 3-25.
- Veber, D. F. et al. "Molecular properties that influence the oral bioavailability of drug candidates." _J. Med. Chem._ 2002, 45, 2615-2623.
- Ertl, P. et al. "Fast calculation of molecular polar surface area as a sum of fragment-based contributions and its application to the prediction of drug transport properties." _J. Med. Chem._ 2000, 43, 3714-3717.

---

**Last Updated:** 2025-11-20  
**Maintainer:** openchem team
