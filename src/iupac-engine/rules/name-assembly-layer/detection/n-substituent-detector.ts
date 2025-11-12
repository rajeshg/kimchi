import type { FunctionalGroup, ParentStructure } from "../../../types";
import type { Molecule, Atom } from "types";
import {
  getMultiplicativePrefix,
  collectSubstituentAtoms,
} from "../utils";
import { nameYlideneSubstituent } from "../substituent-helpers/ylidene-naming";
import { nameAlkylSubstituent } from "../substituent-helpers/alkyl-naming";
import { nameRingSubstituent } from "../../../naming/iupac-chains";
import { getSimpleMultiplierWithVowel } from "../../../opsin-adapter";
import type { OPSINService } from "../../../opsin-service";
import { getSharedOPSINService } from "../../../opsin-service";

type ParentStructureExtended = ParentStructure & {
  assembledName?: string;
  substituents?: any[];
  size?: number;
};

type NSubstituent = {
  name: string;
  atomId: number;
  nitrogenId: number;
  nLocant: string;
  isRing: boolean;
  isDoubleBond: boolean;
};

/**
 * Detect N-substituents on amine/imine nitrogen atoms
 * Returns a prefix string like "N-methyl" or "N,N-dimethyl" or empty string
 */
export function detectNSubstituents(
  principalGroup: FunctionalGroup,
  parentStructure: ParentStructureExtended,
  molecule: Molecule,
  opsinService?: OPSINService,
): { prefix: string; atomIds: Set<number> } {
  if (!principalGroup.atoms || principalGroup.atoms.length === 0) {
    return { prefix: "", atomIds: new Set() };
  }

  if (!molecule || !molecule.atoms || !molecule.bonds) {
    return { prefix: "", atomIds: new Set() };
  }

  // Collect all nitrogen atoms in the principal group
  const nitrogenAtoms: Atom[] = [];
  for (const atom of principalGroup.atoms) {
    if (atom.symbol === "N") {
      nitrogenAtoms.push(atom);
    }
  }

  if (process.env.VERBOSE) {
    console.log(
      `[detectNSubstituents] Found ${nitrogenAtoms.length} nitrogen atoms in principal group:`,
      nitrogenAtoms.map((n) => n.id),
    );
  }

  // If no nitrogen atoms found, might be imine (C=N)
  if (nitrogenAtoms.length === 0) {
    const firstAtom = principalGroup.atoms[0];
    if (firstAtom?.symbol === "C") {
      const imineCarbonId = firstAtom.id;
      for (const bond of molecule.bonds) {
        if (bond.type !== "single") continue;
        let potentialNitrogenId: number | undefined;
        if (bond.atom1 === imineCarbonId) {
          potentialNitrogenId = bond.atom2;
        } else if (bond.atom2 === imineCarbonId) {
          potentialNitrogenId = bond.atom1;
        }

        if (potentialNitrogenId !== undefined) {
          const potentialNitrogen = molecule.atoms.find(
            (a: Atom) => a.id === potentialNitrogenId,
          );
          if (
            potentialNitrogen?.symbol === "N" &&
            !potentialNitrogen.isInRing
          ) {
            nitrogenAtoms.push(potentialNitrogen);
            break;
          }
        }
      }
    }
  }

  if (nitrogenAtoms.length === 0) {
    return { prefix: "", atomIds: new Set() };
  }

  // Find parent structure atoms
  const parentAtomIds = new Set<number>();
  if (parentStructure.type === "chain" && parentStructure.chain?.atoms) {
    for (const atom of parentStructure.chain.atoms) {
      parentAtomIds.add(atom.id);
    }
  } else if (parentStructure.type === "ring" && parentStructure.ring?.atoms) {
    for (const atom of parentStructure.ring.atoms) {
      parentAtomIds.add(atom.id);
    }
  }

  const allNSubstituents: NSubstituent[] = [];

  // Process each nitrogen atom and collect its substituents
  for (
    let nitrogenIndex = 0;
    nitrogenIndex < nitrogenAtoms.length;
    nitrogenIndex++
  ) {
    const amineNitrogen = nitrogenAtoms[nitrogenIndex];
    if (!amineNitrogen) continue;

    const nLocant = nitrogenIndex === 0 ? "N" : `N${"'".repeat(nitrogenIndex)}`;

    for (const bond of molecule.bonds) {
      let substituentAtomId: number | undefined;
      if (bond.atom1 === amineNitrogen.id) {
        substituentAtomId = bond.atom2;
      } else if (bond.atom2 === amineNitrogen.id) {
        substituentAtomId = bond.atom1;
      }

      if (substituentAtomId === undefined) continue;
      if (parentAtomIds.has(substituentAtomId)) continue;

      const substituentAtom = molecule.atoms.find(
        (a) => a.id === substituentAtomId,
      );
      if (!substituentAtom || substituentAtom.symbol !== "C") continue;

      const isDoubleBond = bond.type === "double";
      if (!isDoubleBond && bond.type !== "single") continue;

      let substituentName: string;
      let isRing = false;

      if (substituentAtom.isInRing && substituentAtom.aromatic) {
        isRing = true;
        const ringSubInfo = nameRingSubstituent(
          molecule,
          substituentAtomId,
          parentAtomIds,
          0,
          3,
        );
        substituentName = ringSubInfo?.name || "phenyl";
      } else if (!substituentAtom.isInRing) {
        if (isDoubleBond) {
          substituentName = nameYlideneSubstituent(
            molecule,
            substituentAtomId,
            amineNitrogen.id,
            parentAtomIds,
            opsinService ?? getSharedOPSINService(),
          );
        } else {
          substituentName = nameAlkylSubstituent(
            molecule,
            substituentAtomId,
            amineNitrogen.id,
            parentAtomIds,
            opsinService ?? getSharedOPSINService(),
          );
        }
      } else {
        continue;
      }

      allNSubstituents.push({
        name: substituentName,
        atomId: substituentAtomId,
        nitrogenId: amineNitrogen.id,
        nLocant,
        isRing,
        isDoubleBond,
      });
    }
  }

  if (allNSubstituents.length === 0) {
    return { prefix: "", atomIds: new Set() };
  }

  // Collect all atom IDs from N-substituents (including the N atoms themselves and all connected atoms)
  const nSubstituentAtomIds = new Set<number>();
  for (const sub of allNSubstituents) {
    // Add the nitrogen atom
    nSubstituentAtomIds.add(sub.nitrogenId);
    // Add the substituent root atom
    nSubstituentAtomIds.add(sub.atomId);
    // Collect all atoms in this substituent chain
    const subAtoms = collectSubstituentAtoms(
      molecule,
      sub.atomId,
      parentAtomIds,
      sub.nitrogenId,
    );
    for (const atomId of subAtoms) {
      nSubstituentAtomIds.add(atomId);
    }
  }

  // Group substituents by name
  const substituentGroups = new Map<string, NSubstituent[]>();
  for (const sub of allNSubstituents) {
    const existing = substituentGroups.get(sub.name);
    if (existing) {
      existing.push(sub);
    } else {
      substituentGroups.set(sub.name, [sub]);
    }
  }

  const formattedParts: string[] = [];

  // Process each group of substituents
  for (const [name, subs] of substituentGroups) {
    if (subs.length === 1) {
      const sub = subs[0]!;
      if (sub.isDoubleBond) {
        formattedParts.push(`(${sub.name}amino)`);
      } else if (sub.isRing) {
        formattedParts.push(`${sub.nLocant}-(${sub.name})`);
      } else {
        formattedParts.push(`${sub.nLocant}-${sub.name}`);
      }
    } else {
      // Multiple identical substituents across different nitrogens
      const locants = subs
        .map((s) => s.nLocant)
        .sort()
        .join(",");

      // Check if this is a complex substituent (contains another functional group)
      // Complex substituents need bis(), tris(), etc. with parentheses
      // Simple substituents (methyl, ethyl, propyl, formyl, etc.) use di-, tri-, tetra-
      const simpleSubstituents = [
        "methyl",
        "ethyl",
        "propyl",
        "butyl",
        "formyl",
        "acetyl",
      ];
      const isSimpleSubstituent = simpleSubstituents.includes(name);
      const isComplexSubstituent =
        !isSimpleSubstituent &&
        name.includes("yl") &&
        (name.includes("hydroxy") ||
          name.includes("oxo") ||
          name.includes("amino") ||
          name.includes("carboxy") ||
          name.includes("phenyl"));

      if (subs[0]!.isRing || isComplexSubstituent) {
        const multiplier = getMultiplicativePrefix(
          subs.length,
          true,
          opsinService ?? getSharedOPSINService(),
        );
        formattedParts.push(`${locants}-${multiplier}(${name})`);
      } else {
        const multiplier = getSimpleMultiplierWithVowel(
          subs.length,
          name.charAt(0),
          opsinService ?? getSharedOPSINService(),
        );
        formattedParts.push(`${locants}-${multiplier}${name}`);
      }
    }
  }

  // Sort by the base substituent name (ignoring multiplicative prefixes)
  // Extract the part after the last hyphen and inside parentheses if present
  const prefix = formattedParts
    .sort((a, b) => {
      // Extract base name: "N,N'-diformyl" -> "formyl", "N,N'-bis(hydroxymethyl)" -> "hydroxymethyl"
      const getBaseName = (s: string): string => {
        const afterLastHyphen = s.split("-").pop() || s;
        // Remove multiplicative prefixes like "di", "tri", "bis", "tris"
        const withoutPrefix = afterLastHyphen.replace(
          /^(di|tri|tetra|bis|tris|tetrakis)\(?/,
          "",
        );
        // Remove trailing parenthesis if present
        return withoutPrefix.replace(/\)$/, "");
      };

      const baseA = getBaseName(a);
      const baseB = getBaseName(b);
      return baseA.localeCompare(baseB);
    })
    .join("-");

  return { prefix, atomIds: nSubstituentAtomIds };
}
