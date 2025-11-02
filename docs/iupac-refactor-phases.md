# IUPAC Engine Refactoring Phases

**Last Updated:** Nov 1, 2025

This document tracks the incremental refactoring of the openchem IUPAC naming engine, focusing on code quality, modularity, and test coverage.

---

## Phase 1: Ring Substituent Support for Esters
**Status:** In Progress
**Goal:** Fix ester naming for ring substituents (e.g., `1-(oxolan-2-yl)ethyl octanoate`)
**Steps:**
- Extract ester naming utilities to `utils/ester-naming.ts`
- Create ring substituent naming module `utils/ring-substituent-naming.ts`
- Enhance alkoxy group detection to support rings
- Test and validate (target: 6/6 ester tests passing)

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
**Status:** Pending
**Goal:** Modularize large layer files by extracting utilities
**Steps:**
- Create utility module structure
- Extract helpers from name-assembly, numbering, and functional-groups layers
- Add unit tests for utilities
- Verify no regressions

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

## Progress Tracking
- Phase 1: In Progress
- Phase 2-5: Upcoming

## Success Criteria
- All ester tests passing
- Layer files reduced by 20-50%
- Utility modules extracted
- 80%+ test coverage
- No regressions

---

## Resources
- See `docs/iupac-refactoring-assessment.md` for detailed analysis
- See `docs/iupac-rules.md` for Blue Book reference
