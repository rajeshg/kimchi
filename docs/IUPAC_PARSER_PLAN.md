# IUPAC Parser Implementation Plan

## Overview
Goal: Convert IUPAC chemical names to openchem Molecule objects
Example: "2-methylpropan-1-ol" → Molecule { atoms: [...], bonds: [...] }

## Architecture: 3-Stage Pipeline

### Stage 1: Tokenizer (iupac-tokenizer.ts) ~300-400 lines
**Input**: IUPAC name string (e.g., "2-methylpropan-1-ol")
**Output**: Token array with parsed components

Token types:
- LOCANT: "2", "1" (numbers for atom positions)
- MULTIPLIER: "di", "tri" (quantity prefix)
- SUBSTITUENT: "methyl" (alkyl group)
- PARENT_CHAIN: "propan" (base chain)
- SUFFIX: "ol" (functional group: alcohol, amine, etc.)
- STEREO: "@", "@@" (stereochemistry)

Algorithm:
1. Normalize: lowercase, remove spaces, handle brackets
2. Greedy longest-match tokenization:
   - Try to match longest known tokens first
   - Priority: locants → stereo → multipliers → suffixes → substituents → parent chains
3. Collect all matches with positions
4. Return Token array

### Stage 2: Builder (iupac-builder.ts) ~400-500 lines
**Input**: Token array + opsin-rules.json data
**Output**: Partially-built Molecule with atoms and bonds

Steps:
1. **Parse parent chain**:
   - Look up parent chain from tokens in opsin-rules.ringSystems or alkanes
   - Get SMILES representation (e.g., "c1ccccc1" for benzene)
   - Parse SMILES into atom/bond graph
   - Store atom positions/labels from opsin-rules

2. **Apply functional groups**:
   - Find suffix tokens (ol, one, al, etc.)
   - Locate attachment positions from locants
   - Modify parent structure (add =O for ketones, etc.)

3. **Attach substituents**:
   - Find multiplier + substituent combinations
   - Look up SMILES in opsin-rules.substituents
   - Get attachment point locants
   - Build sub-molecule from SMILES, connect to parent

4. **Apply stereochemistry**:
   - Parse stereo tokens (@, @@)
   - Set bond stereochemistry on parent structure

### Stage 3: Validator (uses existing framework)
**Input**: Built Molecule
**Output**: Validated Molecule or error array

Uses existing validators:
- AromaticityValidator
- StereoValidator
- ValenceValidator

## File Structure

```
src/parsers/
├── iupac-parser.ts           (Main entry point, ~100 lines)
├── iupac-tokenizer.ts        (Tokenization, ~350 lines)
├── iupac-builder.ts          (Molecule building, ~450 lines)
├── iupac-types.ts            (Type definitions, ~50 lines)
└── iupac-utils.ts            (Helpers, ~100 lines)

index.ts
├── Export parseIUPACName() function
└── Export IUPACParseResult type
```

## Type Definitions

```typescript
interface IUPACToken {
  type: 'LOCANT' | 'MULTIPLIER' | 'SUBSTITUENT' | 'PARENT' | 'SUFFIX' | 'STEREO';
  value: string;
  position: number;
  metadata?: Record<string, any>;
}

interface IUPACParseResult {
  molecule: Molecule | null;
  errors: string[];
  warnings: string[];
}
```

## Tokenizer Strategy

Priority order for token matching (greedy longest-match):
1. **Locants** (position numbers): "1", "2", "1,2", "2,3,4"
2. **Stereochemistry**: "@", "@@", "E-", "Z-", "R-", "S-"
3. **Multipliers**: "di", "tri", "tetra" (check opsin-rules.multipliers)
4. **Functional group suffixes**: "ol", "one", "al", "amine", "acid" (check opsin-rules.suffixes)
5. **Substituents**: "methyl", "ethyl", "chloro", "bromo" (check opsin-rules.substituents)
6. **Parent chains**: "methane", "ethane", "benzene", "pyridine" (check opsin-rules combined)

## Builder Strategy

1. **Parent chain identification**:
   - Find primary parent token (highest priority parent chain)
   - Look up in opsin-rules.ringSystems (for benzene, pyridine, etc.)
   - If not found, try opsin-rules.alkanes (for aliphatic chains)
   - Get SMILES structure and atom labels

2. **Functional group application**:
   - For each suffix token, apply modifications to parent
   - Example: "-ol" at locant "1" → add OH at position 1
   - Example: "-one" at locant "2" → add =O at position 2

3. **Substituent attachment**:
   - Parse multiplier + substituent pairs
   - Look up substituent SMILES in opsin-rules.substituents
   - Parse SMILES into structure
   - Find attachment points from locants
   - Connect to parent chain via attachment bonds

4. **Stereochemistry**:
   - Parse stereo prefix/suffix tokens
   - Set wedge/hash bonds on parent structure

## Key Implementation Details

