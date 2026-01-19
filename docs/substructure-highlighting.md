# Substructure Highlighting Feature - MCP Server

## Overview

Add visual substructure highlighting to the `render` tool, allowing users to highlight specific atoms/bonds in molecular structures with custom colors. This is essential for:

- Drug discovery (highlighting pharmacophores, active sites)
- PAINS detection (problematic substructures)
- Educational tools (teaching functional groups)
- SAR analysis (showing differences between molecules)

## Current State

**MCP Server**: v0.1.6 with 8 tools

- `render` tool supports SVG/PNG output
- `search` tool finds SMARTS matches (returns atom indices)
- No visual highlighting capability

**OpenChem Core**:

- SVG renderer exists (`src/generators/svg-renderer.ts`)
- SMARTS matching exists (`matchSMARTS()`)
- No highlighting API yet

## Proposed Implementation

### Phase 1: Core OpenChem API (Main Project)

Add highlighting support to the SVG renderer:

```typescript
// New types in src/generators/svg-renderer.ts

export interface AtomHighlight {
  atoms: number[]; // Atom indices to highlight
  color?: string; // Default: '#FFFF00' (yellow)
  opacity?: number; // Default: 0.3
  radius?: number; // Circle radius multiplier, default: 1.5
}

export interface BondHighlight {
  bonds: Array<[number, number]>; // Pairs of atom indices
  color?: string; // Default: '#FF0000' (red)
  width?: number; // Line width multiplier, default: 2.0
  opacity?: number; // Default: 0.8
}

export interface SubstructureHighlight {
  smarts?: string; // SMARTS pattern to match
  atoms?: number[]; // Or explicit atom indices
  bonds?: Array<[number, number]>; // Explicit bonds
  color?: string; // Unified color for atoms+bonds
  atomColor?: string; // Override atom highlight color
  bondColor?: string; // Override bond highlight color
  opacity?: number; // Unified opacity
  label?: string; // Optional label for legend
}

// Updated SVGRendererOptions
export interface SVGRendererOptions {
  // ... existing options ...
  highlights?: SubstructureHighlight[]; // NEW
  atomHighlights?: AtomHighlight[]; // NEW (low-level)
  bondHighlights?: BondHighlight[]; // NEW (low-level)
}
```

**New Core Functions**:

```typescript
// src/generators/svg-renderer.ts

function renderAtomHighlight(
  atomIdx: number,
  coords: AtomCoordinates,
  options: AtomHighlight,
): string {
  // Render colored circle behind atom
  const { color = "#FFFF00", opacity = 0.3, radius = 1.5 } = options;
  const r = 8 * radius; // Base radius
  return (
    `<circle cx="${coords.x}" cy="${coords.y}" r="${r}" ` +
    `fill="${color}" opacity="${opacity}" />`
  );
}

function renderBondHighlight(
  bond: [number, number],
  coords1: AtomCoordinates,
  coords2: AtomCoordinates,
  options: BondHighlight,
): string {
  // Render thick colored line behind bond
  const { color = "#FF0000", width = 2.0, opacity = 0.8 } = options;
  const lineWidth = 2 * width; // Base width
  return (
    `<line x1="${coords1.x}" y1="${coords1.y}" ` +
    `x2="${coords2.x}" y2="${coords2.y}" ` +
    `stroke="${color}" stroke-width="${lineWidth}" ` +
    `opacity="${opacity}" stroke-linecap="round" />`
  );
}

function processHighlights(
  molecule: Molecule,
  highlights: SubstructureHighlight[],
): { atomHighlights: AtomHighlight[]; bondHighlights: BondHighlight[] } {
  const atomHighlights: AtomHighlight[] = [];
  const bondHighlights: BondHighlight[] = [];

  for (const hl of highlights) {
    let atoms: number[] = [];
    let bonds: Array<[number, number]> = [];

    // If SMARTS pattern provided, find matches
    if (hl.smarts) {
      const matches = matchSMARTS(molecule, hl.smarts);
      if (matches.length > 0) {
        // Use first match (or all matches?)
        atoms = matches[0] || [];
        // Infer bonds between matched atoms
        bonds = inferBondsBetweenAtoms(molecule, atoms);
      }
    } else {
      atoms = hl.atoms || [];
      bonds = hl.bonds || [];
    }

    // Create atom highlights
    if (atoms.length > 0) {
      atomHighlights.push({
        atoms,
        color: hl.atomColor || hl.color || "#FFFF00",
        opacity: hl.opacity || 0.3,
      });
    }

    // Create bond highlights
    if (bonds.length > 0) {
      bondHighlights.push({
        bonds,
        color: hl.bondColor || hl.color || "#FF0000",
        opacity: hl.opacity || 0.8,
      });
    }
  }

  return { atomHighlights, bondHighlights };
}

function inferBondsBetweenAtoms(molecule: Molecule, atoms: number[]): Array<[number, number]> {
  const atomSet = new Set(atoms);
  const bonds: Array<[number, number]> = [];

  for (const bond of molecule.bonds) {
    if (atomSet.has(bond.atom1) && atomSet.has(bond.atom2)) {
      bonds.push([bond.atom1, bond.atom2]);
    }
  }

  return bonds;
}
```

