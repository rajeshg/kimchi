import type { Molecule, Atom } from 'types';
import { StereoType } from 'types';
import type { SVGRendererOptions } from 'src/generators/svg-renderer';
import { findSSSR } from './ring-analysis';

export interface AtomCoordinates {
  x: number;
  y: number;
}

export type MoleculeCoordinates = AtomCoordinates[];

interface RingSystem {
  rings: number[][];
  atoms: Set<number>;
  type: 'isolated' | 'fused' | 'spiro' | 'bridged' | 'connected';
}

function getBondLength(atom1: Atom, atom2: Atom, defaultLength: number): number {
  return defaultLength;
}

function getIdealAngle(atom: Atom, neighbors: number[]): number {
  if (neighbors.length === 1) return Math.PI;
  if (neighbors.length === 2) return Math.PI * (2 / 3);
  if (neighbors.length === 3) return Math.PI * (2 / 3);
  return Math.PI / 2;
}

function computeForces(
  coords: MoleculeCoordinates,
  molecule: Molecule,
  bondLength: number,
  ringAtoms: Set<number>
): AtomCoordinates[] {
  const forces: AtomCoordinates[] = coords.map(() => ({ x: 0, y: 0 }));
  const k_spring = 0.5;
  const k_repel = 1000;
  const k_angle = 0.3;

  for (const bond of molecule.bonds) {
    const i = bond.atom1;
    const j = bond.atom2;
    const c1 = coords[i];
    const c2 = coords[j];
    if (!c1 || !c2) continue;

    const dx = c2.x - c1.x;
    const dy = c2.y - c1.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 0.01) continue;

    const targetLength = bondLength;
    const diff = dist - targetLength;
    const force = k_spring * diff;
    const fx = (force * dx) / dist;
    const fy = (force * dy) / dist;

    forces[i]!.x += fx;
    forces[i]!.y += fy;
    forces[j]!.x -= fx;
    forces[j]!.y -= fy;
  }

  for (let i = 0; i < coords.length; i++) {
    for (let j = i + 1; j < coords.length; j++) {
      const c1 = coords[i];
      const c2 = coords[j];
      if (!c1 || !c2) continue;

      const dx = c2.x - c1.x;
      const dy = c2.y - c1.y;
      const distSq = dx * dx + dy * dy;
      if (distSq < 0.01) continue;

      const dist = Math.sqrt(distSq);
      const force = k_repel / distSq;
      const fx = (force * dx) / dist;
      const fy = (force * dy) / dist;

      forces[i]!.x -= fx;
      forces[i]!.y -= fy;
      forces[j]!.x += fx;
      forces[j]!.y += fy;
    }
  }

  for (let i = 0; i < molecule.atoms.length; i++) {
    const atom = molecule.atoms[i];
    if (!atom) continue;
    const neighbors = molecule.bonds
      .filter(b => b.atom1 === atom.id || b.atom2 === atom.id)
      .map(b => (b.atom1 === atom.id ? b.atom2 : b.atom1));

    if (neighbors.length >= 2) {
      for (let j = 0; j < neighbors.length; j++) {
        for (let k = j + 1; k < neighbors.length; k++) {
          const n1 = neighbors[j]!;
          const n2 = neighbors[k]!;
          const c0 = coords[i];
          const c1 = coords[n1];
          const c2 = coords[n2];
          if (!c0 || !c1 || !c2) continue;

          const v1x = c1.x - c0.x;
          const v1y = c1.y - c0.y;
          const v2x = c2.x - c0.x;
          const v2y = c2.y - c0.y;
          const len1 = Math.sqrt(v1x * v1x + v1y * v1y);
          const len2 = Math.sqrt(v2x * v2x + v2y * v2y);
          if (len1 < 0.01 || len2 < 0.01) continue;

          const cosAngle = (v1x * v2x + v1y * v2y) / (len1 * len2);
          const angle = Math.acos(Math.max(-1, Math.min(1, cosAngle)));
          const targetAngle = getIdealAngle(atom, neighbors);
          const angleDiff = angle - targetAngle;
          const torque = k_angle * angleDiff;

          const perp1x = -v1y / len1;
          const perp1y = v1x / len1;
          const perp2x = -v2y / len2;
          const perp2y = v2x / len2;

          forces[n1]!.x += torque * perp1x;
          forces[n1]!.y += torque * perp1y;
          forces[n2]!.x -= torque * perp2x;
          forces[n2]!.y -= torque * perp2y;
        }
      }
    }
  }

  for (const atomId of ringAtoms) {
    const idx = molecule.atoms.findIndex(a => a.id === atomId);
    if (idx >= 0) {
      forces[idx]!.x *= 0.1;
      forces[idx]!.y *= 0.1;
    }
  }

  return forces;
}

