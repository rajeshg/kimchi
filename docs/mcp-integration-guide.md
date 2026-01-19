# OpenChem MCP Integration Guide

A comprehensive guide for integrating OpenChem's MCP server with AI assistants and chemistry workflows.

---

## Table of Contents

1. [What is OpenChem MCP?](#what-is-openchem-mcp)
2. [Architecture Overview](#architecture-overview)
3. [Quick Start](#quick-start)
4. [Integration Methods](#integration-methods)
5. [Deployment Options](#deployment-options)
6. [Custom Integration Examples](#custom-integration-examples)
7. [Troubleshooting](#troubleshooting)

---

## What is OpenChem MCP?

OpenChem provides a **Model Context Protocol (MCP) server** that exposes chemistry analysis capabilities to AI assistants like Claude, ChatGPT, and custom agents.

### Key Features

- **Dual transport modes**: stdio (for IDEs) and HTTP (for remote clients)
- **5 Composite Tools**: Complete chemistry workflows in single calls
- **Lightweight**: Minimal dependencies, pure Node.js implementation
- **Production-ready**: Works with Node.js and Bun
- **Zero-config**: Install via npm and run

### Available Tools

| Tool      | Purpose                                                                  | Example Use                           |
| --------- | ------------------------------------------------------------------------ | ------------------------------------- |
| `analyze` | Complete molecular analysis (40+ descriptors, drug-likeness, IUPAC name) | "Analyze aspirin"                     |
| `compare` | Molecular similarity (Morgan fingerprints, Tanimoto)                     | "Compare aspirin to ibuprofen"        |
| `search`  | Substructure matching (SMARTS patterns)                                  | "Find benzene rings in this molecule" |
| `render`  | 2D structure visualization (SVG)                                         | "Draw this molecule"                  |
| `convert` | Format conversion (canonical SMILES, IUPAC, scaffold)                    | "Convert to IUPAC name"               |

---

## Architecture Overview

### Transport Modes

OpenChem MCP supports **two transport modes**:

1. **stdio transport** (default) - For VS Code, Cursor, and IDE integrations
2. **HTTP + SSE transport** (`--http` flag) - For Claude Desktop and remote clients

```
┌─────────────────────────────────────────────────────┐
│ @openchem/mcp package                                │
│                                                      │
│ ┌──────────────────────────────────────────────┐   │
│ │ Node.js HTTP Server                          │   │
│ │ • Port 3000 (configurable via PORT env var)  │   │
│ │ • CORS enabled                               │   │
│ │ • Endpoints:                                 │   │
│ │   - GET  /health                             │   │
│ │   - POST /mcp                                │   │
│ │   - GET  /mcp?lastEventId=...                │   │
│ │   - DELETE /mcp                              │   │
│ │   - POST /mcp/sse (alias)                    │   │
│ └──────────────────────────────────────────────┘   │
│                                                      │
│ ┌──────────────────────────────────────────────┐   │
│ │ StreamableHTTPServerTransport                │   │
│ │ • HTTP POST for requests                     │   │
│ │ • Server-Sent Events (SSE) for responses     │   │
│ │ • Session management via UUID                │   │
│ └──────────────────────────────────────────────┘   │
│                                                      │
│ ┌──────────────────────────────────────────────┐   │
│ │ MCP Server (from SDK)                        │   │
│ │ • Protocol version: 2024-11-05               │   │
│ │ • 5 registered tools                         │   │
│ └──────────────────────────────────────────────┘   │
│                                                      │
│ ┌──────────────────────────────────────────────┐   │
│ │ src/mcp-tools.ts (tool definitions)          │   │
│ │ • Runtime-agnostic                           │   │
│ │ • Pure TypeScript                            │   │
│ │ • Imports from index.ts                      │   │
│ └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

### Transport: Streamable HTTP (NOT WebSocket)

The ChatGPT suggestions incorrectly assumed WebSocket transport. OpenChem uses:

- **HTTP POST** for client requests
- **Server-Sent Events (SSE)** for server responses
- **Session-based** communication via `Mcp-Session-Id` header

This is the official MCP SDK's `StreamableHTTPServerTransport`, not a custom WebSocket implementation.

---

## Quick Start

### Installation

```bash
# Install globally via npm
npm install -g @openchem/mcp

# Or use with npx (no installation)
npx @openchem/mcp --help
```

### 1. Start in HTTP Mode (for Claude Desktop, remote clients)

```bash
# Start HTTP server
openchem-mcp --http

# Or with custom port
openchem-mcp --http --port 8080
```

Expected output:

```
✨ OpenChem MCP Server v0.1.4 (HTTP mode)
📍 Running on http://localhost:4141
🏥 Health: http://localhost:4141/health
🔌 MCP endpoints:
   • http://localhost:4141/mcp
   • http://localhost:4141/mcp/sse

🧪 Available tools:
   • analyze   - Complete molecular analysis
   • compare   - Similarity comparison
   • search    - Substructure matching
   • render    - 2D visualization (SVG/PNG)
   • convert   - Format conversion
```

### 2. Test HTTP Mode with curl

```bash
# Health check
curl http://localhost:4141/health

# Initialize MCP session
curl -X POST http://localhost:4141/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "capabilities": {},
      "clientInfo": {"name": "test", "version": "1.0.0"}
    },
    "id": 1
  }'
```

### 3. Use in VS Code (stdio mode)

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

---

## Integration Methods

### Method 1: VS Code Copilot (Recommended for Development)

VS Code Copilot has native MCP support via `.vscode/mcp.json`.

**Configuration:**

Create or edit `.vscode/mcp.json` in your workspace:

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

**Steps:**

1. Install VS Code with Copilot enabled
2. Create `.vscode/mcp.json` in your workspace root
3. Add the configuration above
4. Restart VS Code
5. Test: Ask Copilot to "Analyze aspirin using SMILES CC(=O)Oc1ccccc1C(=O)O"

VS Code will automatically spawn the server when needed (no manual start required).

---

### Method 2: Claude Desktop

Claude Desktop has native MCP support via `claude_desktop_config.json`.

**Location:**

```
~/Library/Application Support/Claude/claude_desktop_config.json  (macOS)
%APPDATA%/Claude/claude_desktop_config.json  (Windows)
```

**Configuration:**

```json
{
  "mcpServers": {
    "openchem": {
      "url": "http://localhost:4141/mcp"
    }
  }
}
```

**Steps:**

1. Start OpenChem MCP server: `openchem-mcp --http`
2. Edit `claude_desktop_config.json` (create if missing)
3. Add the configuration above
4. Restart Claude Desktop
5. Test: "Analyze aspirin using SMILES CC(=O)Oc1ccccc1C(=O)O"

Claude will automatically discover and use the `analyze` tool.

---

### Method 3: ChatGPT Desktop (Custom Actions)

ChatGPT does **not** natively support MCP protocol. You need to:

**Option A: Wait for Native Support**

OpenAI has not announced MCP support yet. Monitor:

- https://github.com/modelcontextprotocol
- ChatGPT release notes

**Option B: Use a Bridge Service**

Create a REST API wrapper that translates ChatGPT's Custom Actions to MCP calls:

```typescript
// example-chatgpt-bridge.ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import express from "express";

const app = express();
app.use(express.json());

const mcpClient = new Client(
  {
    name: "chatgpt-bridge",
    version: "1.0.0",
  },
  {
    capabilities: { tools: {} },
  },
);

const transport = new StreamableHTTPClientTransport(new URL("http://localhost:3000/mcp"));

await mcpClient.connect(transport);

// REST endpoint for ChatGPT
app.post("/api/analyze", async (req, res) => {
  const { smiles } = req.body;

  const result = await mcpClient.callTool("analyze", {
    smiles,
    includeRendering: false,
  });

  res.json(JSON.parse(result.content[0].text));
});

app.listen(8080, () => {
  console.log("Bridge running on http://localhost:8080");
});
```

Then create a ChatGPT Custom Action pointing to `http://localhost:8080/api/analyze`.

**Option C: Use Claude Desktop Instead**

Claude has better MCP support. For ChatGPT users, consider using Claude Desktop for chemistry tasks.

---

### Method 3: Programmatic Integration (Node.js/TypeScript)

For custom applications, use the MCP SDK client directly:

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

// Create client
const client = new Client(
  {
    name: "my-chemistry-app",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// Connect to OpenChem MCP server
const transport = new StreamableHTTPClientTransport(new URL("http://localhost:3000/mcp"));

await client.connect(transport);

// Call analyze tool
const result = await client.callTool("analyze", {
  smiles: "CC(=O)Oc1ccccc1C(=O)O",
  includeRendering: true,
  renderWidth: 500,
  renderHeight: 500,
});

const data = JSON.parse(result.content[0].text);
console.log(`Molecular Weight: ${data.properties.molecularWeight}`);
console.log(`LogP: ${data.properties.logP}`);
console.log(`IUPAC Name: ${data.iupacName}`);
console.log(`SVG: ${data.rendering.svg}`);
```

---

### Method 4: Python Integration

Use the official Python MCP SDK:

```python
from mcp import ClientSession, StreamableHTTPClientTransport
import json

# Create transport
transport = StreamableHTTPClientTransport("http://localhost:3000/mcp")

async with ClientSession(transport) as session:
    # Initialize
    await session.initialize()

    # Call analyze tool
    result = await session.call_tool("analyze", {
        "smiles": "CC(=O)Oc1ccccc1C(=O)O",
        "includeRendering": False
    })

    data = json.loads(result.content[0].text)
    print(f"Molecular Weight: {data['properties']['molecularWeight']}")
    print(f"LogP: {data['properties']['logP']}")
    print(f"IUPAC Name: {data['iupacName']}")
```

---

## Deployment Options

### Option 1: Local Development

**Best for:** Testing, development, personal use

```bash
bun run mcp:remote  # Production mode
bun run mcp:dev     # Auto-reload mode
```

---

### Option 2: Docker Container

**Best for:** Production deployments, team sharing

**Dockerfile:**

```dockerfile
FROM oven/bun:1

WORKDIR /app

# Install dependencies
COPY package.json bun.lock ./
RUN bun install --production

# Copy source
COPY . .

# Build (if needed)
RUN bun run build

# Expose port
EXPOSE 3000

# Run server
CMD ["bun", "run", "src/mcp-server-remote.ts"]
```

**Build and run:**

```bash
docker build -t openchem-mcp .
docker run -p 3000:3000 openchem-mcp
```

**Docker Compose:**

```yaml
version: "3.8"
services:
  openchem-mcp:
    build: .
    ports:
      - "3000:3000"
    environment:
      - PORT=3000
    restart: unless-stopped
```

---

### Option 3: Cloud Deployment

#### Fly.io

```bash
# Install flyctl
brew install flyctl

# Login
flyctl auth login

# Create app
flyctl launch

# Deploy
flyctl deploy
```

**fly.toml:**

```toml
app = "openchem-mcp"
primary_region = "sjc"

[build]
  builder = "oven/bun"

[env]
  PORT = "8080"

[[services]]
  http_checks = []
  internal_port = 8080
  protocol = "tcp"

  [[services.ports]]
    port = 80
    handlers = ["http"]

  [[services.ports]]
    port = 443
    handlers = ["tls", "http"]
```

#### Railway

1. Go to https://railway.app
2. "New Project" → "Deploy from GitHub"
3. Select `openchem` repository
4. Railway auto-detects Bun and deploys
5. Get public URL: `https://openchem-mcp.railway.app`

#### Render

1. Go to https://render.com
2. "New Web Service"
3. Connect GitHub repo
4. Build command: `bun install`
5. Start command: `bun run src/mcp-server-remote.ts`

---

### Option 4: Cloudflare Workers

**Status:** ❌ Not currently supported

**Reason:** MCP SDK's `StreamableHTTPServerTransport` uses Node.js HTTP primitives (`IncomingMessage`, `ServerResponse`) which are not available in Cloudflare Workers.

**Future:** When MCP SDK releases a native Web Fetch API transport, Workers support will be trivial.

**Workaround:** Deploy to Fly.io or Railway instead (both support HTTP/2 and global edge networks).

---

## Custom Integration Examples

### Example 1: Batch Analysis Script

Analyze multiple molecules and export to CSV:

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { writeFileSync } from "node:fs";

const client = new Client(
  { name: "batch-analyzer", version: "1.0.0" },
  { capabilities: { tools: {} } },
);

const transport = new StreamableHTTPClientTransport(new URL("http://localhost:3000/mcp"));

await client.connect(transport);

const molecules = [
  { name: "Aspirin", smiles: "CC(=O)Oc1ccccc1C(=O)O" },
  { name: "Ibuprofen", smiles: "CC(C)Cc1ccc(cc1)C(C)C(=O)O" },
  { name: "Caffeine", smiles: "CN1C=NC2=C1C(=O)N(C(=O)N2C)C" },
];

const results = [];

for (const mol of molecules) {
  const result = await client.callTool("analyze", {
    smiles: mol.smiles,
    includeRendering: false,
  });

  const data = JSON.parse(result.content[0].text);

  results.push({
    Name: mol.name,
    SMILES: mol.smiles,
    "Molecular Weight": data.properties.molecularWeight,
    LogP: data.properties.logP,
    "H-Bond Donors": data.properties.hBondDonors,
    "H-Bond Acceptors": data.properties.hBondAcceptors,
    "Lipinski Pass": data.drugLikeness.lipinski.passed,
  });
}

// Convert to CSV
const csv = [
  Object.keys(results[0]).join(","),
  ...results.map((r) => Object.values(r).join(",")),
].join("\n");

writeFileSync("analysis.csv", csv);
console.log("✅ Analysis complete: analysis.csv");
```

---

### Example 2: Web Dashboard

Simple web UI for OpenChem MCP:

```typescript
// server.ts
import express from "express";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const app = express();
app.use(express.json());
app.use(express.static("public"));

const mcpClient = new Client(
  { name: "web-dashboard", version: "1.0.0" },
  { capabilities: { tools: {} } },
);

const transport = new StreamableHTTPClientTransport(new URL("http://localhost:3000/mcp"));

await mcpClient.connect(transport);

app.post("/api/analyze", async (req, res) => {
  try {
    const { smiles } = req.body;

    const result = await mcpClient.callTool("analyze", {
      smiles,
      includeRendering: true,
      renderWidth: 400,
      renderHeight: 400,
    });

    res.json(JSON.parse(result.content[0].text));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.listen(8080, () => {
  console.log("Dashboard running on http://localhost:8080");
});
```

```html
<!-- public/index.html -->
<!DOCTYPE html>
<html>
  <head>
    <title>OpenChem Dashboard</title>
    <style>
      body {
        font-family: sans-serif;
        max-width: 800px;
        margin: 50px auto;
      }
      input {
        width: 100%;
        padding: 10px;
        font-size: 16px;
      }
      button {
        padding: 10px 20px;
        font-size: 16px;
        cursor: pointer;
      }
      #result {
        margin-top: 20px;
      }
      svg {
        border: 1px solid #ccc;
      }
    </style>
  </head>
  <body>
    <h1>OpenChem Analyzer</h1>
    <input id="smiles" type="text" placeholder="Enter SMILES (e.g., CCO)" />
    <button onclick="analyze()">Analyze</button>
    <div id="result"></div>

    <script>
      async function analyze() {
        const smiles = document.getElementById("smiles").value;
        const response = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ smiles }),
        });

        const data = await response.json();

        document.getElementById("result").innerHTML = `
        <h2>${data.iupacName}</h2>
        <div>${data.rendering.svg}</div>
        <p><b>Molecular Weight:</b> ${data.properties.molecularWeight}</p>
        <p><b>LogP:</b> ${data.properties.logP}</p>
        <p><b>H-Bond Donors:</b> ${data.properties.hBondDonors}</p>
        <p><b>H-Bond Acceptors:</b> ${data.properties.hBondAcceptors}</p>
        <p><b>Lipinski Rule of Five:</b> ${data.drugLikeness.lipinski.passed ? "✅ Pass" : "❌ Fail"}</p>
      `;
      }
    </script>
  </body>
</html>
```

---

## Troubleshooting

### Server won't start

**Symptom:** `EADDRINUSE` error

**Solution:**

```bash
# Check what's using port 3000
lsof -i :3000

# Kill process or use different port
PORT=8080 bun run mcp:remote
```

---

### Claude Desktop can't connect

**Symptom:** Claude shows "Server unavailable"

**Checklist:**

1. ✅ Server is running: `curl http://localhost:3000/health`
2. ✅ Config file exists and is valid JSON
3. ✅ Config points to correct URL: `http://localhost:3000/mcp` (not `/mcp/sse`)
4. ✅ Restart Claude Desktop after config change

**macOS Config Location:**

```bash
cat ~/Library/Application\ Support/Claude/claude_desktop_config.json
```

---

### Tools return parsing errors

**Symptom:** `Failed to parse SMILES`

**Common issues:**

- Invalid SMILES syntax (use `parseSMILES()` to test)
- Typos in aromatic notation (`C` vs `c`)
- Missing brackets around complex atoms

**Test SMILES locally:**

```bash
bun -e "import { parseSMILES } from './index.ts'; console.log(parseSMILES('CCO'))"
```

---

### High latency / slow responses

**Typical causes:**

- Network issues (test with local server first)
- Large molecules (> 100 atoms may take longer)
- Rendering enabled (adds 50-200ms)

**Optimize:**

```typescript
// Disable rendering for faster analysis
await client.callTool("analyze", {
  smiles: "...",
  includeRendering: false, // ⚡ Faster
});
```

---

### Session timeout errors

**Symptom:** `Session expired` after idle time

**Solution:** The MCP SDK handles reconnection automatically. If you're implementing a custom client, store the session ID and retry:

```typescript
let sessionId = null;

async function callWithRetry(tool, args) {
  try {
    return await client.callTool(tool, args);
  } catch (error) {
    if (error.message.includes("session")) {
      // Reconnect
      await client.connect(transport);
      return await client.callTool(tool, args);
    }
    throw error;
  }
}
```

---

## Summary

### What OpenChem MCP Actually Is

- ✅ HTTP + SSE server (Node.js `http` module)
- ✅ Streamable HTTP transport (official MCP SDK)
- ✅ 87-line server implementation
- ✅ 5 composite chemistry tools
- ✅ Works with Claude Desktop today
- ❌ NOT WebSocket-based
- ❌ NOT yet supported by ChatGPT

### Integration Priorities

| Client             | Status            | Effort              |
| ------------------ | ----------------- | ------------------- |
| Claude Desktop     | ✅ Native support | 5 minutes           |
| Custom Node.js app | ✅ MCP SDK client | 30 minutes          |
| Python app         | ✅ MCP Python SDK | 30 minutes          |
| ChatGPT Desktop    | ❌ No MCP support | Build bridge API    |
| Cloudflare Workers | ❌ SDK limitation | Wait for SDK update |

### Next Steps

1. **Try Claude Desktop integration** (easiest way to test)
2. **Deploy to Fly.io or Railway** for remote access
3. **Build custom integrations** using MCP SDK
4. **Monitor ChatGPT** for future MCP support

---

## Resources

- **OpenChem Docs:** [docs/mcp-server-remote.md](./mcp-server-remote.md)
- **Quick Start:** [MCP_QUICKSTART.md](../MCP_QUICKSTART.md)
- **MCP Protocol:** https://github.com/modelcontextprotocol
- **MCP SDK:** https://github.com/modelcontextprotocol/typescript-sdk
- **Claude Desktop Config:** https://docs.anthropic.com/en/docs/mcp