**SVG Rendering Order** (layers from back to front):

1. Background highlights (circles for atoms, thick lines for bonds)
2. Bonds (normal rendering)
3. Atoms (normal rendering)
4. Labels (optional legend)

### Phase 2: MCP Tool Enhancement

Update the `render` tool to accept highlighting parameters:

```typescript
// packages/mcp/src/mcp-tools.ts

const renderSchema = z.object({
  smiles: z.string().describe("SMILES string to render"),
  format: z.enum(["svg", "png"]).default("png"),
  width: z.number().default(400),
  height: z.number().default(400),
  outputPath: z.string().optional(),

  // NEW: Highlighting support
  highlights: z
    .array(
      z.object({
        smarts: z.string().optional().describe("SMARTS pattern to highlight"),
        atoms: z.array(z.number()).optional().describe("Atom indices to highlight"),
        bonds: z.array(z.tuple([z.number(), z.number()])).optional(),
        color: z.string().optional().describe("Highlight color (hex or CSS name)"),
        atomColor: z.string().optional(),
        bondColor: z.string().optional(),
        opacity: z.number().min(0).max(1).optional(),
        label: z.string().optional().describe("Label for legend"),
      }),
    )
    .optional()
    .describe("Substructure highlights"),
});
```

## Use Cases & Examples

### 1. Highlight Benzene Ring in Aspirin

```json
{
  "tool": "render",
  "arguments": {
    "smiles": "CC(=O)Oc1ccccc1C(=O)O",
    "format": "png",
    "width": 500,
    "height": 500,
    "highlights": [
      {
        "smarts": "c1ccccc1",
        "color": "#FFFF00",
        "opacity": 0.4,
        "label": "Aromatic ring"
      }
    ]
  }
}
```

### 2. Highlight Multiple Functional Groups

```json
{
  "tool": "render",
  "arguments": {
    "smiles": "CC(=O)Oc1ccccc1C(=O)O",
    "highlights": [
      {
        "smarts": "C(=O)O",
        "color": "#FF0000",
        "label": "Carboxylic acid"
      },
      {
        "smarts": "OC(=O)C",
        "color": "#00FF00",
        "label": "Ester"
      }
    ]
  }
}
```

### 3. Highlight Specific Atoms (Active Site)

```json
{
  "tool": "render",
  "arguments": {
    "smiles": "c1ccccc1",
    "highlights": [
      {
        "atoms": [0, 1, 2],
        "color": "#0000FF",
        "label": "Binding site"
      }
    ]
  }
}
```

### 4. PAINS Detection Visualization

```json
{
  "tool": "render",
  "arguments": {
    "smiles": "c1ccc2c(c1)c(=O)c1ccccc1[nH]2",
    "highlights": [
      {
        "smarts": "c1ccc2c(c1)[nH]c1ccccc12",
        "color": "#FF4444",
        "opacity": 0.5,
        "label": "PAINS: Phenothiazine-like"
      }
    ]
  }
}
```

## Implementation Plan

### Step 1: Core SVG Highlighting (Main Project)

**Time**: 4-6 hours  
**Files**:

