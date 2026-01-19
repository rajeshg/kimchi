# SVG Rendering Guide

**Audience:** Users and developers working with 2D molecular structure visualization  
**Related:** [README](../README.md)

---

## Overview

openchem provides a complete 2D molecular structure rendering system that generates clean, chemically accurate SVG diagrams from SMILES strings or Molecule objects. The renderer automatically computes 2D coordinates and produces ChemDraw-style visualizations.

**Key Features:**

- ✅ Automatic 2D coordinate generation
- ✅ Multiple bond types (single, double, triple, aromatic)
- ✅ Stereochemistry support (wedge/hash bonds)
- ✅ Smart atom label visibility
- ✅ Scalable SVG output
- ✅ Element-based coloring or monochrome

---

## Quick Start

### Basic Usage

```typescript
import { parseSMILES, renderSVG } from "index";

// Parse SMILES and render to SVG
const result = parseSMILES("c1ccccc1");
const molecule = result.molecules[0];

const svg = renderSVG(molecule);
// Returns SVG string ready for display or saving
```

### With Options

```typescript
import { parseSMILES, renderSVG } from "index";

const molecule = parseSMILES("c1ccccc1").molecules[0];

const svgResult = renderSVG(molecule, {
  width: 400,
  height: 300,
  bondLength: 50,
  colorScheme: "default", // or 'monochrome'
  fontSize: 14,
  strokeWidth: 1.5,
});

console.log(svgResult.svg); // SVG markup
console.log(svgResult.width); // 400
console.log(svgResult.height); // 300
```

### Usage in Web Applications

```typescript
import { parseSMILES, renderSVG } from 'openchem';

const molecule = parseSMILES('CC(=O)Oc1ccccc1C(=O)O').molecules[0];
const result = renderSVG(molecule);

// React/JSX
<div dangerouslySetInnerHTML={{ __html: result.svg }} />

// Vanilla JS
document.getElementById('molecule').innerHTML = result.svg;

// Save to file (Node.js)
import fs from 'fs';
fs.writeFileSync('aspirin.svg', result.svg);
```

---

## API Reference

### `renderSVG(molecule: Molecule, options?: SVGRenderOptions)`

**Parameters:**

- `molecule` (Molecule) — Molecule object to render
- `options` (SVGRenderOptions, optional) — Rendering configuration

**Returns:** `string` — SVG markup

**Options:**

```typescript
interface SVGRendererOptions {
  width?: number; // SVG width (default: 400)
  height?: number; // SVG height (default: 300)
  bondLength?: number; // Bond length in pixels (default: 40)
  colorScheme?: "default" | "monochrome"; // Color scheme (default: 'default')
  fontSize?: number; // Font size for labels (default: 12)
  strokeWidth?: number; // Bond thickness (default: 1.5)
  margin?: number; // Margin around molecule (default: 20)
}
```

**Returns:**

```typescript
interface SVGRenderResult {
  svg: string; // Complete SVG markup
  width: number; // Canvas width
  height: number; // Canvas height
  errors: string[]; // Any rendering errors
}
```

---

## Architecture

openchem uses a rigid unit architecture for coordinate generation, providing high-quality 2D layouts with perfect ring geometry:

**Key features:**

- ✅ **Rigid unit detection** — Ring systems and chains identified as rigid bodies
- ✅ **Perfect regular polygons** — Mathematically precise ring geometry
- ✅ **DOF-based optimization** — Only rotations and translations, no internal distortion
- ✅ **Overlap resolution** — Automatic detection and resolution of atom collisions
- ✅ **Clean separation** — Coordinate generator and renderer have distinct responsibilities

### 2D Layout Algorithm

The coordinate generation follows a multi-stage pipeline:

```
1. Ring System Detection
   ↓
2. Rigid Unit Detection
   ↓
3. Rigid Unit Placement (perfect geometry)
   ↓
4. DOF-Based Minimization (rotations/translations only)
   ↓
5. Overlap Resolution
   ↓
6. Orientation Optimization
   ↓
7. SVG Rendering (no geometry changes)
```

### Stage 1: Ring System Detection

**Purpose:** Identify all ring systems and classify their relationships

**Algorithm:**

