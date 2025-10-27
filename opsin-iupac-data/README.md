# OPSIN IUPAC Nomenclature Data

This directory contains XML lexicon and rule files for IUPAC chemical nomenclature, extracted from the **OPSIN** (Open Source IUPAC Nomenclature) project.

## Quick Start

- **Lookup File**: `LOOKUP.json` - Comprehensive index of all files organized by category
- **Total Files**: 38 XML files (~1.2 MB)
- **Schema**: All files follow the `tokenLists.dtd` DTD schema

## Directory Structure

Files are organized by purpose:

### Core Elements (3 files)
- `elementaryAtoms.xml` - H, C, N, O, S, P, halogens, etc.
- `heteroAtoms.xml` - Complex heteroatom definitions
- `hwHeteroAtoms.xml` - Hantzsch-Widman heteroatom rules

### Hydrocarbons (3 files)
- `alkanes.xml` - Alkane naming conventions
- `unsaturators.xml` - Double/triple bond suffixes (ene, yne)
- `cyclicUnsaturableHydrocarbon.xml` - Aromatic rings

### Functional Groups (6 files)
- `suffixes.xml` - Core suffix definitions
- `carboxylicAcids.xml` - COOH naming
- `nonCarboxylicAcids.xml` - Other acid types
- `functionalTerms.xml` - Functional group nomenclature
- `inlineSuffixes.xml` - Inline suffix rules
- `inlineChargeSuffixes.xml` - Charge notation

### Substituents (4 files)
- `simpleSubstituents.xml` - Alkyl and common groups
- `multiRadicalSubstituents.xml` - Multi-valent groups
- `arylSubstituents.xml` - Aromatic prefixes
- `suffixPrefix.xml` - Prefix rules

### Ring Systems (4 files)
- `simpleCyclicGroups.xml` - Cyclopropane to cyclooctane, benzene
- `arylGroups.xml` - Aromatic ring systems
- `fusionComponents.xml` - Naphthalene, anthracene, etc.
- `simpleGroups.xml` - General group definitions

### Multipliers & Connectors (2 files)
- `multipliers.xml` - mono-, di-, tri-, etc.
- `infixes.xml` - Connecting tokens

### Specialized (5 files)
- `carbohydrates.xml` - Sugar nomenclature
- `carbohydrateSuffixes.xml` - Carbohydrate suffixes
- `aminoAcids.xml` - Amino acid names
- `naturalProducts.xml` - Steroids, natural products
- `atomHydrides.xml` - Hydride naming

### Validation & Rules (7 files)
- `wordRules.xml` - Name construction rules
- `regexes.xml` - Pattern matching rules (37KB)
- `suffixApplicability.xml` - When suffixes apply
- `groupStemsAllowingAllSuffixes.xml` - Universal compatibility
- `groupStemsAllowingInlineSuffixes.xml` - Inline compatibility
- `chargeAndOxidationNumberSpecifiers.xml` - Ionic notation
- `miscTokens.xml` - Special cases

### Special (3 files)
- `germanTokens.xml` - German IUPAC support
- `index.xml` - Master index
- `substituents.xml` - Substituent reference

## Usage

### Example: Naming an Organic Compound

```
Input: C6H5-CH2-CH3 (ethylbenzene)

1. Identify parent chain: benzene (from arylGroups.xml)
2. Find substituent: ethyl (from simpleSubstituents.xml)
3. Number position: ethylbenzene (2-position)
4. Check multiplier: only 1 substituent (multipliers.xml)
5. Construct name: ethylbenzene or 2-ethylbenzene
```

### For Developers

To load and parse these files in TypeScript:

```typescript
import * as fs from 'fs';
import * as xml2js from 'xml2js';

const parser = new xml2js.Parser();
const fileContent = fs.readFileSync('opsin-iupac-data/alkanes.xml', 'utf8');
const result = await parser.parseStringPromise(fileContent);
```

## Source

- **Project**: OPSIN (Open Source IUPAC Nomenclature)
- **Repository**: https://github.com/dan2097/opsin
- **License**: Check OPSIN repository for license details
- **Extracted**: 2025-10-25

## Key Files by Priority

**Most Important** (start here):
1. `LOOKUP.json` - Find what you need
2. `alkanes.xml` - Basic hydrocarbon names
3. `suffixes.xml` - Functional group endings
4. `simpleSubstituents.xml` - Alkyl groups

**Frequently Used**:
- `arylGroups.xml` - Aromatic compounds
- `regexes.xml` - Pattern validation
- `multipliers.xml` - Numerical prefixes

## Notes

- All files use UTF-8 encoding
- DTD schema file (`tokenLists.dtd`) is referenced but not included
- Files are read-only copies from OPSIN source
- Some files contain special characters and entity references

## Related Documentation

- See `LOOKUP.json` for detailed metadata on each file
- OpenSMILES spec: https://www.opensmiles.org/
- IUPAC Blue Book: https://iupac.org/what-we-do/nomenclature/