- `src/generators/svg-renderer.ts` - Add highlighting logic
- `test/svg/highlighting.test.ts` - New test file

**Tasks**:

1. Add `AtomHighlight`, `BondHighlight`, `SubstructureHighlight` types
2. Implement `renderAtomHighlight()` and `renderBondHighlight()`
3. Implement `processHighlights()` to convert SMARTS → atom/bond indices
4. Update `renderSVG()` to render highlights as background layer
5. Add 10-15 tests covering:
   - Single highlight
   - Multiple highlights
   - SMARTS-based highlights
   - Explicit atom/bond highlights
   - Color/opacity variations

### Step 2: MCP Tool Integration

**Time**: 2-3 hours  
**Files**:

- `packages/mcp/src/mcp-tools.ts` - Update `render` tool
- `packages/mcp/README.md` - Document new feature
- `packages/mcp/CHANGELOG.md` - Add v0.1.7 notes

**Tasks**:

1. Add `highlights` parameter to `renderSchema`
2. Pass highlights to `renderSVG()` call
3. Update tool description for better LLM discoverability
4. Add example queries to documentation

### Step 3: Documentation & Examples

**Time**: 1-2 hours  
**Files**:

- `docs/mcp-example-questions.md` - Add 2-3 new examples
- `packages/mcp/README.md` - Add highlighting section

**Examples**:

- Question 13: "Show me aspirin with the carboxylic acid highlighted in red"
- Question 14: "Highlight all aromatic rings in ibuprofen"
- Question 15: "Show celecoxib with the sulfonamide group highlighted"

### Step 4: Testing & Validation

**Time**: 1-2 hours  
**Tasks**:

1. Manual testing with VS Code Copilot
2. Verify PNG export with highlights
3. Test multi-molecule rendering with highlights
4. Verify color/opacity variations

## Total Effort

**Core Implementation**: 4-6 hours  
**MCP Integration**: 2-3 hours  
**Documentation**: 1-2 hours  
**Testing**: 1-2 hours

**Total**: 8-13 hours (~1-2 days)

## Benefits

1. **Drug Discovery**: Visualize pharmacophores, binding sites, active regions
2. **PAINS Detection**: Automatically highlight problematic substructures
3. **Education**: Teach organic chemistry (highlight functional groups)
4. **SAR Analysis**: Show structural differences between molecules
5. **Better UX**: More intuitive visualization in AI chat interfaces

## Risks & Considerations

1. **Performance**: Multiple highlights might slow rendering
   - **Mitigation**: Limit to 5-10 highlights per render
2. **Color Conflicts**: Overlapping highlights may be hard to see
   - **Mitigation**: Use semi-transparent colors (opacity 0.3-0.5)
3. **Label Positioning**: Legend may overlap with molecule
   - **Mitigation**: Position legend outside molecule bounds (Phase 2 enhancement)

4. **SMARTS Ambiguity**: Multiple matches for same pattern
   - **Mitigation**: Highlight all matches or first match (configurable)

## Future Enhancements (Phase 3)

1. **Legend Rendering**: Auto-generate color legend for highlights
2. **Pattern Labels**: Show labels next to highlighted regions
3. **Interactive Highlights**: Export atom/bond IDs for interactivity
4. **Predefined Patterns**: Built-in PAINS, Lipinski, functional group highlights
5. **3D Highlighting**: When 3D coordinates are added

## Dependencies

- ✅ `renderSVG()` exists
- ✅ `matchSMARTS()` exists
- ✅ PNG export exists
- ⚠️ Need to add highlight rendering logic

## Success Metrics

1. **Accuracy**: Highlights match SMARTS patterns correctly (100% pass rate)
2. **Visual Quality**: Highlights don't obscure molecule structure
3. **Performance**: < 100ms overhead for typical highlights
4. **Usability**: Clear examples in documentation
5. **Adoption**: Used in 20%+ of `render` tool calls

## Next Steps

1. ✅ Review and approve proposal
2. ⏳ Implement core highlighting in `svg-renderer.ts`
3. ⏳ Add MCP tool support
4. ⏳ Write tests and documentation
5. ⏳ Publish as v0.1.7

---

**Estimated Release**: v0.1.7 (1-2 days after approval)
