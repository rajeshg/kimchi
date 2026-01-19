# @openchem/mcp

Model Context Protocol (MCP) server for [OpenChem](https://npmjs.com/package/openchem) - AI assistant integration for chemistry analysis.

## Features

- 🚀 **Dual transport modes** - stdio (for IDEs) and HTTP (for remote clients)
- 🧪 **8 composite chemistry tools** for complete workflows
- 🔌 **VS Code & Claude Desktop integration** out of the box
- 📦 **Zero-config CLI** - just run `openchem-mcp`
- 🏥 **Built-in health check** endpoint

## Installation

```bash
npm install -g @openchem/mcp
```

This will install both `@openchem/mcp` and its peer dependency `openchem`.

## Quick Start

### stdio Mode (for VS Code, Cursor, IDEs)

```bash
# Default mode - stdio transport
openchem-mcp
```

This mode is designed for IDE integrations where the server is spawned as a child process.

### HTTP Mode (for Claude Desktop, remote clients)

```bash
# Start HTTP server
openchem-mcp --http

# Start on custom port
openchem-mcp --http --port 8080

# Or via environment variable
PORT=9000 openchem-mcp --http
```

The HTTP server will start on `http://localhost:4141` by default.

## Available Tools

### 1. **analyze** - Complete Molecular Analysis

Comprehensive analysis including:

- SMILES parsing and canonicalization
- 40+ molecular descriptors
- Drug-likeness assessment (Lipinski, Veber rules)
- IUPAC name generation
- Optional 2D SVG rendering

**Example:**

```typescript
{
  "name": "analyze",
  "arguments": {
    "smiles": "CC(=O)Oc1ccccc1C(=O)O",
    "includeRendering": true
  }
}
```

### 2. **compare** - Molecular Similarity

Compare two molecules using:

- Morgan fingerprints (ECFP)
- Tanimoto similarity
- Property comparison

**Example:**

```typescript
{
  "name": "compare",
  "arguments": {
    "smiles1": "CC(=O)Oc1ccccc1C(=O)O",
    "smiles2": "CC(C)Cc1ccc(cc1)C(C)C(=O)O"
  }
}
```

### 3. **search** - Substructure Matching

Search for SMARTS patterns:

- Match count and indices
- Support for complex patterns
- Aromatic and aliphatic matching

**Example:**

```typescript
{
  "name": "search",
  "arguments": {
    "smiles": "c1ccccc1",
    "pattern": "[#6]"
  }
}
```

### 4. **render** - 2D Structure Visualization

Generate publication-quality images in SVG or PNG format:

- Automatic layout
- Stereochemistry display
- Customizable size
- Vector (SVG) or raster (PNG) output
- **NEW:** Substructure highlighting (pharmacophores, functional groups, PAINS)

**Basic Example:**

```typescript
{
  "name": "render",
  "arguments": {
    "smiles": "c1ccccc1",
    "format": "png",
    "width": 400,
    "height": 400
  }
}
```

**Highlighting Example:**

```typescript
{
  "name": "render",
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
      },
      {
        "smarts": "C(=O)O",
        "color": "#FF0000",
        "opacity": 0.5,
        "label": "Carboxylic acid"
      }
    ]
  }
}
```

**Highlight Options:**

- `smarts`: SMARTS pattern to match (e.g., `"c1ccccc1"` for benzene)
- `atoms`: Array of atom indices to highlight (e.g., `[0, 1, 2]`)
- `bonds`: Array of bond pairs to highlight (e.g., `[[0, 1], [1, 2]]`)
- `color`: Hex color or CSS name (default: yellow for atoms, red for bonds)
- `atomColor`: Override atom highlight color
- `bondColor`: Override bond highlight color
- `opacity`: 0-1 (default: 0.3 for atoms, 0.8 for bonds)
- `label`: Optional label (reserved for future legend feature)

### 5. **convert** - Format Conversion

Convert between formats:

- Canonical SMILES
- IUPAC names
- Murcko scaffolds

**Example:**

```typescript
{
  "name": "convert",
  "arguments": {
    "smiles": "CC(=O)Oc1ccccc1C(=O)O",
    "outputFormat": "iupac"
  }
}
```

### 6. **identifiers** - Molecular Identifiers

Generate standard identifiers for database lookups:

- InChI (International Chemical Identifier)
- InChIKey (hashed identifier for exact matching)
- Canonical SMILES
- Molecular formula
- Essential for PubChem, ChEMBL, DrugBank integration

**Example:**

```typescript
{
  "name": "identifiers",
  "arguments": {
    "smiles": "CC(=O)Oc1ccccc1C(=O)O"
  }
}
```

**Output:**

```json
{
  "canonicalSmiles": "CC(=O)Oc1ccccc1C(=O)O",
  "inchi": "InChI=1S/C9H8O4/c1-6(10)13-8-5-3-2-4-7(8)9(11)12/h2-5H,1H3,(H,11,12)",
  "inchiKey": "BSYNRYMUTXBXSQ-UHFFFAOYSA-N",
  "formula": "C9H8O4",
  "molecularWeight": 180.16
}
```

### 7. **tautomers** - Tautomer Enumeration

Enumerate and score molecular tautomers:

- Keto-enol tautomers
- Imine-enamine tautomers
- Amide-imidol forms
- RDKit-compatible scoring (higher = more stable)
- Returns canonical (most stable) tautomer
- Essential for drug discovery and docking studies

**Example:**

```typescript
{
  "name": "tautomers",
  "arguments": {
    "smiles": "CC(=O)CC(=O)C",
    "maxTautomers": 10,
    "returnCanonical": true
  }
}
```

**Output:**

```json
{
  "canonicalTautomer": "CC(O)=CC(=O)C",
  "tautomerCount": 2,
  "tautomers": [
    { "smiles": "CC(O)=CC(=O)C", "score": 1.8 },
    { "smiles": "CC(=O)CC(O)=C", "score": 1.5 }
  ]
}
```

### 8. **fileConvert** - MOL/SDF File Format Conversion

Convert between industry-standard molecular file formats:

- SMILES → MOL (V2000 format)
- MOL → SMILES
- SMILES → SDF (with properties)
- SDF → SMILES (multi-molecule support)
- Property data preservation
- Essential for data exchange with ChemDraw, Maestro, PyMOL, etc.

**Operations:**

#### smilesToMol

```typescript
{
  "name": "fileConvert",
  "arguments": {
    "operation": "smilesToMol",
    "input": "c1ccccc1",
    "moleculeName": "Benzene"
  }
}
```

#### molToSmiles

```typescript
{
  "name": "fileConvert",
  "arguments": {
    "operation": "molToSmiles",
    "input": "<MOL file content>"
  }
}
```

#### smilesToSDF

```typescript
{
  "name": "fileConvert",
  "arguments": {
    "operation": "smilesToSDF",
    "input": "[\"c1ccccc1\", \"Cc1ccccc1\"]",
    "properties": [
      { "NAME": "Benzene", "MW": "78.11" },
      { "NAME": "Toluene", "MW": "92.14" }
    ]
  }
}
```

#### sdfToSmiles

```typescript
{
  "name": "fileConvert",
  "arguments": {
    "operation": "sdfToSmiles",
    "input": "<SDF file content>"
  }
}
```

## Integration

### VS Code Copilot

Add to `.vscode/mcp.json`:

```json
{
  "servers": {
    "openchem": {
      "command": "npx",
      "args": ["@openchem/mcp"],
      "type": "stdio"
    }
  }
}
```

Restart VS Code and the server will be automatically spawned when needed.

### Claude Desktop

First, start the HTTP server:

```bash
openchem-mcp --http
```

Then add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "openchem": {
      "url": "http://localhost:4141/mcp"
    }
  }
}
```

Restart Claude Desktop and try:

> "Analyze aspirin using SMILES CC(=O)Oc1ccccc1C(=O)O"

## Programmatic Usage

You can also use the MCP server programmatically:

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const client = new Client({ name: "my-app", version: "1.0.0" }, { capabilities: { tools: {} } });

const transport = new StreamableHTTPClientTransport(new URL("http://localhost:4141/mcp"));

await client.connect(transport);

const result = await client.callTool("analyze", {
  smiles: "CC(=O)Oc1ccccc1C(=O)O",
  includeRendering: false,
});

console.log(result);
```

