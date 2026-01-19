# IUPAC Name → SMILES Parsing

**Audience:** Users who want to convert IUPAC chemical names into SMILES notation  
**Related:** [SMILES → IUPAC Generation](./iupac-generation.md)

---

## Overview

openchem's IUPAC parser converts systematic IUPAC names into SMILES strings. The parser uses OPSIN (Open Parser for Systematic IUPAC Nomenclature) data to recognize chemical name patterns and construct molecular graphs.

**Key Features:**

- ✅ Supports IUPAC Blue Book 2013 systematic nomenclature
- ✅ Recognizes both systematic and trivial names (via OPSIN data)
- ✅ Handles alkanes, functional groups, aromatics, heterocycles
- ✅ Pure TypeScript implementation (no external dependencies)

---

## Quick Start

### Basic Usage

```typescript
import { parseIUPACName, generateSMILES } from "index";

// Parse IUPAC name → Molecule
const result = parseIUPACName("propan-2-ol");

if (result.errors.length > 0) {
  console.error("Parse failed:", result.errors);
} else if (result.molecule) {
  // Convert Molecule → SMILES
  const smiles = generateSMILES(result.molecule, true); // true = canonical
  console.log(`SMILES: ${smiles}`); // CC(C)O
}
```

### Error Handling

```typescript
const result = parseIUPACName("invalid-chemical-name");

if (result.errors.length > 0) {
  console.error("Errors:", result.errors);
  // ["Unrecognized chemical name: invalid-chemical-name"]
}
```

---

## Supported Chemical Classes

### 1. Acyclic Hydrocarbons

**Alkanes (100% coverage):**

```typescript
parseIUPACName("methane"); // CH₄
parseIUPACName("ethane"); // C₂H₆
parseIUPACName("propane"); // C₃H₈
parseIUPACName("butane"); // C₄H₁₀
parseIUPACName("pentane"); // C₅H₁₂
parseIUPACName("hexane"); // C₆H₁₄
parseIUPACName("octane"); // C₈H₁₈
parseIUPACName("decane"); // C₁₀H₂₂
```

**Branched Alkanes:**

```typescript
parseIUPACName("2-methylpropane"); // (CH₃)₂CHCH₃
parseIUPACName("2-methylbutane"); // CH₃CH(CH₃)CH₂CH₃
parseIUPACName("2,2-dimethylpropane"); // (CH₃)₄C
parseIUPACName("2,3-dimethylbutane"); // (CH₃)₂CHCH(CH₃)₂
```

**Alkenes & Alkynes:**

```typescript
parseIUPACName("ethene"); // C₂H₄ (ethylene)
parseIUPACName("propene"); // C₃H₆
parseIUPACName("but-1-ene"); // CH₂=CHCH₂CH₃
parseIUPACName("but-2-ene"); // CH₃CH=CHCH₃
parseIUPACName("ethyne"); // C₂H₂ (acetylene)
parseIUPACName("propyne"); // HC≡CCH₃
```

### 2. Functional Groups

**Alcohols:**

```typescript
parseIUPACName("methanol"); // CH₃OH
parseIUPACName("ethanol"); // CH₃CH₂OH
parseIUPACName("propan-1-ol"); // CH₃CH₂CH₂OH
parseIUPACName("propan-2-ol"); // (CH₃)₂CHOH (isopropanol)
parseIUPACName("butan-2-ol"); // CH₃CH(OH)CH₂CH₃
```

**Ketones:**

```typescript
parseIUPACName("propan-2-one"); // (CH₃)₂CO (acetone)
parseIUPACName("butan-2-one"); // CH₃COCH₂CH₃
parseIUPACName("pentan-3-one"); // CH₃CH₂COCH₂CH₃
```

**Aldehydes:**

```typescript
parseIUPACName("methanal"); // HCHO (formaldehyde)
parseIUPACName("ethanal"); // CH₃CHO (acetaldehyde)
parseIUPACName("propanal"); // CH₃CH₂CHO
```

**Carboxylic Acids:**

```typescript
parseIUPACName("methanoic acid"); // HCOOH (formic acid)
parseIUPACName("ethanoic acid"); // CH₃COOH (acetic acid)
parseIUPACName("propanoic acid"); // CH₃CH₂COOH
parseIUPACName("butanoic acid"); // CH₃CH₂CH₂COOH
```

**Esters:**

```typescript
parseIUPACName("methyl ethanoate"); // CH₃COOCH₃ (methyl acetate)
parseIUPACName("ethyl ethanoate"); // CH₃COOCH₂CH₃ (ethyl acetate)
parseIUPACName("methyl propanoate"); // CH₃CH₂COOCH₃
```

**Amines:**

```typescript
parseIUPACName("methanamine"); // CH₃NH₂
parseIUPACName("ethanamine"); // CH₃CH₂NH₂
parseIUPACName("propan-1-amine"); // CH₃CH₂CH₂NH₂
parseIUPACName("propan-2-amine"); // (CH₃)₂CHNH₂
```