### OPSINRules Structure (from opsin-rules.json)
```
{
  "ringSystems": {
    "c1ccccc1": { aliases: ["benzen", "benzene"], labels: "1/2..." },
    "n1ccccc1": { aliases: ["pyridin"], labels: "1/2..." },
    ...
  },
  "alkanes": {
    "C": "meth",
    "CC": "eth",
    ...
  },
  "substituents": {
    "-C": { aliases: ["methyl"], smiles: "-C" },
    "-CC": { aliases: ["ethyl"], smiles: "-CC" },
    ...
  },
  "suffixes": {
    "ol": { aliases: ["ol"], type: "alcohol" },
    "one": { aliases: ["one"], type: "ketone" },
    ...
  },
  "multipliers": {
    "basic": { "2": "di", "3": "tri", ... },
    ...
  }
}
```

### Parsing Examples

**Example 1: "methane"**
1. Tokenize: [{ type: "PARENT", value: "methane" }]
2. Build: Get SMILES "C" from alkanes, parse to single carbon atom
3. Validate: Check valence (carbon with 4 hydrogens)
4. Result: Molecule { atoms: [C], bonds: [] }

**Example 2: "2-methylpropane"**
1. Tokenize:
   - [{ type: "LOCANT", value: "2" },
   - { type: "MULTIPLIER", value: "mono" (implicit) },
   - { type: "SUBSTITUENT", value: "methyl" },
   - { type: "PARENT", value: "propane" }]
2. Build:
   - Parent: "propane" → SMILES "CCC" → [C1, C2, C3]
   - Substituent: "methyl" at locant 2 → attach CH3 to C2
3. Validate: Check structure
4. Result: Molecule with 4-carbon chain branched structure

**Example 3: "benzene-1,2-diol"**
1. Tokenize:
   - [{ type: "PARENT", value: "benzene" },
   - { type: "LOCANT", value: "1,2" },
   - { type: "SUFFIX", value: "diol" }]
2. Build:
   - Parent: "benzene" → SMILES "c1ccccc1" with 6 carbons
   - Suffix "diol": apply OH at positions 1 and 2
3. Validate
4. Result: Catechol molecule

## Testing Strategy

### Unit Tests (iupac-tokenizer.test.ts)
```
✓ Tokenize simple alkane: "methane" → [PARENT]
✓ Tokenize with locant: "2-methylpropane" → [LOCANT, MULT, SUBST, PARENT]
✓ Tokenize with suffix: "propan-1-ol" → [PARENT, LOCANT, SUFFIX]
✓ Tokenize with multipliers: "dimethylamine" → [MULT, SUBST, SUFFIX]
✓ Error on unknown token: "methXane" → throws error
```

### Integration Tests (iupac-parser.test.ts)
```
✓ Parse "methane" → Molecule with 1 carbon
✓ Parse "ethane" → Molecule with 2 carbons
✓ Parse "propan-1-ol" → Molecule with 3 carbons + OH
✓ Parse "2-methylpropane" → 4-carbon branched structure
✓ Roundtrip: IUPAC → Molecule → generateIUPACName() match
✓ Compare against 155-molecule test dataset
```

### Performance Tests
```
✓ Simple name (< 10 chars): < 5ms
✓ Medium name (10-30 chars): < 20ms
✓ Complex name (30+ chars): < 50ms
```

## MVP Scope (Phase 1)

What we'll support in MVP:
- ✅ Simple alkanes: methane, ethane, propane, butane
- ✅ Simple aromatics: benzene, pyridine, furan
- ✅ Simple alcohols: methanol, propan-1-ol
- ✅ Simple ketones: propan-2-one
- ✅ Simple amines: methylamine, dimethylamine
- ✅ Simple substituents: 2-methylpropane, 3-ethylheptane
- ✅ Simple locants: 1,2-ethanediol

What we'll NOT support in MVP (Phase 2+):
- ❌ Stereochemistry prefixes (R-, S-, E-, Z-)
- ❌ Bicyclic (von Baeyer) nomenclature
- ❌ Complex heterocycles (morpholine, piperazine edge cases)
- ❌ Natural product names
- ❌ Radicals and ions

## Timeline

- **Days 1-2**: Type definitions + Tokenizer implementation & tests
- **Days 3-5**: Builder implementation & tests
- **Day 6**: Main parser entry point & integration
- **Days 7-8**: Testing on full dataset + performance optimization
- **Total**: ~1-2 weeks for MVP

## Success Criteria

- [ ] Tokenizer handles 50+ basic IUPAC names without error
- [ ] Builder creates valid molecules for simple alkanes/aromatics
- [ ] Parser achieves 85%+ accuracy on MVP test set
- [ ] All parser tests pass
- [ ] Roundtrip IUPAC → Molecule → IUPAC successful for 50+ names
- [ ] TypeScript compilation passes
- [ ] No regressions in existing tests

## Future Enhancements (Post-MVP)

1. **Stereochemistry**: Support R/S, E/Z, @/@@
2. **Von Baeyer nomenclature**: Handle bicyclic bridged systems
3. **Radical/ion support**: Parse charged and radical species
4. **Better error messages**: Suggest corrections for mistyped names
5. **Interactive debugger**: Visual tokenization breakdown
6. **Performance**: Cache opsin-rules, optimize matching algorithms
