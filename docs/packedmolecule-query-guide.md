# PackedMolecule Query API Guide

## Overview

`PackedMolecule` is a high-level wrapper around the binary `PackedMol` format that provides efficient molecular inspection without full deserialization. The `.query` interface exposes all query operations in an organized, type-safe manner.

## Basic Usage

```typescript
import { PackedMolecule } from "openchem";
import { parseSMILES } from "openchem";

// Create from a Molecule
const mol = parseSMILES("CCO").molecules[0];
const packed = new PackedMolecule(mol);

// Access basic properties (no deserialization)
console.log(packed.atomCount); // 3
console.log(packed.bondCount); // 2
console.log(packed.bufferSize); // ~64 bytes

// Access query interface
console.log(packed.query.atomCount); // 3
console.log(packed.query.formula); // { 6: 2, 8: 1 }
console.log(packed.query.totalHydrogens); // 6
console.log(packed.query.molecularCharge); // 0
```

## Query Interface Methods

### Aggregate Properties

Get molecular-level information without deserialization:

```typescript
// Molecular composition
packed.query.atomCount; // Total atoms
packed.query.bondCount; // Total bonds
packed.query.totalHydrogens; // Sum of all H atoms
packed.query.molecularCharge; // Sum of formal charges
packed.query.aromaticAtomCount; // Number of aromatic atoms
packed.query.chiralAtomCount; // Number of chiral centers
packed.query.formula; // Record<atomicNumber, count>

// Examples
const aspirin = new PackedMolecule(parseSMILES("CC(=O)Oc1ccccc1C(=O)O").molecules[0]);
console.log(aspirin.query.formula); // { 6: 9, 8: 4, 1: 8 } (C₉H₈O₄)
console.log(aspirin.query.aromaticAtomCount); // 6
console.log(aspirin.query.chiralAtomCount); // 0
```

### Atom-Level Queries

Inspect individual atoms efficiently:

```typescript
// Properties of atom at index
packed.query.getAtomicNumber(0); // Element (atomic number)
packed.query.getFormalCharge(0); // Integer charge
packed.query.getHydrogens(0); // Explicit H count
packed.query.getDegree(0); // Number of bonds

// Atom flags
packed.query.isAromatic(0); // Is in aromatic system?
packed.query.isChiral(0); // Is chiral center?
packed.query.isDummy(0); // Is dummy atom (*)?

// Neighbors
packed.query.getNeighbors(0); // [[neighborAtom, bondIndex], ...]

// Example: Inspect ethanol atoms
const ethanol = new PackedMolecule(parseSMILES("CCO").molecules[0]);
for (let i = 0; i < ethanol.query.atomCount; i++) {
  const atomicNum = ethanol.query.getAtomicNumber(i);
  const degree = ethanol.query.getDegree(i);
  const neighbors = ethanol.query.getNeighbors(i);
  console.log(`Atom ${i}: element ${atomicNum}, degree ${degree}, ${neighbors.length} neighbors`);
}
// Output:
// Atom 0: element 6, degree 2, 2 neighbors
// Atom 1: element 6, degree 3, 2 neighbors
// Atom 2: element 8, degree 1, 1 neighbor
```

### Bond-Level Queries

Inspect individual bonds:

```typescript
// Bond properties
const [atom1, atom2] = packed.query.getBondAtoms(0); // Connected atoms
packed.query.getBondDirection(0); // "up", "down", or "none"

// Example: List all bonds
const benzene = new PackedMolecule(parseSMILES("c1ccccc1").molecules[0]);
for (let i = 0; i < benzene.query.bondCount; i++) {
  const [a1, a2] = benzene.query.getBondAtoms(i);
  const direction = benzene.query.getBondDirection(i);
  console.log(`Bond ${i}: ${a1}-${a2} (${direction})`);
}
```

### Search & Filter

Find atoms matching criteria:

```typescript
// Count atoms of specific type
packed.query.countAtomType(6); // How many carbons?
packed.query.countAtomType(8); // How many oxygens?

// Find all atoms of specific type
const carbons = packed.query.findAtomsByType(6);
const oxygens = packed.query.findAtomsByType(8);

// Example: Analyze aspirin composition
const aspirin = new PackedMolecule(parseSMILES("CC(=O)Oc1ccccc1C(=O)O").molecules[0]);
console.log(`Carbons: ${aspirin.query.countAtomType(6)}`); // 9
console.log(`Hydrogens: ${aspirin.query.countAtomType(1)}`); // 8
console.log(`Oxygens: ${aspirin.query.countAtomType(8)}`); // 4
```

## Performance Benefits