function groupRingsIntoSystems(rings: number[][], molecule: Molecule): RingSystem[] {
  const systems: RingSystem[] = [];
  const processed = new Set<number>();

  for (let i = 0; i < rings.length; i++) {
    if (processed.has(i)) continue;

    const system: RingSystem = {
      rings: [rings[i]!],
      atoms: new Set(rings[i]),
      type: 'isolated',
    };

    let changed = true;
    while (changed) {
      changed = false;
      for (let j = 0; j < rings.length; j++) {
        if (processed.has(j) || j === i) continue;
        const ring = rings[j]!;
        const intersection = ring.filter(a => system.atoms.has(a));
        if (intersection.length > 0) {
          system.rings.push(ring);
          for (const atom of ring) system.atoms.add(atom);
          processed.add(j);
          changed = true;
        }
      }
    }

    processed.add(i);
    systems.push(system);
  }

  // Check for systems connected by bonds (but not sharing atoms)
  for (let i = 0; i < systems.length; i++) {
    for (let j = i + 1; j < systems.length; j++) {
      const system1 = systems[i]!;
      const system2 = systems[j]!;
      
      // Check if there's a bond between atoms in different systems
      let hasConnection = false;
      for (const bond of molecule.bonds) {
        const atom1InSystem1 = system1.atoms.has(bond.atom1);
        const atom2InSystem2 = system2.atoms.has(bond.atom2);
        const atom1InSystem2 = system2.atoms.has(bond.atom1);
        const atom2InSystem1 = system1.atoms.has(bond.atom2);
        
        if ((atom1InSystem1 && atom2InSystem2) || (atom1InSystem2 && atom2InSystem1)) {
          hasConnection = true;
          break;
        }
      }
      
      if (hasConnection) {
        // Mark as connected systems
        system1.type = 'connected';
        system2.type = 'connected';
      }
    }
  }

  return systems;
}

function layoutRing(ring: number[], bondLength: number, startAngle?: number): Map<number, AtomCoordinates> {
  const n = ring.length;
  const coords = new Map<number, AtomCoordinates>();
  const radius = bondLength / (2 * Math.sin(Math.PI / n));

  if (startAngle === undefined) {
    if (n === 6) {
      startAngle = -Math.PI / 6;
    } else if (n % 2 === 1) {
      startAngle = -Math.PI / 2;
    } else {
      startAngle = -Math.PI / 2 + Math.PI / n;
    }
  }

  for (let i = 0; i < n; i++) {
    const angle = startAngle + (2 * Math.PI * i) / n;
    coords.set(ring[i]!, {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    });
  }

  return coords;
}

function orderRingsLinearlyForFusion(rings: number[][]): number[][] {
  if (rings.length <= 2) return rings;
  
  const graph = new Map<number, Set<number>>();
  
  for (let i = 0; i < rings.length; i++) {
    if (!graph.has(i)) graph.set(i, new Set());
    for (let j = i + 1; j < rings.length; j++) {
      const setI = new Set(rings[i]);
      const setJ = new Set(rings[j]);
      let sharedCount = 0;
      for (const atom of setI) {
        if (setJ.has(atom)) {
          sharedCount++;
          if (sharedCount >= 2) break;
        }
      }
      if (sharedCount >= 2) {
        graph.get(i)!.add(j);
        if (!graph.has(j)) graph.set(j, new Set());
        graph.get(j)!.add(i);
      }
    }
  }
  
  const findLinearChain = (start: number, visited: Set<number>): number[] => {
    const chain: number[] = [start];
    visited.add(start);
    let current = start;
    
    while (true) {
      const neighbors = Array.from(graph.get(current) || []).filter(n => !visited.has(n));
      if (neighbors.length === 0) break;
      if (neighbors.length > 1) break;
      const next = neighbors[0]!;
      chain.push(next);
      visited.add(next);
      current = next;
    }
    
    return chain;
  };
  
  const visited = new Set<number>();
  const chains: number[][] = [];
  
  for (let i = 0; i < rings.length; i++) {
    if (!visited.has(i)) {
      const chain = findLinearChain(i, visited);
      chains.push(chain);
    }
  }
  
  const result: number[][] = [];
  chains.sort((a, b) => b.length - a.length);
  for (const chain of chains) {
    for (const ringIdx of chain) {
      result.push(rings[ringIdx]!);
    }
  }
  return result;
}

