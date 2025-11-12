# IUPAC Naming Engine - Documentation Hub

Welcome to the openchem IUPAC naming engine documentation. This hub helps you find the right documentation based on your role and needs.

## Quick Start

- **Want to generate IUPAC names?** → Start with [IUPAC Name Generation](./iupac-name-generation.md)
- **Contributing to the engine?** → Read [Implementation Guide](./iupac-implementation.md)
- **Implementing IUPAC rules?** → See [Rules Reference](./iupac-rules-reference.md)
- **Planning features or evaluating capabilities?** → Check [Capabilities & Roadmap](./iupac-capabilities.md)
- **Working with large molecules (>100 atoms)?** → Review [Large Molecule Analysis](./iupac-large-molecules.md)

## Documentation Structure

### 1. [IUPAC Name Generation](./iupac-name-generation.md)
**Audience:** End users, API consumers  
**Purpose:** User-facing overview of how to use the IUPAC naming functionality

- How to generate IUPAC names from SMILES
- Supported molecule types
- Output formats (PIN, traditional names)
- Basic examples

### 2. [Implementation Guide](./iupac-implementation.md)
**Audience:** Contributors, maintainers  
**Purpose:** Technical architecture and implementation details

- Overall architecture and design patterns
- Core components (IUPACContext, chain selection, stereo engine)
- Numbering systems and algorithms
- State management approach
- Integration with OPSIN data
- Testing strategy
- How to extend the engine

### 3. [Rules Reference](./iupac-rules-reference.md)
**Audience:** Rule implementers, chemistry domain experts  
**Purpose:** Comprehensive guide to IUPAC Blue Book rules

- Overview of Blue Book 2013 structure
- Implemented rules by section (P-14 through P-68)
- Rule implementation status matrix
- Handling priorities and exceptions
- Fusion nomenclature details
- Links to official IUPAC specifications

### 4. [Capabilities & Roadmap](./iupac-capabilities.md)
**Audience:** Project managers, feature planners  
**Purpose:** Current capabilities, known limitations, and future roadmap

- What works well (validated with PubChem dataset)
- Known limitations and edge cases
- Test results and success rates
- Roadmap for future improvements
- Comparison with other tools (OPSIN, RDKit)

### 5. [Large Molecule Analysis](./iupac-large-molecules.md)
**Audience:** Performance engineers, strategic planners  
**Purpose:** Deep dive into handling molecules with 100+ atoms

- Performance characteristics for large molecules
- Memory usage and optimization strategies
- Specific challenges (fullerenes, dendrimers, polymers)
- Algorithmic complexity analysis
- Recommendations for production use

## Quick Reference

### Current Capabilities Summary

| Feature | Status | Notes |
|---------|--------|-------|
| Basic hydrocarbons | ✅ Full | Alkanes, alkenes, alkynes |
| Cyclic hydrocarbons | ✅ Full | Monocycles, fused rings, bridged |
| Functional groups | ✅ Good | Alcohols, ketones, acids, esters |
| Heteroatoms | ✅ Good | N, O, S, P in rings and chains |
| Stereochemistry | ⚠️ Partial | E/Z implemented, R/S in progress |
| Fusion nomenclature | ⚠️ Partial | Common systems, expanding coverage |
| Natural products | ⚠️ Limited | Basic retained names only |
| Macromolecules | ❌ Not yet | Polymers, proteins require future work |

### Size Limits (Tested)

- **Optimal performance:** < 30 atoms (< 10ms)
- **Good performance:** 30-60 atoms (10-100ms)
- **Acceptable:** 60-100 atoms (100ms-1s)
- **Large molecules:** 100-200 atoms (1-10s, may require optimization)
- **Very large:** > 200 atoms (not yet validated, use with caution)

### Known Limitations

1. **Stereochemistry**: R/S configuration detection incomplete
2. **Fusion nomenclature**: Limited to common ring systems
3. **Natural product names**: Minimal retained name support
4. **Complex bridged systems**: Some edge cases fail
5. **Tautomers**: No automatic canonical form selection

See [Capabilities & Roadmap](./iupac-capabilities.md) for full details.

## Architecture Overview

```
IUPAC Engine
├── Parsers (input)
│   ├── SMILES → Molecule
│   └── MOL file → Molecule
├── Context Builder
│   ├── Ring analysis (SSSR, fusion detection)
│   ├── Aromaticity perception
│   └── Functional group detection
├── Main Chain Selection (P-44)
│   ├── Seniority rules
│   └── Longest chain algorithm
├── Numbering Engine (P-14)
│   ├── Lowest locant principle
│   └── Direction selection
├── Name Assembly
│   ├── Prefix generation (substituents)
│   ├── Parent name construction
│   └── Suffix handling (functional groups)
└── Output Formatting
    ├── PIN (Preferred IUPAC Name)
    └── Traditional name variants
```

See [Implementation Guide](./iupac-implementation.md) for detailed architecture.

## Contributing

### Adding New Rules

1. **Identify the rule**: Find the Blue Book section (e.g., P-31.2)
2. **Read the specification**: See [Rules Reference](./iupac-rules-reference.md) for links
3. **Check existing implementation**: Review current status in rules reference
4. **Write tests first**: Add test cases in `test/unit/iupac-engine/`
5. **Implement the rule**: Follow patterns in `src/iupac-engine/rules/`
6. **Validate against RDKit/OPSIN**: Run comparison tests
7. **Update documentation**: Add to rules reference and changelog

### Testing Strategy

- **Unit tests**: Each rule in isolation (`test/unit/iupac-engine/`)
- **Integration tests**: Full name generation pipeline
- **Comparison tests**: Validate against RDKit and OPSIN
- **Realistic dataset**: 300+ PubChem molecules in `docs/pubchem-iupac-name-300.json`

See [Implementation Guide](./iupac-implementation.md#testing) for details.

## References

### Official IUPAC Resources

- **Blue Book 2013**: [Nomenclature of Organic Chemistry](https://iupac.org/what-we-do/books/bluebook/)
- **IUPAC Gold Book**: [Compendium of Chemical Terminology](https://goldbook.iupac.org/)
- **PIN Guidelines**: [Preferred IUPAC Names](https://iupac.org/project/2001-043-1-800/)

### Related Tools

- **OPSIN**: [Open Parser for Systematic IUPAC Nomenclature](https://github.com/dan2097/opsin)
- **RDKit**: [Cheminformatics toolkit](https://www.rdkit.org/)
- **PubChem**: [Chemical database](https://pubchem.ncbi.nlm.nih.gov/)

## Getting Help

1. **Check the docs**: Use this hub to navigate to relevant sections
2. **Search issues**: [GitHub Issues](https://github.com/sst/openchem/issues)
3. **Ask questions**: Open a new issue with the `question` label
4. **Contribute**: PRs welcome! See contributing guidelines above

## Changelog

- **v0.2.0** (Current): Basic IUPAC naming with P-14, P-44, P-31, P-45 support
- **v0.1.x**: Initial SMILES/MOL parsing, no IUPAC naming

See individual documentation files for detailed version history.