## Endpoints

- `GET /health` - Health check
- `POST /mcp` - Main MCP endpoint (HTTP + SSE)
- `POST /mcp/sse` - MCP endpoint (alias)

## Configuration

### Command-Line Options

- `--http` - Start HTTP server mode (default: stdio mode)
- `--port <PORT>` - Server port (default: 4141, HTTP mode only)
- `--help` - Show help message

### Environment Variables

- `PORT` - Server port (default: 4141, HTTP mode only)
- `VERBOSE` - Enable debug logging (set to "1")

### CORS

CORS is enabled by default in HTTP mode (`Access-Control-Allow-Origin: *`). For production, consider restricting origins.

## Requirements

- Node.js 18+
- `openchem` ^0.2.11 (installed automatically as peer dependency)

## Documentation

- **[Integration Guide](https://github.com/rajeshg/openchem/blob/main/docs/mcp-integration-guide.md)** - Complete integration guide
- **[API Reference](https://github.com/rajeshg/openchem/blob/main/docs/mcp-server-remote.md)** - Detailed API documentation
- **[OpenChem Docs](https://github.com/rajeshg/openchem)** - Core library documentation

## Deployment

### Docker

```dockerfile
FROM node:18-alpine
RUN npm install -g @openchem/mcp
EXPOSE 3000
CMD ["openchem-mcp"]
```

### Cloud Platforms

- **Fly.io**: `flyctl launch`
- **Railway**: Connect repo and deploy
- **Render**: Web service deployment
- **DigitalOcean**: App Platform deployment

See the [integration guide](https://github.com/rajeshg/openchem/blob/main/docs/mcp-integration-guide.md) for detailed deployment instructions.

## Troubleshooting

### Server won't start

```bash
# Check if port is in use
lsof -i :3000

# Use different port
openchem-mcp --port 8080
```

### Claude Desktop can't connect

1. Ensure server is running: `curl http://localhost:3000/health`
2. Check config file exists: `cat ~/Library/Application\ Support/Claude/claude_desktop_config.json`
3. Restart Claude Desktop

### Tools return errors

- Validate SMILES syntax
- Check server logs with `VERBOSE=1 openchem-mcp`

## Performance

Typical response times:

- **analyze** (no rendering): 50-200ms
- **analyze** (with rendering): 100-400ms
- **compare**: 100-300ms
- **search**: 20-100ms
- **render**: 50-200ms
- **convert**: 20-150ms

## License

MIT - Same as [OpenChem](https://github.com/rajeshg/openchem)

## Links

- **npm**: https://npmjs.com/package/@openchem/mcp
- **GitHub**: https://github.com/rajeshg/openchem
- **OpenChem Library**: https://npmjs.com/package/openchem
- **Issues**: https://github.com/rajeshg/openchem/issues
