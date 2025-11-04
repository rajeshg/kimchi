import type { Molecule, Atom, Bond, ParseError } from "types";
import { matchSMARTS } from "src/matchers/smarts-matcher";
import type { Match, AtomMatch } from "src/types/smarts-types";
import tautomerRules, {
  type TautomerRule,
} from "src/utils/tautomer/tautomer-rules";
import { generateSMILES } from "src/generators/smiles-generator";
import { BondType } from "types";
import { validateValences } from "src/validators/valence-validator";
import { enrichMolecule } from "src/utils/molecule-enrichment";
import { computeImplicitHydrogens } from "src/utils/implicit-hydrogens";
import { computeMorganFingerprint } from "src/utils/morgan-fingerprint";

const debugTautomer = !!process.env.OPENCHEM_DEBUG_TAUTOMER;

export interface TautomerOptions {
  maxTautomers?: number;
  maxTransforms?: number;
  removeStereo?: boolean;
  phases?: number[]; // e.g. [1,2,3]
  maxPerPhase?: number; // optional cap per phase to avoid explosion
  // Fingerprint deduplication options
  useFingerprintDedup?: boolean;
  fpRadius?: number;
  fpSize?: number;
}

export interface TautomerResult {
  smiles: string;
  molecule: Molecule;
  score: number;
  ruleIds: string[];
}

function cloneMolecule(m: Molecule): Molecule {
  const atoms = m.atoms.map((a) => ({ ...a }) as Atom);
  const bonds = m.bonds.map((b) => ({ ...b }) as Bond);
  const cloned: Molecule = {
    atoms,
    bonds,
    rings: m.rings,
    ringInfo: m.ringInfo,
  };
  return cloned;
}

// implicit hydrogens computed in src/utils/implicit-hydrogens.ts

function findBondIndexBetween(
  mol: Molecule,
  atomId1: number,
  atomId2: number,
): number {
  return mol.bonds.findIndex(
    (b) =>
      (b.atom1 === atomId1 && b.atom2 === atomId2) ||
      (b.atom1 === atomId2 && b.atom2 === atomId1),
  );
}

