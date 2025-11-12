import type { IUPACRule, FunctionalGroup } from "../../types";
import { RulePriority } from "../../types";
import type { ImmutableNamingContext } from "../../immutable-context";
import { ExecutionPhase } from "../../immutable-context";
import type { Molecule, Atom, Bond } from "../../../../types";

type RawFunctionalGroup = {
  type: string;
  suffix?: string;
  prefix?: string;
  priority: number;
  atoms: Atom[];
  bonds: Bond[];
  isPrincipal: boolean;
  locants: number[];
};

/**
 * Normalize detector-provided priorities to the engine's static scale.
 * OPSIN/other detectors often return small numbers (e.g., 1..12). The engine
 * uses larger static values (roughly 80..100). To compare fairly, rescale
 * small detector priorities into the static range. If a priority already
 * appears to be on the engine scale (>20) leave it unchanged.
 *
 * IMPORTANT: OPSIN uses inverted scale (1=highest, 12=lowest) while engine
 * uses normal scale (100=highest, 0=lowest). We must invert during normalization.
 */
function normalizePriority(p: number): number {
  if (typeof p !== "number" || Number.isNaN(p)) return 0;
  if (p > 20) return p; // assume already in engine scale
  const detectorMax = 19; // maximum priority in OPSIN detector (borane = 19)
  // Invert OPSIN scale: (detectorMax + 1 - p) makes 1→19, 19→1
  // Then scale to engine range: /detectorMax * 100
  return Math.round(((detectorMax + 1 - p) / detectorMax) * 100);
}

function isCarbonyl(atom1: Atom, atom2: Atom): boolean {
  return (
    (atom1.symbol === "C" && atom2.symbol === "O") ||
    (atom2.symbol === "C" && atom1.symbol === "O")
  );
}

function getCarbonFromCarbonyl(atom1: Atom, atom2: Atom): Atom {
  return atom1.symbol === "C" ? atom1 : atom2;
}

function findOHBond(carbon: Atom, molecules: Molecule): Bond | null {
  for (const bond of molecules.bonds) {
    if (bond.atom1 === carbon.id || bond.atom2 === carbon.id) {
      const otherId = bond.atom1 === carbon.id ? bond.atom2 : bond.atom1;
      const otherAtom = molecules.atoms.find((a: Atom) => a.id === otherId);
      if (otherAtom && otherAtom.symbol === "O") {
        // Check for H bonded to O
        for (const bond2 of molecules.bonds) {
          if (bond2.atom1 === otherAtom.id || bond2.atom2 === otherAtom.id) {
            const otherId2 =
              bond2.atom1 === otherAtom.id ? bond2.atom2 : bond2.atom1;
            const otherAtom2 = molecules.atoms.find(
              (a: Atom) => a.id === otherId2,
            );
            if (otherAtom2 && otherAtom2.symbol === "H") {
              return bond2;
            }
          }
        }
      }
    }
  }
  return null;
}

/**
 * Detect carboxylic acid groups (-COOH)
 */
function detectCarboxylicAcids(
  context: ImmutableNamingContext,
): RawFunctionalGroup[] {
  const carboxylicAcids: RawFunctionalGroup[] = [];
  const molecules = context.getState().molecule;

  // Look for C=O bonds followed by O-H
  for (const bond of molecules.bonds) {
    if (bond.type === "double") {
      const atom1 = molecules.atoms.find((a: Atom) => a.id === bond.atom1);
      const atom2 = molecules.atoms.find((a: Atom) => a.id === bond.atom2);

      if (atom1 && atom2 && isCarbonyl(atom1, atom2)) {
        // Check if attached to OH
        const carbon = getCarbonFromCarbonyl(atom1, atom2);
        const ohBond = findOHBond(carbon, molecules);

        if (ohBond) {
          const atom1 = molecules.atoms.find(
            (a: Atom) => a.id === ohBond.atom1,
          );
          const atom2 = molecules.atoms.find(
            (a: Atom) => a.id === ohBond.atom2,
          );
          if (!atom1 || !atom2) continue;

          carboxylicAcids.push({
            type: "carboxylic_acid",
            atoms: [carbon, atom1, atom2],
            bonds: [bond, ohBond],
            suffix: "oic acid",
            priority: normalizePriority(
              context
                .getDetector()
                .getFunctionalGroupPriority("carboxylic_acid") || 0,
            ),
            isPrincipal: false,
            locants: [carbon.id],
          });
        }
      }
    }
  }

  return carboxylicAcids;
}

