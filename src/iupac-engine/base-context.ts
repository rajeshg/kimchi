/**
 * Common context interface that both old and new implementations can use
 */

import type { Molecule } from "../../types";

export interface BaseContext {
  molecule: Molecule;
  getState(): unknown;
}
