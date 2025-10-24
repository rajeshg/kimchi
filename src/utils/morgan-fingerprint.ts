// Morgan/ECFP Fingerprint implementation for openchem
// Author: opencode agent
//
// Usage: computeMorganFingerprint(mol, { radius: 2, nBits: 2048 })

import type { Molecule, Atom, Bond } from 'types';
import { findRings } from './ring-analysis';

export interface MorganFingerprintOptions {
  radius?: number; // ECFP4 = 2
  nBits?: number;  // 1024 or 2048
  useCounts?: boolean; // if true, returns count vector
}

// Simple bit vector utility
class BitVector {
  bits: Uint8Array;
  constructor(size: number) {
    this.bits = new Uint8Array(size);
  }
  set(idx: number) {
    this.bits[idx] = 1;
  }
  toArray() {
    return Array.from(this.bits);
  }
}

// Simple hash function (FNV-1a, 32-bit)
function hashArray(arr: any[]): number {
  let hash = 2166136261;
  for (const v of arr) {
    let str = String(v);
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
  }
  return (hash >>> 0);
}

// Hash combine function (exact boost::hash_combine)
function hashCombine(seed: number, value: number): number {
  // Exact boost::hash_combine implementation
  let hash = seed >>> 0; // Ensure unsigned
  const val = value >>> 0; // Ensure unsigned
  hash ^= val + 0x9e3779b9 + (hash << 6) + (hash >> 2);
  return hash >>> 0; // Ensure unsigned 32-bit
}

// Hash a vector of uint32_t (similar to boost::hash<vector<uint32_t>>)
function hashVector(components: number[]): number {
  let hash = 0;
  for (const component of components) {
    hash = hashCombine(hash, component);
  }
  return hash;
}

// Check if an atom is in any ring (cache for performance)
function isAtomInRing(atom: Atom, mol: Molecule, ringCache?: Map<number, boolean>): boolean {
  if (ringCache?.has(atom.id)) {
    return ringCache.get(atom.id)!;
  }

  const rings = findRings(mol.atoms, mol.bonds);
  const cache = ringCache || new Map<number, boolean>();
  
  for (const ring of rings) {
    for (const atomId of ring) {
      cache.set(atomId, true);
    }
  }

  // Mark atoms not in any ring
  for (const a of mol.atoms) {
    if (!cache.has(a.id)) {
      cache.set(a.id, false);
    }
  }

  if (ringCache) {
    return ringCache.get(atom.id)!;
  }
  return cache.get(atom.id) ?? false;
}

// Compute atom invariant matching RDKit's getConnectivityInvariants
function atomInvariant(
  atom: Atom,
  mol: Molecule,
  atomIdToIdx: Map<number, number>,
  ringCache?: Map<number, boolean>
): number {
  // RDKit's getConnectivityInvariants components:
  // 1. Atomic number
  // 2. Total degree (number of bonds)
  // 3. Total number of hydrogens (including implicit)
  // 4. Formal charge
  // 5. Delta mass (isotope difference from standard atomic weight)
  // 6. Ring membership (1 if in any ring, 0 otherwise)

  const components: number[] = [];

  // 1. Atomic number
  components.push(atom.atomicNumber);

  // 2. Total degree (number of bonds)
  const degree = mol.bonds.filter(b => b.atom1 === atom.id || b.atom2 === atom.id).length;
  components.push(degree);

  // 3. Total number of hydrogens (including implicit)
  const numH = atom.hydrogens || 0;
  components.push(numH);

  // 4. Formal charge
  const charge = atom.charge || 0;
  components.push(charge);

   // 5. Delta mass (isotope difference)
   const deltaMass = atom.isotope || 0;
   components.push(deltaMass);

   // 6. Ring membership (1 if in any ring)
   const inRing = isAtomInRing(atom, mol, ringCache) ? 1 : 0;
   components.push(inRing);

  // Hash the components vector (like boost::hash<vector<uint32_t>>)
  return hashVector(components);
}

