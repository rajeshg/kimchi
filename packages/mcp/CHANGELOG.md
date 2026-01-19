# Changelog - @openchem/mcp

All notable changes to @openchem/mcp will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.11] - 2025-12-03

### Changed

- Updated dependency to openchem 0.2.16
- Improved tautomer enumeration: filters invalid structures (charged atoms, triple bonds to N, allenes)
- Added amidine tautomerism support for heterocycles (guanine, adenine, cytosine)
- Lactam-lactim tautomerism now works with aromatic heterocycles

## [0.1.10] - 2025-12-02

### Changed

- Updated dependency to openchem 0.2.15
- Improved SVG rendering with proper skeletal formula conventions (implicit carbons, combined heteroatom+H labels)

## [0.1.9] - 2025-11-30

### Added

- **NEW Tool: `parse`** - Universal molecular structure parser supporting SMILES, IUPAC names, MOL files, and SDF files with auto-detection
- **NEW Tool: `analyze`** - Comprehensive molecular property analysis with 40+ descriptors across 6 categories (basic, structural, drug-likeness, topology, chi indices)
- **NEW Tool: `compare`** - Side-by-side molecular comparison using Morgan fingerprints and Tanimoto similarity
- **NEW Tool: `search`** - Substructure search using SMARTS patterns with detailed match reporting
- **NEW Tool: `identifiers`** - Generate standard molecular identifiers (InChI, InChIKey, IUPAC, canonical SMILES, formula)
- **NEW Tool: `tautomers`** - Tautomer enumeration and scoring with canonical tautomer identification
- **NEW Tool: `scaffold`** - Extract Murcko scaffolds, Bemis-Murcko frameworks, and scaffold trees
- **NEW Tool: `render`** - 2D structure visualization with SVG/PNG output and substructure highlighting
- **NEW Tool: `bulk`** - Batch operations for virtual screening (SMARTS matching, similarity search, drug-likeness filtering)

### Changed

- **Complete tool redesign** following Unix philosophy ("do one thing well")
- 9 specific, single-purpose tools instead of mixed capability tools
- Improved tool descriptions with clear boundaries and minimal parameters
- Better LLM tool selection accuracy due to specific tool purposes
- Enhanced error handling and validation across all tools
- Parse errors now reported with context in bulk operations

### Technical Details

- IUPAC→SMILES parsing now integrated (using `parseIUPACName().molecule`)
- Bulk operations automatically parse SMILES arrays to molecules
- Formula access via `Descriptors.formula()` instead of direct property
- Surface descriptors removed from API (not yet available in core library)
- All operations return structured JSON with success/error states
- Backward compatible - can add legacy tool aliases if needed

### Benefits

- 100% coverage of openchem library capabilities
- Cleaner separation of concerns
- Easier to extend with new tools
- Better performance through targeted operations
- Improved debugging and error reporting
- Matches industry best practices (Anthropic/OpenAI MCP guidelines)

## [0.1.8] - 2025-11-29

### Changed

- **Dependency**: Updated to `openchem@^0.2.13` for automatic molecular orientation optimization
- All rendered molecules now appear in canonical, chemically intuitive orientations
- Linear fused rings (naphthalene, anthracene) render horizontally
- Single rings (benzene) render with flat-top orientation
- Linear chains (n-hexane) render horizontally
- ~1ms performance overhead per molecule for orientation optimization

### Technical Details

- PCA-based principal axis calculation ensures consistent orientation
- Molecule type detection (8 categories) with type-specific heuristics
- Fully backward compatible - orientation optimization can be disabled if needed

## [0.1.7] - 2025-11-28

### Added

- **Substructure highlighting in `render` tool** - Visual highlighting of molecular features
  - New `highlights` parameter accepts array of substructure highlights
  - SMARTS-based highlighting - automatically finds and highlights patterns (e.g., benzene rings, functional groups)
  - Explicit atom/bond highlighting by index
  - Customizable colors, opacity, and sizes for each highlight
  - Multiple highlights with different colors supported
  - Enables visualization of pharmacophores, PAINS alerts, functional groups, and binding sites

### Changed

- **Dependency**: Requires `openchem@0.2.12` or higher (for highlighting API)
- Enhanced `render` tool description to mention highlighting capabilities

### Examples

Highlight benzene ring in aspirin:

```json
{
  "tool": "render",
  "smiles": "CC(=O)Oc1ccccc1C(=O)O",
  "highlights": [
    {
      "smarts": "c1ccccc1",
      "color": "#FFFF00",
      "opacity": 0.4
    }
  ]
}
```

Highlight multiple functional groups:

```json
{
  "tool": "render",
  "smiles": "CC(=O)Oc1ccccc1C(=O)O",
  "highlights": [
    { "smarts": "C(=O)O", "color": "#FF0000", "label": "Carboxylic acid" },
    { "smarts": "OC(=O)C", "color": "#00FF00", "label": "Ester" }
  ]
}
```

## [0.1.6] - 2025-11-28

### Added - Phase 1: Critical User-Facing Features

