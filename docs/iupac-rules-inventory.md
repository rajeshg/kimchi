# IUPAC Rules Inventory

**Status**: Comprehensive inventory of all Blue Book rules implemented in openchem
**Date**: 2025-11-02
**Purpose**: Reference document for rules refactoring

## Summary Statistics

- **Total layer files**: 8
- **Total lines in layers**: 8,006 lines
- **Largest file**: functional-groups-layer.ts (1,964 lines)
- **Rules identified**: 50+ distinct rule implementations
- **Existing organized files**: 3 (in bluebook/ subdirectory)

## File Structure (Current)

```
src/iupac-engine/rules/
├── bluebook/
│   ├── atomic-analysis/
│   │   └── valence-analysis.ts
│   ├── P-2/
│   │   └── parent-hydride-rules.ts (organized ✓)
│   ├── P-3/
│   │   └── substituent-rules.ts (organized ✓)
│   ├── P-14/ (EMPTY)
│   ├── P-44.1/ (EMPTY)
│   ├── P-44.2/ (EMPTY)
│   ├── P-44.3/
│   │   └── maximum-length-rules.ts (organized ✓)
│   ├── P-44.4/ (EMPTY)
│   └── P-51/ (EMPTY)
├── atomic-layer.ts (339 lines)
├── functional-groups-layer.ts (1,964 lines)
├── initial-structure-layer.ts (228 lines)
├── name-assembly-layer.ts (1,427 lines)
├── nomenclature-method-layer.ts (255 lines)
├── numbering-layer.ts (1,741 lines)
├── parent-chain-selection-layer.ts (996 lines)
└── ring-analysis-layer.ts (1,056 lines)
```

## Rules by Blue Book Section

### P-2: Parent Hydride Names

| Rule | Description | Current Location | Lines | Status |
|------|-------------|------------------|-------|--------|
| P-2 | Parent structure names | name-assembly-layer.ts | ~100 | ❌ Extract |
| P-2.1 | Heteroatom parent hydrides | bluebook/P-2/parent-hydride-rules.ts | - | ✅ Organized |
| P-2.3 | Ring assemblies (von Baeyer) | ring-analysis-layer.ts | ~80 | ❌ Extract |
| P-2.4 | Spiro compounds | ring-analysis-layer.ts | ~50 | ❌ Extract |
| P-2.5 | Fused ring systems | ring-analysis-layer.ts | ~70 | ❌ Extract |

### P-3: Substituent Rules

| Rule | Description | Current Location | Lines | Status |
|------|-------------|------------------|-------|--------|
| P-3.1 | Heteroatom substituents | bluebook/P-3/substituent-rules.ts | - | ✅ Organized |

### P-14: Numbering and Locants

| Rule | Description | Current Location | Lines | Status |
|------|-------------|------------------|-------|--------|
| P-14 | Complete numbering validation | numbering-layer.ts | ~50 | ❌ Extract |
| P-14.1 | Fixed locants | numbering-layer.ts | ~30 | ❌ Extract |
| P-14.2 | Lowest locant set principle | numbering-layer.ts | ~100 | ❌ Extract |
| P-14.3 | Principal group numbering | numbering-layer.ts | ~100 | ❌ Extract |
| P-14.3 | Alphabetization of substituents | name-assembly-layer.ts | ~50 | ❌ Extract |
| P-14.4 | Multiple bonds and substituents | numbering-layer.ts | ~80 | ❌ Extract |

### P-16: Multiplicative Prefixes

| Rule | Description | Current Location | Lines | Status |
|------|-------------|------------------|-------|--------|
| P-16.1 | Multiplicative prefixes | name-assembly-layer.ts | ~100 | ❌ Extract |

### P-25: Aromatic Structures

| Rule | Description | Current Location | Lines | Status |
|------|-------------|------------------|-------|--------|
| P-25.1 | Aromatic parent structures | atomic-layer.ts | ~60 | ❌ Extract |

### P-44: Parent Structure Selection

#### P-44.1: Principal Characteristic Groups

| Rule | Description | Current Location | Lines | Status |
|------|-------------|------------------|-------|--------|
| P-44.1 | Principal group selection | functional-groups-layer.ts | ~250 | ❌ Extract |
| P-44.1.1 | Maximum principal groups | ring-analysis-layer.ts | ~220 | ❌ Extract |
| P-44.1.8 | Ketones | functional-groups-layer.ts | ~40 | ❌ Extract |
| P-44.1.9 | Aldehydes | functional-groups-layer.ts | ~30 | ❌ Extract |
| P-44.1.10 | Carboxylic acids | functional-groups-layer.ts | ~30 | ❌ Extract |

#### P-44.2: Ring System Seniority