export function layoutFusedRings(rings: number[][], bondLength: number): Map<number, AtomCoordinates> {
  const coords = new Map<number, AtomCoordinates>();

  const sortedRings = orderRingsLinearlyForFusion(rings);
  
  const firstRing = sortedRings[0]!;
  const firstCoords = layoutRing(firstRing, bondLength);
  for (const [id, coord] of firstCoords) {
    coords.set(id, coord);
  }

  for (let i = 1; i < sortedRings.length; i++) {
    const ring = sortedRings[i]!;
    const sharedAtoms = ring.filter(a => coords.has(a));

    if (sharedAtoms.length >= 2) {
      const [a1, a2] = sharedAtoms;
      const c1 = coords.get(a1!)!;
      const c2 = coords.get(a2!)!;

      const idx1 = ring.indexOf(a1!);
      const idx2 = ring.indexOf(a2!);
      
      const ringSize = ring.length;
      const interiorAngle = ((ringSize - 2) * Math.PI) / ringSize;
      
      const idealRingCoords = layoutRing(ring, bondLength);
      const idealC1 = idealRingCoords.get(a1!)!;
      const idealC2 = idealRingCoords.get(a2!)!;
      
      const dx = c2.x - c1.x;
      const dy = c2.y - c1.y;
      const actualDist = Math.sqrt(dx * dx + dy * dy);
      
      const idealDx = idealC2.x - idealC1.x;
      const idealDy = idealC2.y - idealC1.y;
      const idealDist = Math.sqrt(idealDx * idealDx + idealDy * idealDy);
      
      const scale = actualDist / idealDist;
      const actualAngle = Math.atan2(dy, dx);
      const idealAngle = Math.atan2(idealDy, idealDx);
      const rotation = actualAngle - idealAngle;
      
      for (const [atomId, idealCoord] of idealRingCoords) {
        if (!coords.has(atomId)) {
          const relX = idealCoord.x - idealC1.x;
          const relY = idealCoord.y - idealC1.y;
          
          const rotatedX = relX * Math.cos(rotation) - relY * Math.sin(rotation);
          const rotatedY = relX * Math.sin(rotation) + relY * Math.cos(rotation);
          
          const scaledX = rotatedX * scale;
          const scaledY = rotatedY * scale;
          
          coords.set(atomId, {
            x: c1.x + scaledX,
            y: c1.y + scaledY,
          });
        }
      }
    } else if (sharedAtoms.length === 1) {
      const spiroAtom = sharedAtoms[0]!;
      const spiroCoord = coords.get(spiroAtom)!;
      const ringCoords = layoutRing(ring, bondLength);
      const ringSpiroCoord = ringCoords.get(spiroAtom)!;

      for (const [id, coord] of ringCoords) {
        if (id !== spiroAtom) {
          coords.set(id, {
            x: spiroCoord.x + (coord.x - ringSpiroCoord.x),
            y: spiroCoord.y + (coord.y - ringSpiroCoord.y),
          });
        }
      }
    }
  }

  return coords;
}