/**
 * Detect alcohol groups (-OH)
 */
function detectAlcohols(context: ImmutableNamingContext): RawFunctionalGroup[] {
  const alcohols: RawFunctionalGroup[] = [];
  const molecules = context.getState().molecule;

  for (const atom of molecules.atoms) {
    if (atom.symbol === "O") {
      const bonds = molecules.bonds.filter(
        (b: Bond) =>
          (b.atom1 === atom.id || b.atom2 === atom.id) && b.type === "single",
      );

      // Check if oxygen is bonded to carbon and has one hydrogen (implicit or explicit)
      const carbonBonds = bonds.filter((b: Bond) => {
        const otherId = b.atom1 === atom.id ? b.atom2 : b.atom1;
        const otherAtom = molecules.atoms.find((a: Atom) => a.id === otherId);
        return otherAtom && otherAtom.symbol === "C";
      });

      const hydrogenBonds = bonds.filter((b: Bond) => {
        const otherId = b.atom1 === atom.id ? b.atom2 : b.atom1;
        const otherAtom = molecules.atoms.find((a: Atom) => a.id === otherId);
        return otherAtom && otherAtom.symbol === "H";
      });

      // Check for implicit hydrogens if no explicit H bonds found
      const totalHydrogens = hydrogenBonds.length + (atom.hydrogens || 0);

      if (carbonBonds.length === 1 && totalHydrogens === 1) {
        // Get the carbon atom that the oxygen is bonded to
        const carbonBond = carbonBonds[0];
        if (!carbonBond) continue;

        const carbonId =
          carbonBond.atom1 === atom.id ? carbonBond.atom2 : carbonBond.atom1;
        const carbonAtom = molecules.atoms.find((a: Atom) => a.id === carbonId);

        if (process.env.VERBOSE) {
          console.log(
            `[ALCOHOL DETECTION] Oxygen atom ${atom.id} bonded to carbon atom ${carbonId}`,
          );
          if (process.env.VERBOSE) {
            console.log(`[ALCOHOL DETECTION] Carbon atom:`, carbonAtom);
          }
        }

        if (carbonAtom) {
          alcohols.push({
            type: "alcohol",
            atoms: [carbonAtom], // Store carbon atom, not oxygen
            bonds: carbonBonds, // Only include the C-O bond
            suffix: "ol",
            prefix: "hydroxy",
            priority: normalizePriority(
              context.getDetector().getFunctionalGroupPriority("alcohol") || 0,
            ),
            isPrincipal: false,
            locants: [carbonId], // Set locant to carbon atom ID (P-14.3 will convert to chain position)
          });
        }
      }
    }
  }

  return alcohols;
}

/**
 * Detect amine groups (-NH2, -NHR, -NR2)
 */
function detectAmines(context: ImmutableNamingContext): RawFunctionalGroup[] {
  const amines: RawFunctionalGroup[] = [];
  const molecules = context.getState().molecule;

  if (process.env.VERBOSE) {
    console.log(`[detectAmines] Molecule has ${molecules.atoms.length} atoms`);
  }

  for (const atom of molecules.atoms) {
    if (atom.symbol === "N") {
      if (process.env.VERBOSE) {
        console.log(`[detectAmines] Found N atom ID ${atom.id}`);
      }
      const bonds = molecules.bonds.filter(
        (b: Bond) =>
          (b.atom1 === atom.id || b.atom2 === atom.id) && b.type === "single",
      );

      if (process.env.VERBOSE) {
        console.log(`[detectAmines]   Total single bonds: ${bonds.length}`);
      }

      const carbonBonds = bonds.filter((b: Bond) => {
        const otherId = b.atom1 === atom.id ? b.atom2 : b.atom1;
        const otherAtom = molecules.atoms.find((a: Atom) => a.id === otherId);
        return otherAtom && otherAtom.symbol === "C";
      });

      if (process.env.VERBOSE) {
        console.log(`[detectAmines]   Carbon bonds: ${carbonBonds.length}`);
      }

      // Track hydrogen bonds (used for debugging)
      bonds.filter((b: Bond) => {
        const otherId = b.atom1 === atom.id ? b.atom2 : b.atom1;
        const otherAtom = molecules.atoms.find((a: Atom) => a.id === otherId);
        return otherAtom && otherAtom.symbol === "H";
      });

      if (carbonBonds.length > 0) {
        if (process.env.VERBOSE) {
          console.log(
            `[detectAmines]   Adding amine functional group for N atom ${atom.id}`,
          );
        }
        amines.push({
          type: "amine",
          atoms: [atom],
          bonds: bonds,
          suffix: "amine",
          prefix: "amino",
          priority: normalizePriority(
            context.getDetector().getFunctionalGroupPriority("amine") || 0,
          ),
          isPrincipal: false,
          locants: [atom.id],
        });
      }
    }
  }

  if (process.env.VERBOSE) {
    console.log(`[detectAmines] Total amines detected: ${amines.length}`);
  }

  return amines;
}