**Amides:**

```typescript
parseIUPACName("ethanamide"); // CH₃CONH₂ (acetamide)
parseIUPACName("N-methylethanamide"); // CH₃CONHCH₃
parseIUPACName("N,N-dimethylethanamide"); // CH₃CON(CH₃)₂
```

**Nitriles:**

```typescript
parseIUPACName("ethanenitrile"); // CH₃CN (acetonitrile)
parseIUPACName("propanenitrile"); // CH₃CH₂CN
```

### 3. Aromatic Compounds

**Simple Aromatics:**

```typescript
parseIUPACName("benzene"); // C₆H₆
parseIUPACName("methylbenzene"); // C₆H₅CH₃ (toluene)
parseIUPACName("ethylbenzene"); // C₆H₅CH₂CH₃
parseIUPACName("chlorobenzene"); // C₆H₅Cl
```

**Fused Ring Systems:**

```typescript
parseIUPACName("naphthalene"); // C₁₀H₈
parseIUPACName("anthracene"); // C₁₄H₁₀
parseIUPACName("phenanthrene"); // C₁₄H₁₀
```

### 4. Heterocycles

**Aromatic Heterocycles:**

```typescript
parseIUPACName("pyridine"); // C₅H₅N
parseIUPACName("pyrimidine"); // C₄H₄N₂
parseIUPACName("furan"); // C₄H₄O
parseIUPACName("thiophene"); // C₄H₄S
parseIUPACName("pyrrole"); // C₄H₅N
parseIUPACName("imidazole"); // C₃H₄N₂
```

**Saturated Heterocycles:**

```typescript
parseIUPACName("morpholine"); // C₄H₉NO
parseIUPACName("piperazine"); // C₄H₁₀N₂
parseIUPACName("piperidine"); // C₅H₁₁N
parseIUPACName("pyrrolidine"); // C₄H₉N
parseIUPACName("oxane"); // C₅H₁₀O (tetrahydropyran)
parseIUPACName("oxolane"); // C₄H₈O (tetrahydrofuran)
```

### 5. Cyclic Hydrocarbons

**Monocyclic:**

```typescript
parseIUPACName("cyclopropane"); // C₃H₆
parseIUPACName("cyclobutane"); // C₄H₈
parseIUPACName("cyclopentane"); // C₅H₁₀
parseIUPACName("cyclohexane"); // C₆H₁₂
parseIUPACName("cyclohexene"); // C₆H₁₀
```

**Polycyclic:**

```typescript
parseIUPACName("bicyclo[2.2.1]heptane"); // norbornane
parseIUPACName("adamantane"); // C₁₀H₁₆
```

---

## Trivial Names Support

The parser recognizes common trivial names through OPSIN data:

```typescript
// Trivial names are automatically recognized
parseIUPACName("acetone"); // → propan-2-one
parseIUPACName("isopropanol"); // → propan-2-ol
parseIUPACName("toluene"); // → methylbenzene
parseIUPACName("acetic acid"); // → ethanoic acid
parseIUPACName("acetonitrile"); // → ethanenitrile
parseIUPACName("formic acid"); // → methanoic acid
```

**Supported trivial names:**

- C1-C4 carboxylic acids (formic, acetic, propionic, butyric)
- Common solvents (acetone, isopropanol, acetonitrile)
- Simple aromatics (toluene, xylene, cumene)
- Common heterocycles (tetrahydrofuran, tetrahydropyran)

---

## Round-Trip Testing

You can verify parsing accuracy with round-trip conversion:

```typescript
import { parseIUPACName, generateIUPACName, generateSMILES } from "index";

// Test: IUPAC → SMILES → IUPAC
const originalName = "propan-2-ol";

// Step 1: Parse IUPAC name
const parseResult = parseIUPACName(originalName);
console.log("Parsed:", parseResult.molecule ? "✓" : "✗");

// Step 2: Convert to SMILES
const smiles = generateSMILES(parseResult.molecule!, true);
console.log("SMILES:", smiles); // CC(C)O

// Step 3: Generate IUPAC name from molecule
const nameResult = generateIUPACName(parseResult.molecule!);
console.log("Generated name:", nameResult.name); // propan-2-ol

// Compare names
const match = nameResult.name.toLowerCase() === originalName.toLowerCase();
console.log("Round-trip:", match ? "✓" : "✗");
```

---

## Known Limitations

### 1. Complex Natural Products

**Not supported:** Steroids, alkaloids, complex polycyclic systems

```typescript
// These will fail or return errors:
parseIUPACName("cholesterol");
parseIUPACName("morphine");
parseIUPACName("quinine");
```

**Workaround:** Use SMILES input directly for complex molecules.

### 2. Complex Stereochemistry

**Limited support:** Advanced E/Z, R/S descriptors

