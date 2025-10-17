export { parseSMILES } from './src/parsers/smiles-parser';
export { generateSMILES } from './src/generators/smiles-generator';
export { generateMolfile, type MolGeneratorOptions } from './src/generators/mol-generator';
export { parseMolfile, type MolfileParseResult, type MolfileData, MolfileVersion } from './src/parsers/molfile-parser';
export { parseSDF, type SDFParseResult, type SDFRecord } from './src/parsers/sdf-parser';
export { writeSDF, type SDFWriterOptions, type SDFWriterResult } from './src/generators/sdf-writer';
export { parseSMARTS } from './src/parsers/smarts-parser';
export { matchSMARTS } from './src/matchers/smarts-matcher';
export {
  getMolecularFormula,
  getMolecularMass,
  getExactMass,
  getHeavyAtomCount,
  getHeteroAtomCount,
  getRingCount,
  getAromaticRingCount,
  getFractionCSP3,
  getHBondAcceptorCount,
  getHBondDonorCount,
  getTPSA,
  getRotatableBondCount,
  checkLipinskiRuleOfFive,
  checkVeberRules,
  checkBBBPenetration,
} from './src/utils/molecular-properties';
export { computeLogP } from './src/utils/logp';
export type {
  LipinskiResult,
  VeberResult,
  BBBResult,
} from './src/utils/molecular-properties';
export {
  computeDescriptors,
  getAtomCount,
  getBondCount,
  getFormalCharge,
  getElementCounts,
  getHeavyAtomFraction,
} from './src/utils/molecular-descriptors';
export type { DescriptorOptions, DescriptorResult } from './types';
export type { SMARTSPattern, MatchResult, Match, AtomMatch } from './src/types/smarts-types';
export type { Atom, Bond, Molecule, ParseResult } from './types';