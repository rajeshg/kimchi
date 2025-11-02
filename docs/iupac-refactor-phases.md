# IUPAC Engine Refactoring Phases

**Last Updated:** Nov 2, 2025

This document tracks the incremental refactoring of the openchem IUPAC naming engine, focusing on code quality, modularity, and test coverage.

---

## Overview

The IUPAC engine refactoring has progressed through several phases, focusing on modularizing the rule-based naming system. The primary goals are:
- Improve code maintainability through clear separation of concerns
- Align code structure with IUPAC Blue Book sections
- Enable easier testing and validation of individual rule components
- Reduce complexity of monolithic layer files

---

## Phase 1: Ring Substituent Support for Esters
**Status:** Deferred
**Goal:** Fix ester naming for ring substituents (e.g., `1-(oxolan-2-yl)ethyl octanoate`)
**Steps:**
- Extract ester naming utilities to `utils/ester-naming.ts`
- Create ring substituent naming module `utils/ring-substituent-naming.ts`
- Enhance alkoxy group detection to support rings
- Test and validate (target: 6/6 ester tests passing)

**Notes:** Deferred in favor of structural refactoring phases.

---

## Phase 2: Priority System Normalization
**Status:** Pending
**Goal:** Adopt a clear, sequential priority system (10-100 scale) within each phase
**Steps:**
- Audit all rules and map to new priority scale
- Update rule definitions and dependencies
- Add logging and validation for priority conflicts

---

## Phase 3: Extract Helper Functions
**Status:** Partially Complete
**Goal:** Modularize large layer files by extracting utilities
**Steps:**
- ✅ Created helper modules in parent-chain-selection-layer
- ✅ Created helper modules in numbering-layer
- ✅ Created helper modules in ring-analysis-layer
- ⏳ Extract helpers from name-assembly and functional-groups layers (pending)
- ⏳ Add unit tests for utilities (pending)

---

## Phase 4: Complete Layer Contracts
**Status:** Pending
**Goal:** Define and validate contracts for all 8 layers
**Steps:**
- Define missing contracts
- Update PhaseController for validation
- Add contract validation tests

---

## Phase 5: Testing Infrastructure
**Status:** Pending
**Goal:** Achieve 80%+ test coverage for utilities and layers
**Steps:**
- Create granular unit and integration tests
- Add regression suite (PubChem 300)
- Document testing guidelines

---

## Phase 6: Parent Chain Selection Layer Modularization
**Status:** Complete ✅
**Goal:** Split parent-chain-selection-layer into focused, testable modules aligned with Blue Book sections
**Completed:**
- ✅ Split monolithic file into 8 Blue Book-aligned modules (P-44.3.1 through P-44.3.8)
- ✅ Created helpers.ts for shared utilities
- ✅ Created index.ts for centralized exports
- ✅ All tests passing (1336 passing, 3 pre-existing known failures)

**Files Created:**
- `P-44.3.1-maximum-length.ts` - Parent chain length rules
- `P-44.3.2-multiple-bonds.ts` - Multiple bond maximization
- `P-44.3.3-double-bonds.ts` - Double bond prioritization
- `P-44.3.4-multiple-bond-locants.ts` - Lowest multiple bond locants
- `P-44.3.5-double-bond-locants.ts` - Lowest double bond locants
- `P-44.3.6-substituents.ts` - Maximum substituent rules
- `P-44.3.7-substituent-locants.ts` - Lowest substituent locants
- `P-44.3.8-alphabetical-locant.ts` - Alphabetical tie-breaking
- `helpers.ts` - Shared utilities
- `index.ts` - Centralized exports

---

## Phase 7: Numbering Layer Modularization
**Status:** Complete ✅
**Goal:** Refactor numbering-layer.ts into focused, maintainable modules aligned with IUPAC P-14 numbering rules
**Completed:**
- ✅ Split 800+ line file into 8 focused modules
- ✅ Separated ring numbering from acyclic numbering logic
- ✅ Created dedicated modules for P-14 subsections
- ✅ Extracted shared utilities to helpers.ts
- ✅ All tests passing (1336 passing, 3 pre-existing known failures)