function layoutChain(molecule: Molecule, bondLength: number): MoleculeCoordinates {
  const n = molecule.atoms.length;
  const coords: MoleculeCoordinates = new Array(n);
  const visited = new Set<number>();

  const degrees = molecule.atoms.map(a => 
    molecule.bonds.filter(b => b.atom1 === a.id || b.atom2 === a.id).length
  );
  
  const isSimpleNonRingMolecule = !molecule.ringInfo || !molecule.ringInfo.rings || molecule.ringInfo.rings.length === 0;
  
  let startIdx: number;
  if (isSimpleNonRingMolecule) {
    const branchingAtomIdx = degrees.findIndex(d => d > 2);
    if (branchingAtomIdx !== -1) {
      startIdx = branchingAtomIdx;
    } else {
      startIdx = degrees.indexOf(Math.min(...degrees));
    }
  } else {
    startIdx = degrees.indexOf(Math.min(...degrees));
  }
  
  const startId = molecule.atoms[startIdx]!.id;

   const queue: { id: number; parentId: number | null; angle: number; depth: number }[] = [];
   queue.push({ id: startId, parentId: null, angle: 0, depth: 0 });

   coords[startIdx] = { x: 0, y: 0 };
   visited.add(startId);

   while (queue.length > 0) {
     const item = queue.shift()!;
     const { id, parentId, angle, depth } = item;

     const neighbors = molecule.bonds
       .filter(b => b.atom1 === id || b.atom2 === id)
       .map(b => (b.atom1 === id ? b.atom2 : b.atom1))
       .filter(nid => !visited.has(nid));

     for (let i = 0; i < neighbors.length; i++) {
       const neighborId = neighbors[i]!;
       const neighborIdx = molecule.atoms.findIndex(a => a.id === neighborId);
       const currentIdx = molecule.atoms.findIndex(a => a.id === id);
       const currentCoord = coords[currentIdx]!;

       let childAngle: number;
       if (neighbors.length === 1) {
         if (parentId === null) {
           childAngle = 0;
         } else {
           const parentIdx = molecule.atoms.findIndex(a => a.id === parentId);
           const parentCoord = coords[parentIdx]!;
           const incomingAngle = Math.atan2(
             currentCoord.y - parentCoord.y,
             currentCoord.x - parentCoord.x
           );
           if (isSimpleNonRingMolecule) {
             const alternation = (depth % 2 === 0) ? 1 : -1;
             childAngle = incomingAngle + alternation * Math.PI / 3;
           } else {
             childAngle = incomingAngle + Math.PI / 6;
           }
         }
        } else {
          if (isSimpleNonRingMolecule) {
            if (neighbors.length === 2) {
              childAngle = angle + (i - 0.5) * (2 * Math.PI / 3);
            } else if (neighbors.length === 3) {
              childAngle = angle + i * (2 * Math.PI / 3);
            } else if (neighbors.length === 4) {
              childAngle = angle + (i - 1.5) * (Math.PI / 2);
            } else {
              childAngle = angle + (i - (neighbors.length - 1) / 2) * (Math.PI / 3);
            }
          } else {
            if (neighbors.length === 4) {
              childAngle = angle + (i - 1.5) * (Math.PI / 2);
            } else {
              childAngle = angle + (i - (neighbors.length - 1) / 2) * (Math.PI / 3);
            }
          }
        }

       coords[neighborIdx] = {
         x: currentCoord.x + Math.cos(childAngle) * bondLength,
         y: currentCoord.y + Math.sin(childAngle) * bondLength,
       };
       visited.add(neighborId);
       queue.push({ id: neighborId, parentId: id, angle: childAngle, depth: depth + 1 });
     }
   }

  return coords;
}

// Detect linear chains attached to a given atom id. Returns an array of chains
// where each chain is an array of atom ids starting from the attachment neighbor
// and extending out until a branchpoint or ring is reached.
function detectLinearChainsAttachedToAtom(molecule: Molecule, atomId: number, minLen: number): number[][] {
  const chains: number[][] = [];
  const isRingAtom = (aid: number) => !!molecule.ringInfo && Array.from(molecule.ringInfo.rings).some(r => r && r.includes(aid));

  const neighbors = molecule.bonds
    .filter(b => b.atom1 === atomId || b.atom2 === atomId)
    .map(b => (b.atom1 === atomId ? b.atom2 : b.atom1));

  for (const nb of neighbors) {
    // walk outward from nb while degree == 2 and not in a ring
    const chain: number[] = [];
    let current = nb;
    let prev = atomId;
    while (true) {
      chain.push(current);
      const deg = molecule.bonds.filter(b => b.atom1 === current || b.atom2 === current).length;
      if (deg !== 2) break;
      if (isRingAtom(current)) break;
      // find next
      const nexts = molecule.bonds
        .filter(b => b.atom1 === current || b.atom2 === current)
        .map(b => (b.atom1 === current ? b.atom2 : b.atom1))
        .filter(aid => aid !== prev);
      if (nexts.length !== 1) break;
      prev = current;
      current = nexts[0]!;
    }
    if (chain.length >= minLen) {
      chains.push(chain);
    }
  }
  return chains;
}

