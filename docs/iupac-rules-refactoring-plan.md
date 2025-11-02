# IUPAC Rules Refactoring Plan

**Status**: Phase 2 Complete - atomic-layer extracted
**Date**: 2025-11-02
**Last Updated**: 2025-11-02
**Goal**: Organize IUPAC rules into clear, discoverable structure with layers in folders

## Progress Summary
- ✅ **Phase 1 Complete**: Created layer folder structure
- ✅ **Phase 2 Complete**: Extracted atomic-layer (6 rules) - All 1336 tests passing
- ⏭️ **Phase 3 Next**: Extract initial-structure-layer (1 rule)

## Overview

Transform the current mixed organization into a clear structure where:
1. Each layer has its own folder
2. Each rule has its own file with rule number in filename
3. Rule files follow naming convention: `P-XX.Y.Z-description.ts`
4. Layer index files orchestrate rule execution

## Target Directory Structure

```
src/iupac-engine/rules/
├── atomic-layer/
│   ├── index.ts (layer orchestration)
│   ├── P-25.1-aromatic-parents.ts
│   ├── P-44.2-ring-seniority.ts
│   ├── P-44.2.2-heteroatom-seniority.ts
│   └── P-44.3.2-3-multiple-bond-seniority.ts
├── functional-groups-layer/
│   ├── index.ts (layer orchestration)
│   ├── P-44.1-principal-group-selection.ts
│   ├── P-44.1.1-principal-groups.ts
│   ├── P-44.1.8-ketones.ts
│   ├── P-44.1.9-aldehydes.ts
│   ├── P-44.1.10-carboxylic-acids.ts
│   ├── P-51.2-functional-class-detection.ts
│   ├── P-51.2.1-esters.ts
│   ├── P-63.2.2-ethers-as-substituents.ts
│   └── P-66.1.1.4-lactones.ts
├── initial-structure-layer/
│   ├── index.ts (layer orchestration)
│   └── P-44.4-ring-vs-chain.ts
├── name-assembly-layer/
│   ├── index.ts (layer orchestration)
│   ├── P-2-parent-names.ts
│   ├── P-14-locant-assembly.ts
│   ├── P-14.3-alphabetization.ts
│   └── P-16.1-multiplicative-prefixes.ts
├── nomenclature-method-layer/
│   ├── index.ts (layer orchestration)
│   ├── P-51-special-cases.ts
│   ├── P-51.1-substitutive.ts
│   ├── P-51.2-functional-class.ts
│   ├── P-51.3-skeletal-replacement.ts
│   └── P-51.4-multiplicative.ts
├── numbering-layer/
│   ├── index.ts (layer orchestration)
│   ├── P-14-validation.ts
│   ├── P-14.1-fixed-locants.ts
│   ├── P-14.2-lowest-locant-set.ts
│   ├── P-14.3-principal-group-numbering.ts
│   └── P-14.4-multiple-bonds.ts
├── parent-chain-selection-layer/
│   ├── index.ts (layer orchestration)
│   ├── P-44.3.1-maximum-chain-length.ts
│   ├── P-44.3.2-multiple-bonds.ts
│   ├── P-44.3.3-double-bonds.ts
│   ├── P-44.3.4-locants-multiple-bonds.ts
│   ├── P-44.3.5-locants-double-bonds.ts
│   ├── P-44.3.6-greatest-substituents.ts
│   ├── P-44.3.7-locants-substituents.ts
│   └── P-44.4-chain-analysis.ts
├── ring-analysis-layer/
│   ├── index.ts (layer orchestration)
│   ├── P-2.3-von-baeyer.ts
│   ├── P-2.4-spiro.ts
│   ├── P-2.5-fused-rings.ts
│   ├── P-44.1.1-max-principal-groups.ts
│   ├── P-44.2-ring-seniority.ts
│   ├── P-44.2.1-ring-detection.ts
│   ├── P-44.2.2-heteroatom-seniority.ts
│   ├── P-44.2.3-ring-size.ts
│   └── P-44.2.4-maximum-rings.ts
├── bluebook/
│   ├── P-2/
│   │   └── parent-hydride-rules.ts (already organized)
│   ├── P-3/
│   │   └── substituent-rules.ts (already organized)
│   └── P-44.3/
│       └── maximum-length-rules.ts (already organized)
└── README.md (master index of all rules)
```

