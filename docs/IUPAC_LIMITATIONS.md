# IUPAC Naming Service — Limitations & Prioritized Work Items

This document captures the current limitations of the IUPAC naming service in this repository and gives prioritized work items to improve correctness, coverage, and maintainability.

Summary
-------
- The current implementation produces many valid aliphatic and simple cyclic names but has gaps for complex functional groups, stereochemistry, fused/bridged/spiro ring systems, isotopes, and organometallics.
- Several parts of the codebase use heuristic or placeholder logic rather than complete IUPAC rules; others use ad-hoc SMARTS fallbacks.
- This doc groups limitations and proposes prioritized work items (High / Medium / Low) with suggested acceptance criteria.

Primary Code References
-----------------------
- `src/utils/iupac/iupac-generator.ts`
- `src/utils/iupac/iupac-rings/index.ts`
- `src/utils/iupac/iupac-types.ts`
- `src/utils/iupac/iupac-chains.ts`
- `src/utils/iupac/*` (pipeline, chain selection/numbering, helpers)

Detailed Limitations (by category)
----------------------------------
1) Functional Coverage
- Problem: Functional-group detection is ad-hoc and incomplete (only simple C=O and C–OH checks exist). Some named heterocycles are detected via a couple hard-coded SMARTS checks. See `src/utils/iupac/iupac-generator.ts` for heuristics and SMARTS fallbacks.
- Impact: Wrong principal functional-group selection, missing suffixes/prefixes, incorrect prioritization.
- Suggested improvement: Add a comprehensive SMARTS-based functional group registry, with metadata (priority, suffix/prefix, parenthesis rules, canonicalization rules).

2) Stereochemistry & Isotopes
- Problem: `includeStereochemistry` option exists but stereochemical descriptor generation (R/S, E/Z, cis/trans) is not implemented. Isotopes are not supported in naming.
- Impact: Names for chiral molecules are incomplete or missing stereodescriptors; isotopologues not represented.
- Suggested improvement: Add a stereochemistry stage in the pipeline that produces canonical stereodescriptors; extend atom types to include isotopic masses and render isotopic locants.

3) Ring Systems & Heterocycles
- Problem: Heterocyclic naming is limited to a few simple cases (single heteroatom, limited sizes). Spiro/bridged naming are placeholders; fused/polycyclic cases often fall back to `polycyclic_C...` or other non-systematic placeholders. See `src/utils/iupac/iupac-rings/index.ts`.
- Impact: Non-systematic or placeholder names for many cyclic systems.
- Suggested improvement: Expand heterocycle templates, implement spiro/bridged/fused naming rules or integrate a dedicated fused-ring naming engine; add a larger pattern library for fused heterocycles.

4) Substituent Detection & Classification
- Problem: Substituent classification uses simple carbon-count heuristics and may not detect functionalized or cyclic substituents correctly. Position mapping assumes one-atom attachments in many places. See `classifySubstituent` and `findSubstituentsOnMonocyclicRing`.
- Impact: Incorrect substituent names and locants in complex substituents.
- Suggested improvement: Implement full substituent fragment extraction, canonical substituent naming (including cyclic substituents), and robust locant mapping.

5) Numbering & Chain Selection
- Problem: Multiple code paths exist for chain selection and numbering (pipeline, legacy `selectPrincipalChain`, `numberChain`). Tie-break rules and priority application are fragile.
- Impact: Ambiguous parent selection, inconsistent naming across code paths.
- Suggested improvement: Centralize chain selection and numbering into a single deterministic engine with a full rule set and unit tests for tie-break scenarios.

6) SMARTS / Pattern Reliance & Fragility
- Problem: A few hard-coded SMARTS fallbacks (e.g., indole) are brittle; many detections use ad-hoc atom/bond checks rather than consistent SMARTS patterns.
- Impact: Fragile detection and mismatches depending on molecule representation.
- Suggested improvement: Maintain a SMARTS registry for all recognized patterns and use a stable SMARTS matcher with graceful diagnostics for failures.