/**
 * Detect ketone groups (>C=O)
 */
function detectKetones(context: ImmutableNamingContext): RawFunctionalGroup[] {
  const ketones: RawFunctionalGroup[] = [];
  const molecules = context.getState().molecule;

  for (const bond of molecules.bonds) {
    if (bond.type === "double") {
      const atom1 = molecules.atoms.find((a: Atom) => a.id === bond.atom1);
      const atom2 = molecules.atoms.find((a: Atom) => a.id === bond.atom2);

      if (atom1 && atom2 && isCarbonyl(atom1, atom2)) {
        // Check if the carbon is not part of carboxylic acid
        const carbon = getCarbonFromCarbonyl(atom1, atom2);

        // Simple heuristic: if carbon has two other carbon bonds, it's likely a ketone
        const carbonBonds = molecules.bonds.filter(
          (b: Bond) =>
            (b.atom1 === carbon.id || b.atom2 === carbon.id) &&
            b.type === "single",
        );

        const carbonAtomBonds = carbonBonds.filter((b: Bond) => {
          const otherId = b.atom1 === carbon.id ? b.atom2 : b.atom1;
          const otherAtom = molecules.atoms.find((a: Atom) => a.id === otherId);
          return otherAtom && otherAtom.symbol === "C";
        });

        if (carbonAtomBonds.length === 2) {
          ketones.push({
            type: "ketone",
            atoms: [carbon, atom1, atom2],
            bonds: [bond],
            suffix: "one",
            prefix: "oxo",
            priority: normalizePriority(
              context.getDetector().getFunctionalGroupPriority("ketone") || 0,
            ),
            isPrincipal: false,
            locants: [carbon.id],
          });
        }
      }
    }
  }

  return ketones;
}

/**
 * Rule: Carboxylic Acid Detection
 *
 * Highest priority functional group
 * Example: CH3COOH → ethanoic acid
 */
export const CARBOXYLIC_ACID_RULE: IUPACRule = {
  id: "carboxylic-acid-detection",
  name: "Carboxylic Acid Detection",
  description: "Detect carboxylic acid functional groups",
  blueBookReference: "P-44.1 - Principal characteristic groups",
  priority: RulePriority.TEN, // 100 - Carboxylic acids have highest priority
  conditions: (context: ImmutableNamingContext) =>
    context.getState().molecule.bonds.length > 0,
  action: (context: ImmutableNamingContext) => {
    const carboxylicAcids: FunctionalGroup[] = detectCarboxylicAcids(context);
    let updatedContext = context;
    if (carboxylicAcids.length > 0) {
      // Append to any existing functional groups instead of overwriting
      const existing = context.getState().functionalGroups || [];
      updatedContext = updatedContext.withFunctionalGroups(
        existing.concat(carboxylicAcids),
        "carboxylic-acid-detection",
        "Carboxylic Acid Detection",
        "P-44.1.1",
        ExecutionPhase.FUNCTIONAL_GROUP,
        "Detected carboxylic acid groups",
      );
      updatedContext = updatedContext.withStateUpdate(
        (state) => ({
          ...state,
          principalGroup: carboxylicAcids[0],
          functionalGroupPriority:
            context
              .getDetector()
              .getFunctionalGroupPriority("carboxylic_acid") || 0,
        }),
        "carboxylic-acid-detection",
        "Carboxylic Acid Detection",
        "P-44.1.1",
        ExecutionPhase.FUNCTIONAL_GROUP,
        "Set principal group to carboxylic acid and priority to 1",
      );
    }
    return updatedContext;
  },
};

/**
 * Rule: Alcohol Detection
 *
 * Medium priority functional group
 * Example: CH3CH2OH → ethanol
 */
