import type { Atom, Molecule } from "types";
import type {
  FunctionalGroup,
  ParentStructure,
  StructuralSubstituent,
} from "../../../types";
import type { NamingSubstituent } from "../../../naming/iupac-types";
import {
  nameAlkylSulfanylSubstituent,
  namePhosphorylSubstituent,
  namePhosphanylSubstituent,
  nameAmideSubstituent,
} from "../../../naming/iupac-chains";
import { collectSubstituentAtoms, findAttachmentPoint } from "../utils";

type UnifiedSubstituent =
  | StructuralSubstituent
  | NamingSubstituent
  | FunctionalGroup;

interface SpecialNamingContext {
  molecule: Molecule;
  parentStructure: ParentStructure;
  sub: UnifiedSubstituent;
  subName: string;
}

export function nameSpecialSubstituent(
  context: SpecialNamingContext,
): string | null {
  const { molecule, parentStructure, sub, subName } = context;

  // Extract locant prefix if present (e.g., "10-" from "10-thioether")
  const locantMatch = subName.match(/^(\d+)-/);
  const locantPrefix = locantMatch ? locantMatch[1] + "-" : "";

  // Try thioether naming
  if (subName === "thioether" || subName.includes("-thioether")) {
    const named = nameThioether(
      molecule,
      parentStructure,
      sub,
      locantPrefix,
    );
    if (named) return named;
  }

  // Try phosphorylsulfanyl naming
  if (
    subName === "phosphorylsulfanyl" ||
    subName.includes("-phosphorylsulfanyl")
  ) {
    const named = namePhosphorylsulfanyl(
      molecule,
      parentStructure,
      sub,
      locantPrefix,
    );
    if (named) return named;
  }

  // Try phosphoryl naming
  if (subName === "phosphoryl" || subName.includes("-phosphoryl")) {
    const named = namePhosphoryl(
      molecule,
      parentStructure,
      sub,
      locantPrefix,
    );
    if (named) return named;
  }

  // Try phosphanyl naming
  if (subName === "phosphanyl" || subName.includes("-phosphanyl")) {
    const named = namePhosphanyl(
      molecule,
      parentStructure,
      sub,
      locantPrefix,
    );
    if (named) return named;
  }

  // Try amide naming
  if (subName === "amide" || subName.includes("-amide")) {
    const named = nameAmide(molecule, parentStructure, sub, locantPrefix);
    if (named) return named;
  }

  return null;
}

function nameThioether(
  molecule: Molecule,
  parentStructure: ParentStructure,
  sub: UnifiedSubstituent,
  locantPrefix: string,
): string | null {
  if (!("atoms" in sub) || !sub.atoms || sub.atoms.length === 0) {
    return "sulfanyl";
  }

  const firstAtom = sub.atoms[0];

  // Handle Atom[] (StructuralSubstituent/FunctionalGroup)
  if (typeof firstAtom === "object" && "symbol" in firstAtom) {
    const atoms = sub.atoms as Atom[];
    const sulfurAtom = atoms.find((atom: Atom) => atom.symbol === "S");
    if (!sulfurAtom) return "sulfanyl";

    const sulfurIdx = molecule.atoms.findIndex((a) => a.id === sulfurAtom.id);
    if (sulfurIdx === -1) return "sulfanyl";

    const mainChainAtomIndices = getMainChainIndices(molecule, parentStructure);
    const substituentAtomIndices = collectSubstituentAtoms(
      molecule,
      sulfurIdx,
      mainChainAtomIndices,
    );

    const baseName = nameAlkylSulfanylSubstituent(
      molecule,
      substituentAtomIndices,
      sulfurIdx,
    );
    return locantPrefix + baseName;
  }

  // Handle number[] (NamingSubstituent)
  if (typeof firstAtom === "number") {
    const atomIndices = sub.atoms as number[];
    const sulfurIdx = atomIndices.find(
      (idx: number) => molecule.atoms[idx]?.symbol === "S",
    );
    if (sulfurIdx === undefined) return "sulfanyl";

    const mainChainAtomIndices = getMainChainIndices(molecule, parentStructure);
    const substituentAtomIndices = collectSubstituentAtoms(
      molecule,
      sulfurIdx,
      mainChainAtomIndices,
    );

    const baseName = nameAlkylSulfanylSubstituent(
      molecule,
      substituentAtomIndices,
      sulfurIdx,
    );
    return locantPrefix + baseName;
  }

  return "sulfanyl";
}

