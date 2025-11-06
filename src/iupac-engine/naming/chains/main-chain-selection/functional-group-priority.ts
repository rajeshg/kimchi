import type { Molecule } from "types";
import { BondType } from "types";
import { getSharedOPSINService } from "../../../services/opsin-service";

/**
 * Calculate the highest priority functional group in a chain using OPSIN priorities
 * Returns the lowest OPSIN priority number (highest priority functional group)
 *
 * OPSIN Priority Order (lower number = higher priority):
 * 1. Carboxylic acids, phosphonic acids (priority 1-2)
 * 2. Sulfonic acids (priority 2)
 * 3. Anhydrides (priority 3)
 * 4. Esters (priority 4)
 * 5. Acyl halides, sulfonyl halides (priority 5)
 * 6. Amides (priority 6)
 * 7. Nitriles, isocyanates, isothiocyanates (priority 7)
 * 8. Aldehydes, ketones (priority 9)
 * 9. Alcohols (priority 10)
 * 10. Sulfonamides (priority 11)
 * 11. Amines (priority 13)
 * 12. Sulfones (priority 16)
 * 13. Nitro groups (priority 17)
 *
 * @param chain - Chain atom indices to analyze
 * @param molecule - Molecule containing the chain
 * @returns Lowest OPSIN priority number (999 if no functional groups found)
 */
