import { describe, it, expect } from 'bun:test';
import { parseSMILES } from 'index';
import { renderSVG } from 'src/generators/svg-renderer';
import { generateCoordinates } from 'src/utils/coordinate-generator';
import fs from 'fs';
import path from 'path';

function findChainAttachedToRing(molecule: any, minLen = 4) {
  // find a ring atom that has a neighbor chain
  const ringAtoms = new Set<number>();
  if (molecule.ringInfo) {
    for (const r of molecule.ringInfo.rings) {
      if (!r) continue;
      for (const id of r) ringAtoms.add(id);
    }
  }

  // look for any atom in ring with an attached linear chain
  for (const atom of molecule.atoms) {
    if (!ringAtoms.has(atom.id)) continue;
    const neighbors = molecule.bonds
      .filter((b: any) => b.atom1 === atom.id || b.atom2 === atom.id)
      .map((b: any) => (b.atom1 === atom.id ? b.atom2 : b.atom1));
    for (const nb of neighbors) {
      // walk outward
      const chain: number[] = [];
      let prev = atom.id;
      let current = nb;
      while (true) {
        chain.push(current);
        const deg = molecule.bonds.filter((b: any) => b.atom1 === current || b.atom2 === current).length;
        if (deg !== 2) break;
        if (ringAtoms.has(current)) break;
        const nexts = molecule.bonds
          .filter((b: any) => b.atom1 === current || b.atom2 === current)
          .map((b: any) => (b.atom1 === current ? b.atom2 : b.atom1))
          .filter((x: number) => x !== prev);
        if (nexts.length !== 1) break;
        prev = current;
        current = nexts[0]!;
      }
      if (chain.length >= minLen) {
        return { attachId: atom.id, chain };
      }
    }
  }
  return null;
}

describe('deterministic chain placement', () => {
  it('should place long chain attached to ring with zigzag when enabled and write SVGs', () => {
    const smiles = 'CCCCCCCCCCc1ccccc1';
    const parsed = parseSMILES(smiles);
    expect(parsed.molecules.length).toBeGreaterThan(0);
    const molecule = parsed.molecules[0]!;

    // default coords
    const coordsDefault = generateCoordinates(molecule, {});
    expect(coordsDefault.length).toBe(molecule.atoms.length);

    // deterministic coords
    const coordsDet = generateCoordinates(molecule, { deterministicChainPlacement: true });
    expect(coordsDet.length).toBe(molecule.atoms.length);

    // find chain
    const found = findChainAttachedToRing(molecule, 4);
    expect(found).not.toBeNull();
    if (!found) return;
    const { attachId, chain } = found;

    // compute cross-product signs between consecutive segments for deterministic coords
    const crossSigns: number[] = [];
    for (let i = 1; i < chain.length - 1; i++) {
      const prevId = chain[i - 1]!;
      const curId = chain[i]!;
      const nextId = chain[i + 1]!;
      const prevIdx = molecule.atoms.findIndex((a: any) => a.id === prevId);
      const curIdx = molecule.atoms.findIndex((a: any) => a.id === curId);
      const nextIdx = molecule.atoms.findIndex((a: any) => a.id === nextId);
      const p = coordsDet[prevIdx]!;
      const c = coordsDet[curIdx]!;
      const n = coordsDet[nextIdx]!;
      const v1x = c.x - p.x;
      const v1y = c.y - p.y;
      const v2x = n.x - c.x;
      const v2y = n.y - c.y;
      const cross = v1x * v2y - v1y * v2x;
      crossSigns.push(Math.sign(cross) === 0 ? 1 : Math.sign(cross));
    }

    // Expect alternating signs (zigzag) for deterministic coords
    let alternation = true;
    for (let i = 1; i < crossSigns.length; i++) {
      if (crossSigns[i] === crossSigns[i - 1]) { alternation = false; break; }
    }
    expect(alternation).toBe(true);

    // Write both SVGs for visual inspection
    const outDir = path.join(process.cwd(), 'test', 'output');
    try { fs.mkdirSync(outDir, { recursive: true }); } catch (e) {}

    const svgDefault = renderSVG(molecule, { atomCoordinates: coordsDefault });
    const svgDet = renderSVG(molecule, { atomCoordinates: coordsDet });

    fs.writeFileSync(path.join(outDir, 'deterministic-default.svg'), svgDefault.svg);
    fs.writeFileSync(path.join(outDir, 'deterministic-deterministic.svg'), svgDet.svg);
  });
});