```typescript
// Basic E/Z works:
parseIUPACName("(E)-but-2-ene"); // ✓

// Complex R/S may fail:
parseIUPACName("(2R,3S)-2,3-dihydroxybutanoic acid"); // ⚠️
```

### 3. Non-Standard Nomenclature

**Not supported:** Trade names, brand names, non-IUPAC conventions

```typescript
// These will fail:
parseIUPACName("Aspirin"); // Use: 2-acetoxybenzoic acid
parseIUPACName("Tylenol"); // Use: N-(4-hydroxyphenyl)ethanamide
```

---

## Advanced Usage

### Complete Example

```typescript
import { parseIUPACName, generateSMILES, generateIUPACName } from "index";

function demonstrateParsing() {
  const examples = [
    "ethane",
    "2-methylpropane",
    "propan-2-ol",
    "butan-2-one",
    "ethanoic acid",
    "benzene",
    "pyridine",
  ];

  console.log("IUPAC Name → SMILES Parsing\n");

  for (const iupacName of examples) {
    const result = parseIUPACName(iupacName);

    if (result.errors.length > 0) {
      console.log(`✗ ${iupacName}: ${result.errors[0]}`);
      continue;
    }

    if (!result.molecule) {
      console.log(`✗ ${iupacName}: No molecule generated`);
      continue;
    }

    const smiles = generateSMILES(result.molecule, true);
    console.log(`✓ ${iupacName} → ${smiles}`);
  }
}

demonstrateParsing();
```

### Working with Errors

```typescript
const result = parseIUPACName("invalid-name");

if (result.errors.length > 0) {
  result.errors.forEach((error, i) => {
    console.error(`Error ${i + 1}: ${error}`);
  });
}
```

---

## Implementation Details

### Parser Architecture

```
IUPAC Name Input
    ↓
Citation Normalizer (preprocess)
    ↓
OPSIN Data Lookup
    ↓
Token Parsing (prefix, parent, suffix)
    ↓
Molecule Graph Builder
    ↓
Implicit Hydrogen Addition
    ↓
Return Molecule Object
```

### OPSIN Data Integration

The parser uses OPSIN XML data located in `opsin-iupac-data/`:

- `alkanes.xml` — C1-C100 alkane names
- `simpleGroups.xml` — Common substituents
- `functionalTerms.xml` — Functional group suffixes
- `heteroAtoms.xml` — Heteroatom replacement names
- `simpleCyclicGroups.xml` — Common ring systems
- `LOOKUP.json` — Compiled lookup table (26,000+ entries)

**How it works:**

1. Input name is normalized (remove spaces, lowercase)
2. Citation normalizer handles chemical conventions
3. Name is split into tokens (prefix, parent, suffix)
4. Each token is looked up in OPSIN data
5. Tokens are assembled into a molecular graph
6. Final molecule is validated and returned

---

## Related Documentation

### For Users:

- **[SMILES → IUPAC Generation](./iupac-generation.md)** — Generate IUPAC names from SMILES
- **[Comprehensive Example](./examples/example-iupac.ts)** — Full code examples
- **[README](../README.md)** — Library overview

### For Developers:

- **[Implementation Guide](./iupac-implementation.md)** — Technical architecture
- **[Rules Reference](./iupac-rules-reference.md)** — IUPAC Blue Book rules

---

## Testing

### Run Parser Tests

```bash
# All IUPAC parser tests
bun test test/unit/iupac-engine/iupac-parser-integration.test.ts

# Full IUPAC test suite
bun test test/unit/iupac-engine/

# Realistic dataset (149 molecules)
bun test test/unit/iupac-engine/realistic-iupac-dataset.test.ts
```

### Test Coverage

- **Unit tests:** 60 test files, 400+ tests
- **Integration tests:** Full name → SMILES pipeline
- **Realistic dataset:** 149 molecules from PubChem

---

## API Reference

### `parseIUPACName(name: string)`

**Parameters:**

- `name` (string) — IUPAC chemical name (systematic or trivial)

**Returns:**

```typescript
{
  molecule: Molecule | null,      // Parsed molecule object
  errors: string[]                // Array of error messages
}
```

**Example:**

```typescript
const result = parseIUPACName("propan-2-ol");
// { molecule: {...}, errors: [] }
```

### `generateSMILES(molecule: Molecule, canonical?: boolean)`

**Parameters:**

- `molecule` (Molecule) — Molecule object to convert
- `canonical` (boolean, optional) — Generate canonical SMILES (default: false)

**Returns:** `string` — SMILES representation

**Example:**

```typescript
const smiles = generateSMILES(molecule, true);
// "CC(C)O"
```

---

## Getting Help

- **GitHub Issues:** [Report bugs or request features](https://github.com/sst/openchem/issues)
- **Documentation:** See `/docs` folder for detailed guides
- **Examples:** Check `docs/examples/example-iupac.ts`

---

**Last Updated:** 2025-11-20  
**Maintainer:** openchem team