// Main Morgan/ECFP fingerprint function
/**
 * Computes a Morgan/ECFP fingerprint for a molecule.
 *
 * @param mol - Molecule object (from parseSMILES, etc)
 * @param options - Optional settings:
 *   - radius: fingerprint radius (default 2, i.e. ECFP4)
 *   - nBits: fingerprint length (default 2048)
 *   - useCounts: if true, returns a count vector (not implemented)
 * @returns Array of 0/1 bits (length nBits)
 *
 * Example:
 *   const mol = parseSMILES('CCO').molecules[0];
 *   const fp = computeMorganFingerprint(mol, { radius: 2, nBits: 1024 });
 */
export function computeMorganFingerprint(
   mol: Molecule,
   options?: MorganFingerprintOptions
): number[] {
   const radius = options?.radius ?? 2;
   const nBits = options?.nBits ?? 2048;
   
   // Build atomId to index map
   const atomIdToIdx = new Map<number, number>();
   for (let i = 0; i < mol.atoms.length; i++) {
     atomIdToIdx.set(mol.atoms[i]!.id, i);
   }

   // Build ring cache once for all atomInvariant calls
   const rings = findRings(mol.atoms, mol.bonds);
   const ringCache = new Map<number, boolean>();
   for (const ring of rings) {
     for (const atomId of ring) {
       ringCache.set(atomId, true);
     }
   }
   for (const atom of mol.atoms) {
     if (!ringCache.has(atom.id)) {
       ringCache.set(atom.id, false);
     }
   }

   // 1. Initial atom invariants
   let invariants: number[] = [];
   for (let i = 0; i < mol.atoms.length; i++) {
     invariants[i] = atomInvariant(mol.atoms[i]!, mol, atomIdToIdx, ringCache);
   }

  // 2. Iterative update (matching RDKit's Morgan algorithm)
  let currentInvariants = [...invariants];
  let seen = new Set<number>();

  // Add round 0 invariants to seen set
  for (const inv of currentInvariants) {
    seen.add(inv);
  }

  for (let layer = 0; layer < radius; layer++) {
    let nextInvariants: number[] = [];

    for (let i = 0; i < mol.atoms.length; i++) {
      const atom = mol.atoms[i]!;

      // Collect neighbor data: [bond_invariant, neighbor_invariant]
      let neighborhoodInvariants: [number, number][] = [];

      for (let b = 0; b < mol.bonds.length; b++) {
        const bond = mol.bonds[b]!;
        let neighborId: number | null = null;
        if (bond.atom1 === atom.id) neighborId = bond.atom2;
        else if (bond.atom2 === atom.id) neighborId = bond.atom1;
        if (neighborId !== null) {
          const neighborIdx = atomIdToIdx.get(neighborId);
          if (neighborIdx === undefined) continue;

          // Map bond type to RDKit's bond invariant (same as bond type for basic Morgan)
          let bondInvariant = 1; // default single
          switch (bond.type) {
            case 'single': bondInvariant = 1; break;
            case 'double': bondInvariant = 2; break;
            case 'triple': bondInvariant = 3; break;
            case 'aromatic': bondInvariant = 12; break; // RDKit uses 12 for aromatic
            default: bondInvariant = 1;
          }

          neighborhoodInvariants.push([bondInvariant, currentInvariants[neighborIdx]!]);
        }
      }

      // Sort the neighbor list (RDKit sorts by the pair)
      neighborhoodInvariants.sort((a, b) => {
        if (a[1] !== b[1]) return a[1] - b[1]; // First by neighbor invariant
        return a[0] - b[0]; // Then by bond invariant
      });

      // Calculate new invariant using incremental hashing (matching RDKit)
      let invar = layer; // Start with layer number
      invar = hashCombine(invar, currentInvariants[i]!); // Add current atom invariant

      // Add each neighbor pair's contribution
      for (const [bondInv, neighborInv] of neighborhoodInvariants) {
        // RDKit combines the pair: hash_combine(invar, make_pair(bond_inv, neighbor_inv))
        // We simulate this by hashing a combined value
        const pairHash = hashCombine(bondInv, neighborInv);
        invar = hashCombine(invar, pairHash);
      }

      nextInvariants[i] = invar;
      seen.add(invar);
    }

    currentInvariants = nextInvariants;
  }

  // 3. Bit vector
  const bits = new BitVector(nBits);
  for (const hash of seen) {
    bits.set((hash % nBits) as number);
  }
  return bits.toArray();
}