The `.query` interface avoids deserialization entirely:

```typescript
// FAST: No deserialization
const atomCount = packed.query.atomCount; // ~1 μs

// SLOW: Full deserialization
const molecule = packed.molecule; // ~1-5 ms
const atomCount2 = molecule.atoms.length;
```

## Use Cases

### 1. Molecular Filtering

```typescript
// Filter drug-like molecules without deserialization
function isSmallMolecule(packed: PackedMolecule): boolean {
  return packed.query.atomCount <= 50 && packed.query.bondCount <= 60;
}

const molecules = [packed1, packed2, packed3];
const small = molecules.filter(isSmallMolecule);
```

### 2. Molecular Comparison

```typescript
// Compare molecular composition quickly
function isSameFormula(p1: PackedMolecule, p2: PackedMolecule): boolean {
  const f1 = JSON.stringify(p1.query.formula);
  const f2 = JSON.stringify(p2.query.formula);
  return f1 === f2;
}
```

### 3. Aromatic Ring Detection

```typescript
// Count aromatic atoms without full decode
const benzene = new PackedMolecule(parseSMILES("c1ccccc1").molecules[0]);
console.log(`Aromatic atoms: ${benzene.query.aromaticAtomCount}`); // 6

const naphthalene = new PackedMolecule(parseSMILES("c1ccc2ccccc2c1").molecules[0]);
console.log(`Aromatic atoms: ${naphthalene.query.aromaticAtomCount}`); // 10
```

### 4. Structural Analysis

```typescript
// Analyze connectivity patterns
const mol = new PackedMolecule(parseSMILES("CC(C)CC1=CC=C(C=C1)C(C)C(=O)O").molecules[0]); // Ibuprofen

for (let i = 0; i < mol.query.atomCount; i++) {
  const degree = mol.query.getDegree(i);
  const isAromatic = mol.query.isAromatic(i);

  if (degree === 3 && mol.query.getAtomicNumber(i) === 6) {
    console.log(`Carbon ${i}: quaternary, aromatic=${isAromatic}`);
  }
}
```

## Transitioning to Full Deserialization

When you need the complete structure, use `.molecule`:

```typescript
const packed = new PackedMolecule(mol);

// Quick queries first (no deserialization)
if (packed.query.atomCount > 100) {
  console.log("Molecule too large");
  return;
}

// Now deserialize if needed
const fullMol = packed.molecule; // One-time cost (~1-5ms)

// Use fullMol for complex operations
// SMILES generation, IUPAC naming, etc.
```

## Type Definitions

```typescript
export interface PackedMoleculeQuery {
  // Aggregates
  get atomCount(): number;
  get bondCount(): number;
  get totalHydrogens(): number;
  get molecularCharge(): number;
  get aromaticAtomCount(): number;
  get chiralAtomCount(): number;
  get formula(): Record<number, number>;

  // Atom-level
  countAtomType(atomicNumber: number): number;
  findAtomsByType(atomicNumber: number): number[];
  getAtomicNumber(atomIndex: number): number;
  getFormalCharge(atomIndex: number): number;
  getHydrogens(atomIndex: number): number;
  getDegree(atomIndex: number): number;
  getNeighbors(atomIndex: number): Array<[number, number]>;
  isAromatic(atomIndex: number): boolean;
  isChiral(atomIndex: number): boolean;
  isDummy(atomIndex: number): boolean;

  // Bond-level
  getBondAtoms(bondIndex: number): [number, number];
  getBondDirection(bondIndex: number): "up" | "down" | "none";
}
```

## Best Practices

1. **Use `.query` for filtering/analysis** - Avoid unnecessary deserialization
2. **Cache PackedMolecule instances** - Reuse encodings when possible
3. **Transition lazily** - Only deserialize when needed
4. **Batch queries** - Gather all query information before deserialization
5. **Transfer for parallelism** - Use `.packed` and `.transfer()` for Web Workers

## Memory Efficiency

PackedMolecule is 20-40x smaller than standard Molecule objects:

```typescript
const mol = parseSMILES("CC(=O)Oc1ccccc1C(=O)O").molecules[0];
const packed = new PackedMolecule(mol);

console.log(`Molecule JSON: ${JSON.stringify(mol).length} bytes`);
console.log(`PackedMolecule: ${packed.bufferSize} bytes`);
// Output:
// Molecule JSON: 2500+ bytes
// PackedMolecule: 80-120 bytes
```

## See Also

- `PackedMol` specification: `docs/packedmol-spec.md`
- Main `PackedMolecule` class: `src/utils/packed-molecule.ts`
- Query implementation: `src/utils/packedmol-query.ts`