- Detect rings using graph cycle detection
- Group rings into fused systems (rings sharing edges)
- Classify as isolated, fused, spiro, or bridged
- Compute ring connectivity graph

**Implementation:** `src/generators/coordinate-generator/ring-system-detector.ts`

### Stage 2: Rigid Unit Detection

**Purpose:** Identify rigid units (ring systems and chain segments)

**Algorithm:**

- Ring systems become single rigid units
- Chains between ring systems become rigid chain units
- Single atoms connected to multiple units become bridges
- Build unit connectivity graph

**Implementation:** `src/generators/coordinate-generator/rigid-unit-detector.ts`

### Stage 3: Rigid Unit Placement

**Purpose:** Place each rigid unit with perfect internal geometry

**Algorithm:**

- Generate perfect regular polygons for each ring size
- For fused ring systems, place rings sequentially:
  - Align shared edges exactly
  - Detect overlaps and flip rings as needed
  - Use spiro placement for single-atom connections
- Place chains with ideal 120° angles

**Key feature:** Internal geometry is **never distorted** — rings are always perfect polygons.

**Implementation:** `src/generators/coordinate-generator/rigid-unit-placer.ts`

### Stage 4: DOF-Based Minimization

**Purpose:** Optimize unit positions without distorting internal geometry

**Algorithm:**

- Each unit has only 3 degrees of freedom: translation (x, y) and rotation (θ)
- Minimize bond length deviation for connecting bonds
- Try multiple rotation angles and optional flips
- Preserve perfect internal geometry throughout

**Key feature:** **Rigid body optimization** — atoms within a unit never move relative to each other.

**Implementation:** `src/generators/coordinate-generator/rigid-body-minimizer.ts`

### Stage 5: Overlap Resolution

**Purpose:** Detect and resolve any remaining atom overlaps

**Algorithm:**

- Compute pairwise atom distances
- Identify overlaps (distance < threshold)
- Apply repulsive forces to separate atoms
- Iterate until no overlaps remain

**Implementation:** `src/generators/coordinate-generator/overlap-resolver.ts`

### Stage 6: Orientation Optimization

**Purpose:** Rotate molecule to canonical orientation

**Algorithm:**

- Identify principal ring system
- Rotate to align largest ring horizontally
- Position longest chain direction appropriately

**Implementation:** `src/generators/coordinate-generator/orientation-optimizer.ts`

### Stage 7: SVG Rendering

**Purpose:** Convert coordinates to visual SVG elements

**Algorithm:**

- Draw bonds as lines (single/double/triple/aromatic)
- Render wedge/hash bonds for stereochemistry
- Add atom labels (heteroatoms, charges, isotopes)
- Apply color scheme (default or monochrome)
- **No geometry changes** — renderer trusts coordinate generator

**Implementation:** `src/generators/svg-renderer.ts` (single consolidated file, ~1,800 lines)

---

## Visual Rendering Rules

### Bond Types

**Single bonds:**

- Solid straight lines
- Uniform thickness (default 1.5px)

**Double bonds:**

- Two parallel lines with slight spacing
- Centered on bond axis

**Triple bonds:**

- Three parallel lines with closer spacing
- Centered on bond axis

**Aromatic bonds:**

- Alternating single/double representation
- Optional: circle inside ring (not currently implemented)

**Stereo bonds:**

- **Wedge (solid)**: Bond toward viewer (filled triangle)
- **Hash (dashed)**: Bond away from viewer (parallel dashed lines)

**Implementation:** `src/generators/svg-renderer/`

### Atom Labels

**Show labels for:**

- Heteroatoms (N, O, S, P, halogens, etc.)
- Charged atoms (NH₄⁺, O⁻, etc.)
- Isotopes (¹³C, ²H, etc.)
- Radicals (C•)

**Hide labels for:**

- Normal carbons (chemical convention)
- Implicit hydrogens on carbons

**Element colors (default scheme):**