## Migration Steps

### Phase 1: Create Layer Folders (Preparation)
**Goal**: Set up folder structure without breaking anything

```bash
# Create layer folders
mkdir -p src/iupac-engine/rules/atomic-layer
mkdir -p src/iupac-engine/rules/functional-groups-layer
mkdir -p src/iupac-engine/rules/initial-structure-layer
mkdir -p src/iupac-engine/rules/name-assembly-layer
mkdir -p src/iupac-engine/rules/nomenclature-method-layer
mkdir -p src/iupac-engine/rules/numbering-layer
mkdir -p src/iupac-engine/rules/parent-chain-selection-layer
mkdir -p src/iupac-engine/rules/ring-analysis-layer
```

**Testing**: No tests needed (just folder creation)

### Phase 2: Extract atomic-layer (Smallest - 339 lines)
**Rules to extract**: 4 rules

| Step | Rule | Source Lines | Target File | Estimated Lines |
|------|------|--------------|-------------|-----------------|
| 2.1 | P-25.1 | 115-175 | P-25.1-aromatic-parents.ts | 60 |
| 2.2 | P-44.2.2 | 174-234 | P-44.2.2-heteroatom-seniority.ts | 60 |
| 2.3 | P-44.3.2-3 | 220-280 | P-44.3.2-3-multiple-bond-seniority.ts | 60 |
| 2.4 | P-44.2 | 274-314 | P-44.2-ring-seniority.ts | 40 |
| 2.5 | Create index | - | index.ts | 100 |

**Actions**:
1. Extract each rule into individual file
2. Create `atomic-layer/index.ts` that imports and exports all rules
3. Update imports in other files to use `rules/atomic-layer`
4. Delete old `atomic-layer.ts` file
5. Run test suite

**Testing**: `bun test` (expect 1336 passing)

### Phase 3: Extract initial-structure-layer (Small - 228 lines)
**Rules to extract**: 1 rule + imports

| Step | Rule | Source Lines | Target File | Estimated Lines |
|------|------|--------------|-------------|-----------------|
| 3.1 | P-44.4 | 116-211 | P-44.4-ring-vs-chain.ts | 95 |
| 3.2 | Create index | - | index.ts | 80 |

**Actions**:
1. Extract P-44.4 rule
2. Create `initial-structure-layer/index.ts` with imports from P-2, P-3, P-44.4
3. Update imports in engine files
4. Delete old `initial-structure-layer.ts`
5. Run test suite

**Testing**: `bun test` (expect 1336 passing)

### Phase 4: Extract nomenclature-method-layer (Small - 255 lines)
**Rules to extract**: 5 rules

| Step | Rule | Source Lines | Target File | Estimated Lines |
|------|------|--------------|-------------|-----------------|
| 4.1 | P-51.1 | 17-45 | P-51.1-substitutive.ts | 30 |
| 4.2 | P-51.2 | 46-120 | P-51.2-functional-class.ts | 75 |
| 4.3 | P-51.3 | 121-167 | P-51.3-skeletal-replacement.ts | 50 |
| 4.4 | P-51.4 | 168-212 | P-51.4-multiplicative.ts | 45 |
| 4.5 | P-51 | 213-250 | P-51-special-cases.ts | 40 |
| 4.6 | Create index | - | index.ts | 50 |

**Actions**:
1. Extract each P-51 rule into individual file
2. Create `nomenclature-method-layer/index.ts`
3. Update imports
4. Delete old `nomenclature-method-layer.ts`
5. Run test suite

**Testing**: `bun test` (expect 1336 passing)

### Phase 5: Extract parent-chain-selection-layer (Medium - 996 lines)
**Rules to extract**: 8 rules

