/**
 * Substituent Naming Module
 *
 * This module contains all functions related to finding and naming substituents
 * attached to a main chain in IUPAC nomenclature.
 */

// Main substituent detection
export { findSubstituents } from "./substituent-detection";

// Substituent classification
export { classifySubstituent } from "./substituent-classification";

// Specialized substituent naming functions
export { nameAlkoxySubstituent } from "./alkoxy";
export { nameAlkylSulfanylSubstituent } from "./sulfanyl";
export { namePhosphorylSubstituent } from "./phosphoryl";
export { nameAmideSubstituent } from "./amide";
export { nameRingSubstituent } from "./ring";
