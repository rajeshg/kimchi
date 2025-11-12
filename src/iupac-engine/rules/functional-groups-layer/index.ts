import type { IUPACRule, FunctionalGroup } from "../../types";
import { RulePriority } from "../../types";
import type { ImmutableNamingContext } from "../../immutable-context";
import { ExecutionPhase, NomenclatureMethod } from "../../immutable-context";
import type { Molecule, Atom, Bond } from "../../../../types";
import { getAcyloxyNameFromOPSIN } from "../../opsin-adapter";
import {
  CARBOXYLIC_ACID_RULE,
  ALCOHOL_DETECTION_RULE,
  AMINE_DETECTION_RULE,
  KETONE_DETECTION_RULE,
} from "./simple-detectors";
import {
  normalizePriority,
  findAcylChain,
  expandKetoneToAcylGroup,
} from "./utils";
import {
  ESTER_DETECTION_RULE,
  LACTONE_TO_KETONE_RULE,
  analyzeEsterHierarchy,
} from "./ester-detection";
import {
  selectPrincipalGroup,
  calculateFunctionalGroupPriority,
  isFunctionalClassPreferred,
} from "./priority-selection";

// Type for OPSIN detector return values (atoms are indices)
type DetectedFunctionalGroup = {
  type: string;
  name?: string;
  suffix?: string;
  prefix?: string;
  priority: number;
  atoms: number[];
  bonds?: Bond[];
  pattern?: string;
};

// Type for manually detected functional groups moved to ./functional-groups-layer/simple-detectors.ts

/**
 * Functional Group Detection Layer Rules
 *
 * This layer detects and prioritizes functional groups according to Blue Book P-44.1.
 * The functional group priority determines the parent structure and suffix.
 *
 * Reference: Blue Book P-44.1 - Principal characteristic group selection
 * https://iupac.qmul.ac.uk/BlueBook/RuleP44.html
 *
 * TRACEABILITY NOTE (Phase 2 OPSIN Integration):
 * All functional group priority lookups now use OPSIN data via context.getDetector().
 * Trace metadata (lines 316-364) captures the OPSIN pattern used for each detection,
 * stored in context.state.functionalGroupTrace. This provides full traceability of
 * which OPSIN rules were applied during functional group detection and prioritization.
 */

/**
 * Rule: Principal Group Priority Detection
 *
 * Implements Blue Book Table 5.1 - Order of seniority of classes
 * Highest: Acids (1) → Lowest: Halides (12)
 */
