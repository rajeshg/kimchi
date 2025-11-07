import type {
  FunctionalGroup,
  ParentStructure,
  StructuralSubstituent,
} from "../../types";
import type { NamingSubstituent } from "../../naming/iupac-types";

/**
 * Extended ParentStructure type with assembly-phase properties
 */
export type ParentStructureExtended = ParentStructure & {
  assembledName?: string;
  substituents?: (StructuralSubstituent | NamingSubstituent)[];
  size?: number;
};

/**
 * Extended FunctionalGroup with optional locant property for assembly
 */
export type FunctionalGroupExtended = FunctionalGroup & {
  locant?: number;
};

/**
 * Extended StructuralSubstituent with optional assembly properties
 */
export type StructuralSubstituentExtended = StructuralSubstituent & {
  assembledName?: string;
  prefix?: string;
  locants?: number[];
  suffix?: string;
};

/**
 * Union type for items that can be either FunctionalGroup or StructuralSubstituent with extensions
 */
export type StructuralSubstituentOrFunctionalGroup =
  | FunctionalGroupExtended
  | StructuralSubstituentExtended;