// Place a linear chain deterministically using the parent atom coordinate as anchor.
// Applies alternating perpendicular offsets to create a zigzag. Modifies coords in place.
// Returns the attachment atom id so callers can decide what to anchor for D3.
function placeLinearChainDeterministically(chain: number[], molecule: Molecule, coords: MoleculeCoordinates, bondLength: number): number {
  if (chain.length === 0) return -1;
  // attachment atom is the atom connected to the first chain atom but not part of chain
  const first = chain[0]!;
  const attachmentBond = molecule.bonds.find(b => b.atom1 === first || b.atom2 === first)!;
  const attachId = attachmentBond.atom1 === first ? attachmentBond.atom2 : attachmentBond.atom1;
  const attachIdx = molecule.atoms.findIndex(a => a.id === attachId);
  const attachCoord = coords[attachIdx]!;

  // compute radial vector: if attach atom is in ring, use ring center; otherwise fallback to +x
  let radialX = 1, radialY = 0;
  if (molecule.ringInfo && molecule.ringInfo.rings) {
    // find ring that contains attachId if any
    const ring = molecule.ringInfo.rings.find(r => r && r.includes(attachId));
    if (ring) {
      // compute center of that ring
      const ringAtomIds = Array.from(ring);
      let cx = 0, cy = 0, cnt = 0;
      for (const aid of ringAtomIds) {
        const idx = molecule.atoms.findIndex(a => a.id === aid);
        const c = coords[idx];
        if (c) { cx += c.x; cy += c.y; cnt++; }
      }
      if (cnt > 0) {
        cx /= cnt; cy /= cnt;
        radialX = attachCoord.x - cx;
        radialY = attachCoord.y - cy;
      }
    }
  }
  let rlen = Math.sqrt(radialX * radialX + radialY * radialY) || 1;
  radialX /= rlen; radialY /= rlen;

  // Place chain with alternating 120/240 degree angles for zigzag
   let prevX = attachCoord.x;
   let prevY = attachCoord.y;
   let directionAngle = Math.atan2(radialY, radialX);
   
   for (let i = 0; i < chain.length; i++) {
     const aid = chain[i]!;
     const idx = molecule.atoms.findIndex(a => a.id === aid);
     
     const alternation = (i % 2 === 0) ? 1 : -1;
     const nextAngle = directionAngle + alternation * Math.PI / 3;
     
     const nx = prevX + Math.cos(nextAngle) * bondLength;
     const ny = prevY + Math.sin(nextAngle) * bondLength;
     coords[idx] = { x: nx, y: ny };
     
     prevX = nx;
     prevY = ny;
     directionAngle = nextAngle;
   }

  // Chain zigzag pattern is already in place with proper angles

  return attachId;
}


export function generateCoordinatesDeterministic(molecule: Molecule, options: SVGRendererOptions = {}): MoleculeCoordinates {
  const opts: SVGRendererOptions = { ...options, deterministicChainPlacement: true } as SVGRendererOptions;
  return generateCoordinates(molecule, opts);
}

export function generateCoordinates(
  molecule: Molecule,
  options: SVGRendererOptions = {}
): MoleculeCoordinates {
  const bondLength = options.bondLength ?? 35;
  
  // Generate initial coordinates using default layout
  let coords = generateCoordinatesDefault(molecule, options);

  // Optionally apply deterministic chain placement for long linear chains
  const fixedAtomIds: number[] = [];
  if (options.deterministicChainPlacement) {
    const minLen = options.deterministicChainLength ?? 4;
    // iterate through ring atoms and find attached linear chains
    const ringAtomSet = new Set<number>();
    if (molecule.ringInfo && molecule.ringInfo.rings) {
      for (const r of molecule.ringInfo.rings) {
        if (!r) continue;
        for (const aid of r) ringAtomSet.add(aid);
      }
    }
    for (const atom of molecule.atoms) {
      if (!ringAtomSet.has(atom.id)) continue;
      const chains = detectLinearChainsAttachedToAtom(molecule, atom.id, minLen);
      for (const chain of chains) {
        const attachId = placeLinearChainDeterministically(chain, molecule, coords, bondLength);
        if (attachId !== -1 && !fixedAtomIds.includes(attachId)) fixedAtomIds.push(attachId);
        for (const chainAtomId of chain) {
          if (!fixedAtomIds.includes(chainAtomId)) fixedAtomIds.push(chainAtomId);
        }
      }
    }
  }

  // Anchor atoms that participate in explicit stereochemical bonds so D3 doesn't move them
  for (const bond of molecule.bonds) {
    if (bond.stereo && bond.stereo !== StereoType.NONE) {
      if (!fixedAtomIds.includes(bond.atom1)) fixedAtomIds.push(bond.atom1);
      if (!fixedAtomIds.includes(bond.atom2)) fixedAtomIds.push(bond.atom2);
    }
  }

   try {
     // eslint-disable-next-line @typescript-eslint/no-var-requires
     const { refineCoordinatesWithWebcola } = require('./coordinate-generator-webcola');
     coords = refineCoordinatesWithWebcola(
       molecule,
       coords,
       bondLength,
       options.webcolaIterations ?? 100,
       fixedAtomIds,
       options
     );
   } catch (err) {
     throw new Error('Webcola coordinate engine is required but not available.');
   }

   return coords;
}