export function getChainFunctionalGroupPriority(
  chain: number[],
  molecule: Molecule,
): number {
  const opsinService = getSharedOPSINService();
  const priorityMap =
    opsinService.getRawRules().functionalGroupPriorities || {};

  let best = 999; // Start with very high (low priority), find minimum
  for (const idx of chain) {
    const atom = molecule.atoms[idx];
    if (!atom) continue;

    // Carbon-based functional groups (carboxylic acid, amide, ester, acid chloride, carbonyl)
    if (atom.symbol === "C") {
      let hasDoubleO = false;
      let hasSingleOwithH = false;
      let hasSingleO = false;
      let hasSingleN = false;
      let hasCl = false;
      let singleOConnectedToC = false;
      let isEsterCarbonyl = false;

      for (const b of molecule.bonds) {
        if (b.atom1 !== idx && b.atom2 !== idx) continue;
        const neigh = b.atom1 === idx ? b.atom2 : b.atom1;
        const nat = molecule.atoms[neigh];
        if (!nat) continue;
        if (nat.symbol === "O") {
          if (b.type === BondType.DOUBLE) hasDoubleO = true;
          if (b.type === BondType.SINGLE) {
            hasSingleO = true;
            if (nat.hydrogens && nat.hydrogens > 0) hasSingleOwithH = true;
            // check if that oxygen is bonded to a carbon (ester-like)
            const oConnectedToC = molecule.bonds.some(
              (ob) =>
                (ob.atom1 === neigh &&
                  molecule.atoms[ob.atom2]?.symbol === "C") ||
                (ob.atom2 === neigh &&
                  molecule.atoms[ob.atom1]?.symbol === "C"),
            );
            if (oConnectedToC) singleOConnectedToC = true;
          }
        }
        if (nat.symbol === "N" && b.type === BondType.SINGLE) hasSingleN = true;
        if (nat.symbol === "Cl" && b.type === BondType.SINGLE) hasCl = true;
        // nitrile: C#N triple bond
        if (nat.symbol === "N" && b.type === BondType.TRIPLE) {
          const opsinPriority = priorityMap["nitrile"] || 7;
          best = Math.min(best, opsinPriority);
        }
      }

      // Detect if this is an ester carbonyl carbon (C in R-C(=O)-O-R')
      // This should get highest priority so one ester is chosen as parent chain
      if (hasDoubleO && hasSingleO && singleOConnectedToC && !hasSingleOwithH) {
        isEsterCarbonyl = true;
      }

      // carboxylic acid - use OPSIN priority
      if (hasDoubleO && hasSingleOwithH) {
        const opsinPriority = priorityMap["carboxylic acid"] || 1;
        best = Math.min(best, opsinPriority);
      }
      // ester carbonyl carbon
      else if (isEsterCarbonyl) {
        const opsinPriority = priorityMap["ester"] || 4;
        best = Math.min(best, opsinPriority);
      }
      // amide - use OPSIN priority
      else if (hasDoubleO && hasSingleN) {
        const opsinPriority = priorityMap["amide"] || 6;
        best = Math.min(best, opsinPriority);
      }
      // acid chloride - use OPSIN priority
      else if (hasDoubleO && hasCl) {
        const opsinPriority = priorityMap["acyl halide"] || 5;
        best = Math.min(best, opsinPriority);
      }
      // anhydride: R-C(=O)-O-C(=O)-R (detect C with =O and -O that connects to another C with =O)
      else if (hasDoubleO && hasSingleO) {
        // find the single O neighbor index
        const singleOidx = molecule.bonds.find(
          (b) =>
            (b.atom1 === idx || b.atom2 === idx) &&
            (b.atom1 === idx
              ? molecule.atoms[b.atom2]
              : molecule.atoms[b.atom1]
            )?.symbol === "O" &&
            b.type === BondType.SINGLE,
        );
        if (singleOidx) {
          const oIdx =
            singleOidx.atom1 === idx ? singleOidx.atom2 : singleOidx.atom1;
          // check if that O connects to another carbon which has a double O
          const connectsToCarbonyl = molecule.bonds.some((ob) => {
            const otherC =
              ob.atom1 === oIdx ? ob.atom2 : ob.atom1 === oIdx ? ob.atom1 : -1;
            if (otherC < 0) return false;
            const otherNat = molecule.atoms[otherC];
            if (!otherNat || otherNat.symbol !== "C") return false;
            // check for C=O on that carbon
            return molecule.bonds.some(
              (cb) =>
                (cb.atom1 === otherC || cb.atom2 === otherC) &&
                (cb.atom1 === otherC
                  ? molecule.atoms[cb.atom2]
                  : molecule.atoms[cb.atom1]
                )?.symbol === "O" &&
                cb.type === BondType.DOUBLE,
            );
          });
          if (connectsToCarbonyl) {
            // anhydride R-C(=O)-O-C(=O)-R
            const opsinPriority = priorityMap["anhydride"] || 3;
            best = Math.min(best, opsinPriority);
          } else {
            // ester-like already handled above, so default to ester level
            const opsinPriority = priorityMap["ester"] || 4;
            best = Math.min(best, opsinPriority);
          }
        } else {
          const opsinPriority = priorityMap["ester"] || 4;
          best = Math.min(best, opsinPriority);
        }
      }
      // ketone/aldehyde-like - use OPSIN priority
      else if (hasDoubleO) {
        const opsinPriority =
          priorityMap["ketone"] || priorityMap["aldehyde"] || 9;
        best = Math.min(best, opsinPriority);
      }
    }

    // Sulfur: sulfonic acids, sulfonamides, sulfone-like
    if (atom.symbol === "S") {
      let doubleOcount = 0;
      let singleOwithH = false;
      let singleN = false;
      let hasCl = false;
      for (const b of molecule.bonds) {
        if (b.atom1 !== idx && b.atom2 !== idx) continue;
        const neigh = b.atom1 === idx ? b.atom2 : b.atom1;
        const nat = molecule.atoms[neigh];
        if (!nat) continue;
        if (nat.symbol === "O") {
          if (b.type === BondType.DOUBLE) doubleOcount++;
          if (b.type === BondType.SINGLE && nat.hydrogens && nat.hydrogens > 0)
            singleOwithH = true;
        }
        if (nat.symbol === "N" && b.type === BondType.SINGLE) singleN = true;
        if (nat.symbol === "Cl" && b.type === BondType.SINGLE) hasCl = true;
      }
      if (doubleOcount >= 2 && singleOwithH) {
        // sulfonic acid R-S(=O)2-OH - use OPSIN priority
        const opsinPriority = priorityMap["sulfonic acid"] || 2;
        best = Math.min(best, opsinPriority);
      } else if (doubleOcount >= 2 && singleN) {
        // sulfonamide R-S(=O)2-NR2 - use OPSIN priority
        const opsinPriority = priorityMap["sulfonamide"] || 11;
        best = Math.min(best, opsinPriority);
      } else if (doubleOcount >= 2 && hasCl) {
        // sulfonyl chloride R-S(=O)2-Cl - use OPSIN priority
        const opsinPriority = priorityMap["sulfonyl halide"] || 5;
        best = Math.min(best, opsinPriority);
      } else if (doubleOcount >= 2) {
        // sulfone-like - use OPSIN priority
        const opsinPriority = priorityMap["sulfone"] || 16;
        best = Math.min(best, opsinPriority);
      }
    }

    // Phosphorus: phosphonic / phosphoric acid detection (simple heuristic)
    if (atom.symbol === "P") {
      let doubleO = false;
      let singleOwithH = false;
      for (const b of molecule.bonds) {
        if (b.atom1 !== idx && b.atom2 !== idx) continue;
        const neigh = b.atom1 === idx ? b.atom2 : b.atom1;
        const nat = molecule.atoms[neigh];
        if (!nat) continue;
        if (nat.symbol === "O") {
          if (b.type === BondType.DOUBLE) doubleO = true;
          if (b.type === BondType.SINGLE && nat.hydrogens && nat.hydrogens > 0)
            singleOwithH = true;
        }
      }
      if (doubleO && singleOwithH) {
        // phosphonic/phosphoric acid - use OPSIN priority
        const opsinPriority =
          priorityMap["phosphonic acid"] || priorityMap["phosphoric acid"] || 1;
        best = Math.min(best, opsinPriority);
      }
    }

    // Nitro group detection: look for N with two O neighbors (one double-bonded typical)
    if (atom.symbol === "N") {
      let oCount = 0;
      let hasDoubleO = false;
      for (const b of molecule.bonds) {
        if (b.atom1 !== idx && b.atom2 !== idx) continue;
        const neigh = b.atom1 === idx ? b.atom2 : b.atom1;
        const nat = molecule.atoms[neigh];
        if (!nat) continue;
        if (nat.symbol === "O") {
          oCount++;
          if (b.type === BondType.DOUBLE) hasDoubleO = true;
        }
      }
      if (oCount >= 2 && hasDoubleO) {
        // nitro group - considered similar priority to carbonyls
        const opsinPriority = priorityMap["nitro"] || 17;
        best = Math.min(best, opsinPriority);
      }
      // isocyanate/isothiocyanate detection: N double-bond to C which is double-bonded to O or S
      for (const b of molecule.bonds) {
        if (b.atom1 !== idx && b.atom2 !== idx) continue;
        const neigh = b.atom1 === idx ? b.atom2 : b.atom1;
        const nat = molecule.atoms[neigh];
        if (!nat) continue;
        if (nat.symbol === "C" && b.type === BondType.DOUBLE) {
          // check C has double-bonded O (isocyanate R-N=C=O)
          const cHasDoubleO = molecule.bonds.some(
            (cb) =>
              (cb.atom1 === neigh || cb.atom2 === neigh) &&
              (cb.atom1 === neigh
                ? molecule.atoms[cb.atom2]
                : molecule.atoms[cb.atom1]
              )?.symbol === "O" &&
              cb.type === BondType.DOUBLE,
          );
          const cHasDoubleS = molecule.bonds.some(
            (cb) =>
              (cb.atom1 === neigh || cb.atom2 === neigh) &&
              (cb.atom1 === neigh
                ? molecule.atoms[cb.atom2]
                : molecule.atoms[cb.atom1]
              )?.symbol === "S" &&
              cb.type === BondType.DOUBLE,
          );
          if (cHasDoubleO) {
            // isocyanate R-N=C=O - use OPSIN priority
            const opsinPriority = priorityMap["isocyanate"] || 7;
            best = Math.min(best, opsinPriority);
          }
          if (cHasDoubleS) {
            // isothiocyanate R-N=C=S - use OPSIN priority
            const opsinPriority = priorityMap["isothiocyanate"] || 7;
            best = Math.min(best, opsinPriority);
          }
        }
      }
    }

    // alcohol: O in chain bonded to C and having H - use OPSIN priority
    if (atom.symbol === "O") {
      if (atom.hydrogens && atom.hydrogens > 0) {
        const opsinPriority = priorityMap["alcohol"] || 10;
        best = Math.min(best, opsinPriority);
      }
    }

    // Check for alcohol groups attached to chain carbons (this handles OH on chain atoms)
    if (atom.symbol === "C") {
      for (const b of molecule.bonds) {
        if (b.atom1 !== idx && b.atom2 !== idx) continue;
        const neigh = b.atom1 === idx ? b.atom2 : b.atom1;
        const nat = molecule.atoms[neigh];
        if (!nat) continue;
        // Check for alcohol: C-OH (carbon bonded to oxygen with hydrogen) - use OPSIN priority
        if (
          nat.symbol === "O" &&
          b.type === BondType.SINGLE &&
          nat.hydrogens &&
          nat.hydrogens > 0
        ) {
          const opsinPriority = priorityMap["alcohol"] || 10;
          best = Math.min(best, opsinPriority);
        }
        // Check for phosphonic acid: C-P(=O)(OH)2 (carbon bonded to phosphorus with =O and -OH groups)
        if (nat.symbol === "P" && b.type === BondType.SINGLE) {
          let hasDoubleO = false;
          let hasOH = false;
          for (const pb of molecule.bonds) {
            if (pb.atom1 !== neigh && pb.atom2 !== neigh) continue;
            const pNeigh = pb.atom1 === neigh ? pb.atom2 : pb.atom1;
            const pnat = molecule.atoms[pNeigh];
            if (!pnat) continue;
            if (pnat.symbol === "O") {
              if (pb.type === BondType.DOUBLE) hasDoubleO = true;
              if (
                pb.type === BondType.SINGLE &&
                pnat.hydrogens &&
                pnat.hydrogens > 0
              )
                hasOH = true;
            }
          }
          if (hasDoubleO && hasOH) {
            // phosphonic acid priority - use OPSIN priority
            const opsinPriority =
              priorityMap["phosphonic acid"] ||
              priorityMap["phosphoric acid"] ||
              1;
            best = Math.min(best, opsinPriority);
          }
        }
      }
    }

    // Amine detection: nitrogen in chain bonded to carbons (primary, secondary, tertiary amines)
    // Amines have similar priority to alcohols (priority = 3)
    if (atom.symbol === "N") {
      // Check if this nitrogen is bonded to carbon(s) - indicating an amine
      let hasCarbonBond = false;
      for (const b of molecule.bonds) {
        if (b.atom1 !== idx && b.atom2 !== idx) continue;
        const neigh = b.atom1 === idx ? b.atom2 : b.atom1;
        const nat = molecule.atoms[neigh];
        if (!nat) continue;
        if (nat.symbol === "C" && b.type === BondType.SINGLE) {
          hasCarbonBond = true;
          break;
        }
      }
      // Only count as amine if it has C-N single bond and is not part of higher-priority groups
      // (nitro groups and isocyanates are already detected above with higher priority)
      // Note: Lower OPSIN priority number = higher priority, so we check if current best > 7 (lower than nitrile)
      if (hasCarbonBond && best > 7) {
        // amine - use OPSIN priority
        const opsinPriority = priorityMap["amine"] || 13;
        best = Math.min(best, opsinPriority);
      }
    }
  }
  return best;
}