| Step | Rule | Source Lines | Target File | Estimated Lines |
|------|------|--------------|-------------|-----------------|
| 5.1 | P-44.3.1 | 53-102 | P-44.3.1-maximum-chain-length.ts | 50 |
| 5.2 | P-44.4 | 112-183 | P-44.4-chain-analysis.ts | 72 |
| 5.3 | P-44.3.2 | 184-250 | P-44.3.2-multiple-bonds.ts | 67 |
| 5.4 | P-44.3.3 | 252-321 | P-44.3.3-double-bonds.ts | 70 |
| 5.5 | P-44.3.4 | 323-402 | P-44.3.4-locants-multiple-bonds.ts | 80 |
| 5.6 | P-44.3.5 | 404-479 | P-44.3.5-locants-double-bonds.ts | 76 |
| 5.7 | P-44.3.6 | 481-541 | P-44.3.6-greatest-substituents.ts | 61 |
| 5.8 | P-44.3.7 | 543-996 | P-44.3.7-locants-substituents.ts | 453 |
| 5.9 | Create index | - | index.ts | 100 |

**Actions**:
1. Extract each P-44.3 rule into individual file
2. Create `parent-chain-selection-layer/index.ts`
3. Update imports
4. Delete old `parent-chain-selection-layer.ts`
5. Run test suite

**Testing**: `bun test` (expect 1336 passing)

### Phase 6: Extract ring-analysis-layer (Large - 1,056 lines)
**Rules to extract**: 9 rules

| Step | Rule | Source Lines | Target File | Estimated Lines |
|------|------|--------------|-------------|-----------------|
| 6.1 | P-44.2.1 | 21-51 | P-44.2.1-ring-detection.ts | 30 |
| 6.2 | P-44.2.2 | 52-110 | P-44.2.2-heteroatom-seniority.ts | 59 |
| 6.3 | P-44.2.3 | 111-146 | P-44.2.3-ring-size.ts | 36 |
| 6.4 | P-44.2.4 | 147-206 | P-44.2.4-maximum-rings.ts | 60 |
| 6.5 | P-44.2 | 207-301 | P-44.2-ring-seniority.ts | 95 |
| 6.6 | P-44.1.1 | 627-825 | P-44.1.1-max-principal-groups.ts | 199 |
| 6.7 | P-2.3 | 828-909 | P-2.3-von-baeyer.ts | 82 |
| 6.8 | P-2.4 | 911-964 | P-2.4-spiro.ts | 54 |
| 6.9 | P-2.5 | 966-1056 | P-2.5-fused-rings.ts | 91 |
| 6.10 | Create index | - | index.ts | 150 |

**Actions**:
1. Extract each rule into individual file
2. Create `ring-analysis-layer/index.ts`
3. Update imports
4. Delete old `ring-analysis-layer.ts`
5. Run test suite

**Testing**: `bun test` (expect 1336 passing)

### Phase 7: Extract numbering-layer (Large - 1,741 lines)
**Rules to extract**: 5 rules

| Step | Rule | Source Lines | Target File | Estimated Lines |
|------|------|--------------|-------------|-----------------|
| 7.1 | P-14.2 | 18-105 | P-14.2-lowest-locant-set.ts | 88 |
| 7.2 | P-14.3 | 106-203 | P-14.3-principal-group-numbering.ts | 98 |
| 7.3 | P-14.4 | 204-280 | P-14.4-multiple-bonds.ts | 77 |
| 7.4 | P-14.1 | 281-323 | P-14.1-fixed-locants.ts | 43 |
| 7.5 | P-14 | 713-770 | P-14-validation.ts | 58 |
| 7.6 | Create index | - | index.ts | 200 |

**Note**: numbering-layer has lots of helper functions (~1200 lines). These stay in index.ts

**Actions**:
1. Extract main rules into individual files
2. Create `numbering-layer/index.ts` with helper functions
3. Update imports
4. Delete old `numbering-layer.ts`
5. Run test suite

**Testing**: `bun test` (expect 1336 passing)

### Phase 8: Extract name-assembly-layer (Large - 1,427 lines)
**Rules to extract**: 4 rules

