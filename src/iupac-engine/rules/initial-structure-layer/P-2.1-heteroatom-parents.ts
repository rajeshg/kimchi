/**
 * Blue Book Rule P-2: Parent Hydride Names
 *
 * Reference: IUPAC Blue Book 2013, Section P-2
 * https://iupac.qmul.ac.uk/BlueBook/P2.html
 *
 * Description: Parent hydrides are the fundamental structures for substitutive
 * nomenclature. This rule implements P-2.1 for heteroatom parent hydrides.
 *
 * Examples:
 * - SiH4 → silane
 * - PH3 → phosphine
 * - AsH3 → arsine
 * - SbH3 → stibine
 * - BiH3 → bismuthine
 * - GeH4 → germane
 * - SnH4 → stannane
 * - PbH4 → plumbane
 */

import {
  ImmutableNamingContext,
  ExecutionPhase,
} from "../../immutable-context";
import type { IUPACRule } from "../../types";

// Load OPSIN rules to reuse alkane stems and substituent aliases where helpful
// eslint-disable-next-line @typescript-eslint/no-var-requires
const OPSIN_RULES: any = require("../../../../opsin-rules.json");

// Parent hydride definitions per IUPAC P-2.1
const HETEROATOM_PARENT_HYDRIDES: Record<
  string,
  { name: string; valence: number }
> = {
  // Group 14: silane family
  Si: { name: "silane", valence: 4 },
  Ge: { name: "germane", valence: 4 },
  Sn: { name: "stannane", valence: 4 },
  Pb: { name: "plumbane", valence: 4 },

  // Group 15: phosphine family
  P: { name: "phosphine", valence: 3 },
  As: { name: "arsine", valence: 3 },
  Sb: { name: "stibine", valence: 3 },
  Bi: { name: "bismuthine", valence: 3 },
};

/**
 * Rule P-2.1: Heteroatom Parent Hydride Selection
 *
 * Selects heteroatom parent hydrides when the molecule consists primarily
 * of a single heteroatom bonded to hydrogen atoms.
 */
export const P2_1_HETEROATOM_PARENT_HYDRIDE_RULE: IUPACRule = {
  id: "P-2.1",
  name: "Heteroatom Parent Hydride Selection",
  description:
    "Select heteroatom parent hydride as parent structure per Blue Book P-2.1",
  blueBookReference: "P-2.1 - Parent hydrides for elements other than carbon",
  priority: 150, // High priority - run early in parent structure phase
  conditions: (context: ImmutableNamingContext) => {
    const molecule = context.getState().molecule;

    // Skip if parent structure already selected
    if (context.getState().parentStructure) {
      if (process.env.VERBOSE)
        console.log("P-2.1: parent structure already selected");
      return false;
    }

    // Check for heteroatom molecules with correct valence
    const heteroatoms = molecule.atoms.filter(
      (atom) =>
        atom.symbol !== "C" &&
        atom.symbol !== "H" &&
        HETEROATOM_PARENT_HYDRIDES[atom.symbol],
    );

    if (process.env.VERBOSE)
      console.log(
        "P-2.1: Found heteroatoms:",
        heteroatoms.map((a) => a.symbol),
      );

    // Must have exactly one heteroatom
    if (heteroatoms.length !== 1) {
      if (process.env.VERBOSE)
        console.log("P-2.1: Expected 1 heteroatom, found:", heteroatoms.length);
      return false;
    }

    const heteroatom = heteroatoms[0]!;
    const hydrideDef = HETEROATOM_PARENT_HYDRIDES[heteroatom.symbol];

    if (!hydrideDef) {
      if (process.env.VERBOSE)
        console.log("P-2.1: No hydride definition for:", heteroatom.symbol);
      return false;
    }

    // Calculate total valence: sum of bond orders + implicit hydrogens
    const implicitHydrogens = heteroatom.hydrogens || 0;
    const heteroatomIndex = molecule.atoms.indexOf(heteroatom);
    const bondOrders = molecule.bonds
      .filter(
        (bond) =>
          bond.atom1 === heteroatomIndex || bond.atom2 === heteroatomIndex,
      )
      .reduce((sum, bond) => {
        const order =
          bond.type === "single"
            ? 1
            : bond.type === "double"
              ? 2
              : bond.type === "triple"
                ? 3
                : 1;
        return sum + order;
      }, 0);

    const totalValence = bondOrders + implicitHydrogens;

    if (process.env.VERBOSE) {
      console.log(
        `P-2.1: Heteroatom ${heteroatom.symbol}: bondOrders=${bondOrders}, implicitH=${implicitHydrogens}, total=${totalValence}, expected=${hydrideDef.valence}`,
      );
    }

    // Must match the expected valence for the hydride
    return totalValence === hydrideDef.valence;
  },
  action: (context: ImmutableNamingContext) => {
    const molecule = context.getState().molecule;
    const heteroatom = molecule.atoms.find(
      (atom) =>
        atom.symbol !== "C" &&
        atom.symbol !== "H" &&
        HETEROATOM_PARENT_HYDRIDES[atom.symbol],
    )!;

    console.log("P-2 selecting heteroatom parent:", heteroatom.symbol);

    const hydrideDef = HETEROATOM_PARENT_HYDRIDES[heteroatom.symbol]!;

    // Create parent structure for heteroatom hydride
    const parentStructure = {
      type: "heteroatom" as const,
      heteroatom: heteroatom,
      name: hydrideDef.name,
      locants: [],
      substituents: [],
      multipleBonds: [],
    };

    return context.withParentStructure(
      parentStructure,
      "P-2.1",
      "Heteroatom Parent Hydride Selection",
      "P-2.1",
      ExecutionPhase.PARENT_STRUCTURE,
      `Selected ${hydrideDef.name} as parent hydride for ${heteroatom.symbol}H${hydrideDef.valence}`,
    );
  },
};