function generateCoordinatesDefault(
  molecule: Molecule,
  options: SVGRendererOptions = {}
): MoleculeCoordinates {
  const n = molecule.atoms.length;
  if (n === 0) return [];
  const bondLength = options.bondLength ?? 35;

  const rings = findSSSR(molecule.atoms, molecule.bonds);

  if (rings.length === 0) {
    return layoutChain(molecule, bondLength);
  }

  const systems = groupRingsIntoSystems(rings, molecule);
  const ringCoords = new Map<number, AtomCoordinates>();

  // Layout systems one by one, positioning connected systems appropriately
  const processedSystems = new Set<number>();
  
  for (let i = 0; i < systems.length; i++) {
    if (processedSystems.has(i)) continue;
    
    // Layout this system at origin
    const system = systems[i]!;
    const systemCoords = layoutFusedRings(system.rings, bondLength);
    for (const [id, coord] of systemCoords) {
      ringCoords.set(id, coord);
    }
    processedSystems.add(i);
    
    // Find and position connected systems
    let changed = true;
    while (changed) {
      changed = false;
      
      for (let j = 0; j < systems.length; j++) {
        if (processedSystems.has(j)) continue;
        
        const otherSystem = systems[j]!;
        
        // Find connecting bond between this system and the processed one
        let connectingBond: { atom1: number; atom2: number; newSystemAtom: number; existingSystemAtom: number } | null = null;
        for (const bond of molecule.bonds) {
          const atom1InNew = otherSystem.atoms.has(bond.atom1);
          const atom2InNew = otherSystem.atoms.has(bond.atom2);
          const atom1InExisting = system.atoms.has(bond.atom1);
          const atom2InExisting = system.atoms.has(bond.atom2);
          
          if (atom1InNew && atom2InExisting) {
            connectingBond = { atom1: bond.atom1, atom2: bond.atom2, newSystemAtom: bond.atom1, existingSystemAtom: bond.atom2 };
            break;
          } else if (atom1InExisting && atom2InNew) {
            connectingBond = { atom1: bond.atom1, atom2: bond.atom2, newSystemAtom: bond.atom2, existingSystemAtom: bond.atom1 };
            break;
          }
        }
        
        if (connectingBond) {
          // Layout the new system
          const newSystemCoords = layoutFusedRings(otherSystem.rings, bondLength);
          
          // Get the coordinate of the existing atom
          const existingAtomCoord = ringCoords.get(connectingBond.existingSystemAtom)!;
          const newSystemAtomCoord = newSystemCoords.get(connectingBond.newSystemAtom)!;
          
          // For connected systems, position the new system so that the connecting atoms
          // are at a proper bond length distance apart. Preferably rotate the new system so
          // its local bond vector aligns with the desired outgoing direction from the existing system,
          // then translate it into place. This avoids large offsets and unpredictable orientations.

          // Compute a more appropriate bond direction based on the existing system geometry
          // Try to find a neighbor in the already-positioned system to derive direction; fall back to +x
          let dirX = 1, dirY = 0;
          for (const bond of molecule.bonds) {
            if ((bond.atom1 === connectingBond.existingSystemAtom && ringCoords.has(bond.atom2)) ||
                (bond.atom2 === connectingBond.existingSystemAtom && ringCoords.has(bond.atom1))) {
              const neighborId = ringCoords.has(bond.atom1) ? bond.atom1 : bond.atom2;
              const neighborCoord = ringCoords.get(neighborId)!;
              dirX = existingAtomCoord.x - neighborCoord.x;
              dirY = existingAtomCoord.y - neighborCoord.y;
              break;
            }
          }

          const dlen = Math.sqrt(dirX * dirX + dirY * dirY) || 1;
          dirX /= dlen; dirY /= dlen;

          // Desired position for the new system's connecting atom: one bond length away along dir
          const desiredX = existingAtomCoord.x + dirX * bondLength;
          const desiredY = existingAtomCoord.y + dirY * bondLength;

          // Attempt to rotate the new system so its local neighbor vector aligns opposite to dir
          // (so that rings/substructures extend outward without overlapping).
          let rotatedCoordsMap: Map<number, AtomCoordinates> | null = null;

          // Find a neighbor of the connecting atom within the new system to derive its local orientation
          let newNeighborId: number | null = null;
          for (const bond of molecule.bonds) {
            if (bond.atom1 === connectingBond.newSystemAtom && newSystemCoords.has(bond.atom2)) { newNeighborId = bond.atom2; break; }
            if (bond.atom2 === connectingBond.newSystemAtom && newSystemCoords.has(bond.atom1)) { newNeighborId = bond.atom1; break; }
          }

          if (newNeighborId !== null) {
            const nnCoord = newSystemCoords.get(newNeighborId)!;
            const vNewX = nnCoord.x - newSystemAtomCoord.x;
            const vNewY = nnCoord.y - newSystemAtomCoord.y;
            const vNewLen = Math.sqrt(vNewX * vNewX + vNewY * vNewY) || 1;
            const angleNew = Math.atan2(vNewY, vNewX);
            // We want the neighbor vector to point roughly opposite the outgoing dir so the new system
            // extends outwards from the shared atom. Therefore add PI to dir angle.
            const angleDesired = Math.atan2(dirY, dirX) + Math.PI;
            const rotateAngle = angleDesired - angleNew;

            const sinA = Math.sin(rotateAngle);
            const cosA = Math.cos(rotateAngle);

            rotatedCoordsMap = new Map<number, AtomCoordinates>();
            for (const [id, coord] of newSystemCoords) {
              const tx = coord.x - newSystemAtomCoord.x;
              const ty = coord.y - newSystemAtomCoord.y;
              const rx = tx * cosA - ty * sinA + newSystemAtomCoord.x;
              const ry = tx * sinA + ty * cosA + newSystemAtomCoord.y;
              rotatedCoordsMap.set(id, { x: rx, y: ry });
            }
          }

          if (rotatedCoordsMap) {
            const rotatedAnchor = rotatedCoordsMap.get(connectingBond.newSystemAtom)!;
            const translateX2 = desiredX - rotatedAnchor.x;
            const translateY2 = desiredY - rotatedAnchor.y;
            for (const [id, coord] of rotatedCoordsMap) {
              ringCoords.set(id, { x: coord.x + translateX2, y: coord.y + translateY2 });
            }
          } else {
            // Fallback: simple translation
            const translateX = desiredX - newSystemAtomCoord.x;
            const translateY = desiredY - newSystemAtomCoord.y;
            for (const [id, coord] of newSystemCoords) {
              ringCoords.set(id, {
                x: coord.x + translateX,
                y: coord.y + translateY
              });
            }
          }

          processedSystems.add(j);
          changed = true;
        }
      }
    }
  }

  const coords: MoleculeCoordinates = new Array(n);
  for (let i = 0; i < n; i++) {
    const atomId = molecule.atoms[i]!.id;
    if (ringCoords.has(atomId)) {
      coords[i] = ringCoords.get(atomId)!;
    } else {
      coords[i] = { x: 0, y: 0 };
    }
  }

  const visited = new Set<number>(ringCoords.keys());
  const queue: { id: number; parentId: number; angle: number }[] = [];

  const ringCenters = new Map<number, AtomCoordinates>();
  for (const system of systems) {
    const systemAtoms = Array.from(system.atoms);
    const systemCoordsList = systemAtoms.map(id => ringCoords.get(id)!).filter(c => c);
    if (systemCoordsList.length > 0) {
      const centerX = systemCoordsList.reduce((sum, c) => sum + c.x, 0) / systemCoordsList.length;
      const centerY = systemCoordsList.reduce((sum, c) => sum + c.y, 0) / systemCoordsList.length;
      for (const atomId of systemAtoms) {
        ringCenters.set(atomId, { x: centerX, y: centerY });
      }
    }
  }

  for (const atomId of ringCoords.keys()) {
    const neighbors = molecule.bonds
      .filter(b => b.atom1 === atomId || b.atom2 === atomId)
      .map(b => (b.atom1 === atomId ? b.atom2 : b.atom1))
      .filter(id => !visited.has(id));

    const atomIdx = molecule.atoms.findIndex(a => a.id === atomId);
    const atomCoord = coords[atomIdx]!;
    const ringCenter = ringCenters.get(atomId);
    
    let radialAngle = 0;
    if (ringCenter) {
      radialAngle = Math.atan2(atomCoord.y - ringCenter.y, atomCoord.x - ringCenter.x);
    }

    const ringNeighbors = molecule.bonds
      .filter(b => b.atom1 === atomId || b.atom2 === atomId)
      .map(b => (b.atom1 === atomId ? b.atom2 : b.atom1))
      .filter(id => ringCoords.has(id));

    if (ringNeighbors.length === 0) {
      for (let i = 0; i < neighbors.length; i++) {
        const neighborId = neighbors[i]!;
        const angle = radialAngle + (i - (neighbors.length - 1) / 2) * (Math.PI / 6);
        queue.push({ id: neighborId, parentId: atomId, angle });
      }
    } else if (ringNeighbors.length === 1) {
      const ringNeighborId = ringNeighbors[0]!;
      const ringNeighborIdx = molecule.atoms.findIndex(a => a.id === ringNeighborId);
      const ringNeighborCoord = coords[ringNeighborIdx]!;
      const bondAngle = Math.atan2(ringNeighborCoord.y - atomCoord.y, ringNeighborCoord.x - atomCoord.x);
      
      const baseAngle = bondAngle + Math.PI;
      for (let i = 0; i < neighbors.length; i++) {
        const neighborId = neighbors[i]!;
        const angle = baseAngle + (i - (neighbors.length - 1) / 2) * (Math.PI / 6);
        queue.push({ id: neighborId, parentId: atomId, angle });
      }
    } else if (ringNeighbors.length === 2) {
      const rn1Id = ringNeighbors[0]!;
      const rn2Id = ringNeighbors[1]!;
      const rn1Idx = molecule.atoms.findIndex(a => a.id === rn1Id);
      const rn2Idx = molecule.atoms.findIndex(a => a.id === rn2Id);
      const rn1Coord = coords[rn1Idx]!;
      const rn2Coord = coords[rn2Idx]!;
      
      const angle1 = Math.atan2(rn1Coord.y - atomCoord.y, rn1Coord.x - atomCoord.x);
      const angle2 = Math.atan2(rn2Coord.y - atomCoord.y, rn2Coord.x - atomCoord.x);
      
      let bisectorAngle = (angle1 + angle2) / 2;
      const angleDiff = angle2 - angle1;
      if (Math.abs(angleDiff) > Math.PI) {
        bisectorAngle += Math.PI;
      }
      
      const baseAngle = bisectorAngle + Math.PI;
      for (let i = 0; i < neighbors.length; i++) {
        const neighborId = neighbors[i]!;
        const angle = baseAngle + (i - (neighbors.length - 1) / 2) * (Math.PI / 6);
        queue.push({ id: neighborId, parentId: atomId, angle });
      }
    } else {
      for (let i = 0; i < neighbors.length; i++) {
        const neighborId = neighbors[i]!;
        const angle = radialAngle + (i - (neighbors.length - 1) / 2) * (Math.PI / 6);
        queue.push({ id: neighborId, parentId: atomId, angle });
      }
    }
  }

  while (queue.length > 0) {
    const item = queue.shift()!;
    const { id, parentId, angle } = item;
    if (visited.has(id)) continue;
    visited.add(id);

    const parentIdx = molecule.atoms.findIndex(a => a.id === parentId);
    const parentCoord = coords[parentIdx]!;
    const idx = molecule.atoms.findIndex(a => a.id === id);

    coords[idx] = {
      x: parentCoord.x + Math.cos(angle) * bondLength,
      y: parentCoord.y + Math.sin(angle) * bondLength,
    };

    const neighbors = molecule.bonds
      .filter(b => b.atom1 === id || b.atom2 === id)
      .map(b => (b.atom1 === id ? b.atom2 : b.atom1))
      .filter(nid => !visited.has(nid));

    for (let i = 0; i < neighbors.length; i++) {
      const neighborId = neighbors[i]!;
      let childAngle = angle + (i - (neighbors.length - 1) / 2) * (Math.PI / 3);
      
      if (neighbors.length === 1 && !ringCoords.has(id)) {
        const zigzagDirection = (visited.size % 2) === 0 ? 1 : -1;
        childAngle += zigzagDirection * (Math.PI / 4);
      }
      
      queue.push({ id: neighborId, parentId: id, angle: childAngle });
    }
  }

  const ringAtomSet = new Set(ringCoords.keys());
  
  return coords;
}