function namePhosphorylsulfanyl(
  molecule: Molecule,
  parentStructure: ParentStructure,
  sub: UnifiedSubstituent,
  locantPrefix: string,
): string | null {
  if (!("atoms" in sub) || !sub.atoms || sub.atoms.length === 0) {
    return "phosphorylsulfanyl";
  }

  const firstAtom = sub.atoms[0];

  if (typeof firstAtom === "object" && "symbol" in firstAtom) {
    const atoms = sub.atoms as Atom[];
    const sulfurAtom = atoms.find((atom: Atom) => atom.symbol === "S");
    const phosphorusAtom = atoms.find((atom: Atom) => atom.symbol === "P");

    if (!sulfurAtom || !phosphorusAtom) return "phosphorylsulfanyl";

    const sulfurIdx = molecule.atoms.findIndex((a) => a.id === sulfurAtom.id);
    const phosphorusIdx = molecule.atoms.findIndex(
      (a) => a.id === phosphorusAtom.id,
    );

    if (sulfurIdx === -1 || phosphorusIdx === -1) return "phosphorylsulfanyl";

    const mainChainAtomIndices = getMainChainIndices(molecule, parentStructure);
    const attachmentPoint = findAttachmentPoint(
      molecule,
      sulfurIdx,
      mainChainAtomIndices,
    );

    const substituentAtomIndices = collectSubstituentAtoms(
      molecule,
      phosphorusIdx,
      mainChainAtomIndices,
      attachmentPoint,
    );

    const phosphorylOnlyIndices = new Set(substituentAtomIndices);
    phosphorylOnlyIndices.delete(sulfurIdx);

    const phosphorylName = namePhosphorylSubstituent(
      molecule,
      phosphorylOnlyIndices,
      phosphorusIdx,
    );

    let formattedPhosphoryl = phosphorylName;
    if (formattedPhosphoryl !== "phosphoryl") {
      formattedPhosphoryl = formattedPhosphoryl.replace(/^\(([^)]+)\)/, "$1");
    }

    return locantPrefix + "[" + formattedPhosphoryl + "]sulfanyl";
  }

  if (typeof firstAtom === "number") {
    const atomIndices = sub.atoms as number[];
    const sulfurIdx = atomIndices.find(
      (idx: number) => molecule.atoms[idx]?.symbol === "S",
    );
    const phosphorusIdx = atomIndices.find(
      (idx: number) => molecule.atoms[idx]?.symbol === "P",
    );

    if (sulfurIdx === undefined || phosphorusIdx === undefined) {
      return "phosphorylsulfanyl";
    }

    const mainChainAtomIndices = getMainChainIndices(molecule, parentStructure);
    const attachmentPoint = findAttachmentPoint(
      molecule,
      sulfurIdx,
      mainChainAtomIndices,
    );

    const substituentAtomIndices = collectSubstituentAtoms(
      molecule,
      phosphorusIdx,
      mainChainAtomIndices,
      attachmentPoint,
    );

    const phosphorylOnlyIndices = new Set(substituentAtomIndices);
    phosphorylOnlyIndices.delete(sulfurIdx);

    const phosphorylName = namePhosphorylSubstituent(
      molecule,
      phosphorylOnlyIndices,
      phosphorusIdx,
    );

    let formattedPhosphoryl = phosphorylName;
    if (formattedPhosphoryl !== "phosphoryl") {
      formattedPhosphoryl = formattedPhosphoryl.replace(/^\(([^)]+)\)/, "$1");
    }

    return locantPrefix + "[" + formattedPhosphoryl + "]sulfanyl";
  }

  return "phosphorylsulfanyl";
}

function namePhosphoryl(
  molecule: Molecule,
  parentStructure: ParentStructure,
  sub: UnifiedSubstituent,
  locantPrefix: string,
): string | null {
  if (!("atoms" in sub) || !sub.atoms || sub.atoms.length === 0) {
    return "phosphoryl";
  }

  const firstAtom = sub.atoms[0];

  if (typeof firstAtom === "object" && "symbol" in firstAtom) {
    const atoms = sub.atoms as Atom[];
    const phosphorusAtom = atoms.find((atom: Atom) => atom.symbol === "P");
    if (!phosphorusAtom) return "phosphoryl";

    const phosphorusIdx = molecule.atoms.findIndex(
      (a) => a.id === phosphorusAtom.id,
    );
    if (phosphorusIdx === -1) return "phosphoryl";

    const mainChainAtomIndices = getMainChainIndices(molecule, parentStructure);
    const attachmentPoint = findAttachmentPoint(
      molecule,
      phosphorusIdx,
      mainChainAtomIndices,
    );

    const substituentAtomIndices = collectSubstituentAtoms(
      molecule,
      phosphorusIdx,
      mainChainAtomIndices,
      attachmentPoint,
    );

    const baseName = namePhosphorylSubstituent(
      molecule,
      substituentAtomIndices,
      phosphorusIdx,
    );
    return locantPrefix + baseName;
  }

  if (typeof firstAtom === "number") {
    const atomIndices = sub.atoms as number[];
    const phosphorusIdx = atomIndices.find(
      (idx: number) => molecule.atoms[idx]?.symbol === "P",
    );
    if (phosphorusIdx === undefined) return "phosphoryl";

    const mainChainAtomIndices = getMainChainIndices(molecule, parentStructure);
    const attachmentPoint = findAttachmentPoint(
      molecule,
      phosphorusIdx,
      mainChainAtomIndices,
    );

    const substituentAtomIndices = collectSubstituentAtoms(
      molecule,
      phosphorusIdx,
      mainChainAtomIndices,
      attachmentPoint,
    );

    const baseName = namePhosphorylSubstituent(
      molecule,
      substituentAtomIndices,
      phosphorusIdx,
    );
    return locantPrefix + baseName;
  }

  return "phosphoryl";
}

