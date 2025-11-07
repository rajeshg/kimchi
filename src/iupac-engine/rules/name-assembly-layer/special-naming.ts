import type { Molecule } from "types";
import type { FunctionalGroup, StructuralSubstituent } from "../../types";
import type { OPSINService } from "../../opsin-service";
import { getSharedOPSINService } from "../../opsin-service";
import { buildEsterName } from "../../naming/functional-class/ester-naming";
import { buildAmideName } from "../../naming/functional-class/amide-naming";
import { getSimpleMultiplierWithVowel } from "../../opsin-adapter";
import type {
  ParentStructureExtended,
  FunctionalGroupExtended,
  StructuralSubstituentOrFunctionalGroup,
} from "./types";
import {
  getMultiplicativePrefix,
  collectConnectedAtomsInSet,
  groupSubstituents,
  formatSubstituentGroups,
} from "./utils";
import {
  findLongestCarbonChainFromRoot,
  findSubstituentsOnChain,
  nameChainSubstituent,
} from "./chain-naming";

export function buildFunctionalClassName(
  parentStructure: ParentStructureExtended,
  functionalGroups: FunctionalGroup[],
  molecule: Molecule,
  buildSubstitutiveName: (
    ps: ParentStructureExtended,
    fg: FunctionalGroup[],
    mol: Molecule,
    opsin?: OPSINService,
  ) => string,
  opsinService?: OPSINService,
): string {
  // Functional class nomenclature: substituent name + parent name + functional class term
  const functionalGroup = functionalGroups.find(
    (group) =>
      group.type === "ester" ||
      group.type === "amide" ||
      group.type === "thiocyanate" ||
      group.type === "borane",
  );

  if (process.env.VERBOSE) {
    console.log("[buildFunctionalClassName] functionalGroup:", functionalGroup);
  }

  if (!functionalGroup) {
    return buildSubstitutiveName(
      parentStructure,
      functionalGroups,
      molecule,
      opsinService,
    );
  }

  // For esters, count total number of ester groups to detect diesters
  if (functionalGroup.type === "ester") {
    const esterCount = functionalGroups.filter(
      (g) => g.type === "ester",
    ).length;

    if (process.env.VERBOSE) {
      console.log("[buildFunctionalClassName] esterCount:", esterCount);
    }

    // Set multiplicity on the functional group for diester handling
    const esterGroupWithMultiplicity = {
      ...functionalGroup,
      multiplicity: esterCount,
    };

    return buildEsterName(
      parentStructure,
      esterGroupWithMultiplicity,
      molecule,
      functionalGroups,
      opsinService,
    );
  }

  // Functional class naming
  switch (functionalGroup.type) {
    case "amide":
      return buildAmideName(
        parentStructure,
        functionalGroup,
        molecule,
        functionalGroups,
      );
    case "thiocyanate":
      return buildThiocyanateName(
        parentStructure,
        functionalGroups,
        opsinService,
      );
    case "borane":
      return buildBoraneName(
        parentStructure,
        functionalGroups,
        molecule,
        opsinService,
      );
    default:
      return buildSubstitutiveName(
        parentStructure,
        functionalGroups,
        molecule,
        opsinService,
      );
  }
}

export function buildThiocyanateName(
  parentStructure: ParentStructureExtended,
  functionalGroups: FunctionalGroup[],
  opsinService?: OPSINService,
): string {
  // Thiocyanate functional class nomenclature: [alkyl]thiocyanate
  // Example: CC(=O)CCSC#N → 3-oxobutylthiocyanate

  if (process.env.VERBOSE) {
    console.log(
      "[buildThiocyanateName] parentStructure:",
      JSON.stringify(parentStructure, null, 2),
    );
    console.log(
      "[buildThiocyanateName] functionalGroups:",
      functionalGroups.map((g: FunctionalGroup) => ({
        type: g.type,
        atoms: g.atoms,
      })),
    );
  }

  // Get all functional groups except the thiocyanate
  const otherGroups = functionalGroups.filter(
    (group) => group.type !== "thiocyanate",
  );

  if (process.env.VERBOSE) {
    console.log(
      "[buildThiocyanateName] otherGroups:",
      otherGroups.map((g: FunctionalGroup) => ({
        type: g.type,
        atoms: g.atoms,
      })),
    );
  }

  // Build the alkyl portion name from parent structure + other substituents
  const alkylName = buildAlkylGroupName(
    parentStructure,
    otherGroups,
    opsinService,
  );

  if (process.env.VERBOSE) {
    console.log("[buildThiocyanateName] alkylName:", alkylName);
  }

  // Add "thiocyanate" at the end with space (functional class nomenclature)
  return `${alkylName} thiocyanate`;
}