| Rule | Description | Current Location | Lines | Status |
|------|-------------|------------------|-------|--------|
| P-44.2 | Ring system seniority | ring-analysis-layer.ts | ~100 | ❌ Extract |
| P-44.2 | Ring seniority (atomic) | atomic-layer.ts | ~40 | ❌ Extract |
| P-44.2.1 | Ring system detection | ring-analysis-layer.ts | ~30 | ❌ Extract |
| P-44.2.2 | Heteroatom seniority | ring-analysis-layer.ts | ~50 | ❌ Extract |
| P-44.2.2 | Heteroatom seniority (atomic) | atomic-layer.ts | ~50 | ❌ Extract |
| P-44.2.3 | Ring size seniority | ring-analysis-layer.ts | ~40 | ❌ Extract |
| P-44.2.4 | Maximum number of rings | ring-analysis-layer.ts | ~50 | ❌ Extract |

#### P-44.3: Chain Selection

| Rule | Description | Current Location | Lines | Status |
|------|-------------|------------------|-------|--------|
| P-44.3.1 | Maximum chain length | parent-chain-selection-layer.ts | ~50 | ❌ Extract |
| P-44.3.1 | Maximum length (bluebook) | bluebook/P-44.3/maximum-length-rules.ts | - | ✅ Organized |
| P-44.3.2 | Greatest number of multiple bonds | parent-chain-selection-layer.ts | ~60 | ❌ Extract |
| P-44.3.2-3 | Multiple bond seniority (atomic) | atomic-layer.ts | ~60 | ❌ Extract |
| P-44.3.3 | Greatest number of double bonds | parent-chain-selection-layer.ts | ~60 | ❌ Extract |
| P-44.3.4 | Lowest locants for multiple bonds | parent-chain-selection-layer.ts | ~70 | ❌ Extract |
| P-44.3.5 | Lowest locants for double bonds | parent-chain-selection-layer.ts | ~70 | ❌ Extract |
| P-44.3.6 | Greatest number of substituents | parent-chain-selection-layer.ts | ~50 | ❌ Extract |
| P-44.3.7 | Lowest locants for substituents | parent-chain-selection-layer.ts | ~60 | ❌ Extract |

#### P-44.4: Ring vs Chain

| Rule | Description | Current Location | Lines | Status |
|------|-------------|------------------|-------|--------|
| P-44.4 | Ring vs chain selection | initial-structure-layer.ts | ~100 | ❌ Extract |
| P-44.4 | Ring vs chain (chain-analysis) | parent-chain-selection-layer.ts | ~60 | ❌ Extract |

### P-51: Nomenclature Methods

| Rule | Description | Current Location | Lines | Status |
|------|-------------|------------------|-------|--------|
| P-51 | Special cases | nomenclature-method-layer.ts | ~30 | ❌ Extract |
| P-51.1 | Substitutive nomenclature | nomenclature-method-layer.ts | ~30 | ❌ Extract |
| P-51.2 | Functional class nomenclature | nomenclature-method-layer.ts | ~70 | ❌ Extract |
| P-51.2 | Functional class detection | functional-groups-layer.ts | ~50 | ❌ Extract |
| P-51.2.1 | Esters | functional-groups-layer.ts | ~50 | ❌ Extract |
| P-51.3 | Skeletal replacement | nomenclature-method-layer.ts | ~50 | ❌ Extract |
| P-51.4 | Multiplicative nomenclature | nomenclature-method-layer.ts | ~50 | ❌ Extract |

### P-63: Ethers

| Rule | Description | Current Location | Lines | Status |
|------|-------------|------------------|-------|--------|
| P-63.2.2 | Ethers as substituents | functional-groups-layer.ts | ~60 | ❌ Extract |

### P-66: Lactones

| Rule | Description | Current Location | Lines | Status |
|------|-------------|------------------|-------|--------|
| P-66.1.1.4 | Lactones as heterocycles | functional-groups-layer.ts | ~200 | ❌ Extract |

## Layer File Analysis

### atomic-layer.ts (339 lines)
**Contains**: 4 rules
- P-25.1: Aromatic parent structures (60 lines)
- P-44.2.2: Heteroatom seniority (50 lines)
- P-44.3.2-3: Multiple bond seniority (60 lines)
- P-44.2: Ring system seniority (40 lines)

**Dependencies**: ring-utils, aromaticity-perceiver, atom-utils

### functional-groups-layer.ts (1,964 lines)
**Contains**: 10+ rules (largest file)
- P-44.1: Principal group selection (250 lines)
- P-51.2: Functional class detection (50 lines)
- P-51.2.1: Esters (50 lines)
- P-66.1.1.4: Lactones (200 lines)
- P-44.1.1: Principal groups (80 lines)
- P-44.1.9: Aldehydes (30 lines)
- P-44.1.10: Carboxylic acids (30 lines)
- P-44.1.8: Ketones (40 lines)
- P-63.2.2: Ethers as substituents (60 lines)

**Dependencies**: functional-group-detector, ring-utils, atom-utils, bond-utils