export const FUNCTIONAL_GROUP_PRIORITY_RULE: IUPACRule = {
  id: "functional-group-priority",
  name: "Functional Group Priority Detection",
  description:
    "Detect and prioritize functional groups per Blue Book Table 5.1",
  blueBookReference: "P-44.1 - Principal characteristic group selection",
  priority: RulePriority.SIX, // 60 - Consolidate all FG detections (runs after individual detections)
  conditions: (context: ImmutableNamingContext) =>
    context.getState().molecule.atoms.length > 0,
  action: (context: ImmutableNamingContext) => {
    // Use OPSIN detector directly so we can capture pattern metadata for traceability
    const mol = context.getState().molecule;
    const detected = context.getDetector().detectFunctionalGroups(mol);

    // Get previously detected functional groups (from ALCOHOL_DETECTION_RULE, etc.)
    const previousFunctionalGroups = context.getState().functionalGroups || [];

    if (process.env.VERBOSE) {
      console.log(
        "[FUNCTIONAL_GROUP_PRIORITY_RULE] Molecule has rings?",
        mol.rings?.length || 0,
      );
      if (process.env.VERBOSE) {
        console.log(
          "[FUNCTIONAL_GROUP_PRIORITY_RULE] Detected functional groups (raw):",
          detected.map((d: DetectedFunctionalGroup) => ({
            pattern: d.pattern,
            type: d.type,
            name: d.name,
            priority: d.priority,
          })),
        );
      }
      if (process.env.VERBOSE) {
        console.log(
          "[FUNCTIONAL_GROUP_PRIORITY_RULE] Previous functional groups:",
          previousFunctionalGroups.map((fg: FunctionalGroup) => ({
            type: fg.type,
            bonds: fg.bonds?.length || 0,
          })),
        );
      }
    }

    // Build normalized functional groups and a parallel trace metadata array
    const traceMeta: Array<{
      pattern?: string;
      type?: string;
      atomIds: number[];
    }> = [];

    // Special handling: Split multi-atom amine detections into separate entries
    // SMARTS pattern [NX3][CX4] matches multiple nitrogen atoms in one entry,
    // but we need separate entries to match the structure from detectAmines()
    const expandedDetected: DetectedFunctionalGroup[] = [];
    for (const d of detected) {
      const rawName = (d.name || d.type || d.pattern || "")
        .toString()
        .toLowerCase();
      const type = rawName.replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");

      if (type === "amine" && d.atoms && d.atoms.length > 1) {
        // Check if we have multiple nitrogen atoms
        const nitrogenAtoms = d.atoms.filter(
          (idx: number) => mol.atoms[idx]?.symbol === "N",
        );

        if (nitrogenAtoms.length > 1) {
          // Split into separate amine entries, one per nitrogen
          for (const nAtomIdx of nitrogenAtoms) {
            expandedDetected.push({
              ...d,
              atoms: [nAtomIdx],
            });
          }
          if (process.env.VERBOSE) {
            console.log(
              `[FUNCTIONAL_GROUP_PRIORITY_RULE] Split amine with ${nitrogenAtoms.length} nitrogen atoms into ${nitrogenAtoms.length} separate entries`,
            );
          }
          continue;
        }
      }

      // Not an amine or single-atom amine - keep as-is
      expandedDetected.push(d);
    }

    const functionalGroups: FunctionalGroup[] = expandedDetected.map(
      (d: DetectedFunctionalGroup) => {
        const rawName = (d.name || d.type || d.pattern || "")
          .toString()
          .toLowerCase();
        const type = rawName.replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");

        // d.atoms contains atom indices (numbers), convert to Atom objects
        let atomIndices = d.atoms || [];

        // For ketones, expand to include full acyl substituent chain if applicable
        // This prevents fragmentation of branched acyl groups like 3-methylbutanoyl
        if (type === "ketone") {
          const expandedIndices = expandKetoneToAcylGroup(mol, atomIndices);
          if (expandedIndices.length > atomIndices.length) {
            atomIndices = expandedIndices;
            if (process.env.VERBOSE) {
              console.log(
                `[FUNCTIONAL_GROUP_PRIORITY_RULE] Expanded ketone atoms from ${d.atoms?.length || 0} to ${expandedIndices.length}:`,
                expandedIndices,
              );
            }
          }
        }

        const atoms = atomIndices
          .map((idx: number) => mol.atoms[idx])
          .filter((a: Atom | undefined): a is Atom => a !== undefined);
        const bonds = d.bonds || [];
        const rawPriority =
          typeof d.priority === "number"
            ? d.priority
            : context
                .getDetector()
                .getFunctionalGroupPriority(d.pattern || d.type) || 0;
        const priority = normalizePriority(rawPriority);

        traceMeta.push({
          pattern: d.pattern || d.type,
          type,
          atomIds: atomIndices,
        });

        // For ketones and aldehydes, only the carbonyl carbon (first atom) should be in locants
        // The oxygen is needed in atoms[] for detection, but not for locant numbering
        const isKetoneOrAldehyde = type === "ketone" || type === "aldehyde";
        const locantAtoms = isKetoneOrAldehyde ? atoms.slice(0, 1) : atoms;

        // Try to preserve bonds, atoms, and locants from previously detected functional groups
        // Match by atom IDs to find the corresponding previous detection
        let preservedBonds = bonds;
        let preservedAtoms = atoms;
        let preservedLocants = locantAtoms.map((a: Atom) =>
          a && typeof a.id === "number" ? a.id : -1,
        );

        if (previousFunctionalGroups.length > 0) {
          // atomIndices are array indices, but atoms have IDs. Convert indices to IDs for comparison
          const atomIds = atoms.map((a: Atom) => a.id);
          const atomIdSet = new Set(atomIds);

          const matchingPrevious = previousFunctionalGroups.find(
            (prev: FunctionalGroup) => {
              // Must match by type first
              if (prev.type !== type) return false;

              const prevAtomIds =
                prev.atoms?.map((a: Atom | number) =>
                  typeof a === "number" ? a : a.id,
                ) || [];

              // Match by overlapping atom IDs
              let matches = prevAtomIds.some((id: number) => atomIdSet.has(id));

              // If no direct overlap, check if atoms are bonded
              // This handles cases like alcohols where previous detection stores carbon (C)
              // and SMARTS detection finds oxygen (O), but they're bonded via C-O bond
              if (!matches && prev.bonds && prev.bonds.length > 0) {
                const prevBonds = prev.bonds;
                matches = prevAtomIds.some((prevAtomId: number) =>
                  atomIds.some((currentAtomId: number) =>
                    prevBonds.some(
                      (bond: Bond) =>
                        (bond.atom1 === prevAtomId &&
                          bond.atom2 === currentAtomId) ||
                        (bond.atom2 === prevAtomId &&
                          bond.atom1 === currentAtomId),
                    ),
                  ),
                );
              }

              if (process.env.VERBOSE && type === "ketone") {
                if (process.env.VERBOSE) {
                  console.log(
                    `[FUNCTIONAL_GROUP_PRIORITY_RULE] Checking prev.type=${prev.type} prevAtomIds=`,
                    prevAtomIds,
                    "matches=",
                    matches,
                  );
                }
              }

              return matches;
            },
          );

          if (matchingPrevious) {
            // Preserve bonds if available
            if (matchingPrevious.bonds && matchingPrevious.bonds.length > 0) {
              preservedBonds = matchingPrevious.bonds;
              if (process.env.VERBOSE) {
                console.log(
                  `[FUNCTIONAL_GROUP_PRIORITY_RULE] Preserved bonds for ${type} from previous detection:`,
                  preservedBonds.length,
                );
              }
            }

            // Preserve atoms if available from previous detection
            // BUT: for ketones, if we expanded the atom list to include acyl chains, don't preserve
            // ALSO: for ketones, don't preserve if previous detection had different atom count (e.g., LACTONE_TO_KETONE only stores carbonyl C)
            const wasExpanded =
              type === "ketone" && atoms.length > (d.atoms?.length || 0);
            const isDifferentAtomCount =
              type === "ketone" &&
              matchingPrevious.atoms?.length !== atoms.length;
            if (
              matchingPrevious.atoms &&
              matchingPrevious.atoms.length > 0 &&
              !wasExpanded &&
              !isDifferentAtomCount
            ) {
              preservedAtoms = matchingPrevious.atoms;
              if (process.env.VERBOSE) {
                console.log(
                  `[FUNCTIONAL_GROUP_PRIORITY_RULE] Preserved atoms for ${type} from previous detection:`,
                  preservedAtoms.map((a: Atom | number) =>
                    typeof a === "number" ? a : a.id,
                  ),
                );
              }
            } else if (wasExpanded && process.env.VERBOSE) {
              if (process.env.VERBOSE) {
                console.log(
                  `[FUNCTIONAL_GROUP_PRIORITY_RULE] NOT preserving atoms for ${type} because we expanded from ${d.atoms?.length} to ${atoms.length}`,
                );
              }
            }

            // Preserve locants if explicitly set (e.g., alcohol detection sets carbon atom ID)
            // BUT: for expanded ketones, use only carbonyl carbon as locant
            if (
              matchingPrevious.locants &&
              matchingPrevious.locants.length > 0 &&
              !wasExpanded
            ) {
              preservedLocants = matchingPrevious.locants;
              if (process.env.VERBOSE) {
                console.log(
                  `[FUNCTIONAL_GROUP_PRIORITY_RULE] Preserved locants for ${type} from previous detection:`,
                  preservedLocants,
                );
              }
            }
          }
        }

        return {
          type,
          atoms: preservedAtoms,
          bonds: preservedBonds,
          suffix:
            d.suffix ||
            context
              .getDetector()
              .getFunctionalGroupSuffix(d.pattern || d.type) ||
            undefined,
          prefix: d.prefix || undefined,
          priority,
          isPrincipal: false,
          locants: preservedLocants,
        } as FunctionalGroup;
      },
    );

    if (process.env.VERBOSE) {
      console.log(
        "[FUNCTIONAL_GROUP_PRIORITY_RULE] Normalized functional groups:",
        functionalGroups.map((fg: FunctionalGroup) => ({
          type: fg.type,
          priority: fg.priority,
          locants: fg.locants,
        })),
      );
    }
    // sort by priority (higher numeric value = higher priority)
    functionalGroups.sort((a, b) => (b.priority || 0) - (a.priority || 0));

    const principalGroup = selectPrincipalGroup(
      functionalGroups,
      mol,
      context.getDetector(),
    );
    const priorityScore = calculateFunctionalGroupPriority(
      functionalGroups,
      mol,
      context.getDetector(),
    );

    if (process.env.VERBOSE) {
      console.log(
        "[FUNCTIONAL_GROUP_PRIORITY_RULE] Selected principalGroup:",
        principalGroup && {
          type: principalGroup.type,
          priority: principalGroup.priority,
          locants: principalGroup.locants,
          isPrincipal: principalGroup.isPrincipal,
        },
      );
      if (process.env.VERBOSE) {
        console.log(
          "[FUNCTIONAL_GROUP_PRIORITY_RULE] functional group priority score:",
          priorityScore,
        );
      }
    }

    // Special handling for ring systems:
    // If molecule has a heterocyclic ring and functional groups are attached to ring atoms,
    // those functional groups should be treated as substituents, not as principal groups
    const hasRingSystem = (mol.rings?.length || 0) > 0;
    const ringAtomIds = new Set<number>();
    if (hasRingSystem && mol.rings) {
      for (const ring of mol.rings) {
        if (ring && ring.length > 0) {
          for (const atomId of ring) {
            ringAtomIds.add(atomId);
          }
        }
      }
    }

    // Check if principal group is PART OF a ring (not just attached to it)
    // For example:
    // - Pyridine: nitrogen IS part of the ring → demote to "pyridine" (not "azine")
    // - Cyclohexanol: oxygen is NOT part of ring → keep as principal → "cyclohexanol" (not "hydroxycyclohexane")
    // - Cyclohexanone: oxygen is NOT part of ring → keep as principal → "cyclohexanone" (not "oxocyclohexane")
    let shouldDemotePrincipalGroup = false;
    if (hasRingSystem && principalGroup && principalGroup.locants) {
      const fgLocants = principalGroup.locants;

      // For alcohols, ketones, aldehydes, and amides: locants are the carbon atoms
      // We need to check if the OXYGEN (not the carbon) is part of the ring
      // Example: imidazolidin-4-one has C=O where O is NOT in ring (correct: keep as principal)
      // Example: pyridine-N-oxide has N-O where O is NOT in ring (correct: keep as principal)
      if (
        principalGroup.type === "alcohol" ||
        principalGroup.type === "ketone" ||
        principalGroup.type === "aldehyde" ||
        principalGroup.type === "amide"
      ) {
        // Special case for amides: check if it's a lactam (cyclic amide)
        // Lactam: both carbonyl C and N are in the ring, oxygen is exocyclic
        // Example: pyrrolidin-2-one (O=C1CCCN1) - C and N in ring, O outside
        if (principalGroup.type === "amide" && principalGroup.atoms) {
          const amideAtoms = principalGroup.atoms;
          // Amide atoms are stored as [C, O, N] (carbonyl carbon, oxygen, nitrogen)
          if (amideAtoms.length >= 3) {
            const carbonylC = amideAtoms[0];
            const nitrogen = amideAtoms[2];

            if (carbonylC && nitrogen) {
              const carbonylCId =
                typeof carbonylC === "number" ? carbonylC : carbonylC.id;
              const nitrogenId =
                typeof nitrogen === "number" ? nitrogen : nitrogen.id;

              // If both C and N are in ring → it's a lactam → demote
              if (ringAtomIds.has(carbonylCId) && ringAtomIds.has(nitrogenId)) {
                shouldDemotePrincipalGroup = true;
                if (process.env.VERBOSE) {
                  console.log(
                    "[FUNCTIONAL_GROUP_PRIORITY_RULE] Detected lactam (cyclic amide) - demoting amide group",
                  );
                }
              }
            }
          }
        }

        // Only check oxygen if not already demoted (and not a lactam)
        if (!shouldDemotePrincipalGroup) {
          for (const locant of fgLocants) {
            // Find oxygen atoms bonded to this carbon
            const oxygenAtoms = mol.bonds
              .filter((bond) => bond.atom1 === locant || bond.atom2 === locant)
              .map((bond) => (bond.atom1 === locant ? bond.atom2 : bond.atom1))
              .map((atomId) => mol.atoms.find((a) => a.id === atomId))
              .filter(
                (atom): atom is Atom =>
                  atom !== undefined && atom.symbol === "O",
              );

            // Check if any of these oxygens are part of the ring
            for (const oxygen of oxygenAtoms) {
              if (ringAtomIds.has(oxygen.id)) {
                shouldDemotePrincipalGroup = true;
                break;
              }
            }
            if (shouldDemotePrincipalGroup) break;
          }
        }
      } else {
        // For other functional groups, check if the locant itself is in the ring
        for (const locant of fgLocants) {
          const isPartOfRing = ringAtomIds.has(locant);
          if (isPartOfRing) {
            shouldDemotePrincipalGroup = true;
            break;
          }
        }
      }
    }

    if (shouldDemotePrincipalGroup && process.env.VERBOSE) {
      if (process.env.VERBOSE) {
        console.log(
          "[FUNCTIONAL_GROUP_PRIORITY_RULE] Ring system detected - functional groups attached to ring atoms will be treated as substituents",
        );
      }
      if (process.env.VERBOSE) {
        console.log(
          "[FUNCTIONAL_GROUP_PRIORITY_RULE] Demoting principal group:",
          principalGroup?.type,
        );
      }
    }

    // Mark ALL functional groups of the principal type as principal
    // (e.g., if we have 2 ketones, both should be marked as principal)
    // EXCEPT:
    // 1. For hierarchical esters - only mark the primary ester as principal
    // 2. For ring systems - functional groups attached to ring atoms are NOT principal
    let updatedFunctionalGroups =
      principalGroup && !shouldDemotePrincipalGroup
        ? functionalGroups.map((g) => {
            if (
              g.type === principalGroup.type &&
              g.priority === principalGroup.priority
            ) {
              if (process.env.VERBOSE) {
                console.log(
                  "[FUNCTIONAL_GROUP_PRIORITY_RULE] Marking as principal:",
                  {
                    type: g.type,
                    priority: g.priority,
                    locants: g.locants,
                  },
                );
              }
              return {
                ...g,
                isPrincipal: true,
              } as FunctionalGroup;
            }
            return g;
          })
        : functionalGroups;

    // Special handling for hierarchical esters
    // If we have multiple esters and they're hierarchical, only mark the primary ester as principal
    if (principalGroup?.type === "ester") {
      const esters = updatedFunctionalGroups.filter(
        (fg) => fg.type === "ester",
      );
      if (esters.length >= 2) {
        const hierarchyResult = analyzeEsterHierarchy(context, esters);
        if (
          hierarchyResult.isHierarchical &&
          hierarchyResult.primaryEsterAtoms
        ) {
          if (process.env.VERBOSE) {
            console.log(
              "[FUNCTIONAL_GROUP_PRIORITY_RULE] Detected hierarchical esters - marking only primary ester as principal",
            );
            if (process.env.VERBOSE) {
              console.log(
                "[FUNCTIONAL_GROUP_PRIORITY_RULE] Primary ester atoms:",
                hierarchyResult.primaryEsterAtoms,
              );
            }
          }
          // Only mark the primary ester as principal, demote nested esters
          const primaryAtomSet = new Set(hierarchyResult.primaryEsterAtoms);
          updatedFunctionalGroups = updatedFunctionalGroups.map((fg) => {
            if (fg.type === "ester") {
              // Check if this ester's atoms match the primary ester
              const fgAtomIds = fg.atoms.map((a: Atom | number) =>
                typeof a === "number" ? a : a.id,
              );
              const isPrimaryEster = fgAtomIds.some((id) =>
                primaryAtomSet.has(id),
              );
              return {
                ...fg,
                isPrincipal: isPrimaryEster,
              } as FunctionalGroup;
            }
            return fg;
          });
        }
      }
    }

    // Convert non-principal ethers to alkoxy substituents
    // This must happen AFTER principal group is marked
    for (let i = 0; i < updatedFunctionalGroups.length; i++) {
      const fg = updatedFunctionalGroups[i];
      if (!fg) continue;

      // Legacy ether→alkoxy conversion removed - now handled by ETHER_TO_ALKOXY_RULE
      // The ETHER_TO_ALKOXY_RULE (line ~2112) sets type='alkoxy' without prefix,
      // allowing name assembly to determine correct substituent name with full main chain context
    }

    // Convert non-principal esters to acyloxy substituents (e.g., "butanoyloxy")
    // This must happen AFTER principal group is marked
    for (let i = 0; i < updatedFunctionalGroups.length; i++) {
      const fg = updatedFunctionalGroups[i];
      if (!fg) continue;

      // Only convert esters that are NOT the principal group
      if (fg.type === "ester" && !fg.isPrincipal) {
        if (process.env.VERBOSE) {
          console.log(
            "[FUNCTIONAL_GROUP_PRIORITY_RULE] Converting non-principal ester to acyloxy substituent:",
            fg.atoms,
          );
        }

        // Find the carbonyl carbon and build the acyl chain name
        const esterAtomIds = fg.atoms.map((a: Atom | number) =>
          typeof a === "number" ? a : a.id,
        );
        let carbonylCarbon: number | undefined;

        // Find C=O bond
        for (const bond of mol.bonds) {
          if (bond.type === "double") {
            const atom1 = mol.atoms[bond.atom1];
            const atom2 = mol.atoms[bond.atom2];

            if (
              atom1?.symbol === "C" &&
              atom2?.symbol === "O" &&
              esterAtomIds.includes(bond.atom1)
            ) {
              carbonylCarbon = bond.atom1;
              break;
            } else if (
              atom1?.symbol === "O" &&
              atom2?.symbol === "C" &&
              esterAtomIds.includes(bond.atom2)
            ) {
              carbonylCarbon = bond.atom2;
              break;
            }
          }
        }

        if (!carbonylCarbon) continue;

        // Find the acyl chain (carbons attached to carbonyl, excluding the ester oxygen side)
        // For CCCC(=O)O-, we want to traverse from the carbonyl carbon through C-C bonds
        const acylChainAtoms = findAcylChain(mol, carbonylCarbon);
        const chainLength = acylChainAtoms.length;

        // Build acyloxy name: "butanoyloxy" for 4-carbon chain
        const opsinService = context.getOPSIN();
        const acyloxyName = getAcyloxyNameFromOPSIN(chainLength, opsinService);

        if (process.env.VERBOSE) {
          console.log(
            "[FUNCTIONAL_GROUP_PRIORITY_RULE] Acyl chain length:",
            chainLength,
            "name:",
            acyloxyName,
          );
        }

        updatedFunctionalGroups[i] = {
          ...fg,
          type: "acyloxy",
          prefix: acyloxyName,
          atoms: fg.atoms || [],
        } as FunctionalGroup;
      }
    }

    // Update functional groups
    let updatedContext = context.withFunctionalGroups(
      updatedFunctionalGroups,
      "functional-group-priority",
      "Functional Group Priority Detection",
      "P-44.1",
      ExecutionPhase.FUNCTIONAL_GROUP,
      "Detected and prioritized functional groups",
    );

    // Attach OPSIN trace metadata into context state (not on FunctionalGroup objects)
    updatedContext = updatedContext.withStateUpdate(
      (state) => ({ ...state, functionalGroupTrace: traceMeta }),
      "functional-group-trace",
      "Functional Group Trace Metadata",
      "P-44.1",
      ExecutionPhase.FUNCTIONAL_GROUP,
      "Attach OPSIN pattern metadata for detected functional groups",
    );

    // Update principal group and priority in state
    updatedContext = updatedContext.withStateUpdate(
      (state) => ({
        ...state,
        principalGroup,
        functionalGroupPriority: priorityScore,
      }),
      "functional-group-priority",
      "Functional Group Priority Detection",
      "P-44.1",
      ExecutionPhase.FUNCTIONAL_GROUP,
      "Set principal group and priority score",
    );

    return updatedContext;
  },
};

