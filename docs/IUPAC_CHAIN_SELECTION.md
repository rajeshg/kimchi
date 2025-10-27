# IUPAC parent-chain selection decisions (implementation notes)

This document records the chain-selection rules implemented in `src/utils/iupac/iupac-chains.ts`.

These rules encode the project's pragmatic interpretation of the IUPAC tie-break hierarchy for choosing
the parent chain when multiple candidate linear chains are available (including chains that contain
heteroatoms).

Summary (decision order)

1. Longest carbon chain (by number of carbon atoms) is the primary criterion. We compute the set of
   longest carbon-only chains and consider hetero-containing heavy-atom chains only when they have the
   same number of carbon atoms as the longest carbon-only chains.

2. Principal functional-group precedence: if a candidate chain contains a principal functional group
   (e.g., carboxylic acid, amide, aldehyde/ketone, alcohol), chains that include the highest-priority
   functional group are preferred. A small heuristic function `getChainFunctionalGroupPriority` assigns
   numeric priorities to detect these groups; higher numbers win.

3. Hydrocarbon preference: if no principal functional group differentiates candidates, we prefer an
   all-carbon (hydrocarbon) parent over heteroatom-containing chains of equal carbon-count. This
   mirrors the IUPAC guidance that hydrocarbon parents are preferred when no higher-priority
   functional group requires inclusion of heteroatoms in the parent.

4. Locant-based tie-breaks: if candidates still tie, we fall back to locant-based comparisons implemented
   elsewhere in the module:
   - unsaturation locants (lowest set wins),
   - heteroatom locants (promoted in our comparator),
   - substituent locants (alphabetical and numeric ordering),
   - an OPSIN-inspired lightweight heuristic (`isBetterByOpsinHeuristics`) that prefers chains with more
     heteroatoms and fewer substituents when locant tuples are identical.

Implementation notes

- The selection logic lives in `findMainChain(molecule)`.
- Candidate chains are built from `findAllCarbonChains` (carbon-only) plus `findAllAtomChains`
  (heavy-atom chains) when appropriate.
- The small principal-group detector `getChainFunctionalGroupPriority(chain, molecule)` currently
  recognizes (heuristically): carboxylic-acid like patterns (priority 6), amide-like (5), carbonyls
  (4) and alcohols (3). This is intentionally conservative: it aims to capture the common cases that
  require parent inclusion rather than a comprehensive IUPAC functional-group parser.
- The behavior is intentionally configurable in code (see comments) — if you want stricter/more
  complete functional-group coverage, extend `getChainFunctionalGroupPriority`.

Why this design

The implementation follows the IUPAC intent while keeping the codebase pragmatic and maintainable.
We prefer a clear primary metric (carbon count) and only promote hetero-containing parents when a
chemical reason (principal functional group) forces it. This keeps names like `ethoxyethane` for
`CH3CH2OCH2CH3` while ensuring `2-methoxyethanol` (or equivalent) is produced when an –OH group
defines the parent.

Files & entry points

- `src/utils/iupac/iupac-chains.ts` — `findMainChain`, `getChainFunctionalGroupPriority`, helpers
- `test/unit/iupac-chain-priority.test.ts` — new focused unit tests (see test file)

Recommended next steps

- Expand `getChainFunctionalGroupPriority` to detect more principal groups (sulfonic acids, acid
  derivatives, phosphonic acids, etc.) if you need full IUPAC precedence coverage.
- Add more unit tests representing tricky ambivalent structures (bridged systems, multiple potential
  principal groups on different positions) and compare against OPSIN or RDKit-derived expected names
  where authoritative naming is required.

Questions or changes? Open a PR with desired examples and I can encode additional heuristics.
