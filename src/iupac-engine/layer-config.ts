import { LayerType } from "./types";
import type { Layer } from "./types";
import { ATOMIC_LAYER_RULES } from "./rules/atomic-layer/index";
import { FUNCTIONAL_GROUP_LAYER_RULES } from "./rules/functional-groups-layer";
import { NOMENCLATURE_METHOD_LAYER_RULES } from "./rules/nomenclature-method-layer/index";
import { PARENT_CHAIN_SELECTION_LAYER_RULES } from "./rules/parent-chain-selection-layer/index";
import { INITIAL_STRUCTURE_LAYER_RULES } from "./rules/initial-structure-layer/index";
import { RING_ANALYSIS_LAYER_RULES } from "./rules/ring-analysis-layer";
import { NUMBERING_LAYER_RULES } from "./rules/numbering-layer";
import { NAME_ASSEMBLY_LAYER_RULES } from "./rules/name-assembly-layer";

/**
 * Layer execution order -严格按照Blue Book rule hierarchy
 */
export const LAYER_ORDER = [
  "atomic",
  "functional-groups",
  "nomenclature-method",
  "ring-analysis",
  "parent-selection",
  "chain-analysis",
  "numbering",
  "name-assembly",
] as const;

/**
 * Layer definitions with their rules
 */
export const LAYER_DEFINITIONS: Layer[] = [
  {
    name: "atomic",
    description: "Atomic properties and basic molecular analysis",
    layerType: LayerType.ATOMIC,
    rules: ATOMIC_LAYER_RULES,
  },
  {
    name: "functional-groups",
    description: "Functional group detection and prioritization",
    layerType: LayerType.FUNCTIONAL_GROUPS,
    rules: FUNCTIONAL_GROUP_LAYER_RULES,
  },
  {
    name: "nomenclature-method",
    description: "Nomenclature method selection (P-51)",
    layerType: LayerType.NOMENCLATURE_METHOD,
    rules: NOMENCLATURE_METHOD_LAYER_RULES,
  },
  {
    name: "ring-analysis",
    description: "Ring system analysis and selection",
    layerType: LayerType.PARENT_SELECTION,
    rules: RING_ANALYSIS_LAYER_RULES,
  },
  {
    name: "parent-selection",
    description: "Parent structure selection (P-44)",
    layerType: LayerType.PARENT_SELECTION,
    rules: INITIAL_STRUCTURE_LAYER_RULES,
  },
  {
    name: "chain-analysis",
    description: "Chain analysis and selection (P-44.3)",
    layerType: LayerType.PARENT_SELECTION,
    rules: PARENT_CHAIN_SELECTION_LAYER_RULES,
  },
  {
    name: "numbering",
    description: "Locant assignment and numbering (P-14.4)",
    layerType: LayerType.NUMBERING,
    rules: NUMBERING_LAYER_RULES,
  },
  {
    name: "name-assembly",
    description: "Final name construction and assembly",
    layerType: LayerType.NAME_ASSEMBLY,
    rules: NAME_ASSEMBLY_LAYER_RULES,
  },
];

/**
 * Layer dependencies
 */
export const LAYER_DEPENDENCIES: Record<string, string[]> = {
  "functional-groups": ["atomic"],
  "nomenclature-method": ["functional-groups"],
  "ring-analysis": ["functional-groups"],
  "parent-selection": ["nomenclature-method", "ring-analysis"],
  "chain-analysis": ["functional-groups", "parent-selection"],
  numbering: ["parent-selection"],
  "name-assembly": ["numbering"],
};