/**
 * Rule: Functional Class Nomenclature Detection
 *
 * Determines if the compound should be named using functional class nomenclature
 * according to P-51.2
 */
export const FUNCTIONAL_CLASS_RULE: IUPACRule = {
  id: "functional-class-nomenclature",
  name: "Functional Class Nomenclature Detection",
  description:
    "Detect if functional class nomenclature should be used (P-51.2)",
  blueBookReference: "P-51.2 - Functional class nomenclature",
  priority: RulePriority.ONE, // 10 - Functional class runs last (lowest priority)
  conditions: (context: ImmutableNamingContext) =>
    context.getState().functionalGroups.length > 0,
  action: (context: ImmutableNamingContext) => {
    // If a nomenclature method has already been chosen by an earlier rule
    // (for example ESTER_DETECTION_RULE), do not overwrite it here. This
    // preserves ester-specific functional-class decisions and avoids
    // later rules clobbering them.
    const principalGroup = context.getState().principalGroup;
    const functionalGroups = context.getState().functionalGroups;
    const existingMethod = context.getState().nomenclatureMethod;
    if (existingMethod) {
      if (process.env.VERBOSE) {
        console.log(
          "[FUNCTIONAL_CLASS_RULE] Nomenclature method already set, skipping functional-class evaluation",
        );
      }
      return context;
    }

    // Check if ANY functional group prefers functional class nomenclature
    // (not just the principal group). Borane, for example, should always
    // trigger functional class nomenclature even if other functional groups
    // like ethers are present.
    const hasFunctionalClassGroup = functionalGroups.some((fg) =>
      isFunctionalClassPreferred(fg),
    );

    let updatedContext: ImmutableNamingContext;
    if (hasFunctionalClassGroup || isFunctionalClassPreferred(principalGroup)) {
      updatedContext = context.withNomenclatureMethod(
        NomenclatureMethod.FUNCTIONAL_CLASS,
        "functional-class-nomenclature",
        "Functional Class Nomenclature Detection",
        "P-51.2",
        ExecutionPhase.FUNCTIONAL_GROUP,
        "Set nomenclature method to functional class",
      );
      updatedContext = updatedContext.withStateUpdate(
        (state) => ({ ...state, useFunctionalClass: true }),
        "functional-class-nomenclature",
        "Functional Class Nomenclature Detection",
        "P-51.2",
        ExecutionPhase.FUNCTIONAL_GROUP,
        "Set useFunctionalClass to true",
      );
    } else {
      updatedContext = context.withNomenclatureMethod(
        NomenclatureMethod.SUBSTITUTIVE,
        "functional-class-nomenclature",
        "Functional Class Nomenclature Detection",
        "P-51.2",
        ExecutionPhase.FUNCTIONAL_GROUP,
        "Set nomenclature method to substitutive",
      );
      updatedContext = updatedContext.withStateUpdate(
        (state) => ({ ...state, useFunctionalClass: false }),
        "functional-class-nomenclature",
        "Functional Class Nomenclature Detection",
        "P-51.2",
        ExecutionPhase.FUNCTIONAL_GROUP,
        "Set useFunctionalClass to false",
      );
    }
    return updatedContext;
  },
};