- Carbon: black (#000000)
- Nitrogen: blue (#0000FF)
- Oxygen: red (#FF0000)
- Sulfur: yellow (#CCCC00)
- Phosphorus: orange (#FF8000)
- Halogens: dark green (#006400)

**Monochrome scheme:**

- All elements: black (#000000)

### Geometry Guidelines

**Bond angles:**

- sp² centers: 120°
- sp³ centers: 109.5° (simplified to 90°/120° in 2D)
- Avoid acute angles (< 60°) except in small rings
- Maintain balanced symmetry

**Bond lengths:**

- Uniform across molecule (default: 40px)
- Recommended range: 30-60px
- Avoid stretched or compressed bonds

**Ring geometry:**

- Draw as regular polygons
- Fused rings share exact edge geometry
- No distortion at fusion points

**Spacing:**

- Maintain uniform spacing between atoms
- No overlaps between bonds, labels, or hydrogens
- Keep molecule centered and planar

**Implementation:** Rules defined in coordinate generation and SVG rendering modules

---

## Visual Quality Metrics

### Quality Score Calculation

Each rule has an associated weight. Overall quality can be computed as:

```
quality_score = Σ(rule_score × weight) / Σ(weight)
```

**High priority rules (weight > 0.9):**

- Bond angles (0.9)
- Stereochemistry consistency (1.0)
- Layout optimization (1.0)
- Geometric optimization (1.0)

**Medium priority rules (weight 0.7-0.9):**

- Bond lengths (0.8)
- Ring geometry (0.85)
- Spacing (0.8)
- Bond types (0.9)
- Global consistency (0.9)

**Lower priority rules (weight < 0.7):**

- Aromatic representation (0.7)
- Label alignment (0.6)
- Color/contrast (0.6)

---

## Advanced Usage

### Custom Coordinate Generation

```typescript
import { parseSMILES, renderSVG } from "index";

// Render molecule (coordinates generated automatically)
const molecule = parseSMILES("CC(C)C").molecules[0];
const svg = renderSVG(molecule, {
  width: 300,
  height: 200,
  bondLength: 50,
  colorScheme: "monochrome",
  strokeWidth: 2.0,
});

console.log(svg.svg); // SVG markup
console.log(svg.width, svg.height); // Canvas dimensions
```

**Note:** Coordinate generation is fully integrated into `renderSVG()`. You don't need to generate coordinates separately unless you're doing advanced coordinate manipulation.

### Batch Rendering

```typescript
import { parseSMILES, renderSVG } from "index";

const smilesList = ["c1ccccc1", "CCO", "CC(=O)O"];

const svgs = smilesList.map((smiles) => {
  const molecule = parseSMILES(smiles).molecules[0];
  return renderSVG(molecule, { width: 300, height: 200 });
});

// Save all SVGs
svgs.forEach((svg, i) => {
  fs.writeFileSync(`molecule_${i}.svg`, svg);
});
```

### Embedding in HTML

```html
<!DOCTYPE html>
<html>
  <body>
    <div id="molecule-container"></div>

    <script type="module">
      import { parseSMILES, renderSVG } from "openchem";

      const molecule = parseSMILES("c1ccccc1").molecules[0];
      const svg = renderSVG(molecule);

      document.getElementById("molecule-container").innerHTML = svg;
    </script>
  </body>
</html>
```

---

## Performance Considerations

### Coordinate Generation Complexity

| Operation           | Complexity | Notes                           |
| ------------------- | ---------- | ------------------------------- |
| Ring finding (SSSR) | O(N²)      | Bottleneck for large molecules  |
| Ring placement      | O(R)       | R = number of rings             |
| Chain expansion     | O(N)       | N = number of atoms             |
| Force relaxation    | O(N²)      | Can be expensive for 100+ atoms |
| SVG generation      | O(N + B)   | N = atoms, B = bonds            |

### Performance Guidelines

- **< 30 atoms**: Instant (< 5ms)
- **30-60 atoms**: Very fast (5-20ms)
- **60-100 atoms**: Fast (20-50ms)
- **100-200 atoms**: Acceptable (50-150ms)
- **> 200 atoms**: May be slow (150ms-1s)

### Optimization Tips

1. **Cache rendered SVGs** for repeated use
2. **Generate coordinates once**, render multiple times with different styles
3. **Use simpler layout** for very large molecules (disable force relaxation)
4. **Consider static images** for molecules > 200 atoms

---

## Examples

### Basic Molecules

```typescript
// Benzene
renderSVG(parseSMILES("c1ccccc1").molecules[0]);

// Ethanol
renderSVG(parseSMILES("CCO").molecules[0]);

// Acetic acid
renderSVG(parseSMILES("CC(=O)O").molecules[0]);
```

### Complex Molecules

```typescript
// Aspirin
renderSVG(parseSMILES("CC(=O)Oc1ccccc1C(=O)O").molecules[0]);

// Caffeine
renderSVG(parseSMILES("CN1C=NC2=C1C(=O)N(C(=O)N2C)C").molecules[0]);

// Ibuprofen
renderSVG(parseSMILES("CC(C)Cc1ccc(cc1)C(C)C(=O)O").molecules[0]);
```

### Stereochemistry

```typescript
// (E)-but-2-ene
renderSVG(parseSMILES("C/C=C/C").molecules[0]);

// L-alanine
renderSVG(parseSMILES("C[C@@H](N)C(=O)O").molecules[0]);
```

---

## Implementation Files

### Coordinate Generator

**Location:** `src/generators/coordinate-generator/`

| Module                     | Purpose                                            |
| -------------------------- | -------------------------------------------------- |
| `index.ts`                 | Entry point, pipeline orchestration                |
| `types.ts`                 | Type definitions                                   |
| `ring-system-detector.ts`  | Ring detection and classification                  |
| `rigid-unit-detector.ts`   | Identify rigid units (ring systems, chains)        |
| `rigid-unit-placer.ts`     | Place units with perfect geometry                  |
| `rigid-body-minimizer.ts`  | DOF-based optimization (rotation/translation only) |
| `overlap-resolver.ts`      | Collision detection and resolution                 |
| `orientation-optimizer.ts` | Canonical orientation                              |
| `geometry-utils.ts`        | Vector math, rotations, distance checks            |
| `macrocycle-placer.ts`     | Special handling for large rings                   |

### SVG Renderer

**Location:** `src/generators/svg-renderer.ts` (single consolidated file, ~1,800 lines)

**Architecture:** All rendering logic consolidated into a single file for simplicity and maintainability.

### Supporting Utilities

- **Ring analysis:** `src/utils/ring-analysis.ts` — SSSR, ring classification
- **Ring finding:** `src/utils/ring-finder.ts` — Cycle detection

---

## Testing

### Run Rendering Tests

```bash
# SVG rendering tests
bun test test/svg/

# Specific tests
bun test test/svg/svg-basic.test.ts
bun test test/svg/tetrahedral-geometry.test.ts
bun test test/svg/biphenyl.test.ts
```

### Visual Validation

```bash
# Generate SVG files for visual inspection
bun run scripts/save-rendered-svgs.mjs
```

---

## Known Limitations

### 1. Large Molecules (> 100 atoms)

**Issue:** Coordinate generation can be slow
**Workaround:** Use simpler layout algorithm or pre-compute coordinates

### 2. Complex Polycyclic Systems

**Issue:** Fused ring layout may not be optimal for very complex systems
**Status:** Works well for common cases (naphthalene, anthracene, steroids)

### 3. 3D Stereochemistry Display

**Issue:** Only basic wedge/hash support, no 3D perspective
**Status:** Sufficient for most 2D chemical drawings

---

## Contributing

### Adding New Bond Types

1. Define bond type in `types.ts`
2. Add rendering logic in `src/generators/svg-renderer/`
3. Update bond rendering dispatch
4. Add test cases in `test/svg/`

### Improving Layout Algorithm

1. Modify coordinate generation in `src/generators/coordinate-generator/`
2. Update force relaxation parameters
3. Test with diverse molecule set
4. Validate visual quality

### Custom Element Colors

1. Update color scheme mapping in `svg-renderer.ts`
2. Add new color scheme option
3. Test with heteroatom-rich molecules

---

## Related Documentation

- **[README](../README.md)** — Library overview
- **[Molecular Properties](./molecular-properties.md)** — Descriptors and calculations
- **[SMILES → IUPAC Generation](./iupac-generation.md)** — Name generation

---

**Last Updated:** 2025-11-22  
**Maintainer:** openchem team