**Files Created:**
- `p14-1-fixed-locants.ts` - IUPAC P-14.1 (heteroatom fixed numbering)
- `p14-2-lowest-locant-set.ts` - IUPAC P-14.2 (lowest locant set)
- `p14-3-principal-group-numbering.ts` - IUPAC P-14.3 (principal groups)
- `p14-4-multiple-bonds-substituents.ts` - IUPAC P-14.4 (unsaturation & substituents)
- `ring-numbering.ts` - Ring system numbering
- `substituent-numbering.ts` - Acyclic substituent numbering
- `numbering-complete.ts` - Main orchestration logic
- `helpers.ts` - Shared utilities (11 functions)
- `index.ts` - Centralized exports

**Impact:**
- Reduced complexity of main numbering logic
- Clear mapping to IUPAC Blue Book sections
- Easier to test individual numbering criteria
- Improved maintainability for future rule additions

---

## Phase 8: Bluebook Directory Integration
**Status:** Complete ✅
**Goal:** Integrate standalone bluebook/ rules into the modular layer structure
**Completed:**
- ✅ Moved `bluebook/P-2/parent-hydride-rules.ts` → `initial-structure-layer/P-2.1-heteroatom-parents.ts`
- ✅ Moved `bluebook/P-3/substituent-rules.ts` → `initial-structure-layer/P-3-heteroatom-substituents.ts`
- ✅ Updated import paths in initial-structure-layer/index.ts
- ✅ Deleted obsolete bluebook/ directory
- ✅ All tests passing (1336 passing, 3 pre-existing known failures)

**Files Moved:**
- `P-2.1-heteroatom-parents.ts` - Heteroatom parent hydride selection rules (IUPAC P-2)
- `P-3-heteroatom-substituents.ts` - Complex substituent detection rules (IUPAC P-3, 670 lines)

**Deleted:**
- `bluebook/P-44.3/maximum-length-rules.ts` - Superseded by parent-chain-selection-layer modules
- `bluebook/atomic-analysis/valence-analysis.ts` - Unused utility
- `bluebook/README.md` - Documentation

**Impact:**
- No more isolated bluebook/ directory
- All rules integrated into layer structure
- Clearer ownership and organization
- Consistent import patterns across codebase

---

## Progress Tracking

### Completed Phases
- ✅ Phase 3: Extract Helper Functions (Partially)
- ✅ Phase 6: Parent Chain Selection Layer Modularization
- ✅ Phase 7: Numbering Layer Modularization
- ✅ Phase 8: Bluebook Directory Integration

### Pending Phases
- ⏳ Phase 1: Ring Substituent Support for Esters (Deferred)
- ⏳ Phase 2: Priority System Normalization
- ⏳ Phase 3: Complete helper extraction for remaining layers
- ⏳ Phase 4: Complete Layer Contracts
- ⏳ Phase 5: Testing Infrastructure

---

## Success Metrics

### Achieved
- ✅ Numbering layer reduced from 800+ lines to 8 focused modules
- ✅ Parent chain selection split into 8 Blue Book-aligned files
- ✅ Helper utilities extracted to dedicated modules
- ✅ No test regressions (1336 passing consistently)
- ✅ Clear mapping to IUPAC Blue Book sections
- ✅ All bluebook/ rules integrated into layer structure

### Remaining Goals
- All ester tests passing (3 known failures remain)
- 80%+ test coverage for utilities and layers
- Complete contract validation for all layers
- Priority system normalization

---

## Current Structure

```
src/iupac-engine/rules/
├── atomic-layer/              # P-00, P-25.1, P-44.2.2 (7 files)
├── initial-structure-layer/   # P-2, P-3, P-44.3.1, P-44.4 (5 files) ✅ NEW
├── ring-analysis-layer/       # P-2.3-5, P-44.1.1, P-44.2.x (11 files)
├── parent-chain-selection-layer/ # P-44.3.1-8 (11 files) ✅ Phase 6
├── numbering-layer/           # P-14.1-4 (9 files) ✅ Phase 7
├── nomenclature-method-layer/ # P-51.1-4 (6 files)
├── functional-groups-layer.ts # Functional group detection
└── name-assembly-layer.ts     # Final name assembly
```

---

## Resources
- See `docs/iupac-refactoring-assessment.md` for detailed analysis
- See `docs/iupac-rules.md` for Blue Book reference
- See `src/iupac-engine/rules/README.md` for architectural overview