// Ester detection and lactone conversion rules moved to ./functional-groups-layer/ester-detection.ts

// Priority selection functions moved to ./functional-groups-layer/priority-selection.ts
// Detector functions moved to ./functional-groups-layer/simple-detectors.ts
// Helper functions moved to ./functional-groups-layer/utils.ts

/**
 * Rule: Convert Ethers to Alkoxy Substituents
 *
 * When an ether is NOT the principal functional group, it should be named as an alkoxy substituent
 * (methoxy, ethoxy, propoxy, etc.) rather than "ether"
 *
 * Example: COC1CCCC(=O)CC1 → 4-methoxycycloheptan-1-one (not "4-ether...")
 */
export const ETHER_TO_ALKOXY_RULE: IUPACRule = {
  id: "ether-to-alkoxy-conversion",
  name: "Convert Ethers to Alkoxy Substituents",
  description:
    "Convert non-principal ethers to alkoxy substituent names (methoxy, ethoxy, propoxy)",
  blueBookReference: "P-63.2.2 - Ethers as substituents",
  priority: RulePriority.THREE, // 30 - Runs late, after lactone conversion (40)
  conditions: (context: ImmutableNamingContext) => {
    const functionalGroups = context.getState().functionalGroups;
    const principalGroup = context.getState().principalGroup;
    const hasEther = functionalGroups.some(
      (g) =>
        g.type === "ether" &&
        (!principalGroup || g.type !== principalGroup.type),
    );

    return hasEther;
  },
  action: (context: ImmutableNamingContext) => {
    const _mol = context.getState().molecule;
    const functionalGroups = context.getState().functionalGroups;
    const principalGroup = context.getState().principalGroup;

    // Get main chain info if available to help identify which carbon is on main chain
    const parentStructure = context.getState().parentStructure;
    const _mainChainAtoms = parentStructure?.chain?.atoms
      ? new Set(
          parentStructure.chain.atoms.map((a) =>
            typeof a === "number" ? a : a.id,
          ),
        )
      : null;

    const updatedGroups = functionalGroups.map((fg) => {
      // Only convert ethers that are NOT the principal group
      if (
        fg.type === "ether" &&
        (!principalGroup || fg.type !== principalGroup.type)
      ) {
        // Convert ether to alkoxy type
        // The actual alkoxy name (methoxy, ethoxy, etc.) will be determined later
        // during name assembly when the main chain is known
        return {
          ...fg,
          type: "alkoxy",
          // Don't set prefix here - it will be determined in name assembly with proper context
          prefix: undefined,
        };
      }
      return fg;
    });

    return context.withFunctionalGroups(
      updatedGroups,
      "ether-to-alkoxy-conversion",
      "Convert Ethers to Alkoxy Substituents",
      "P-63.2.2",
      ExecutionPhase.FUNCTIONAL_GROUP,
      "Converted non-principal ethers to alkoxy substituents",
    );
  },
};