| Step | Rule | Source Lines | Target File | Estimated Lines |
|------|------|--------------|-------------|-----------------|
| 8.1 | P-14.3 | 25-77 | P-14.3-alphabetization.ts | 53 |
| 8.2 | P-14 | 78-148 | P-14-locant-assembly.ts | 71 |
| 8.3 | P-16.1 | 149-236 | P-16.1-multiplicative-prefixes.ts | 88 |
| 8.4 | P-2 | 237-291 | P-2-parent-names.ts | 55 |
| 8.5 | Create index | - | index.ts | 200 |

**Note**: name-assembly-layer has many helper functions (~1000 lines). These stay in index.ts

**Actions**:
1. Extract main rules into individual files
2. Create `name-assembly-layer/index.ts` with helper functions
3. Update imports
4. Delete old `name-assembly-layer.ts`
5. Run test suite

**Testing**: `bun test` (expect 1336 passing)

### Phase 9: Extract functional-groups-layer (Largest - 1,964 lines)
**Rules to extract**: 9 rules

| Step | Rule | Source Lines | Target File | Estimated Lines |
|------|------|--------------|-------------|-----------------|
| 9.1 | P-44.1 | 84-344 | P-44.1-principal-group-selection.ts | 261 |
| 9.2 | P-51.2 | 345-411 | P-51.2-functional-class-detection.ts | 67 |
| 9.3 | P-51.2.1 | 1013-1071 | P-51.2.1-esters.ts | 59 |
| 9.4 | P-66.1.1.4 | 1072-1241 | P-66.1.1.4-lactones.ts | 170 |
| 9.5 | P-44.1.1 | 1242-1276 | P-44.1.1-principal-groups.ts | 35 |
| 9.6 | P-44.1.9 | 1286-1316 | P-44.1.9-aldehydes.ts | 31 |
| 9.7 | P-44.1.10 | 1318-1348 | P-44.1.10-carboxylic-acids.ts | 31 |
| 9.8 | P-44.1.8 | 1350-1377 | P-44.1.8-ketones.ts | 28 |
| 9.9 | P-63.2.2 | 1777-1850 | P-63.2.2-ethers-as-substituents.ts | 74 |
| 9.10 | Create index | - | index.ts | 300 |

**Note**: functional-groups-layer has helper functions (~600 lines). These stay in index.ts

**Actions**:
1. Extract each rule into individual file
2. Create `functional-groups-layer/index.ts` with helper functions
3. Update imports
4. Delete old `functional-groups-layer.ts`
5. Run test suite

**Testing**: `bun test` (expect 1336 passing)

### Phase 10: Clean Up Bluebook Directory
**Goal**: Remove empty folders, consolidate organized rules

**Actions**:
1. Move `bluebook/P-2/parent-hydride-rules.ts` to `initial-structure-layer/P-2.1-parent-hydride-rules.ts`
2. Move `bluebook/P-3/substituent-rules.ts` to `initial-structure-layer/P-3.1-substituent-rules.ts`
3. Evaluate `bluebook/P-44.3/maximum-length-rules.ts` - merge with extracted P-44.3.1 or keep separate
4. Delete empty bluebook folders: P-14, P-44.1, P-44.2, P-44.4, P-51
5. Delete bluebook/atomic-analysis if no longer needed
6. Update all imports
7. Run test suite

**Testing**: `bun test` (expect 1336 passing)

### Phase 11: Create Master Index
**Goal**: Document all rules for easy discovery

Create `src/iupac-engine/rules/README.md` with:
- Complete list of all rules by Blue Book section
- File location for each rule
- Brief description of each rule
- Dependencies between rules
- Layer execution order

### Phase 12: Final Validation
**Goal**: Ensure everything works perfectly

1. Run full test suite: `bun test`
2. Run type check: `bun run typecheck`
3. Run build: `bun run build`
4. Verify no broken imports
5. Verify all 1336 tests still pass
6. Update main documentation

## File Naming Convention

**Format**: `P-XX.Y.Z-descriptive-name.ts`

**Rules**:
- Always include Blue Book rule number as prefix
- Use kebab-case for descriptive name
- Keep names concise but clear
- Use standard terminology from Blue Book