### initial-structure-layer.ts (228 lines)
**Contains**: 2 rules
- P-44.4: Ring vs chain selection (100 lines)
- Imports P-2 and P-3 organized rules

**Dependencies**: P-2/parent-hydride-rules, P-3/substituent-rules

### name-assembly-layer.ts (1,427 lines)
**Contains**: 4 rules
- P-14.3: Alphabetization (50 lines)
- P-14: Locant assembly (50 lines)
- P-16.1: Multiplicative prefixes (100 lines)
- P-2: Parent structure names (100 lines)

**Dependencies**: nomenclature-utils

### nomenclature-method-layer.ts (255 lines)
**Contains**: 5 rules
- P-51.1: Substitutive nomenclature (30 lines)
- P-51.2: Functional class nomenclature (70 lines)
- P-51.3: Skeletal replacement (50 lines)
- P-51.4: Multiplicative nomenclature (50 lines)
- P-51: Special cases (30 lines)

**Dependencies**: None (high-level orchestration)

### numbering-layer.ts (1,741 lines)
**Contains**: 5 rules
- P-14.2: Lowest locant set (100 lines)
- P-14.3: Principal group numbering (100 lines)
- P-14.4: Multiple bonds numbering (80 lines)
- P-14.1: Fixed locants (30 lines)
- P-14: Complete validation (50 lines)

**Dependencies**: ring-utils, atom-utils, functional-group-detector

### parent-chain-selection-layer.ts (996 lines)
**Contains**: 8 rules
- P-44.3.1: Maximum chain length (50 lines)
- P-44.4: Ring vs chain (chain-analysis) (60 lines)
- P-44.3.2: Multiple bonds (60 lines)
- P-44.3.3: Double bonds (60 lines)
- P-44.3.4: Locants for multiple bonds (70 lines)
- P-44.3.5: Locants for double bonds (70 lines)
- P-44.3.6: Greatest substituents (50 lines)
- P-44.3.7: Locants for substituents (60 lines)

**Dependencies**: chain-finder, functional-group-detector, ring-utils

### ring-analysis-layer.ts (1,056 lines)
**Contains**: 8 rules
- P-44.2.1: Ring detection (30 lines)
- P-44.2.2: Heteroatom seniority (50 lines)
- P-44.2.3: Ring size seniority (40 lines)
- P-44.2.4: Maximum rings (50 lines)
- P-44.2: Ring seniority (100 lines)
- P-44.1.1: Maximum principal groups (220 lines)
- P-2.3: von Baeyer (80 lines)
- P-2.4: Spiro (50 lines)
- P-2.5: Fused rings (70 lines)

**Dependencies**: ring-utils, ring-finder, chain-finder, von-baeyer-nomenclature

## Duplicate Rules Analysis

Several rules appear in multiple files:

1. **P-44.2.2 (Heteroatom seniority)**
   - atomic-layer.ts (50 lines)
   - ring-analysis-layer.ts (50 lines)
   - **Action**: Keep ring-analysis version, remove atomic duplicate

2. **P-44.4 (Ring vs chain)**
   - initial-structure-layer.ts (100 lines)
   - parent-chain-selection-layer.ts (60 lines)
   - **Action**: Keep initial-structure version (primary), document chain-analysis variant

3. **P-44.3.1 (Maximum chain length)**
   - parent-chain-selection-layer.ts (50 lines)
   - bluebook/P-44.3/maximum-length-rules.ts (organized file)
   - **Action**: Keep bluebook version, update references

4. **P-51.2 (Functional class nomenclature)**
   - nomenclature-method-layer.ts (70 lines - decision logic)
   - functional-groups-layer.ts (50 lines - detection logic)
   - **Action**: Split into P-51.2-decision.ts and P-51.2-detection.ts

## Refactoring Strategy

### Phase 1: Organize by Blue Book Section
Create one file per rule with naming convention: `P-XX.Y.Z-description.ts`

### Phase 2: Extract Complex Rules First
Priority order (by size/complexity):
1. P-66.1.1.4 (Lactones) - 200 lines
2. P-44.1 (Principal groups) - 250 lines
3. P-44.1.1 (Max principal groups) - 220 lines
4. P-14.2, P-14.3, P-14.4 (Numbering) - 280 lines total

### Phase 3: Handle Duplicates
- Consolidate duplicate implementations
- Document variant behaviors
- Update all references

### Phase 4: Testing After Each Extraction
- Run full test suite after each rule extraction
- Verify 1336 tests still pass
- Fix any import issues immediately

### Phase 5: Documentation
- Create rules/README.md with complete index
- Document rule dependencies
- Add Blue Book references

## Next Steps

1. ✅ Create this inventory document
2. ⏭️ Document rule dependencies in detail
3. ⏭️ Create extraction plan with order of operations
4. ⏭️ Begin extraction with smallest, simplest rules first
5. ⏭️ Test after each extraction
6. ⏭️ Update documentation continuously