7) Compliance & Edge Cases
- Problem: Placeholder names such as `spiro_C...`, `bridged_C...`, and `polycyclic_C...` are returned when the engine cannot handle a pattern.
- Impact: Non-IUPAC outputs make the library unsuitable for formal naming needs in many cases.
- Suggested improvement: Replace placeholders with either full systematic names (possibly verbose) or return structured errors/warnings explaining why systematic naming failed.

8) Types, Data Model & Maintainability
- Problem: `iupac-types.ts` is minimal and lacks metadata required for advanced naming (stereo flags, isotope info, canonical atom index mapping, etc.). The repo contains remnants of duplicate rule-engine implementations (historical drift).
- Impact: Hard to extend and maintain; increased risk of inconsistent behavior.
- Suggested improvement: Enrich types with required metadata and consolidate rule engines into a single extensible Rule Engine.

9) Performance & Scalability
- Problem: Substituent traversals and ring analysis can re-traverse graphs multiple times and may be slow on large molecules. Some expensive computations are not memoized.
- Impact: Slow name generation on large polynuclear/branched molecules.
- Suggested improvement: Cache ring analysis results per molecule, memoize substituent fragment computations, and avoid redundant traversals.

10) Error Handling & Diagnostics
- Problem: Several try/catch blocks swallow SMARTS errors silently; fallbacks often return placeholders without clear warnings. `IUPACGenerationResult` includes `errors` and `warnings` but outputs are sparse on diagnostics.
- Impact: Hard to debug why a systematic name was not produced.
- Suggested improvement: Improve structured warnings (reason codes), surface SMARTS failures as warnings, and provide diagnostic metadata in results.

11) Testing & Validation
- Problem: Tests exist for many iupac internals, but coverage gaps remain (stereochemistry, isotopes, fused systems, organometallics, salts). No broad authoritative cross-validation harness against OPSIN/RDKit for naming is present.
- Impact: Regressions may go undetected for complex cases.
- Suggested improvement: Add targeted unit tests for all tie-breaker rules and cross-validate a canonical test set against OPSIN/RDKit/other authoritative converters.

12) API & Structured Output
- Problem: `IUPACGenerationResult` is limited to `name`, `errors`, and `warnings`. It does not return structured metadata such as canonical locants, numbering maps, or substituent lists.
- Impact: Downstream consumers cannot programmatically access the naming decisions.
- Suggested improvement: Extend API to return optional structured metadata: `numberingMap`, `principalChainIndices`, `substituentsWithLocants`, `stereodescriptors`, `diagnostics`.

13) Multi-component Systems & Special Classes
- Problem: Salts, solvates, organometallics, polymers and repeating units are not supported. Multi-component molecules are naively joined with `.`.
- Impact: Incorrect or non-standard representation for multi-component materials.
- Suggested improvement: Define handling strategy for salts/complexes and defer organometallics/polymers to specialized modules or mark as out-of-scope.

Prioritized Work Items (High / Medium / Low)
--------------------------------------------
High Priority (Correctness & Core Coverage)
- H1: Implement a comprehensive SMARTS-based Functional Group Registry
  - Why: Correct principal functional-group detection underpins suffix/priority rules.
  - Deliverables: SMARTS list + metadata (priority, suffix/prefix, parenthesized), unit tests for common FG priority cases.
  - Files: `src/utils/iupac/functional-group-registry.ts`, usages in `identifyPrincipalFunctionalGroup`.
  - Acceptance: Matches expected principal group for >95% of a curated 200-molecule test set.

- H2: Centralize chain selection & numbering engine
  - Why: Prevent inconsistent parent selection and ensure deterministic numbering/Tie-breaks.
  - Deliverables: Single engine (pipeline stage) implementing IUPAC parent-selection rules with exhaustive tie-break tests.
  - Files: Consolidate `pipeline`, `chain-selection`, `chain-numbering` into a single deterministic module.
  - Acceptance: Existing tests for ambiguous parents pass and new tie-breaker test vectors produce consistent outputs.