**Examples**:
- ✅ `P-44.3.1-maximum-chain-length.ts`
- ✅ `P-14.2-lowest-locant-set.ts`
- ✅ `P-66.1.1.4-lactones.ts`
- ❌ `maximum-length-rules.ts` (missing rule number)
- ❌ `P-44-rules.ts` (too generic)

## Layer Index File Pattern

Each layer's `index.ts` should:
1. Import all rule files
2. Export individual rules
3. Export rule array in execution order
4. Include helper functions used by multiple rules
5. Export helper functions if needed elsewhere

**Example Structure**:
```typescript
// Layer: parent-chain-selection-layer/index.ts
import { P_44_3_1_MAXIMUM_CHAIN_LENGTH } from './P-44.3.1-maximum-chain-length';
import { P_44_3_2_MULTIPLE_BONDS } from './P-44.3.2-multiple-bonds';
// ... more imports

// Helper functions used by multiple rules
function findAllChains(molecule: Molecule): Chain[] {
  // implementation
}

// Export individual rules
export { P_44_3_1_MAXIMUM_CHAIN_LENGTH };
export { P_44_3_2_MULTIPLE_BONDS };
// ... more exports

// Export rule array in execution order
export const PARENT_CHAIN_SELECTION_RULES = [
  P_44_3_1_MAXIMUM_CHAIN_LENGTH,
  P_44_3_2_MULTIPLE_BONDS,
  // ... in order
];

// Export helpers if needed
export { findAllChains };
```

## Risk Mitigation

### Critical Success Factors
1. **Test after each extraction**: Never extract multiple layers before testing
2. **Maintain execution order**: Rules must execute in same order as before
3. **Preserve all logic**: No logic changes during refactoring
4. **Update imports immediately**: Fix all imports before moving to next step

### Rollback Strategy
- Use git branches for each phase
- Commit after each successful extraction
- Tag working states: `refactor-phase-1`, `refactor-phase-2`, etc.
- Keep original files until tests pass

### Known Challenges

**Duplicate Rules**:
- P-44.2.2 appears in both atomic-layer and ring-analysis-layer
  - **Solution**: Keep ring-analysis version, document atomic version as variant
- P-44.4 appears in both initial-structure-layer and parent-chain-selection-layer
  - **Solution**: Keep both with different suffixes: `P-44.4-ring-vs-chain.ts` and `P-44.4-chain-analysis.ts`

**Large Helper Function Blocks**:
- numbering-layer: ~1200 lines of helpers
- name-assembly-layer: ~1000 lines of helpers
- functional-groups-layer: ~600 lines of helpers
  - **Solution**: Keep helpers in layer index.ts, extract only main rules

**Shared Dependencies**:
- Multiple layers use ring-utils, atom-utils, functional-group-detector
  - **Solution**: No changes needed - these remain in utils/

## Timeline Estimate

| Phase | Duration | Complexity |
|-------|----------|------------|
| Phase 1: Setup | 5 min | Low |
| Phase 2: atomic-layer | 20 min | Low |
| Phase 3: initial-structure-layer | 15 min | Low |
| Phase 4: nomenclature-method-layer | 20 min | Low |
| Phase 5: parent-chain-selection-layer | 45 min | Medium |
| Phase 6: ring-analysis-layer | 60 min | High |
| Phase 7: numbering-layer | 45 min | Medium |
| Phase 8: name-assembly-layer | 45 min | Medium |
| Phase 9: functional-groups-layer | 75 min | High |
| Phase 10: Bluebook cleanup | 30 min | Medium |
| Phase 11: Master index | 30 min | Low |
| Phase 12: Final validation | 15 min | Low |
| **Total** | **~6.5 hours** | |

## Success Criteria

✅ All rules organized in layer folders
✅ Each rule in individual file with Blue Book number in filename
✅ All 1336 tests passing
✅ No broken imports
✅ Type checking passes
✅ Build succeeds
✅ Master README.md documents all rules
✅ Code is more maintainable and discoverable

## Next Steps

1. ✅ Create inventory document
2. ✅ Create this refactoring plan
3. ⏭️ Execute Phase 1: Create layer folders
4. ⏭️ Execute Phase 2: Extract atomic-layer
5. ⏭️ Continue through all phases systematically