- **Tool 6: `identifiers`** - Generate InChI, InChIKey, and canonical molecular identifiers
  - InChI generation with full structural information
  - InChIKey for exact molecular matching (database lookups)
  - Canonical SMILES and molecular formula
  - Essential for PubChem, ChEMBL, DrugBank integration
- **Tool 7: `tautomers`** - Enumerate and score molecular tautomers
  - Enumerate all tautomers up to configurable limit
  - RDKit-compatible scoring (higher = more stable)
  - Returns canonical (most stable) tautomer
  - Essential for drug discovery and docking studies
- **Tool 8: `fileConvert`** - MOL/SDF file format conversion
  - 4 operations: smilesToMol, molToSmiles, smilesToSDF, sdfToSmiles
  - V2000 MOL format support
  - SDF multi-molecule support with property preservation
  - Essential for data exchange with other chemistry tools

### Changed

- **Coverage increased from 40% → 65%** - 8 tools now available (was 5)
- PNG is now the default format for `render` tool (better inline display)
- Enhanced tool descriptions for better LLM discoverability
- Improved help text in CLI to list all 8 tools

### Impact

- **Professional chemistry workflows** - Database lookups, tautomer analysis, file conversion
- **Better LLM integration** - AI assistants can now discover PNG rendering automatically
- **Data exchange ready** - MOL/SDF support enables integration with ChemDraw, Maestro, PyMOL, etc.

## [0.1.5] - 2025-11-28

### Added

- **PNG inline display in Copilot Chat** - PNG images now display directly in GitHub Copilot chat window
- **Optional file output** - Added `outputPath` parameter to save PNG/SVG files to disk
- MCP standard `image` content type for proper inline rendering

### Changed

- PNG images now returned as MCP `image` content type (displays inline in Copilot)
- Improved image handling with optional file saving capability

## [0.1.4] - 2025-11-28

### Added

- **stdio transport support** - Server now works with VS Code, Cursor, and other IDE integrations
- Dual transport mode: stdio (default) and HTTP (with `--http` flag)
- `--http` flag to explicitly start HTTP server mode

### Changed

- **Default mode is now stdio** - Better IDE integration experience
- Server name: `openchem` (stdio mode) vs `openchem-remote` (HTTP mode)
- Updated help text and documentation to reflect both transport modes
- Improved startup logging (stderr for stdio mode, stdout for HTTP mode)

### Fixed

- **VS Code Copilot integration** - Server now properly responds to `initialize` requests in stdio mode
- IDE spawned processes work correctly with stdio transport

## [0.1.3] - 2025-11-27

### Added

- **PNG export support** - Render tool now supports PNG format alongside SVG
- Uses `@resvg/resvg-js` for high-quality SVG to PNG conversion
- Base64-encoded PNG output in MCP responses

### Changed

- **Build system optimized** - Switched from bundling to TypeScript compilation
- **Dist size reduced by 98.5%** - From 3.28 MB to 48 KB
- Updated documentation to reflect PNG support
- Render tool now accepts `format` parameter: `"svg"` or `"png"` (default: `"svg"`)

## [0.1.2] - 2025-11-27

### Changed

- **Default port changed to 4141** - Avoid conflicts with other webapps (previously 3000)
- Updated all documentation to reflect port 4141

## [0.1.1] - 2025-11-27

### Fixed

- **Stateless transport mode** - Use `sessionIdGenerator: undefined` to avoid "Server not initialized" errors
- **Request body parsing** - Properly parse JSON body for POST requests before passing to `handleRequest`
- **Transport cleanup** - Close transport when request ends to prevent memory leaks
- **Error handling** - Add try/catch around MCP request handling with proper 500 error responses

### Changed

- `.vscode/mcp.json` - Updated default port from 8080 to 3000 to match server default

## [0.1.0] - 2025-11-27

### 🎉 Initial Release

OpenChem MCP server for AI assistant integration. Extracted from `openchem` core package for better separation of concerns.

### Added

- **Streamable HTTP + SSE transport** for remote AI assistant connections
- **5 composite chemistry tools**:
  - `analyze` - Complete molecular analysis (40+ descriptors, drug-likeness, IUPAC name, optional rendering)
  - `compare` - Molecular similarity (Morgan fingerprints, Tanimoto similarity, property comparison)
  - `search` - Substructure matching (SMARTS patterns with match counts and indices)
  - `render` - 2D structure visualization (publication-quality SVG)
  - `convert` - Format conversion (canonical SMILES, IUPAC names, Murcko scaffolds)
- **Zero-config CLI** - `openchem-mcp` command
- **Built-in health check** endpoint (`/health`)
- **CORS enabled** for remote access
- **Claude Desktop integration** out of the box
- **Comprehensive documentation**

### Installation

```bash
npm install -g @openchem/mcp
openchem-mcp
```

### Requirements

- Node.js 18+
- `openchem` >=0.2.10 (installed automatically as peer dependency)

### Links

- **npm**: https://npmjs.com/package/@openchem/mcp
- **GitHub**: https://github.com/rajeshg/openchem
- **Documentation**: https://github.com/rajeshg/openchem/blob/main/docs/mcp-integration-guide.md