/**
 * Rule: Analyze Alkoxy Groups
 *
 * Analyze alkoxy groups to determine their specific names (methoxy, ethoxy, etc.)
 * This must run AFTER ETHER_TO_ALKOXY_RULE and before name assembly
 */
export const ANALYZE_ALKOXY_RULE: IUPACRule = {
  id: "analyze-alkoxy-groups",
  name: "Analyze Alkoxy Groups",
  description:
    "Determine specific alkoxy names (methoxy, ethoxy, propoxy, etc.)",
  blueBookReference: "P-63.2.2 - Ethers as substituents",
  priority: RulePriority.TWO, // 20 - After ether-to-alkoxy (30), before name assembly
  conditions: (context: ImmutableNamingContext) => {
    const functionalGroups = context.getState().functionalGroups;
    return functionalGroups.some((g) => g.type === "alkoxy" && !g.prefix);
  },
  action: (context: ImmutableNamingContext) => {
    const _mol = context.getState().molecule;
    const functionalGroups = context.getState().functionalGroups;
    const parentStructure = context.getState().parentStructure;

    // Get main chain/ring atoms to help identify substituents
    const _mainChainAtoms = parentStructure?.chain?.atoms
      ? new Set(
          parentStructure.chain.atoms.map((a) =>
            typeof a === "number" ? a : a.id,
          ),
        )
      : null;

    // If no parent structure yet, mark as pending and defer analysis
    if (!parentStructure) {
      if (process.env.VERBOSE) {
        console.log(
          "[ANALYZE_ALKOXY_RULE] No parent structure yet, marking alkoxy groups as pending",
        );
      }
      const updatedGroups = functionalGroups.map((fg) => {
        if (fg.type === "alkoxy" && !fg.prefix) {
          return {
            ...fg,
            prefix: "pending-analysis",
          };
        }
        return fg;
      });

      return context.withFunctionalGroups(
        updatedGroups,
        "analyze-alkoxy-groups",
        "Analyze Alkoxy Groups",
        "P-63.2.2",
        ExecutionPhase.FUNCTIONAL_GROUP,
        "Marked alkoxy groups as pending (no parent structure yet)",
      );
    }

    const updatedGroups = functionalGroups.map((fg) => {
      if (
        fg.type === "alkoxy" &&
        !fg.prefix &&
        fg.atoms &&
        fg.atoms.length > 0
      ) {
        // Find the oxygen atom in the alkoxy group
        const oxygenAtom = fg.atoms.find((atomOrId) => {
          const atomId = typeof atomOrId === "number" ? atomOrId : atomOrId.id;
          return _mol.atoms[atomId]?.symbol === "O";
        });

        if (oxygenAtom) {
          const oxygenId =
            typeof oxygenAtom === "number" ? oxygenAtom : oxygenAtom.id;
          const oxyAtom = _mol.atoms[oxygenId];

          if (!oxyAtom) return fg; // Safety check

          // Find carbons bonded to oxygen
          const bondedCarbons = _mol.bonds
            .filter(
              (bond) =>
                (bond.atom1 === oxygenId || bond.atom2 === oxygenId) &&
                bond.type === "single",
            )
            .map((bond) => {
              const otherId = bond.atom1 === oxygenId ? bond.atom2 : bond.atom1;
              return _mol.atoms[otherId];
            })
            .filter((atom): atom is Atom => atom?.symbol === "C");

          if (bondedCarbons.length === 2) {
            // Analyze and determine alkoxy name
            const alkoxyName = analyzeAlkoxySubstituent(
              _mol,
              oxyAtom,
              bondedCarbons,
              _mainChainAtoms,
            );

            if (process.env.VERBOSE) {
              console.log(
                `[ANALYZE_ALKOXY_RULE] Oxygen ${oxygenId} → ${alkoxyName}`,
              );
            }

            return {
              ...fg,
              prefix: alkoxyName,
            };
          }
        }
      }
      return fg;
    });

    return context.withFunctionalGroups(
      updatedGroups,
      "analyze-alkoxy-groups",
      "Analyze Alkoxy Groups",
      "P-63.2.2",
      ExecutionPhase.FUNCTIONAL_GROUP,
      "Analyzed alkoxy groups and set specific names",
    );
  },
};