- H3: Replace placeholders for spiro/bridged/fused ring systems with systematic naming (or structured error)
  - Why: Placeholders produce unusable names in critical cases.
  - Deliverables: Implement proper spiro/bridged naming or deterministic systematic fallback name; add regression tests.
  - Acceptance: No placeholder strings are returned for molecules in core fused/spiro test set.

Medium Priority (Coverage & API)
- M1: Expand heterocycle & fused-ring pattern library
  - Deliverables: SMARTS/templates for common heterocycles and fused systems; integrate into `iupac-rings` logic.
  - Acceptance: Recognizes and names common heterocycles (pyridine, pyrrole, indole, benzofuran, benzothiophene) with correct substituent locants.

- M2: Add stereochemistry detection+rendering stage
  - Deliverables: R/S algorithm (CIP rules) and E/Z detection for double bonds integrated into pipeline.
  - Acceptance: Generates correct stereodescriptors for test stereo molecules.

- M3: Enhance structured API output
  - Deliverables: Extend `IUPACGenerationResult` to optionally include `numberingMap`, `principalChainIndices`, `substituents`, `stereodescriptors`, and `diagnostics`.
  - Acceptance: Downstream code can reconstruct numbering and mapping from result object.

- M4: Improve substituent classification & fragment extraction
  - Deliverables: Extract substituent fragments, detect cyclic substituents and complex functionalized substituents, canonical substituent names.
  - Acceptance: Substituents in monocyclic and fused cases are named consistently in tests.

Low Priority (Performance, Edge Features)
- L1: Memoize ring and substituent analyses for performance
  - Deliverables: Per-molecule caches to avoid repeated ring/fragment recomputation.
  - Acceptance: Benchmarks show <50% time on repeated calls for same molecule compared to baseline.

- L2: Add isotopic labelling support
  - Deliverables: Support isotopic locants in name construction.
  - Acceptance: Names include isotopic locants per tests.

- L3: Add cross-validation test harness vs OPSIN/RDKit (non-blocking)
  - Deliverables: Script and curated test set to compare outputs and highlight differences.
  - Acceptance: Automated report showing differences and actionable items.

- L4: Define scope & handling for salts, organometallics, polymers (document or implement)
  - Deliverables: Decision doc and minimal implementation or explicit error/warning.
  - Acceptance: Known out-of-scope classes produce clear diagnostics.

Implementation Milestones (Suggested)
------------------------------------
- Milestone 1 (2–3 weeks): Functional Group Registry + tests (H1)
- Milestone 2 (2–4 weeks): Centralize chain selection & numbering (H2)
- Milestone 3 (3–6 weeks): Fused/spiro naming improvements (H3) + heterocycle expansion (M1)
- Milestone 4 (3–5 weeks): Stereochemistry stage + tests (M2)
- Milestone 5 (2–4 weeks): Structured API output + substituent improvements (M3, M4)
- Ongoing: Performance optimizations, isotopes, cross-validation harness.

Acceptance Criteria & Testing
-----------------------------
- Unit tests for every rule/tie-breaker added to `test/unit/iupac/`.
- Cross-check core 200-molecule dataset against OPSIN or RDKit for regression detection.
- No placeholder names (e.g., `spiro_C...`, `polycyclic_C...`) returned for molecules in the core validation set.
- Structured metadata available when `options.includeMetadata` is enabled.

Developer Notes & Next Steps
---------------------------
- Start by building a comprehensive FG SMARTS list (public sources: Daylight SMARTS patterns, OPSIN rules, known FG registries).
- Consolidate rule logic into a single, testable pipeline stage.
- Add explicit diagnostics codes (e.g., `unhandled-fused-pattern`, `missing-fg-template`) to help triage failures.

If you want, I can now:
- Create an initial branch and scaffold `src/utils/iupac/functional-group-registry.ts` and the enriched `IUPACGenerationResult` type and add a small set of tests.
- Or produce a prioritized ticket list in your issue tracker format (GitHub issues/PRs).

---
Generated by the codebase analysis on the local repository. For quick reference edit the file:
`docs/IUPAC_LIMITATIONS.md`

