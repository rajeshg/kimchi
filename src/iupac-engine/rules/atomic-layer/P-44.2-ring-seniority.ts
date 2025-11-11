import type { IUPACRule } from "../../types";
import { RulePriority } from "../../types";
import type { ImmutableNamingContext } from "../../immutable-context";
import { ExecutionPhase } from "../../immutable-context";
import type { RingSystem } from "../../types";
import { RingSystemType } from "../../types";
import type { Atom, Bond } from "types";

/**
 * Rule: P-44.2 - Ring System Seniority
 * Seeds candidate rings from parser-provided ring detection
 */
export const P_44_2_RING_SENIORITY: IUPACRule = {
  id: "atomic-seed-rings",
  name: "Seed Candidate Rings from Parser",
  description: "Seed candidateRings state from parser-provided rings",
  blueBookReference: "P-44.2 - Ring system seniority",
  priority: RulePriority.FIVE,
  conditions: (context: ImmutableNamingContext) => {
    const state = context.getState();
    return (
      Array.isArray(state.molecule?.rings) &&
      state.molecule.rings.length > 0 &&
      !state.candidateRings
    );
  },
  action: (context: ImmutableNamingContext) => {
    const molecule = context.getState().molecule;
    if (!molecule || !Array.isArray(molecule.rings)) return context;
    const ringSystems: RingSystem[] = [];
    for (const ringIdxs of molecule.rings) {
      const atoms = ringIdxs
        .map((i: number) => molecule.atoms[i])
        .filter(Boolean);
      if (atoms.length < 3) continue;
      const bonds = molecule.bonds.filter(
        (b: Bond) => ringIdxs.includes(b.atom1) && ringIdxs.includes(b.atom2),
      );
      const hasAromatic = atoms.some((a: Atom) => !!a.aromatic);
      const hasHetero = atoms.some(
        (a: Atom) => a.symbol !== "C" && a.symbol !== "H",
      );
      const type: RingSystemType = hasAromatic
        ? RingSystemType.AROMATIC
        : hasHetero
          ? RingSystemType.HETEROCYCLIC
          : RingSystemType.ALIPHATIC;
      ringSystems.push({
        atoms,
        bonds,
        rings: [ringIdxs],
        size: atoms.length,
        ringCount: 1, // Single ring system
        heteroatoms: atoms.filter((a: Atom) => a.symbol !== "C"),
        type,
        fused: false,
        bridged: false,
        spiro: false,
      });
    }
    if (ringSystems.length === 0) return context;
    return context.withStateUpdate(
      (state) => ({ ...state, candidateRings: ringSystems }),
      "atomic-seed-rings",
      "Seed Candidate Rings from Parser",
      "P-44.2",
      ExecutionPhase.NOMENCLATURE_SELECTION,
      `Seeded ${ringSystems.length} candidate ring(s) from parser`,
    );
  },
};