/**
 * Rule P-2.2: Carbon Parent Hydride Selection (Alkanes)
 *
 * For completeness, this rule handles simple alkane parent hydrides.
 * Note: Complex chain selection is handled by P-44.3 rules.
 */
export const P2_2_CARBON_PARENT_HYDRIDE_RULE: IUPACRule = {
  id: "P-2.2",
  name: "Carbon Parent Hydride Selection",
  description:
    "Select carbon parent hydride (alkane) as parent structure per Blue Book P-2.2",
  blueBookReference: "P-2.2 - Parent hydrides for carbon chains",
  priority: 50, // Run after chain selection
  conditions: (context: ImmutableNamingContext) => {
    const molecule = context.getState().molecule;

    // Skip if parent structure already selected
    if (context.getState().parentStructure) {
      return false;
    }

    // Skip if functional groups are detected (alcohols, etc.)
    const functionalGroups = context.getState().functionalGroups;
    console.error(
      `P2_2 conditions: functionalGroups.length = ${functionalGroups ? functionalGroups.length : "undefined"}`,
    );
    if (functionalGroups && functionalGroups.length > 0) {
      return false;
    }

    // Check for simple hydrocarbon molecules (methane, ethane, etc.)
    const carbons = molecule.atoms.filter((a) => a.symbol === "C");
    const heteroatoms = molecule.atoms.filter(
      (a) => a.symbol !== "C" && a.symbol !== "H",
    );

    // Must have carbons and no heteroatoms
    if (carbons.length === 0 || heteroatoms.length > 0) {
      return false;
    }

    // Must be saturated (alkane) - only single bonds
    // This is a simplified check - complex chains handled by P-44.3
    // Only apply to linear alkanes (single candidate chain)
    const candidateChains = context.getState().candidateChains;
    return (
      carbons.length <= 10 &&
      molecule.bonds.every((bond) => bond.type === "single") &&
      candidateChains &&
      candidateChains.length === 1
    );
  },
  action: (context: ImmutableNamingContext) => {
    const molecule = context.getState().molecule;
    const carbonCount = molecule.atoms.filter((a) => a.symbol === "C").length;

    // Get alkane name: prefer opsin stem mapping (repeated 'C' key), fallback to built-in
    const defaultAlkaneNames = [
      "",
      "methane",
      "ethane",
      "propane",
      "butane",
      "pentane",
      "hexane",
      "heptane",
      "octane",
      "nonane",
      "decane",
    ];
    let name = `${carbonCount}-ane`;
    try {
      const alkaneKey = "C".repeat(Math.max(1, carbonCount));
      const stem =
        OPSIN_RULES && OPSIN_RULES.alkanes && OPSIN_RULES.alkanes[alkaneKey];
      if (stem) {
        name = `${stem}ane`;
      } else if (carbonCount < defaultAlkaneNames.length) {
        name = defaultAlkaneNames[carbonCount] || `${carbonCount}-ane`;
      }
    } catch (e) {
      // fallback
      if (carbonCount < defaultAlkaneNames.length)
        name = defaultAlkaneNames[carbonCount] || `${carbonCount}-ane`;
      else name = `${carbonCount}-ane`;
    }

    // Create parent structure for alkane
    const parentStructure = {
      type: "chain" as const,
      name: name,
      locants: [],
      substituents: [],
      multipleBonds: [],
    };

    return context.withParentStructure(
      parentStructure,
      "P-2.2",
      "Carbon Parent Hydride Selection",
      "P-2.2",
      ExecutionPhase.PARENT_STRUCTURE,
      `Selected ${name} as parent hydride for C${carbonCount}H${2 * carbonCount + 2}`,
    );
  },
};

/**
 * Export all P-2 parent hydride rules
 */
export const P2_PARENT_HYDRIDE_RULES: IUPACRule[] = [
  P2_1_HETEROATOM_PARENT_HYDRIDE_RULE,
  // P2_2_CARBON_PARENT_HYDRIDE_RULE, // Removed to avoid conflict with chain selection
];