export function buildAlkylGroupName(
  parentStructure: ParentStructureExtended,
  functionalGroups: FunctionalGroup[],
  opsinService?: OPSINService,
): string {
  // Build alkyl group name (like "3-oxobutyl")
  // This is similar to buildSubstitutiveName but ends with "yl" instead of "ane"

  if (process.env.VERBOSE) {
    console.log(
      "[buildAlkylGroupName] parentStructure keys:",
      Object.keys(parentStructure),
    );
    console.log(
      "[buildAlkylGroupName] parentStructure.substituents:",
      parentStructure.substituents?.map((s) => ({
        type: s.type,
        locant: "locant" in s ? s.locant : undefined,
      })),
    );
    console.log(
      "[buildAlkylGroupName] parentStructure.chain keys:",
      Object.keys(parentStructure.chain || {}),
    );
    console.log(
      "[buildAlkylGroupName] parentStructure.chain.substituents:",
      parentStructure.chain?.substituents?.map((s: StructuralSubstituent) => ({
        type: s.type,
        locant: s.locant,
      })),
    );
  }

  // For functional class nomenclature with thiocyanate:
  // The chain needs to be renumbered from the attachment point (where thiocyanate was attached)
  // The attachment point is the first atom in the chain (lowest locant becomes 1)

  let name = "";

  // If the parentStructure already has an assembledName,
  // convert it to alkyl form to use as base name
  let useAssembledNameAsBase = false;
  if (parentStructure && parentStructure.assembledName) {
    // For alkyl group names, we need to convert the assembledName (e.g., "methane")
    // to alkyl form (e.g., "methyl") by removing "ane" and adding "yl"
    const assembledName = parentStructure.assembledName;
    if (process.env.VERBOSE) {
      console.log("[buildAlkylGroupName] Using assembledName:", assembledName);
    }
    if (assembledName.endsWith("ane")) {
      name = assembledName.replace(/ane$/, "yl");
    } else {
      name = assembledName + "yl";
    }
    if (process.env.VERBOSE) {
      console.log("[buildAlkylGroupName] Converted to alkyl name:", name);
    }
    // Use assembledName as base but still allow substituents
    useAssembledNameAsBase = true;
  }

  // Add substituents from functional groups
  // For functional class nomenclature, ALL functional groups (except thiocyanate) become substituents
  const fgStructuralSubstituents = functionalGroups; // Don't filter by isPrincipal - include all
  const parentStructuralSubstituents = parentStructure.substituents || [];

  // Filter out thiocyanate substituents from parent
  const chainStructuralSubstituents = parentStructure.chain?.substituents || [];
  const allParentStructuralSubstituents = [
    ...parentStructuralSubstituents,
    ...chainStructuralSubstituents,
  ];
  // Filter out thiocyanate substituents and deduplicate by type+locant
  const seen = new Set<string>();
  const filteredParentStructuralSubstituents = allParentStructuralSubstituents
    .filter(
      (sub) =>
        sub.type !== "thiocyanate" &&
        sub.type !== "thiocyano" &&
        sub.name !== "thiocyano",
    )
    .filter((sub) => {
      const key = `${sub.type}:${"locant" in sub ? sub.locant || "" : ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  if (process.env.VERBOSE) {
    console.log(
      "[buildAlkylGroupName] parentStructuralSubstituents:",
      parentStructuralSubstituents.map((s) => ({
        type: s.type,
        locant: "locant" in s ? s.locant : undefined,
      })),
    );
    console.log(
      "[buildAlkylGroupName] chainStructuralSubstituents:",
      chainStructuralSubstituents.map((s: StructuralSubstituent) => ({
        type: s.type,
        locant: s.locant,
      })),
    );
    console.log(
      "[buildAlkylGroupName] filteredParentStructuralSubstituents:",
      filteredParentStructuralSubstituents.map((s) => ({
        type: s.type,
        locant: "locant" in s ? s.locant : undefined,
      })),
    );
  }

  // Renumber functional groups based on chain position
  const chain = parentStructure.chain;
  const chainAtomIds = chain?.atoms?.map((a) => a.id) || [];

  // Create a map from atom ID to new locant (1-indexed from start of chain)
  // For functional class nomenclature, number from the ATTACHMENT POINT (end of chain)
  // back toward the other end. This means we reverse the chain numbering.
  // Example: CC(=O)CCSC#N
  // Chain: [C(0), C(1), C(3), C(4)] where C(4) is attached to S-C≡N
  // Standard numbering: C(0)=1, C(1)=2, C(3)=3, C(4)=4
  // Functional class numbering: C(4)=1, C(3)=2, C(1)=3, C(0)=4
  // So ketone at C(1) gets locant 3 → "3-oxobutyl thiocyanate"
  const atomIdToLocant = new Map<number, number>();
  chainAtomIds.forEach((atomId: number, index: number) => {
    // Reverse the numbering: last atom gets 1, first atom gets length
    const reversedLocant = chainAtomIds.length - index;
    atomIdToLocant.set(atomId, reversedLocant);
  });

  if (process.env.VERBOSE) {
    console.log(
      "[buildAlkylGroupName] atomIdToLocant:",
      Array.from(atomIdToLocant.entries()),
    );
  }

  // Renumber functional groups
  const renumberedFgStructuralSubstituents: FunctionalGroupExtended[] =
    fgStructuralSubstituents.map((group) => {
      if (group.atoms && group.atoms.length > 0) {
        // For ketone, the carbon of C=O is the position
        const carbonAtom = group.atoms[0]; // First atom is typically the C in C=O
        if (!carbonAtom) return group; // Safety check
        const carbonAtomId: number =
          typeof carbonAtom === "object"
            ? carbonAtom.id
            : (carbonAtom as number); // Extract ID if it's an object
        const newLocant = atomIdToLocant.get(carbonAtomId);
        if (newLocant !== undefined) {
          if (process.env.VERBOSE) {
            console.log(
              "[buildAlkylGroupName] Renumbering group:",
              group.type,
              "carbonAtomId:",
              carbonAtomId,
              "newLocant:",
              newLocant,
            );
          }
          return { ...group, locants: [newLocant], locant: newLocant };
        } else {
          if (process.env.VERBOSE) {
            console.log(
              "[buildAlkylGroupName] No locant found for group:",
              group.type,
              "carbonAtomId:",
              carbonAtomId,
              "available locants:",
              Array.from(atomIdToLocant.entries()),
            );
          }
        }
      }
      return group;
    });

  const allStructuralSubstituents: StructuralSubstituentOrFunctionalGroup[] = [
    ...renumberedFgStructuralSubstituents,
    ...filteredParentStructuralSubstituents.filter(
      (sub): sub is StructuralSubstituent => "bonds" in sub,
    ),
  ];

  if (process.env.VERBOSE) {
    console.log(
      "[buildAlkylGroupName] renumberedFgStructuralSubstituents:",
      renumberedFgStructuralSubstituents.map((s: FunctionalGroupExtended) => ({
        type: s.type,
        locants: s.locants,
      })),
    );
    console.log(
      "[buildAlkylGroupName] allStructuralSubstituents:",
      allStructuralSubstituents.map(
        (s: StructuralSubstituentOrFunctionalGroup) => ({
          type: s.type,
          name: s.name,
          locant: "locant" in s ? s.locant : undefined,
          locants: "locants" in s ? s.locants : undefined,
        }),
      ),
    );
  }

  // Determine whether the assembledName already includes substituent text
  const parentAssembled = parentStructure.assembledName || "";
  const parentHasAssembledStructuralSubstituents = !!(
    parentAssembled &&
    parentStructure.substituents &&
    parentStructure.substituents.length > 0 &&
    parentStructure.substituents.some((s) => {
      const nameToFind = s.name || s.type;
      return nameToFind && parentAssembled.includes(String(nameToFind));
    })
  );
  const hasFgStructuralSubstituents =
    renumberedFgStructuralSubstituents.length > 0;

  if (process.env.VERBOSE) {
    console.log(
      "[buildAlkylGroupName] parentHasAssembledStructuralSubstituents:",
      parentHasAssembledStructuralSubstituents,
    );
    console.log(
      "[buildAlkylGroupName] allStructuralSubstituents.length:",
      allStructuralSubstituents.length,
    );
    console.log(
      "[buildAlkylGroupName] hasFgStructuralSubstituents:",
      hasFgStructuralSubstituents,
    );
    console.log(
      "[buildAlkylGroupName] useAssembledNameAsBase:",
      useAssembledNameAsBase,
    );
  }

  // If the parent structure already has an assembledName that includes substituents,
  // avoid re-assembling substituents here to prevent duplication. However, we still
  // want to include functional group substituents (like ketones) in alkyl names.
  // Only skip if there are NO functional group substituents to add.
  if (
    allStructuralSubstituents.length > 0 &&
    (hasFgStructuralSubstituents || !parentHasAssembledStructuralSubstituents)
  ) {
    const substituentParts: string[] = [];
    const substituentGroups = new Map<string, number[]>();

    for (const sub of allStructuralSubstituents) {
      // For ketone groups, use "oxo" prefix
      let subName = sub.assembledName || sub.name || sub.prefix || sub.type;

      if (sub.type === "[CX3](=O)[CX4]" || sub.type === "ketone") {
        subName = "oxo";
      }

      if (subName) {
        if (!substituentGroups.has(subName)) {
          substituentGroups.set(subName, []);
        }
        const locant = sub.locant || sub.locants?.[0];
        if (locant) {
          substituentGroups.get(subName)!.push(locant);
        }
      }
    }

    for (const [subName, locants] of substituentGroups.entries()) {
      locants.sort((a, b) => a - b);
      const locantStr = locants.length > 0 ? locants.join(",") + "-" : "";
      const multiplicativePrefix =
        locants.length > 1
          ? getMultiplicativePrefix(
              locants.length,
              false,
              opsinService,
              subName.charAt(0),
            )
          : "";
      const fullSubName = `${locantStr}${multiplicativePrefix}${subName}`;
      substituentParts.push(fullSubName);
    }

    substituentParts.sort((a, b) => {
      const aName = a.split("-").slice(1).join("-");
      const bName = b.split("-").slice(1).join("-");
      return aName.localeCompare(bName);
    });

    if (substituentParts.length > 0) {
      // Join substituent parts with commas if multiple, no trailing hyphen
      const substituentPrefix = substituentParts.join(",");
      if (useAssembledNameAsBase) {
        // For assembled names, prepend substituents to create proper alkyl names like "3-oxobutyl"
        name = substituentPrefix + name;
      } else {
        // For regular names, append substituents
        name += substituentPrefix;
      }
    }
  }

  // Add parent chain name with "yl" ending (no hyphen between prefix and base)
  // Only if we haven't already processed an assembledName
  if (!useAssembledNameAsBase) {
    if (parentStructure.type === "chain") {
      const chain = parentStructure.chain;
      const length = chain?.length || 0;

      const chainNames = [
        "",
        "meth",
        "eth",
        "prop",
        "but",
        "pent",
        "hex",
        "hept",
        "oct",
        "non",
        "dec",
      ];

      let baseName = "alkyl";
      if (length < chainNames.length) {
        baseName = (chainNames[length] ?? "alk") + "yl";
      }

      name += baseName;
    } else {
      name += "alkyl";
    }
  }

  return name;
}

export function buildBoraneName(
  parentStructure: ParentStructureExtended,
  functionalGroups: FunctionalGroup[],
  molecule: Molecule,
  opsinService?: OPSINService,
): string {
  // Borane functional class nomenclature: [alkyl1]-[alkyl2]-[alkyl3]borane
  // Example: B(CC)(CC)C(=C(CC)COC)CC → diethyl-[4-(methoxymethyl)hex-3-en-3-yl]borane

  if (process.env.VERBOSE) {
    console.log(
      "[buildBoraneName] parentStructure:",
      JSON.stringify(parentStructure, null, 2),
    );
    console.log(
      "[buildBoraneName] functionalGroups:",
      functionalGroups.map((g: FunctionalGroup) => ({
        type: g.type,
        atoms: g.atoms?.map((a) => (typeof a === "object" ? a.id : a)),
      })),
    );
  }

  // Find the borane functional group (boron atom)
  const boraneGroup = functionalGroups.find((g) => g.type === "borane");
  if (!boraneGroup || !boraneGroup.atoms || boraneGroup.atoms.length === 0) {
    if (process.env.VERBOSE) {
      console.log(
        "[buildBoraneName] No borane group found, returning fallback",
      );
    }
    return "borane"; // Fallback
  }

  const firstAtom = boraneGroup.atoms[0];
  if (!firstAtom) {
    if (process.env.VERBOSE) {
      console.log(
        "[buildBoraneName] No boron atom in group, returning fallback",
      );
    }
    return "borane"; // Fallback
  }

  const boronAtom =
    typeof firstAtom === "object" ? firstAtom : molecule.atoms[firstAtom];
  if (!boronAtom) {
    if (process.env.VERBOSE) {
      console.log("[buildBoraneName] No boron atom found, returning fallback");
    }
    return "borane"; // Fallback
  }

  const boronIdx = molecule.atoms.indexOf(boronAtom);

  if (process.env.VERBOSE) {
    console.log("[buildBoraneName] boronIdx:", boronIdx);
  }

  // Find all bonds to boron (should be 3 for BR₃)
  const bondsToBoron = molecule.bonds.filter(
    (bond) => bond.atom1 === boronIdx || bond.atom2 === boronIdx,
  );

  if (process.env.VERBOSE) {
    console.log(
      "[buildBoraneName] bondsToBoron:",
      bondsToBoron.map((b) => `${b.atom1}-${b.atom2}`),
    );
  }

  // For each bond, trace the substituent and name it as an alkyl group
  const substituentNames: string[] = [];

  for (const bond of bondsToBoron) {
    const substituentAtomIdx =
      bond.atom1 === boronIdx ? bond.atom2 : bond.atom1;
    const substituentAtom = molecule.atoms[substituentAtomIdx];

    if (!substituentAtom) continue;

    if (process.env.VERBOSE) {
      console.log(
        `[buildBoraneName] Tracing substituent from atom ${substituentAtomIdx} (${substituentAtom.symbol})`,
      );
    }

    // Collect all atoms in this substituent (excluding boron)
    const substituentAtoms = new Set<number>();
    const visited = new Set<number>([boronIdx]);
    const stack = [substituentAtomIdx];

    while (stack.length > 0) {
      const current = stack.pop()!;
      if (visited.has(current)) continue;
      visited.add(current);
      substituentAtoms.add(current);

      // Add neighbors (excluding boron)
      for (const b of molecule.bonds) {
        const next =
          b.atom1 === current ? b.atom2 : b.atom2 === current ? b.atom1 : -1;
        if (next !== -1 && !visited.has(next)) {
          stack.push(next);
        }
      }
    }

    if (process.env.VERBOSE) {
      console.log(
        `[buildBoraneName] Substituent ${substituentAtomIdx}: ${Array.from(substituentAtoms).join(",")}`,
      );
    }

    // Name this substituent as an alkyl group
    const alkylName = nameBoranylSubstituent(
      molecule,
      substituentAtoms,
      substituentAtomIdx,
      opsinService,
    );

    if (process.env.VERBOSE) {
      console.log(
        `[buildBoraneName] Named substituent ${substituentAtomIdx} as: ${alkylName}`,
      );
    }

    substituentNames.push(alkylName);
  }

  if (process.env.VERBOSE) {
    console.log("[buildBoraneName] substituentNames:", substituentNames);
  }

  // Group identical substituents and add multiplicity prefixes
  const substituentGroups = new Map<string, number>();
  for (const name of substituentNames) {
    substituentGroups.set(name, (substituentGroups.get(name) || 0) + 1);
  }

  if (process.env.VERBOSE) {
    console.log(
      "[buildBoraneName] substituentGroups:",
      Array.from(substituentGroups.entries()),
    );
  }

  // Sort substituent groups alphabetically
  const sortedGroups = Array.from(substituentGroups.entries()).sort((a, b) =>
    a[0].localeCompare(b[0]),
  );

  // Build the name
  const substituentParts: string[] = [];
  for (const [name, count] of sortedGroups) {
    if (count > 1) {
      const prefix = getMultiplicativePrefix(
        count,
        name.includes("-"),
        opsinService,
        name.charAt(0),
      );
      substituentParts.push(`${prefix}${name}`);
    } else {
      substituentParts.push(name);
    }
  }

  const finalName = substituentParts.join("-") + "borane";

  if (process.env.VERBOSE) {
    console.log("[buildBoraneName] finalName:", finalName);
  }

  return finalName;
}

export function nameBoranylSubstituent(
  molecule: Molecule,
  substituentAtoms: Set<number>,
  rootAtomIdx: number,
  opsinService?: OPSINService,
): string {
  if (process.env.VERBOSE) {
    console.log(
      `[nameBoranylSubstituent] rootAtom=${rootAtomIdx}, substituentAtoms=${Array.from(substituentAtoms).join(",")}`,
    );
  }

  // Get carbon count
  const carbonAtoms = Array.from(substituentAtoms).filter(
    (idx) => molecule.atoms[idx]?.symbol === "C",
  );

  if (carbonAtoms.length === 0) {
    return ""; // No carbons
  }

  // Check if this is a simple saturated alkyl group (no heteroatoms, no multiple bonds)
  const hasHeteroatoms = Array.from(substituentAtoms).some((idx) => {
    const sym = molecule.atoms[idx]?.symbol;
    return sym !== "C" && sym !== "H";
  });

  const hasMultipleBonds = molecule.bonds
    .filter(
      (b) => substituentAtoms.has(b.atom1) && substituentAtoms.has(b.atom2),
    )
    .some((b) => b.type !== "single");

  const hasBranching = carbonAtoms.some((atomIdx) => {
    const carbonNeighbors = molecule.bonds.filter(
      (b) =>
        ((b.atom1 === atomIdx && substituentAtoms.has(b.atom2)) ||
          (b.atom2 === atomIdx && substituentAtoms.has(b.atom1))) &&
        (molecule.atoms[b.atom1]?.symbol === "C" ||
          molecule.atoms[b.atom2]?.symbol === "C"),
    );
    return carbonNeighbors.length > 2;
  });

  // Simple linear alkyl group
  if (!hasHeteroatoms && !hasMultipleBonds && !hasBranching) {
    const alkylNames: Record<number, string> = {
      1: "methyl",
      2: "ethyl",
      3: "propyl",
      4: "butyl",
      5: "pentyl",
      6: "hexyl",
      7: "heptyl",
      8: "octyl",
    };

    const name = alkylNames[carbonAtoms.length];
    if (name) {
      if (process.env.VERBOSE) {
        console.log(`[nameBoranylSubstituent] Simple alkyl: ${name}`);
      }
      return name;
    }
  }

  // Complex substituent - apply full IUPAC naming
  const substituentName = nameComplexBoranylSubstituent(
    molecule,
    substituentAtoms,
    rootAtomIdx,
    opsinService,
  );

  if (process.env.VERBOSE) {
    console.log(`[nameBoranylSubstituent] Complex name: ${substituentName}`);
  }

  return substituentName;
}

export function nameComplexBoranylSubstituent(
  molecule: Molecule,
  substituentAtoms: Set<number>,
  rootAtomIdx: number,
  opsinService?: OPSINService,
): string {
  // Find the longest carbon chain from the root
  const chain = findLongestCarbonChainFromRoot(
    molecule,
    rootAtomIdx,
    substituentAtoms,
  );

  if (chain.length === 0) {
    return "yl";
  }

  if (process.env.VERBOSE) {
    console.log(
      `[nameComplexBoranylSubstituent] Chain from root ${rootAtomIdx}: ${chain.join(",")}`,
    );
  }

  // Detect double/triple bonds along the chain
  const multipleBonds: Array<{ position: number; type: "double" | "triple" }> =
    [];

  for (let i = 0; i < chain.length - 1; i++) {
    const atom1 = chain[i]!;
    const atom2 = chain[i + 1]!;
    const bond = molecule.bonds.find(
      (b) =>
        (b.atom1 === atom1 && b.atom2 === atom2) ||
        (b.atom1 === atom2 && b.atom2 === atom1),
    );

    if (bond?.type === "double") {
      multipleBonds.push({ position: i + 1, type: "double" });
    } else if (bond?.type === "triple") {
      multipleBonds.push({ position: i + 1, type: "triple" });
    }
  }

  // Find all substituents on the chain
  const substituents = findSubstituentsOnChain(
    molecule,
    chain,
    substituentAtoms,
  );

  if (process.env.VERBOSE) {
    console.log(
      `[nameComplexBoranylSubstituent] Found ${substituents.length} substituents:`,
      substituents,
    );
  }

  // Build the base name
  const chainLength = chain.length;
  const baseNames: Record<number, string> = {
    1: "meth",
    2: "eth",
    3: "prop",
    4: "but",
    5: "pent",
    6: "hex",
    7: "hept",
    8: "oct",
    9: "non",
    10: "dec",
  };

  let baseName = baseNames[chainLength] || `C${chainLength}`;

  // Build the full name with unsaturation and substituents
  let nameParts: string[] = [];

  // Add substituents (sorted and grouped)
  if (substituents.length > 0) {
    const grouped = groupSubstituents(substituents);
    nameParts.push(formatSubstituentGroups(grouped, opsinService));
  }

  // Add base name with unsaturation
  if (multipleBonds.length > 0) {
    const doubleBonds = multipleBonds.filter((b) => b.type === "double");
    const tripleBonds = multipleBonds.filter((b) => b.type === "triple");

    let unsatPart = baseName;

    if (doubleBonds.length > 0) {
      const positions = doubleBonds.map((b) => b.position).join(",");
      const multiplier =
        doubleBonds.length === 1
          ? ""
          : getSimpleMultiplierWithVowel(
              doubleBonds.length,
              "e",
              opsinService ?? getSharedOPSINService(),
            );
      unsatPart = `${baseName}-${positions}-${multiplier}en`;
    }

    if (tripleBonds.length > 0) {
      const positions = tripleBonds.map((b) => b.position).join(",");
      const multiplier =
        tripleBonds.length === 1
          ? ""
          : getSimpleMultiplierWithVowel(
              tripleBonds.length,
              "y",
              opsinService ?? getSharedOPSINService(),
            );
      unsatPart = `${unsatPart}-${positions}-${multiplier}yn`;
    }

    nameParts.push(unsatPart);
  } else {
    nameParts.push(baseName);
  }

  // Add "yl" suffix (attachment point is always position 1)
  const fullName = nameParts.join("") + "-1-yl";

  // Wrap in brackets for complex substituents
  if (substituents.length > 0 || multipleBonds.length > 0) {
    return `[${fullName}]`;
  }

  return fullName;
}
