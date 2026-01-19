# OpenChem MCP Server (Remote)

A lightweight, remote-first Model Context Protocol (MCP) server for chemistry analysis powered by OpenChem.

## Features

- **Remote-first**: HTTP + Server-Sent Events (SSE) transport
- **Lightweight**: No Express or heavy dependencies
- **5 Broad Composite Tools**: Complete chemistry workflows in single API calls
- **Production-ready**: Supports Node.js and Bun runtimes

## Tools

### 1. **analyze** - Complete Molecular Analysis

Comprehensive analysis including parsing, 40+ descriptors, drug-likeness, IUPAC name, and optional 2D rendering.

**Input:**

- `smiles` (string): SMILES string of the molecule
- `includeRendering` (boolean, optional): Include 2D SVG rendering
- `renderWidth` (number, optional): SVG width in pixels
- `renderHeight` (number, optional): SVG height in pixels

**Output:**

```json
{
  "smiles": "CC(=O)Oc1ccccc1C(=O)O",
  "canonicalSmiles": "CC(=O)Oc1ccccc1C(=O)O",
  "iupacName": "2-acetyloxybenzoic acid",
  "properties": {
    "molecularWeight": 180.16,
    "logP": 1.19,
    "hBondDonors": 1,
    "hBondAcceptors": 4,
    ...
  },
  "drugLikeness": {
    "lipinski": { "passed": true, ... },
    "veber": { "passed": true, ... }
  },
  "rendering": {
    "svg": "<svg>...</svg>",
    "width": 300,
    "height": 300
  }
}
```

### 2. **compare** - Molecular Similarity

Compare two molecules using Morgan fingerprints (Tanimoto similarity) and property comparison.

**Input:**

- `smiles1` (string): First molecule SMILES
- `smiles2` (string): Second molecule SMILES
- `fingerprintRadius` (number, optional): Morgan fingerprint radius (default: 2)

**Output:**

```json
{
  "molecule1": {
    "smiles": "CC(=O)Oc1ccccc1C(=O)O",
    "canonical": "...",
    "properties": { ... }
  },
  "molecule2": {
    "smiles": "CC(C)Cc1ccc(cc1)C(C)C(=O)O",
    "canonical": "...",
    "properties": { ... }
  },
  "similarity": {
    "tanimoto": 0.42,
    "fingerprintRadius": 2
  }
}
```

### 3. **search** - Substructure Matching

Search for substructures using SMARTS patterns.

**Input:**

- `smiles` (string): Molecule to search in
- `pattern` (string): SMARTS pattern

**Output:**

```json
{
  "smiles": "c1ccccc1",
  "pattern": "[#6]",
  "matchCount": 6,
  "matches": [[0], [1], [2], [3], [4], [5]]
}
```

### 4. **render** - 2D Structure Visualization

Generate publication-quality 2D SVG rendering.

**Input:**

- `smiles` (string): Molecule to render
- `width` (number, optional): Width in pixels (default: 300)
- `height` (number, optional): Height in pixels (default: 300)

**Output:**

```json
{
  "smiles": "c1ccccc1",
  "svg": "<svg xmlns=\"http://www.w3.org/2000/svg\">...</svg>",
  "width": 300,
  "height": 300
}
```

### 5. **convert** - Format Conversion

Convert between molecular formats: canonical SMILES, IUPAC name, Murcko scaffold.

**Input:**

- `smiles` (string): Input SMILES
- `outputFormat` (enum): `"canonical"` | `"iupac"` | `"scaffold"`

**Output (canonical):**

```json
{
  "input": "C1=CC=CC=C1",
  "outputFormat": "canonical",
  "canonical": "c1ccccc1"
}
```

**Output (iupac):**

```json
{
  "input": "CC(=O)Oc1ccccc1C(=O)O",
  "outputFormat": "iupac",
  "iupacName": "2-acetyloxybenzoic acid",
  "confidence": "high"
}
```

**Output (scaffold):**

```json
{
  "input": "c1ccc(cc1)CCN",
  "outputFormat": "scaffold",
  "scaffoldSmiles": "c1ccccc1"
}
```

## Installation

```bash
# Install dependencies
bun install
# or
npm install
```

## Running the Server

### Node.js / Bun

```bash
# Production
bun run mcp:remote
# or
npm run mcp:remote

# Development (with auto-reload)
bun run mcp:dev

# Custom port
PORT=8080 bun run mcp:remote
```

### Using with MCP Clients

The server exposes an MCP endpoint at `/mcp` supporting HTTP + SSE transport.