function namePhosphanyl(
  molecule: Molecule,
  parentStructure: ParentStructure,
  sub: UnifiedSubstituent,
  locantPrefix: string,
): string | null {
  if (!("atoms" in sub) || !sub.atoms || sub.atoms.length === 0) {
    return "phosphanyl";
  }

  const firstAtom = sub.atoms[0];

  if (typeof firstAtom === "object" && "symbol" in firstAtom) {
    const atoms = sub.atoms as Atom[];
    const phosphorusAtom = atoms.find((atom: Atom) => atom.symbol === "P");
    if (!phosphorusAtom) return "phosphanyl";

    const phosphorusIdx = molecule.atoms.findIndex(
      (a) => a.id === phosphorusAtom.id,
    );
    if (phosphorusIdx === -1) return "phosphanyl";

    const mainChainAtomIndices = getMainChainIndices(molecule, parentStructure);
    const attachmentPoint = findAttachmentPoint(
      molecule,
      phosphorusIdx,
      mainChainAtomIndices,
    );

    const substituentAtomIndices = collectSubstituentAtoms(
      molecule,
      phosphorusIdx,
      mainChainAtomIndices,
      attachmentPoint,
    );

    const baseName = namePhosphanylSubstituent(
      molecule,
      substituentAtomIndices,
      phosphorusIdx,
      attachmentPoint,
    );
    return locantPrefix + baseName;
  }

  if (typeof firstAtom === "number") {
    const atomIndices = sub.atoms as number[];
    const phosphorusIdx = atomIndices.find(
      (idx: number) => molecule.atoms[idx]?.symbol === "P",
    );
    if (phosphorusIdx === undefined) return "phosphanyl";

    const mainChainAtomIndices = getMainChainIndices(molecule, parentStructure);
    const attachmentPoint = findAttachmentPoint(
      molecule,
      phosphorusIdx,
      mainChainAtomIndices,
    );

    const substituentAtomIndices = collectSubstituentAtoms(
      molecule,
      phosphorusIdx,
      mainChainAtomIndices,
      attachmentPoint,
    );

    const baseName = namePhosphanylSubstituent(
      molecule,
      substituentAtomIndices,
      phosphorusIdx,
      attachmentPoint,
    );
    return locantPrefix + baseName;
  }

  return "phosphanyl";
}

function nameAmide(
  molecule: Molecule,
  parentStructure: ParentStructure,
  sub: UnifiedSubstituent,
  locantPrefix: string,
): string | null {
  if (!("atoms" in sub) || !sub.atoms || sub.atoms.length === 0) {
    return "carbamoyl";
  }

  const firstAtom = sub.atoms[0];

  if (typeof firstAtom === "object" && "symbol" in firstAtom) {
    const atoms = sub.atoms as Atom[];
    const carbonylCarbon = atoms.find((atom: Atom) => atom.symbol === "C");
    if (!carbonylCarbon) return "carbamoyl";

    const carbonylIdx = molecule.atoms.findIndex(
      (a) => a.id === carbonylCarbon.id,
    );
    if (carbonylIdx === -1) return "carbamoyl";

    const mainChainAtomIndices = getMainChainIndices(molecule, parentStructure);
    const substituentAtomIndices = collectSubstituentAtoms(
      molecule,
      carbonylIdx,
      mainChainAtomIndices,
    );

    const baseName = nameAmideSubstituent(
      molecule,
      substituentAtomIndices,
      carbonylIdx,
    );
    return locantPrefix + baseName;
  }

  if (typeof firstAtom === "number") {
    const atomIndices = sub.atoms as number[];
    const carbonylIdx = atomIndices.find(
      (idx: number) => molecule.atoms[idx]?.symbol === "C",
    );
    if (carbonylIdx === undefined) return "carbamoyl";

    const mainChainAtomIndices = getMainChainIndices(molecule, parentStructure);
    const substituentAtomIndices = collectSubstituentAtoms(
      molecule,
      carbonylIdx,
      mainChainAtomIndices,
    );

    const baseName = nameAmideSubstituent(
      molecule,
      substituentAtomIndices,
      carbonylIdx,
    );
    return locantPrefix + baseName;
  }

  return "carbamoyl";
}

function getMainChainIndices(
  molecule: Molecule,
  parentStructure: ParentStructure,
): Set<number> {
  const mainChainAtomIds = new Set<number>();

  if (parentStructure.chain?.atoms) {
    for (const chainAtom of parentStructure.chain.atoms) {
      mainChainAtomIds.add(chainAtom.id);
    }
  }

  if (parentStructure.ring?.atoms) {
    for (const ringAtom of parentStructure.ring.atoms) {
      mainChainAtomIds.add(ringAtom.id);
    }
  }

  const mainChainAtomIndices = new Set<number>();
  for (const atomId of mainChainAtomIds) {
    const idx = molecule.atoms.findIndex((a) => a.id === atomId);
    if (idx !== -1) mainChainAtomIndices.add(idx);
  }

  return mainChainAtomIndices;
}
