import type { IUPACRule, FunctionalGroup } from "../../types";
import { RulePriority } from "../../types";
import type { Atom } from "types";
import {
  ExecutionPhase,
  ImmutableNamingContext,
} from "../../immutable-context";
import type { ContextState } from "../../immutable-context";
import { optimizeLocantSet, getPrincipalGroupLocantFromSet } from "./helpers";

export const P14_3_PRINCIPAL_GROUP_NUMBERING_RULE: IUPACRule = {
  id: "P-14.3",
  name: "Principal Group Numbering",
  description: "Assign lowest locant to principal group (P-14.3)",
  blueBookReference: "P-14.3 - Numbering of principal group",
  priority: RulePriority.EIGHT,
  conditions: (context: ImmutableNamingContext) => {
    const state = context.getState();
    const parentStructure = state.parentStructure;
    const functionalGroups = state.functionalGroups;

    return !!(
      parentStructure &&
      functionalGroups &&
      functionalGroups.length > 0
    );
  },
  action: (context: ImmutableNamingContext) => {
    const state = context.getState();
    const parentStructure = state.parentStructure;
    const functionalGroups = state.functionalGroups;

    if (
      !parentStructure ||
      !functionalGroups ||
      functionalGroups.length === 0
    ) {
      return context;
    }

    const principalGroups = functionalGroups.filter(
      (g: FunctionalGroup) => g.isPrincipal,
    );

    if (principalGroups.length === 0) {
      return context;
    }

    const firstPrincipal = principalGroups[0];

    if (process.env.VERBOSE) {
      console.log("[P-14.3] Principal group:", firstPrincipal?.type);
      console.log(
        "[P-14.3] Number of principal groups:",
        principalGroups.length,
      );
      console.log(
        "[P-14.3] Principal group atoms:",
        principalGroups.map((g) => g.atoms),
      );
      console.log(
        "[P-14.3] Principal group bonds:",
        principalGroups.map((g) => g.bonds),
      );
      console.log(
        "[P-14.3] Parent chain atoms:",
        parentStructure.chain?.atoms.map((a: Atom) => a.id),
      );
      console.log("[P-14.3] Parent chain locants:", parentStructure.locants);
    }

    let principalLocants: number[];
    let optimizedLocants = parentStructure.locants;

    if (parentStructure.type === "chain" && principalGroups.length === 1) {
      const firstPrincipalGroup = principalGroups[0]!;
      optimizedLocants = optimizeLocantSet(
        parentStructure,
        firstPrincipalGroup,
      );

      parentStructure.locants = optimizedLocants;

      principalLocants = [
        getPrincipalGroupLocantFromSet(
          parentStructure,
          firstPrincipalGroup,
          optimizedLocants,
        ),
      ];
    } else {
      if (process.env.VERBOSE) {
        console.log(
          `[P-14.3 MULTI-PRINCIPAL] Processing ${principalGroups.length} principal groups`,
        );
        console.log(
          `[P-14.3 MULTI-PRINCIPAL] parentStructure.type=${parentStructure.type}`,
        );
        console.log(
          `[P-14.3 MULTI-PRINCIPAL] parentStructure.locants=${JSON.stringify(parentStructure.locants)}`,
        );
        console.log(
          `[P-14.3 MULTI-PRINCIPAL] ring atoms=${parentStructure.ring?.atoms.map((a: Atom) => a.id)}`,
        );
      }
      principalLocants = principalGroups.map((group) => {
        const locant = getPrincipalGroupLocantFromSet(
          parentStructure,
          group,
          parentStructure.locants,
        );
        if (process.env.VERBOSE) {
          console.log(
            `[P-14.3 MULTI-PRINCIPAL] Group ${group.type} atom ${group.atoms[0]?.id}:${group.atoms[0]?.symbol} → locant ${locant}`,
          );
          console.log(
            `[P-14.3 MULTI-PRINCIPAL] Group atoms array:`, group.atoms.map((a: Atom) => `${a.id}:${a.symbol}`)
          );
        }
        return locant;
      });
    }

    if (process.env.VERBOSE) {
      console.log("[P-14.3] Calculated principal locants:", principalLocants);
    }

    let principalIdx = 0;
    const updatedFunctionalGroups = functionalGroups.map(
      (group: FunctionalGroup) => {
        if (group.isPrincipal && principalIdx < principalLocants.length) {
          const locant = principalLocants[principalIdx]!;
          principalIdx++;

          if (process.env.VERBOSE) {
            console.log(
              `[P-14.3 PRINCIPAL] Processing principal group ${group.type}: locant=${locant}, group.locants=${JSON.stringify(group.locants)}, locantsConverted=${group.locantsConverted}, ringNumberingApplied=${parentStructure.ringNumberingApplied}`,
            );
          }

          // If ring numbering has already been applied, preserve the existing locants array
          // Ring numbering handles multiple principal groups on rings correctly
          if (
            parentStructure.ringNumberingApplied &&
            group.locants &&
            group.locants.length > 0
          ) {
            if (process.env.VERBOSE) {
              console.log(
                `[P-14.3] Preserving ring-numbered locants for ${group.type}: ${JSON.stringify(group.locants)}`,
              );
            }
            return {
              ...group,
              locant: group.locants[0] ?? locant,
            };
          }

          return {
            ...group,
            locant: locant,
            locants: [locant],
          };
        }

        // For non-principal groups, convert atom IDs to chain positions
        // Skip if already converted by P-14.2
        if (
          !group.isPrincipal &&
          group.locants &&
          !group.locantsConverted &&
          parentStructure.type === "chain" &&
          parentStructure.chain
        ) {
          const chainAtomIds = parentStructure.chain.atoms.map(
            (a: Atom) => a.id,
          );
          const molecule = context.getState().molecule;
          
          if (process.env.VERBOSE) {
            console.log(
              `[P-14.3 DEBUG] ${group.type}: input locants=${JSON.stringify(group.locants)}, chainAtomIds=${JSON.stringify(chainAtomIds)}, optimizedLocants=${JSON.stringify(optimizedLocants)}`,
            );
          }
          
          const convertedLocants = group.locants.map((atomId: number) => {
            const position = chainAtomIds.indexOf(atomId);
            if (position !== -1) {
              // Convert to 1-based position using the optimized locant set
              const result = optimizedLocants[position] ?? position + 1;
              if (process.env.VERBOSE) {
                console.log(`[P-14.3 CONVERT] atomId=${atomId} in chain at pos=${position} → locant=${result}`);
              }
              return result;
            }
            
            // Atom not in chain - find which chain atom it's bonded to
            if (molecule?.bonds) {
              for (const bond of molecule.bonds) {
                let chainAtomId: number | undefined;
                if (bond.atom1 === atomId && chainAtomIds.includes(bond.atom2)) {
                  chainAtomId = bond.atom2;
                } else if (bond.atom2 === atomId && chainAtomIds.includes(bond.atom1)) {
                  chainAtomId = bond.atom1;
                }
                
                if (chainAtomId !== undefined) {
                  const chainPos = chainAtomIds.indexOf(chainAtomId);
                  if (chainPos !== -1) {
                    const result = optimizedLocants[chainPos] ?? chainPos + 1;
                    if (process.env.VERBOSE) {
                      console.log(`[P-14.3 CONVERT] atomId=${atomId} NOT in chain, bonded to chain atom ${chainAtomId} at pos=${chainPos} → locant=${result}`);
                    }
                    return result;
                  }
                }
              }
            }
            
            if (process.env.VERBOSE) {
              console.log(`[P-14.3 CONVERT] atomId=${atomId} fallback → returning atomId=${atomId}`);
            }
            return atomId; // Fallback to atom ID if not found in chain
          });

          if (process.env.VERBOSE) {
            console.log(
              `[P-14.3] Non-principal group ${group.type}: atom IDs ${group.locants} → positions ${convertedLocants}`,
            );
          }

          return {
            ...group,
            locants: convertedLocants,
            locantsConverted: true, // Mark that locants have been converted
          };
        }

        return group;
      },
    );

    if (process.env.VERBOSE) {
      console.log(
        "[P-14.3 FINAL] Updated functional groups:",
        updatedFunctionalGroups.map(g => ({ type: g.type, isPrincipal: g.isPrincipal, locants: g.locants, locant: g.locant }))
      );
    }

    return context.withStateUpdate(
      (state: ContextState) => ({
        ...state,
        functionalGroups: updatedFunctionalGroups,
      }),
      "P-14.3",
      "Principal Group Numbering",
      "P-14.3",
      ExecutionPhase.NUMBERING,
      `Assigned locants ${principalLocants.join(",")} to ${principalGroups.length} principal group(s): ${firstPrincipal?.type}`,
    );
  },
};