export function enumerateTautomers(
  inputMol: Molecule,
  opts: TautomerOptions = {},
): TautomerResult[] {
  const maxTautomers = opts.maxTautomers ?? 256;
  const maxTransforms = opts.maxTransforms ?? 1024;
  const phases = opts.phases ?? [1, 2, 3];
  const maxPerPhase = opts.maxPerPhase ?? 512;

  let transforms = 0;
  const seen = new Map<string, TautomerResult>();

  // Always include the original molecule in the output set
  const inputSmiles = generateSMILES(inputMol);
  if (!seen.has(inputSmiles)) {
    seen.set(inputSmiles, {
      smiles: inputSmiles,
      molecule: inputMol,
      score: scoreMolecule(inputMol),
      ruleIds: [],
    });
  }

  // Local fingerprint deduplication options and maps
  const useFingerprintDedup: boolean = opts.useFingerprintDedup ?? true;
  const fpRadius: number = opts.fpRadius ?? 2;
  const fpSize: number = opts.fpSize ?? 2048;
  const fpMap: Map<string, string[]> = new Map<string, string[]>();
  const fpCache: Map<string, string> = new Map<string, string>();

  // Normalize rules and ensure phase defaults to 1
  const allRules: Array<TautomerRule> = (tautomerRules || []).map(
    (r: TautomerRule) => ({ ...r, phase: r.phase ?? 1 }),
  );

  function scoreMolecule(mol: Molecule): number {
    let score = 0;
    for (const a of mol.atoms) {
      if (a.charge && a.charge !== 0) score -= 10;
      if (a.aromatic) score += 1;
    }
    return score;
  }

  function debugMol(mol: Molecule, label: string, ruleIds: string[]) {
    if (!debugTautomer) return;
    const smiles = generateSMILES(mol);
    const hCounts = mol.atoms
      .map((a) => `${a.symbol}${a.id}:H${a.hydrogens ?? 0}`)
      .join(" ");
    console.debug(
      `[tautomer][${label}] ${smiles} [${ruleIds.join(",")}] | ${hCounts}`,
    );
  }

  // Queue item carries the molecule and the chain of applied rule ids that produced it
  type QueueItem = { molecule: Molecule; ruleIds: string[] };

  // Start phase processing. The initial seed for phase 1 is the input molecule only.
  let phaseSeedMolecules: QueueItem[] = [{ molecule: inputMol, ruleIds: [] }];

  for (const phase of phases) {
    if (transforms >= maxTransforms) break;
    if (seen.size >= maxTautomers) break;

    if (debugTautomer)
      console.debug(
        `[tautomer] Starting phase ${phase} with seed size ${phaseSeedMolecules.length}`,
      );

    const rulesForPhase = allRules
      .filter((r) => r.phase === phase)
      .sort((a, b) => (b.priority || 0) - (a.priority || 0));
    if (rulesForPhase.length === 0) continue;

    const processedThisPhase = new Set<string>();
    const localQueue: QueueItem[] = phaseSeedMolecules.slice();
    let producedThisPhase = 0;

    while (
      localQueue.length &&
      transforms < maxTransforms &&
      seen.size < maxTautomers &&
      producedThisPhase < maxPerPhase
    ) {
      const baseItem = localQueue.shift()!;
      const baseMol = baseItem.molecule;
      const baseRuleIds = baseItem.ruleIds || [];
      const baseSmiles = generateSMILES(baseMol);
      if (processedThisPhase.has(baseSmiles)) continue;
      processedThisPhase.add(baseSmiles);

      for (const rule of rulesForPhase) {
        if (transforms >= maxTransforms) break;
        try {
          const pattern = (rule.smarts_match ||
            rule.smarts ||
            rule.smarts_replace ||
            "") as string;
          if (!pattern) continue;
          const res = matchSMARTS(pattern, baseMol, { maxMatches: Infinity });
          let matches: Match[] = [];
          if (res.success) {
            matches = res.matches;
          } else if (rule.id === "imine-enamine") {
            const manualMatches: Match[] = [];
            for (const b of baseMol.bonds) {
              if (!b) continue;
              if (b.type !== BondType.DOUBLE) continue;
              const a1Idx = baseMol.atoms.findIndex((x) => x.id === b.atom1);
              const a2Idx = baseMol.atoms.findIndex((x) => x.id === b.atom2);
              if (a1Idx === -1 || a2Idx === -1) continue;
              const a1 = baseMol.atoms[a1Idx];
              const a2 = baseMol.atoms[a2Idx];
              if (!a1 || !a2) continue;
              if (a1.symbol === "N" && a2.symbol === "C") {
                manualMatches.push({
                  atoms: [
                    { moleculeIndex: a1Idx, patternIndex: 0 },
                    { moleculeIndex: a2Idx, patternIndex: 1 },
                  ],
                });
              } else if (a2.symbol === "N" && a1.symbol === "C") {
                manualMatches.push({
                  atoms: [
                    { moleculeIndex: a2Idx, patternIndex: 0 },
                    { moleculeIndex: a1Idx, patternIndex: 1 },
                  ],
                });
              }
            }
            if (manualMatches.length > 0) matches = manualMatches;
          } else if (!res.success && rule.id === "amide-imidol") {
            const manualMatches: Match[] = [];
            for (let aIdx = 0; aIdx < baseMol.atoms.length; aIdx++) {
              const a = baseMol.atoms[aIdx];
              if (!a || a.symbol !== "N") continue;
              const nBonds = baseMol.bonds.filter(
                (b) => b.atom1 === a.id || b.atom2 === a.id,
              );
              for (const nb of nBonds) {
                const otherId = nb.atom1 === a.id ? nb.atom2 : nb.atom1;
                const otherIdx = baseMol.atoms.findIndex(
                  (x) => x.id === otherId,
                );
                if (otherIdx === -1) continue;
                const otherAtom = baseMol.atoms[otherIdx];
                if (!otherAtom || otherAtom.symbol !== "C") continue;
                const cbonds = baseMol.bonds.filter(
                  (b) => b.atom1 === otherAtom.id || b.atom2 === otherAtom.id,
                );
                const hasCarbonyl = cbonds.some((b) => {
                  const oid = b.atom1 === otherAtom.id ? b.atom2 : b.atom1;
                  const oa = baseMol.atoms.find((x) => x.id === oid);
                  return oa && oa.symbol === "O" && b.type === BondType.DOUBLE;
                });
                if (hasCarbonyl)
                  manualMatches.push({
                    atoms: [
                      { moleculeIndex: aIdx, patternIndex: 0 },
                      { moleculeIndex: otherIdx, patternIndex: 1 },
                    ],
                  });
              }
            }
            if (manualMatches.length > 0) {
              if (debugTautomer)
                console.debug(
                  `[tautomer] nitro fallback found ${manualMatches.length} manualMatches`,
                );
              matches = manualMatches;
            }
          } else if (!res.success && rule.id === "nitro-aci-nitro") {
            const manualMatches: Match[] = [];
            for (let i = 0; i < baseMol.atoms.length; i++) {
              const a = baseMol.atoms[i];
              if (!a || a.symbol !== "N") continue;
              const nbonds = baseMol.bonds.filter(
                (b) => b.atom1 === a.id || b.atom2 === a.id,
              );
              const oxyNeighbors = nbonds
                .map((b) => {
                  const oid = b.atom1 === a.id ? b.atom2 : b.atom1;
                  const oa = baseMol.atoms.find((x) => x.id === oid);
                  return oa;
                })
                .filter((oa) => oa && oa.symbol === "O");
              if (oxyNeighbors.length >= 2)
                manualMatches.push({
                  atoms: [{ moleculeIndex: i, patternIndex: 0 }],
                });
            }
            if (manualMatches.length > 0) {
              if (debugTautomer)
                console.debug(
                  `[tautomer] nitro fallback found ${manualMatches.length} manualMatches`,
                );
              matches = manualMatches;
            }
          }

          if (!matches || matches.length === 0) continue;

          for (const match of matches) {
            if (transforms >= maxTransforms) break;
            transforms++;

            const newMol = cloneMolecule(baseMol);
            const matchedAtomIndices: number[] = (match.atoms || []).map(
              (am: AtomMatch) => am.moleculeIndex,
            );
            const atomAt = (idx: number) => newMol.atoms[idx];
            let mutatedMol: Molecule | null = null;

            // The transform implementations are identical to previous logic but are only applied to rules in the current phase.

            if (rule.id === "keto-enol") {
              let carbonylCIdx = -1;
              let oxyIdx = -1;
              for (const mi of matchedAtomIndices) {
                const a = atomAt(mi);
                if (!a) continue;
                if (a.symbol === "C") {
                  const molAtomId = a.id;
                  const bonds = newMol.bonds.filter(
                    (b) => b.atom1 === molAtomId || b.atom2 === molAtomId,
                  );
                  for (const b of bonds) {
                    const otherId = b.atom1 === molAtomId ? b.atom2 : b.atom1;
                    const otherIdx = newMol.atoms.findIndex(
                      (x) => x.id === otherId,
                    );
                    if (otherIdx === -1) continue;
                    const otherAtom = newMol.atoms[otherIdx];
                    if (!otherAtom) continue;
                    if (
                      otherAtom.symbol === "O" &&
                      b.type === BondType.DOUBLE
                    ) {
                      carbonylCIdx = mi;
                      oxyIdx = otherIdx;
                      // For each possible enolization, push to queue immediately
                      const carbonylAtom = newMol.atoms[carbonylCIdx];
                      const oxyAtom = newMol.atoms[oxyIdx];
                      if (carbonylAtom && oxyAtom) {
                        const alphaCandidates = newMol.bonds
                          .filter(
                            (b) =>
                              b.atom1 === carbonylAtom.id ||
                              b.atom2 === carbonylAtom.id,
                          )
                          .map((b) =>
                            b.atom1 === carbonylAtom.id ? b.atom2 : b.atom1,
                          )
                          .map((id) =>
                            newMol.atoms.findIndex((a) => a.id === id),
                          )
                          .filter((idx) => idx !== -1) as number[];

                        let alphaIdx = -1;
                        for (const idx of alphaCandidates) {
                          const other = newMol.atoms[idx];
                          if (!other) continue;
                          if (other.symbol !== "C") continue;
                          if (
                            (other.hydrogens ?? 0) > 0 &&
                            idx !== carbonylCIdx
                          ) {
                            alphaIdx = idx;
                            break;
                          }
                        }
                        if (alphaIdx === -1) {
                          for (const idx of alphaCandidates) {
                            const other = newMol.atoms[idx];
                            if (!other) continue;
                            if (other.symbol === "C" && idx !== carbonylCIdx) {
                              alphaIdx = idx;
                              break;
                            }
                          }
                        }

                        if (alphaIdx !== -1) {
                          const alphaAtom = newMol.atoms[alphaIdx];
                          const oxyAtomNew = newMol.atoms[oxyIdx];
                          if (alphaAtom && oxyAtomNew) {
                            const coBondIdx = findBondIndexBetween(
                              newMol,
                              carbonylAtom.id,
                              oxyAtomNew.id,
                            );
                            const caBondIdx = findBondIndexBetween(
                              newMol,
                              carbonylAtom.id,
                              alphaAtom.id,
                            );
                            if (coBondIdx !== -1 && caBondIdx !== -1) {
                              const newBonds = newMol.bonds.slice();
                              newBonds[coBondIdx] = {
                                ...newBonds[coBondIdx],
                                type: BondType.SINGLE,
                              } as Bond;
                              newBonds[caBondIdx] = {
                                ...newBonds[caBondIdx],
                                type: BondType.DOUBLE,
                              } as Bond;

                              const newAtoms = newMol.atoms.slice();
                              const alphaAtomNew = newAtoms[alphaIdx];
                              const oxyAtomNew2 = newAtoms[oxyIdx];
                              if (alphaAtomNew && oxyAtomNew2) {
                                // Only update hydrogens for heavy atoms (not symbol 'H')
                                if (
                                  alphaAtomNew.symbol === "H" ||
                                  alphaAtomNew.atomicNumber === 1
                                ) {
                                  if (debugTautomer)
                                    console.debug(
                                      `[tautomer][BUG] Attempted to decrement hydrogens on H atom: id=${alphaAtomNew.id}`,
                                    );
                                } else {
                                  newAtoms[alphaIdx] = {
                                    ...alphaAtomNew,
                                    hydrogens:
                                      (alphaAtomNew.hydrogens ?? 0) - 1,
                                  } as Atom;
                                }
                                if (
                                  oxyAtomNew2.symbol === "H" ||
                                  oxyAtomNew2.atomicNumber === 1
                                ) {
                                  if (debugTautomer)
                                    console.debug(
                                      `[tautomer][BUG] Attempted to increment hydrogens on H atom: id=${oxyAtomNew2.id}`,
                                    );
                                } else {
                                  newAtoms[oxyIdx] = {
                                    ...oxyAtomNew2,
                                    hydrogens: (oxyAtomNew2.hydrogens ?? 0) + 1,
                                  } as Atom;
                                }
                                const mutatedMolEnol = {
                                  atoms: newAtoms as readonly Atom[],
                                  bonds: newBonds as readonly Bond[],
                                  rings: newMol.rings,
                                  ringInfo: newMol.ringInfo,
                                } as Molecule;
                                const withHydrogens =
                                  computeImplicitHydrogens(mutatedMolEnol);
                                const finalMol = enrichMolecule(withHydrogens);
                                debugMol(finalMol, "keto-enol", [
                                  ...baseRuleIds,
                                  rule.id,
                                ]);
                                const errors: ParseError[] = [];
                                try {
                                  validateValences(
                                    finalMol.atoms,
                                    finalMol.bonds,
                                    errors,
                                  );
                                } catch (_e) {}
                                if (errors && errors.length > 0) continue;
                                const smiles = generateSMILES(finalMol);
                                if (!seen.has(smiles)) {
                                  const newRuleIds = [...baseRuleIds, rule.id];
                                  const result: TautomerResult = {
                                    smiles,
                                    molecule: finalMol,
                                    score: scoreMolecule(finalMol),
                                    ruleIds: newRuleIds,
                                  };
                                  seen.set(smiles, result);
                                  localQueue.push({
                                    molecule: finalMol,
                                    ruleIds: newRuleIds,
                                  });
                                  producedThisPhase++;
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }

            if (!mutatedMol && rule.id === "imine-enamine") {
              let nIdx = -1;
              let cIdx = -1;
              let alphaIdx = -1;
              for (const mi of matchedAtomIndices) {
                const a = atomAt(mi);
                if (!a) continue;
                if (a.symbol === "N") {
                  const bonds = newMol.bonds.filter(
                    (b) => b.atom1 === a.id || b.atom2 === a.id,
                  );
                  for (const b of bonds) {
                    const otherId = b.atom1 === a.id ? b.atom2 : b.atom1;
                    const otherIdx = newMol.atoms.findIndex(
                      (x) => x.id === otherId,
                    );
                    if (otherIdx === -1) continue;
                    const otherAtom = newMol.atoms[otherIdx];
                    if (!otherAtom) continue;
                    if (
                      otherAtom.symbol === "C" &&
                      b.type === BondType.DOUBLE
                    ) {
                      nIdx = mi;
                      cIdx = otherIdx;
                      break;
                    }
                  }
                  if (nIdx !== -1) break;
                }
              }

              if (nIdx !== -1 && cIdx !== -1) {
                const cAtom = newMol.atoms[cIdx];
                if (cAtom) {
                  const neighBonds = newMol.bonds.filter(
                    (b) => b.atom1 === cAtom.id || b.atom2 === cAtom.id,
                  );
                  for (const b of neighBonds) {
                    const otherId = b.atom1 === cAtom.id ? b.atom2 : b.atom1;
                    const otherIdx = newMol.atoms.findIndex(
                      (x) => x.id === otherId,
                    );
                    if (otherIdx === -1) continue;
                    const otherAtom = newMol.atoms[otherIdx];
                    if (!otherAtom) continue;
                    if (otherAtom.symbol === "C" && otherIdx !== nIdx) {
                      alphaIdx = otherIdx;
                      break;
                    }
                  }

                  if (alphaIdx !== -1) {
                    const nAtom = nIdx !== -1 ? newMol.atoms[nIdx] : undefined;
                    const alphaAtom = newMol.atoms[alphaIdx];
                    if (nAtom && alphaAtom && (nAtom.hydrogens ?? 0) > 0) {
                      const ncBondIdx = findBondIndexBetween(
                        newMol,
                        nAtom.id,
                        cAtom.id,
                      );
                      const caBondIdx = findBondIndexBetween(
                        newMol,
                        cAtom.id,
                        alphaAtom.id,
                      );
                      if (ncBondIdx !== -1 && caBondIdx !== -1) {
                        const newBonds = newMol.bonds.slice();
                        newBonds[ncBondIdx] = {
                          ...newBonds[ncBondIdx],
                          type: BondType.SINGLE,
                        } as Bond;
                        newBonds[caBondIdx] = {
                          ...newBonds[caBondIdx],
                          type: BondType.DOUBLE,
                        } as Bond;

                        const newAtoms = newMol.atoms.slice();
                        const nAtomNew = newAtoms[nIdx];
                        const alphaAtomNew = newAtoms[alphaIdx];
                        if (nAtomNew && alphaAtomNew) {
                          newAtoms[nIdx] = {
                            ...nAtomNew,
                            hydrogens: (nAtomNew.hydrogens ?? 0) - 1,
                          } as Atom;
                          newAtoms[alphaIdx] = {
                            ...alphaAtomNew,
                            hydrogens: (alphaAtomNew.hydrogens ?? 0) + 1,
                          } as Atom;
                          mutatedMol = {
                            atoms: newAtoms as readonly Atom[],
                            bonds: newBonds as readonly Bond[],
                            rings: newMol.rings,
                            ringInfo: newMol.ringInfo,
                          } as Molecule;
                        }
                      }
                    }
                  }
                }
              }
            }

            if (!mutatedMol && rule.id === "amide-imidol") {
              // For each possible NH-CO pair, generate a tautomer (do not break after first match)
              for (const mi of matchedAtomIndices) {
                const a = atomAt(mi);
                if (!a || a.symbol !== "N") continue;
                const nBonds = newMol.bonds.filter(
                  (b) => b.atom1 === a.id || b.atom2 === a.id,
                );
                for (const nb of nBonds) {
                  const otherId = nb.atom1 === a.id ? nb.atom2 : nb.atom1;
                  const otherIdx = newMol.atoms.findIndex(
                    (x) => x.id === otherId,
                  );
                  if (otherIdx === -1) continue;
                  const otherAtom = newMol.atoms[otherIdx];
                  if (!otherAtom || otherAtom.symbol !== "C") continue;
                  const cbonds = newMol.bonds.filter(
                    (b) => b.atom1 === otherAtom.id || b.atom2 === otherAtom.id,
                  );
                  const oxyBond = cbonds.find((b) => {
                    const oid = b.atom1 === otherAtom.id ? b.atom2 : b.atom1;
                    const oa = newMol.atoms.find((x) => x.id === oid);
                    return (
                      oa && oa.symbol === "O" && b.type === BondType.DOUBLE
                    );
                  });
                  if (!oxyBond) continue;
                  const oxyId =
                    oxyBond.atom1 === otherAtom.id
                      ? oxyBond.atom2
                      : oxyBond.atom1;
                  const oxyIdx = newMol.atoms.findIndex((x) => x.id === oxyId);
                  if (oxyIdx === -1) continue;
                  const nAtom = newMol.atoms[mi];
                  if (!nAtom) continue;
                  if ((nAtom.hydrogens ?? 1) <= 0) continue;
                  const cAtom = otherAtom;
                  const nAtomId = nAtom.id;
                  const oxyAtomRef =
                    oxyIdx !== -1 ? newMol.atoms[oxyIdx] : undefined;
                  if (!oxyAtomRef) continue;
                  const ncBondIdx = findBondIndexBetween(
                    newMol,
                    nAtomId,
                    cAtom.id,
                  );
                  const coBondIdx = findBondIndexBetween(
                    newMol,
                    cAtom.id,
                    oxyAtomRef.id,
                  );
                  if (ncBondIdx === -1 || coBondIdx === -1) continue;
                  const newBonds = newMol.bonds.slice();
                  newBonds[coBondIdx] = {
                    ...newBonds[coBondIdx],
                    type: BondType.SINGLE,
                  } as Bond;
                  newBonds[ncBondIdx] = {
                    ...newBonds[ncBondIdx],
                    type: BondType.DOUBLE,
                  } as Bond;
                  const newAtoms = newMol.atoms.slice();
                  const miAtomRef = newAtoms[mi];
                  const oxyAtomNewRef = newAtoms[oxyIdx];
                  if (!miAtomRef || !oxyAtomNewRef) continue;
                  newAtoms[mi] = {
                    ...miAtomRef,
                    hydrogens: (miAtomRef.hydrogens ?? 0) - 1,
                  } as Atom;
                  newAtoms[oxyIdx] = {
                    ...oxyAtomNewRef,
                    hydrogens: (oxyAtomNewRef.hydrogens ?? 0) + 1,
                  } as Atom;
                  mutatedMol = {
                    atoms: newAtoms as readonly Atom[],
                    bonds: newBonds as readonly Bond[],
                    rings: newMol.rings,
                    ringInfo: newMol.ringInfo,
                  } as Molecule;
                  if (debugTautomer)
                    console.debug(
                      `[tautomer] amide transform produced mutatedMol for atom ${mi}, oxyIdx=${oxyIdx}`,
                    );
                  // Instead of break, push this tautomer and continue to next possible NH-CO pair
                  // Add to localQueue immediately so all single imidol forms are generated
                  const withHydrogens = computeImplicitHydrogens(mutatedMol);
                  const finalMol = enrichMolecule(withHydrogens);
                  const errors: ParseError[] = [];
                  try {
                    validateValences(finalMol.atoms, finalMol.bonds, errors);
                  } catch (_e) {}
                  if (errors && errors.length > 0) continue;
                  const smiles = generateSMILES(finalMol);
                  if (!seen.has(smiles)) {
                    const newRuleIds = [...baseRuleIds, rule.id];
                    const result: TautomerResult = {
                      smiles,
                      molecule: finalMol,
                      score: scoreMolecule(finalMol),
                      ruleIds: newRuleIds,
                    };
                    seen.set(smiles, result);
                    localQueue.push({
                      molecule: finalMol,
                      ruleIds: newRuleIds,
                    });
                    producedThisPhase++;
                  }
                }
              }
            }

            if (!mutatedMol && rule.id === "nitro-aci-nitro") {
              for (const mi of matchedAtomIndices) {
                const a = atomAt(mi);
                if (!a || a.symbol !== "N") continue;
                const nbonds = newMol.bonds.filter(
                  (b) => b.atom1 === a.id || b.atom2 === a.id,
                );
                const oxyPairs = nbonds
                  .map((b) => {
                    const oid = b.atom1 === a.id ? b.atom2 : b.atom1;
                    const oa = newMol.atoms.find((x) => x.id === oid);
                    return { bond: b, atom: oa };
                  })
                  .filter((x) => x.atom && x.atom.symbol === "O");
                if (oxyPairs.length < 2) continue;
                const oxy1 = oxyPairs[0];
                const oxy2 = oxyPairs[1];
                if (!oxy1 || !oxy1.atom || !oxy2 || !oxy2.atom) continue;
                const o1Idx = newMol.atoms.findIndex(
                  (x) => x && x.id === (oxy1.atom as Atom).id,
                );
                const o2Idx = newMol.atoms.findIndex(
                  (x) => x && x.id === (oxy2.atom as Atom).id,
                );
                if (o1Idx === -1 || o2Idx === -1) continue;
                const nAtomIdx = mi;
                const nAtomObj = newMol.atoms[nAtomIdx];
                if (!nAtomObj) continue;
                const o1AtomRef =
                  o1Idx !== -1 ? newMol.atoms[o1Idx] : undefined;
                if (!o1AtomRef) continue;
                const noBondIdx = findBondIndexBetween(
                  newMol,
                  nAtomObj.id,
                  o1AtomRef.id,
                );
                if (noBondIdx === -1) continue;
                const newBonds = newMol.bonds.slice();
                newBonds[noBondIdx] = {
                  ...newBonds[noBondIdx],
                  type: BondType.SINGLE,
                } as Bond;
                const newAtoms = newMol.atoms.slice();
                const targetO1 = newAtoms[o1Idx];
                if (!targetO1) continue;
                newAtoms[o1Idx] = {
                  ...targetO1,
                  hydrogens: (targetO1.hydrogens ?? 0) + 1,
                } as Atom;
                mutatedMol = {
                  atoms: newAtoms as readonly Atom[],
                  bonds: newBonds as readonly Bond[],
                  rings: newMol.rings,
                  ringInfo: newMol.ringInfo,
                } as Molecule;
                if (debugTautomer)
                  console.debug(
                    `[tautomer] nitro transform produced mutatedMol for atom ${mi}`,
                  );
                break;
              }
            }

            const finalMolUnenriched = mutatedMol ?? newMol;

            // Recompute implicit hydrogens on the mutated/combined molecule before enrichment
            const withHydrogens = computeImplicitHydrogens(finalMolUnenriched);
            // Re-enrich molecule to recompute derived properties (degree, ring info)
            const finalMol = enrichMolecule(withHydrogens);

            if (debugTautomer) {
              const atomHs = finalMol.atoms
                .map((a) => `${a.symbol}${a.id}:H=${a.hydrogens ?? 0}`)
                .join(",");
              console.debug(
                `[tautomer] rule=${rule.id} finalMol atom Hs: ${atomHs}`,
              );
            }

            const errors: ParseError[] = [];
            try {
              validateValences(finalMol.atoms, finalMol.bonds, errors);
            } catch (_e) {}
            if (errors && errors.length > 0) {
              if (debugTautomer)
                console.debug(
                  `[tautomer] rule=${rule.id} validation failed: ${JSON.stringify(errors)}`,
                );
              continue;
            }

            // Fingerprint-first dedup: compute fingerprint and check a fingerprint map before falling back to SMILES
            // Use the local fp options & maps declared at function scope
            let fpKey: string | null = null;
            if (useFingerprintDedup) {
              try {
                const fp = computeMorganFingerprint(finalMol, fpRadius, fpSize);
                fpKey = Array.from(fp)
                  .map((b) => b.toString(16).padStart(2, "0"))
                  .join("");
              } catch (_e) {
                if (debugTautomer)
                  console.debug(
                    `[tautomer] fingerprinting failed: ${String(_e)}`,
                  );
                fpKey = null;
              }
            }

            if (fpKey) {
              const existing = fpMap.get(fpKey);
              if (!existing) {
                const smiles = generateSMILES(finalMol);
                if (debugTautomer)
                  console.debug(
                    `[tautomer] rule=${rule.id} produced SMILES ${smiles} (new fp bucket)`,
                  );
                if (!seen.has(smiles)) {
                  const newRuleIds = [...baseRuleIds, rule.id];
                  const result: TautomerResult = {
                    smiles,
                    molecule: finalMol,
                    score: scoreMolecule(finalMol),
                    ruleIds: newRuleIds,
                  };
                  seen.set(smiles, result);
                  localQueue.push({ molecule: finalMol, ruleIds: newRuleIds });
                  producedThisPhase++;
                  fpMap.set(fpKey, [smiles]);
                  fpCache.set(smiles, fpKey);
                  if (seen.size >= maxTautomers) break;
                }
              } else {
                const smiles = generateSMILES(finalMol);
                if (existing.includes(smiles)) {
                  if (debugTautomer)
                    console.debug(
                      `[tautomer] SMILES ${smiles} already known in fp bucket`,
                    );
                  if (!seen.has(smiles)) {
                    const newRuleIds = [...baseRuleIds, rule.id];
                    const result: TautomerResult = {
                      smiles,
                      molecule: finalMol,
                      score: scoreMolecule(finalMol),
                      ruleIds: newRuleIds,
                    };
                    seen.set(smiles, result);
                    localQueue.push({
                      molecule: finalMol,
                      ruleIds: newRuleIds,
                    });
                    producedThisPhase++;
                    fpCache.set(smiles, fpKey);
                    if (seen.size >= maxTautomers) break;
                  }
                } else {
                  if (debugTautomer)
                    console.debug(
                      `[tautomer] fingerprint collision: new SMILES ${smiles} in existing fp bucket`,
                    );
                  if (!seen.has(smiles)) {
                    const newRuleIds = [...baseRuleIds, rule.id];
                    const result: TautomerResult = {
                      smiles,
                      molecule: finalMol,
                      score: scoreMolecule(finalMol),
                      ruleIds: newRuleIds,
                    };
                    seen.set(smiles, result);
                    localQueue.push({
                      molecule: finalMol,
                      ruleIds: newRuleIds,
                    });
                    producedThisPhase++;
                    existing.push(smiles);
                    fpCache.set(smiles, fpKey);
                    if (seen.size >= maxTautomers) break;
                  }
                }
              }
            } else {
              const smiles = generateSMILES(finalMol);
              if (debugTautomer)
                console.debug(
                  `[tautomer] rule=${rule.id} produced SMILES ${smiles}`,
                );
              if (!seen.has(smiles)) {
                const newRuleIds = [...baseRuleIds, rule.id];
                const result: TautomerResult = {
                  smiles,
                  molecule: finalMol,
                  score: scoreMolecule(finalMol),
                  ruleIds: newRuleIds,
                };
                seen.set(smiles, result);
                localQueue.push({ molecule: finalMol, ruleIds: newRuleIds });
                producedThisPhase++;
                if (seen.size >= maxTautomers) break;
              }
            }

            if (fpKey) {
              const existing = fpMap.get(fpKey);
              if (!existing) {
                // new fingerprint bucket: compute smiles and add
                const smiles = generateSMILES(finalMol);
                if (debugTautomer)
                  console.debug(
                    `[tautomer] rule=${rule.id} produced SMILES ${smiles} (new fp bucket)`,
                  );
                if (!seen.has(smiles)) {
                  const newRuleIds = [...baseRuleIds, rule.id];
                  const result: TautomerResult = {
                    smiles,
                    molecule: finalMol,
                    score: scoreMolecule(finalMol),
                    ruleIds: newRuleIds,
                  };
                  seen.set(smiles, result);
                  localQueue.push({ molecule: finalMol, ruleIds: newRuleIds });
                  producedThisPhase++;
                  fpMap.set(fpKey, [smiles]);
                  fpCache.set(smiles, fpKey);
                  if (seen.size >= maxTautomers) break;
                }
              } else {
                // fingerprint bucket exists: only compute SMILES if necessary to check exact duplicate
                let isDuplicate = false;
                for (const knownSmiles of existing) {
                  if (
                    knownSmiles ===
                    (fpCache.get(knownSmiles) ? knownSmiles : null)
                  ) {
                    // quick path: if knownSmiles present, treat as duplicate
                    if (debugTautomer)
                      console.debug(
                        `[tautomer] fingerprint match to known SMILES ${knownSmiles}`,
                      );
                    isDuplicate = true;
                    break;
                  }
                }
                if (!isDuplicate) {
                  const smiles = generateSMILES(finalMol);
                  if (existing.includes(smiles)) {
                    if (debugTautomer)
                      console.debug(
                        `[tautomer] SMILES ${smiles} already known in fp bucket`,
                      );
                    isDuplicate = true;
                    // ensure seen has it (in case fp bucket pre-populated externally)
                    if (!seen.has(smiles)) {
                      const newRuleIds = [...baseRuleIds, rule.id];
                      const result: TautomerResult = {
                        smiles,
                        molecule: finalMol,
                        score: scoreMolecule(finalMol),
                        ruleIds: newRuleIds,
                      };
                      seen.set(smiles, result);
                      localQueue.push({
                        molecule: finalMol,
                        ruleIds: newRuleIds,
                      });
                      producedThisPhase++;
                      fpCache.set(smiles, fpKey);
                      if (seen.size >= maxTautomers) break;
                    }
                  } else {
                    if (debugTautomer)
                      console.debug(
                        `[tautomer] fingerprint collision: new SMILES ${smiles} in existing fp bucket`,
                      );
                    const newRuleIds = [...baseRuleIds, rule.id];
                    const result: TautomerResult = {
                      smiles,
                      molecule: finalMol,
                      score: scoreMolecule(finalMol),
                      ruleIds: newRuleIds,
                    };
                    seen.set(smiles, result);
                    localQueue.push({
                      molecule: finalMol,
                      ruleIds: newRuleIds,
                    });
                    producedThisPhase++;
                    existing.push(smiles);
                    fpCache.set(smiles, fpKey);
                    if (seen.size >= maxTautomers) break;
                  }
                }
                if (isDuplicate) {
                  // skip
                }
              }
            } else {
              // fingerprinting disabled or failed: fallback to SMILES-only dedup
              const smiles = generateSMILES(finalMol);
              if (debugTautomer)
                console.debug(
                  `[tautomer] rule=${rule.id} produced SMILES ${smiles}`,
                );
              if (!seen.has(smiles)) {
                const newRuleIds = [...baseRuleIds, rule.id];
                const result: TautomerResult = {
                  smiles,
                  molecule: finalMol,
                  score: scoreMolecule(finalMol),
                  ruleIds: newRuleIds,
                };
                seen.set(smiles, result);
                localQueue.push({ molecule: finalMol, ruleIds: newRuleIds });
                producedThisPhase++;
                if (seen.size >= maxTautomers) break;
              }
            }
          }
        } catch (_err) {
          continue;
        }
      }
    }

    // Prepare seed molecules for next phase: all unique molecules we've discovered so far
    phaseSeedMolecules = Array.from(seen.values()).map((r) => ({
      molecule: r.molecule,
      ruleIds: r.ruleIds || [],
    }));
    if (debugTautomer)
      console.debug(
        `[tautomer] Finished phase ${phase}; seen=${seen.size} transforms=${transforms}`,
      );
  }

  // sort by score descending then return
  return Array.from(seen.values()).sort((a, b) => b.score - a.score);
}
