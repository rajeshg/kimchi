import type { Molecule } from "types";
import { findSubstituents } from "../substituent-naming";
import { getHeteroPositions } from "./chain-orientation";

/**
 * Compare two chains by substituent positions and atom indices
 * Returns true if newChain is better than bestChain
 *
 * Comparison rules (in order):
 * 1. Prefer chain with lower (earlier) substituent positions (lexicographic)
 * 2. If positions equal, prefer chain with more substituents
 * 3. If still equal, prefer chain with lower atom indices (lexicographic)
 */
export function compareChains(
  newPositions: number[],
  newCount: number,
  newChain: number[],
  bestPositions: number[],
  bestCount: number,
  bestChain: number[],
): boolean {
  if (process.env.VERBOSE) {
    console.log(
      `[compareChains] newChain=[${newChain}] newPositions=[${newPositions}] bestChain=[${bestChain}] bestPositions=[${bestPositions}]`,
    );
  }

  // Compare substituent positions (lowest first)
  const minLength = Math.min(newPositions.length, bestPositions.length);
  for (let i = 0; i < minLength; i++) {
    if (newPositions[i]! !== bestPositions[i]!) {
      if (process.env.VERBOSE) {
        console.log(
          `[compareChains] Position comparison: newPositions[${i}]=${newPositions[i]} vs bestPositions[${i}]=${bestPositions[i]} => ${newPositions[i]! < bestPositions[i]!}`,
        );
      }
      return newPositions[i]! < bestPositions[i]!;
    }
  }

  // If positions are equal, prefer more substituents
  if (newPositions.length !== bestPositions.length) {
    if (process.env.VERBOSE) {
      console.log(
        `[compareChains] Length comparison: newPositions.length=${newPositions.length} vs bestPositions.length=${bestPositions.length} => ${newPositions.length > bestPositions.length}`,
      );
    }
    return newPositions.length > bestPositions.length;
  }

  // If everything is equal, prefer the chain with lowest atom indices
  for (let i = 0; i < newChain.length; i++) {
    if (newChain[i] !== bestChain[i]) {
      if (process.env.VERBOSE) {
        console.log(
          `[compareChains] Atom ID comparison: newChain[${i}]=${newChain[i]} vs bestChain[${i}]=${bestChain[i]} => ${newChain[i]! < bestChain[i]!}`,
        );
      }
      return newChain[i]! < bestChain[i]!;
    }
  }

  if (process.env.VERBOSE) {
    console.log(`[compareChains] Chains are identical => false`);
  }
  return false;
}

/**
 * Lexicographic comparison of locant arrays
 * Returns true if 'a' is better (lower) than 'b'
 *
 * Missing elements are treated as +Infinity, so shorter arrays
 * compare correctly against longer ones
 *
 * @param a - First locant array
 * @param b - Second locant array
 * @returns true if 'a' is lexicographically lower than 'b'
 */
export function isBetterLocants(a: number[], b: number[]): boolean {
  const maxLen = Math.max(a.length, b.length);
  for (let i = 0; i < maxLen; i++) {
    const ai = a[i] ?? Number.POSITIVE_INFINITY;
    const bi = b[i] ?? Number.POSITIVE_INFINITY;
    if (ai !== bi) return ai < bi;
  }
  return false;
}

/**
 * Compare priority locants for two chains
 * Returns true if chain 'a' is better than chain 'b'
 *
 * Priority comparison order (P-14.4, P-44.4):
 * 1. Unsaturation locants (lowest wins)
 * 2. Heteroatom locants (lowest wins, promotes hetero chains)
 * 3. Substituent locants (lowest wins)
 *
 * @param a - Priority locants for first chain [unsaturation, substituents, hetero]
 * @param b - Priority locants for second chain [unsaturation, substituents, hetero]
 * @returns true if chain 'a' has better priority locants
 */
export function isBetterPriorityLocants(
  a: [number[], number[], number[]],
  b: [number[], number[], number[]],
): boolean {
  const [aUnsaturation, aSubstituents, aHetero] = a;
  const [bUnsaturation, bSubstituents, bHetero] = b;

  // Compare unsaturation locants lexicographically (lowest set wins)
  if (isBetterLocants(aUnsaturation, bUnsaturation)) return true;
  if (isBetterLocants(bUnsaturation, aUnsaturation)) return false;

  // Unsaturation equal -> prefer chains with lower hetero locants (promote hetero chains)
  if (isBetterLocants(aHetero, bHetero)) return true;
  if (isBetterLocants(bHetero, aHetero)) return false;

  // Hetero equal -> compare substituent locants lexicographically
  if (isBetterLocants(aSubstituents, bSubstituents)) return true;
  if (isBetterLocants(bSubstituents, aSubstituents)) return false;

  return false;
}

/**
 * OPSIN-inspired lightweight heuristics comparator for candidate chains
 * Used when priority locants are identical
 *
 * Comparison rules (in order):
 * 1. Prefer chains with more heteroatoms (higher heteroatom count wins)
 * 2. Prefer chains with fewer substituents (lower substituent count wins)
 * 3. Prefer chains where complex substituents (size >= 5) are at position 1
 * 4. Prefer chains with lower sum of substituent positions
 *
 * Returns true if chain A is better than chain B
 *
 * @param molecule - The molecule containing both chains
 * @param aChain - First chain to compare
 * @param bChain - Second chain to compare
 * @returns true if chain A is better by OPSIN heuristics
 */
export function isBetterByOpsinHeuristics(
  molecule: Molecule,
  aChain: number[],
  bChain: number[],
): boolean {
  const aHeteroCount = getHeteroPositions(aChain, molecule).length;
  const bHeteroCount = getHeteroPositions(bChain, molecule).length;

  if (aHeteroCount !== bHeteroCount) return aHeteroCount > bHeteroCount;

  const aSubs = findSubstituents(molecule, aChain);
  const bSubs = findSubstituents(molecule, bChain);

  if (process.env.VERBOSE) {
    console.log(`[isBetterByOpsinHeuristics] Comparing chains:`);
    console.log(
      `  Chain A [${aChain.join(",")}]: ${aSubs.length} substituents`,
    );
    aSubs.forEach((s) =>
      console.log(`    pos=${s.position}, name=${s.name}, size=${s.size}`),
    );
    console.log(
      `  Chain B [${bChain.join(",")}]: ${bSubs.length} substituents`,
    );
    bSubs.forEach((s) =>
      console.log(`    pos=${s.position}, name=${s.name}, size=${s.size}`),
    );
  }

  if (aSubs.length !== bSubs.length) return aSubs.length < bSubs.length;

  // Prefer chains where complex substituents (large size) are at lower positions
  // This handles cases like sulfonyl-sulfinyl where we want the complex group at position 1
  const aComplexAtLowPos = aSubs.filter(
    (s) => s.size >= 5 && parseInt(s.position) === 1,
  ).length;
  const bComplexAtLowPos = bSubs.filter(
    (s) => s.size >= 5 && parseInt(s.position) === 1,
  ).length;
  if (aComplexAtLowPos !== bComplexAtLowPos) {
    if (process.env.VERBOSE) {
      console.log(
        `  Complex subs at pos 1: A=${aComplexAtLowPos}, B=${bComplexAtLowPos}`,
      );
    }
    return aComplexAtLowPos > bComplexAtLowPos;
  }

  // Tie-break by sum of substituent positions (lower is better)
  const sumA = aSubs.reduce((s, p) => s + parseInt(p.position), 0);
  const sumB = bSubs.reduce((s, p) => s + parseInt(p.position), 0);
  if (sumA !== sumB) return sumA < sumB;

  return false;
}