/**
 * Analyze an ether oxygen to determine the alkoxy substituent name
 * Returns: 'methoxy', 'ethoxy', 'propoxy', etc., or complex names for nested ethers
 * @param mainChainAtoms - Set of atom IDs that are part of the main chain (if available)
 */
function analyzeAlkoxySubstituent(
  mol: Molecule,
  oxygenAtom: Atom,
  bondedCarbons: Atom[],
  mainChainAtoms: Set<number> | null = null,
): string {
  if (bondedCarbons.length !== 2) return "oxy";

  // Analyze each carbon chain to determine which is the substituent
  // Length check above guarantees these exist
  const carbon1 = bondedCarbons[0]!;
  const carbon2 = bondedCarbons[1]!;
  const chain1Info = getAlkylChainInfo(mol, carbon1, oxygenAtom);
  const chain2Info = getAlkylChainInfo(mol, carbon2, oxygenAtom);

  if (process.env.VERBOSE) {
    console.log(`[analyzeAlkoxySubstituent] Oxygen ${oxygenAtom.id}`);
    if (process.env.VERBOSE) {
      console.log(
        `  Carbon ${carbon1.id}: count=${chain1Info.carbonCount}, hasNested=${chain1Info.hasNestedOxygen}, atoms=${chain1Info.atoms.map((a) => a.id).join(",")}`,
      );
    }
    if (process.env.VERBOSE) {
      console.log(
        `  Carbon ${carbon2.id}: count=${chain2Info.carbonCount}, hasNested=${chain2Info.hasNestedOxygen}, atoms=${chain2Info.atoms.map((a) => a.id).join(",")}`,
      );
    }
    if (process.env.VERBOSE) {
      console.log(
        `  MainChainAtoms:`,
        mainChainAtoms ? Array.from(mainChainAtoms) : "null",
      );
    }
  }

  // Determine which chain is the substituent
  let substituent: typeof chain1Info;

  // If we have main chain information, use it to determine substituent
  if (mainChainAtoms) {
    const carbon1OnMainChain = mainChainAtoms.has(carbon1.id);
    const carbon2OnMainChain = mainChainAtoms.has(carbon2.id);

    if (process.env.VERBOSE) {
      console.log(
        `  Carbon ${carbon1.id} on main chain: ${carbon1OnMainChain}`,
      );
      if (process.env.VERBOSE) {
        console.log(
          `  Carbon ${carbon2.id} on main chain: ${carbon2OnMainChain}`,
        );
      }
    }

    if (carbon1OnMainChain && !carbon2OnMainChain) {
      substituent = chain2Info;
      if (process.env.VERBOSE)
        console.log(
          `  → Chose carbon ${carbon2.id} as substituent (C${carbon1.id} on main)`,
        );
    } else if (carbon2OnMainChain && !carbon1OnMainChain) {
      substituent = chain1Info;
      if (process.env.VERBOSE)
        console.log(
          `  → Chose carbon ${carbon1.id} as substituent (C${carbon2.id} on main)`,
        );
    } else {
      // Both or neither on main chain - fall back to size heuristic
      substituent =
        chain1Info.carbonCount <= chain2Info.carbonCount
          ? chain1Info
          : chain2Info;
      if (process.env.VERBOSE)
        console.log(
          `  → Fell back to size heuristic, chose ${substituent === chain1Info ? carbon1.id : carbon2.id}`,
        );
    }
  } else {
    // No main chain info - use simple heuristic: the smaller chain is the substituent
    substituent =
      chain1Info.carbonCount <= chain2Info.carbonCount
        ? chain1Info
        : chain2Info;
    if (process.env.VERBOSE)
      console.log(
        `  → No main chain info, chose smaller: ${substituent === chain1Info ? carbon1.id : carbon2.id}`,
      );
  }

  // Check if there are nested oxygens in the substituent
  if (substituent.hasNestedOxygen) {
    // For now, mark as complex - will be handled in naming phase
    return "complex-alkoxy";
  }

  // Map chain length to alkoxy name
  const alkoxyNames: Record<number, string> = {
    1: "methoxy",
    2: "ethoxy",
    3: "propoxy",
    4: "butoxy",
    5: "pentoxy",
    6: "hexoxy",
    7: "heptoxy",
    8: "octoxy",
  };

  return alkoxyNames[substituent.carbonCount] || "oxy";
}