export const ALCOHOL_DETECTION_RULE: IUPACRule = {
  id: "alcohol-detection",
  name: "Alcohol Detection",
  description: "Detect alcohol functional groups",
  blueBookReference: "P-44.1 - Principal characteristic groups",
  priority: RulePriority.EIGHT, // 80 - Alcohols detected early
  conditions: (context: ImmutableNamingContext) =>
    context.getState().molecule.atoms.length > 0,
  action: (context: ImmutableNamingContext) => {
    const alcohols: FunctionalGroup[] = detectAlcohols(context);
    if (process.env.VERBOSE && alcohols.length > 0) {
      console.log("[ALCOHOL RULE ACTION] Detected alcohols:", alcohols.length);
      for (const alc of alcohols) {
        console.log(
          `[ALCOHOL RULE ACTION] Alcohol atoms:`,
          alc.atoms.map((a) => `${a.id}:${a.symbol}`),
        );
        console.log(`[ALCOHOL RULE ACTION] Alcohol locants:`, alc.locants);
      }
    }
    let updatedContext = context;
    if (alcohols.length > 0) {
      // Append alcohol detections to pre-existing functional groups
      const existing = context.getState().functionalGroups || [];
      updatedContext = updatedContext.withFunctionalGroups(
        existing.concat(alcohols),
        "alcohol-detection",
        "Alcohol Detection",
        "P-44.1.9",
        ExecutionPhase.FUNCTIONAL_GROUP,
        "Detected alcohol groups",
      );
    }
    return updatedContext;
  },
};

/**
 * Rule: Amine Detection
 *
 * Medium priority functional group
 * Example: CH3NH2 → methanamine
 */
export const AMINE_DETECTION_RULE: IUPACRule = {
  id: "amine-detection",
  name: "Amine Detection",
  description: "Detect amine functional groups",
  blueBookReference: "P-44.1 - Principal characteristic groups",
  priority: RulePriority.SEVEN, // 70 - Amines detected early
  conditions: (context: ImmutableNamingContext) =>
    context.getState().molecule.atoms.length > 0,
  action: (context: ImmutableNamingContext) => {
    const amines: FunctionalGroup[] = detectAmines(context);
    if (process.env.VERBOSE) {
      console.log(`[AMINE_DETECTION_RULE] Detected ${amines.length} amines`);
    }
    let updatedContext = context;
    if (amines.length > 0) {
      // Append amine detections to pre-existing functional groups
      const existing = context.getState().functionalGroups || [];
      if (process.env.VERBOSE) {
        console.log(
          `[AMINE_DETECTION_RULE] Existing functional groups: ${existing.length}`,
        );
      }
      updatedContext = updatedContext.withFunctionalGroups(
        existing.concat(amines),
        "amine-detection",
        "Amine Detection",
        "P-44.1.10",
        ExecutionPhase.FUNCTIONAL_GROUP,
        "Detected amine groups",
      );
      if (process.env.VERBOSE) {
        console.log(
          `[AMINE_DETECTION_RULE] Updated context with ${existing.concat(amines).length} functional groups`,
        );
      }
    }
    return updatedContext;
  },
};

/**
 * Rule: Ketone Detection
 *
 * Medium priority functional group
 * Example: CH3COCH3 → propan-2-one
 */
export const KETONE_DETECTION_RULE: IUPACRule = {
  id: "ketone-detection",
  name: "Ketone Detection",
  description: "Detect ketone groups (>C=O)",
  blueBookReference: "P-44.1.8 - Ketones",
  priority: RulePriority.NINE, // 90 - Run before alcohol (80) but after carboxylic acid (100)
  conditions: (context: ImmutableNamingContext) =>
    context.getState().molecule.bonds.length > 0,
  action: (context: ImmutableNamingContext) => {
    const ketones: FunctionalGroup[] = detectKetones(context);
    let updatedContext = context;
    if (ketones.length > 0) {
      // Append ketone detections to pre-existing functional groups
      const existing = context.getState().functionalGroups || [];
      updatedContext = updatedContext.withFunctionalGroups(
        existing.concat(ketones),
        "ketone-detection",
        "Ketone Detection",
        "P-44.1.8",
        ExecutionPhase.FUNCTIONAL_GROUP,
        "Detected ketone groups",
      );
    }
    return updatedContext;
  },
};
