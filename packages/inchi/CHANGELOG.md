# Changelog

## [0.1.0] - 2025-10-22

### Added
- Initial public release of `@openchem/inchi`
- Lightweight wrapper for loading InChI/InChIKey via inchi-js
- Support for dynamic runtime loader pattern
- `getInchiFromMolfile()` function to generate InChI from MOL format
- `getInchiKeyFromInchi()` function to derive InChIKey from InChI string
- Full TypeScript support with declaration files
- Async initialization API with mock support for testing
- Comprehensive README with usage examples and adapter pattern documentation
- Node.js >=18 support

### Features
- **Dynamic Runtime Loading**: Avoids large bundle sizes by loading InChI WASM at runtime
- **Flexible Adapter Pattern**: Easy integration with different InChI implementations
- **Test-Friendly**: Includes utilities for mocking and testing without InChI runtime
- **TypeScript Native**: Full type safety with `.d.ts` files

### Documentation
- Installation and usage guide
- Adapter API documentation
- Examples for both module and WASM-based approaches

### Notes
- `inchi-js` (InChI WASM runtime) is an optional dependency
- Must be installed separately: `npm install inchi-js`
- Designed as part of the broader @openchem/opensmiles ecosystem
