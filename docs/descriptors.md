# Molecular Descriptors

This document describes the basic molecular descriptor utilities exposed by `src/utils/molecular-descriptors.ts` and how to use them.

Overview

- The module provides small, focused descriptor helpers and a convenience entrypoint `computeDescriptors(...)` for computing a set of basic descriptors for a single `Molecule` object.

Provided functions

- `computeDescriptors(mol, opts?)` — returns an object with the basic descriptor group:
  - `atomCount` — number of atoms in the molecule (explicit atoms only)
  - `bondCount` — number of bonds in the molecule
  - `formalCharge` — sum of atomic `charge` fields
  - `elementCounts` — counts per element; optionally includes implicit hydrogens and isotopic labels
  - `heavyAtomFraction` — fraction of heavy (non-hydrogen) atoms relative to total atoms (explicit + implicit H)

- `getAtomCount(mol)` — returns `mol.atoms.length`.
- `getBondCount(mol)` — returns `mol.bonds.length`.
- `getFormalCharge(mol)` — sums `atom.charge` (defaults to `0` when absent).
- `getElementCounts(mol, opts?)` — returns a `Record<string, number>` with element counts.
- `getHeavyAtomFraction(mol)` — returns fraction heavyAtoms / totalAtoms where totalAtoms = explicit atoms + implicit hydrogens.

Options

`DescriptorOptions` (optional object accepted by `computeDescriptors` and `getElementCounts`):

- `includeImplicitH` (boolean, default: `true`) — when `true`, implicit hydrogen counts stored on atoms (atom.hydrogens) are included in `elementCounts` as `'H'` entries and are counted toward total atoms used by `heavyAtomFraction`.
- `includeIsotopes` (boolean, default: `false`) — when `true` elements with an `atom.isotope` integer will be listed using the notation `${isotope}${symbol}` (for example, `13C`) instead of the plain element symbol.

Behavior notes and edge cases

- Heavy atom fraction calculation:
  - Uses `getHeavyAtomCount(mol)` from `molecular-properties` for the numerator.
  - Denominator is `mol.atoms.length + sum(atom.hydrogens || 0)` (explicit atoms + implicit hydrogens).
  - Returns `0` for molecules with zero heavy atoms.

- Element counting:
  - Atoms with `symbol` absent or equal to `'*'` are ignored.
  - If `includeImplicitH` is enabled (default), the `hydrogens` field on each atom is added as `H` counts.
  - If `includeIsotopes` is enabled, atoms with `isotope` produce keys like `"13C"`.

- Input validation:
  - Current functions access `mol.atoms` and `mol.bonds` directly. Passing a malformed object (e.g. `{}`) may throw. Tests currently assert this behavior. If you prefer defensive APIs that return default descriptor values instead of throwing, the implementation can be updated to validate inputs and return safe defaults.

Examples

- Basic usage (compute full set):

```
import { parseSMILES } from 'index';
import { computeDescriptors } from 'src/utils/molecular-descriptors';

const res = parseSMILES('CCO');
const mol = res.molecules[0];
const desc = computeDescriptors(mol);
// desc.atomCount -> 3
// desc.elementCounts -> { C: 2, H: 6, O: 1 }
```

- Including isotopes and excluding implicit H:

```
const desc2 = computeDescriptors(mol, { includeIsotopes: true, includeImplicitH: false });
```

## LogP Calculation

The module also provides Crippen LogP (octanol-water partition coefficient) calculation via `src/utils/logp.ts`:

- `computeLogP(mol, includeHs?)` - Returns the Wildman-Crippen LogP estimate
- `logP(mol, includeHs?)` - Alias for `computeLogP` (convenience)
- `crippenLogP(mol, includeHs?)` - Alias for `computeLogP` (method-explicit)
- `getCrippenAtomContribs(mol, includeHs?)` - Returns per-atom LogP and MR contributions
- `calcCrippenDescriptors(mol, includeHs?)` - Returns both LogP and molar refractivity

### Usage

```typescript
import { parseSMILES, computeLogP, logP, crippenLogP } from 'index';

const res = parseSMILES('CCO');
const mol = res.molecules[0];
const logp1 = computeLogP(mol, true);  // canonical name
const logp2 = logP(mol, true);         // short alias
const logp3 = crippenLogP(mol, true);  // method-explicit alias
// All three return the same value
```

### Implementation Notes

Our LogP implementation uses the published Wildman-Crippen parameters exactly as specified in the original paper. This provides reproducibility but may differ from RDKit by 0.2-1.15 LogP units for complex heterocycles (especially sulfur-containing aromatics).

For detailed information about validation results, known differences with RDKit, and accuracy assessment, see [LogP Implementation Notes](./logp-implementation-notes.md).

Testing and further work

- Tests: unit tests are under `test/unit/utils/` and include `molecular-descriptors.test.ts` plus extra edge-case files added during work.
- Improvements: make descriptor helpers defensive, add more descriptors (rotatable bonds, TPSA, ring counts), and document output contracts in a TypeScript declaration or README section.

Contact

- For changes to semantics (for example, changing whether implicit H are counted in heavy-atom fraction), coordinate with the test suite and update expected values accordingly.
