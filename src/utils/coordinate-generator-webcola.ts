import type { Molecule } from "types";
import type { MoleculeCoordinates } from "./coordinate-generator";
import type { SVGRendererOptions } from "src/generators/svg-renderer";

interface ColaNode {
  index: number;
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  fixed?: boolean;
  px?: number;
  py?: number;
}

interface ColaLink {
  source: number;
  target: number;
  length: number;
}

let colaLib: unknown = null;
try {
  // Try CommonJS require first (works in bun/node)
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  // @ts-ignore
  colaLib = require("webcola");
} catch (_e) {
  // try dynamic import fallback for ESM bundlers
  try {
    (async () => {
      colaLib = await import("webcola");
    })();
  } catch {
    colaLib = null;
  }
}

/**
 * Refine coordinates using webcola (main-thread).
 * Returns coordinates array aligned with molecule.atoms indices.
 */
export function refineCoordinatesWithWebcola(
  molecule: Molecule,
  coordinates: MoleculeCoordinates,
  bondLength: number = 35,
  iterations: number = 100,
  fixedAtomIds: number[] = [],
  opts?: Partial<SVGRendererOptions>,
): MoleculeCoordinates {
  if (!colaLib) return coordinates;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lib = colaLib as any;
  const LayoutCtor = lib.Layout || lib.layout || lib.d3adaptor;
  if (!LayoutCtor) return coordinates;

  // Heuristics for node sizes so avoidOverlaps can work
  const fontSize = opts?.fontSize ?? 12;
  const padding = opts?.padding ?? 4;
  const labelWidthEstimate = Math.max(8, fontSize * 0.6);
  const nodeBase = Math.max(8, bondLength * 0.35);
  const fixedSet = new Set<number>(fixedAtomIds || []);

  const nodes: ColaNode[] = molecule.atoms.map((atom, index) => {
    const coord = coordinates[index] ?? { x: 0, y: 0 };
    const symbol = atom?.symbol ?? "";
    const labelW = Math.max(labelWidthEstimate, symbol.length * fontSize * 0.6);
    const w = Math.max(nodeBase, labelW + padding * 2);
    const h = Math.max(fontSize, fontSize * 1.0) + padding;
    const node: ColaNode = {
      index,
      id: atom.id,
      x: coord.x,
      y: coord.y,
      width: w,
      height: h,
    };
    if (fixedSet.has(atom.id)) {
      // mark pinned; webcola variations store pinned via 'fixed' or px/py
      node.fixed = true;
      node.px = coord.x;
      node.py = coord.y;
    }
    return node;
  });

  const atomIdToIndex = new Map<number, number>();
  molecule.atoms.forEach((a, i) => atomIdToIndex.set(a.id, i));

  const links = molecule.bonds
    .map((b) => {
      const sIdx = atomIdToIndex.get(b.atom1 as number) ?? -1;
      const tIdx = atomIdToIndex.get(b.atom2 as number) ?? -1;
      return {
        source: sIdx,
        target: tIdx,
        length: bondLength,
      };
    })
    .filter((l) => l.source >= 0 && l.target >= 0);

  // instantiate layout in a few supported ways
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let layout: any;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lib = colaLib as any;
    if (lib.Layout) {
      layout = new lib.Layout();
    } else if (lib.d3adaptor) {
      layout = lib.d3adaptor();
    } else if (lib.layout) {
      layout = lib.layout();
    } else {
      return coordinates;
    }
  } catch (_e) {
    return coordinates;
  }

  try {
    if (typeof layout.nodes === "function") layout.nodes(nodes);
    if (typeof layout.links === "function") layout.links(links);

    // some adapters accept node size via .nodes or .handle
    if (typeof layout.avoidOverlaps === "function") {
      layout.avoidOverlaps(true);
    }

    if (typeof layout.linkDistance === "function") {
      layout.linkDistance((l: ColaLink) => l.length ?? bondLength);
    }

    // start/resume layouts where supported
    if (typeof layout.start === "function") {
      // start with requested iterations if API supports it
      // some webcola versions accept a parameter to start()
      try {
        layout.start(iterations);
      } catch {
        layout.start();
      }
    } else if (typeof layout.resume === "function") {
      layout.resume();
    }

    // tick synchronously if available
    const doTick = typeof layout.tick === "function";
    for (let i = 0; i < iterations; i++) {
      if (doTick) {
        layout.tick();
      } else {
        break;
      }
    }

    // map nodes back to coordinates array
    const refined: MoleculeCoordinates = Array(molecule.atoms.length);
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (!node) continue;
      const x =
        typeof node.x === "number"
          ? node.x
          : typeof node.px === "number"
            ? node.px
            : 0;
      const y =
        typeof node.y === "number"
          ? node.y
          : typeof node.py === "number"
            ? node.py
            : 0;
      refined[node.index] = { x, y };
    }

    return refined;
  } catch (_e) {
    return coordinates;
  }
}