/**
 * Get information about an alkyl chain starting from a carbon atom
 * Detects nested oxygens and returns both carbon count and nested oxygen status
 */
function getAlkylChainInfo(
  mol: Molecule,
  startCarbon: Atom,
  oxygenAtom: Atom,
): { carbonCount: number; hasNestedOxygen: boolean; atoms: Atom[] } {
  const visited = new Set<number>([oxygenAtom.id]);
  const chain: Atom[] = [];
  let hasNestedOxygen = false;

  function traverse(atom: Atom): void {
    if (visited.has(atom.id)) return;

    // If we encounter another oxygen
    if (atom.symbol === "O") {
      visited.add(atom.id);

      // Find unvisited carbon atoms bonded to this oxygen
      const oxygenCarbonBonds = mol.bonds.filter((bond) => {
        if (bond.atom1 !== atom.id && bond.atom2 !== atom.id) return false;
        const otherId = bond.atom1 === atom.id ? bond.atom2 : bond.atom1;
        if (visited.has(otherId)) return false;
        const otherAtom = mol.atoms.find((a) => a.id === otherId);
        return otherAtom && otherAtom.symbol === "C";
      });

      // Only mark as nested ether if oxygen bridges to another carbon
      // Terminal oxygens (alcohols with no further carbons) are not nested ethers
      if (oxygenCarbonBonds.length > 0) {
        hasNestedOxygen = true;

        // Continue traversing through the oxygen to count all carbons
        for (const bond of oxygenCarbonBonds) {
          const otherId = bond.atom1 === atom.id ? bond.atom2 : bond.atom1;
          const otherAtom = mol.atoms.find((a) => a.id === otherId);
          if (otherAtom) {
            traverse(otherAtom);
          }
        }
      }
      // If oxygenCarbonBonds.length === 0, it's a terminal OH (alcohol), don't traverse
      return;
    }

    if (atom.symbol !== "C") return;

    visited.add(atom.id);
    chain.push(atom);

    // Find all single bonds to other atoms
    const bonds = mol.bonds.filter((bond) => {
      if (bond.type !== "single") return false;
      if (bond.atom1 !== atom.id && bond.atom2 !== atom.id) return false;

      const otherId = bond.atom1 === atom.id ? bond.atom2 : bond.atom1;
      return !visited.has(otherId);
    });

    for (const bond of bonds) {
      const otherId = bond.atom1 === atom.id ? bond.atom2 : bond.atom1;
      const otherAtom = mol.atoms.find((a) => a.id === otherId);
      if (otherAtom) {
        traverse(otherAtom);
      }
    }
  }

  traverse(startCarbon);
  return { carbonCount: chain.length, hasNestedOxygen, atoms: chain };
}

/**
 * Export all functional group layer rules
 */
export const FUNCTIONAL_GROUP_LAYER_RULES: IUPACRule[] = [
  CARBOXYLIC_ACID_RULE,
  KETONE_DETECTION_RULE,
  ALCOHOL_DETECTION_RULE,
  AMINE_DETECTION_RULE,
  ESTER_DETECTION_RULE,
  LACTONE_TO_KETONE_RULE, // Convert cyclic esters to ketones
  FUNCTIONAL_GROUP_PRIORITY_RULE,
  ETHER_TO_ALKOXY_RULE,
  ANALYZE_ALKOXY_RULE, // Analyze alkoxy groups and set specific names
  FUNCTIONAL_CLASS_RULE,
];