**Example: Claude Desktop Configuration**

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "openchem": {
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

**Note:** You can also use `http://localhost:3000/mcp/sse` if your client prefers explicit SSE routing.

**Example: Programmatic Client (TypeScript)**

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const client = new Client(
  {
    name: "my-chemistry-client",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

const transport = new StreamableHTTPClientTransport(new URL("http://localhost:3000/mcp"));

await client.connect(transport);

// Call analyze tool
const result = await client.callTool("analyze", {
  smiles: "CC(=O)Oc1ccccc1C(=O)O",
  includeRendering: true,
});

console.log(result.content[0].text);
```

## Endpoints

### `GET /health`

Health check endpoint.

**Response:**

```json
{
  "status": "ok",
  "service": "openchem-mcp",
  "version": "0.2.7"
}
```

### `POST /mcp` or `POST /mcp/sse`

Main MCP endpoint for tool execution via HTTP + SSE.

Both `/mcp` and `/mcp/sse` routes are supported for flexibility.

### `GET /mcp?lastEventId=...` or `GET /mcp/sse?lastEventId=...`

SSE stream endpoint for reconnection and resumability.

### `DELETE /mcp` or `DELETE /mcp/sse`

Terminate MCP session.

## Deployment

### Node.js / Bun

Deploy to any Node.js or Bun hosting platform:

- **Fly.io**: `flyctl launch` (with Dockerfile)
- **Railway**: Connect repo and deploy
- **Render**: Web service deployment
- **DigitalOcean App Platform**: Auto-deploy from GitHub
- **AWS Lambda / Fargate**: Container deployment

### Docker

```dockerfile
FROM oven/bun:1
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --production
COPY . .
EXPOSE 3000
CMD ["bun", "run", "src/mcp-server-remote.ts"]
```

```bash
docker build -t openchem-mcp .
docker run -p 3000:3000 openchem-mcp
```

### Cloudflare Workers

**Status:** Not currently supported. The MCP SDK uses Node.js HTTP primitives (`IncomingMessage`, `ServerResponse`) which are not available in Cloudflare Workers.

**Future:** When the MCP SDK releases a native Web Fetch API transport, Cloudflare Workers support will be straightforward.

## Architecture

### Design Principles

1. **Runtime-agnostic tool definitions** (`src/mcp-tools.ts`)
   - Pure TypeScript
   - No Node.js dependencies
   - Reusable across transports

2. **Lightweight server** (`src/mcp-server-remote.ts`)
   - Node.js built-in HTTP module
   - No Express or middleware
   - CORS support built-in

3. **Broad composite tools** over granular methods
   - Fewer round-trips
   - Complete workflows
   - Better user experience

### File Structure

```
src/
├── mcp-tools.ts           # Tool definitions (runtime-agnostic)
└── mcp-server-remote.ts   # HTTP server (Node.js/Bun)
```

## Configuration

### Environment Variables

- `PORT`: Server port (default: `3000`)
- `VERBOSE`: Enable debug logging (set to `"1"`)

### CORS

The server allows all origins by default (`Access-Control-Allow-Origin: *`). For production, consider restricting origins:

```typescript
// In src/mcp-server-remote.ts
res.setHeader("Access-Control-Allow-Origin", "https://your-domain.com");
```

## Security

- ✅ CORS enabled by default
- ✅ Session-based transport with UUID generation
- ⚠️ No rate limiting (add via reverse proxy)
- ⚠️ No authentication (add via middleware or reverse proxy)

For production deployments, consider:

- Reverse proxy (nginx, Caddy) for rate limiting
- API key authentication
- HTTPS/TLS termination

## Performance

- **Typical response times:**
  - `analyze` (no rendering): 50-200ms
  - `analyze` (with rendering): 100-400ms
  - `compare`: 100-300ms
  - `search`: 20-100ms
  - `render`: 50-200ms
  - `convert`: 20-150ms

- **Concurrency:** Node.js event loop handles concurrent requests efficiently
- **Memory:** ~50-100MB per process
- **Scalability:** Stateless design allows horizontal scaling

## Testing

```bash
# Test health endpoint
curl http://localhost:3000/health

# Test MCP tools (requires MCP client)
# See examples above
```

## Troubleshooting

### Server won't start

- Check if port 3000 is already in use: `lsof -i :3000`
- Try a different port: `PORT=8080 bun run mcp:remote`

### Connection refused from MCP client

- Ensure server is running: `curl http://localhost:3000/health`
- Check firewall settings
- Verify client URL matches server address

### Tools return errors

- Validate SMILES syntax: `parseSMILES("CC")` should succeed
- Check server logs for detailed error messages
- Enable verbose logging: `VERBOSE=1 bun run mcp:remote`

## License

MIT

## Related

- [OpenChem Library](../../README.md) - Full chemistry toolkit
- [MCP Protocol](https://github.com/modelcontextprotocol) - Model Context Protocol spec
- [SMILES Specification](https://www.opensmiles.org/) - SMILES format reference
- [SMARTS Specification](http://www.daylight.com/dayhtml/doc/theory/theory.smarts.html) - SMARTS pattern syntax
