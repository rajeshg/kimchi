# @openchem/inchi

Node-first lightweight wrapper for an InChI runtime (e.g. inchi-js) that provides a small, promise-friendly API for generating InChI strings and InChIKeys from molecular inputs.

This package intentionally does NOT bundle the InChI runtime. The consumer should install an adapter/runtime (recommended: `inchi-node`) or provide a browser/WASM loader. This keeps the package small and flexible.

## Features
- Async `init()` to load a runtime adapter
- `getInchiFromMolfile(molfile: string)` → returns InChI string
- `getInchiKeyFromInchi(inchi: string)` → returns InChIKey string
- Node-first: dynamically imports a Node adapter (`inchi-node`) by default

## Installation

Install the package in your project (monorepo users: from repo root run workspace install or `pnpm`/`npm` in the package folder):

```bash
# from project root
# install this package (local development) or publish to npm then use normal install
# npm i @openchem/inchi
```

Then install a runtime adapter. Recommended options:

- Node adapter (recommended for Node): `inchi-node` (third-party adapter/runtime)

```bash
npm install --save inchi-node
```

If you prefer to vendor the runtime or use a custom adapter, install or provide one that exports the expected functions (see Adapter API below).

## Quick Usage (Node)

```ts
import { init, getInchiFromMolfile, getInchiKeyFromInchi } from '@openchem/inchi';

async function example() {
  // init will attempt to dynamically load the runtime adapter (e.g. `inchi-node`)
  await init();

  const molfile = `...`; // V2000 / V3000 molfile string
  const inchi = await getInchiFromMolfile(molfile);
  const key = await getInchiKeyFromInchi(inchi);

  console.log('InChI:', inchi);
  console.log('InChIKey:', key);
}

example().catch(console.error);
```

## Adapter API (what runtime must implement)

The wrapper expects the runtime adapter to export at least one of the following shapes:

1. Named exports (preferred):
```ts
export function InchiFromMolfile(molfile: string, opts?: any): string;
export function InchiKeyFromInchi(inchi: string): string;
```

2. Default export object:
```ts
export default {
  InchiFromMolfile: (molfile: string) => string,
  InchiKeyFromInchi: (inchi: string) => string,
};
```

If the runtime uses different names, you can write a small adapter that re-exports the expected functions.

## Browser / WASM

A browser/WASM loader is not bundled yet. Planned approach:

- Provide `init({ wasmUrl })` option that fetches and initializes the WASM runtime
- Consumers would host `inchi.js` and `.mem` files and pass `wasmUrl` to `init`

If you need browser support now, create a small adapter that loads the inchi.js runtime and exposes the adapter API.

## Dependency Strategy (Recommendations)

We intentionally leave the runtime out of this package to keep it small. Options:

- `optionalDependency`: good UX, installs when available but not required
- `peerDependency`: forces consumer to install runtime explicitly
- `dependency`: best UX (works out of the box) but increases package size

Recommendation: use `peerDependency` or document `npm i inchi-node` in README. For monorepo CI you can vendor the runtime into `packages/inchi/build` if offline runs are required.

## Troubleshooting

- If `init()` fails with `Runtime adapter not found`, install a runtime adapter (e.g. `npm i inchi-node`) or provide a custom adapter.
- If function names differ, create a shim module that exports `InchiFromMolfile` and `InchiKeyFromInchi` and point the loader to it.

## Development & Tests

- TypeScript sources under `src/` and build output to `dist/`.
- Add adapter runtime to `devDependencies` for tests or vendor runtime into `packages/inchi/build` for CI.

## License
MIT
