# Performance Optimization Guide

This guide documents the hot paths in openchem and provides recommendations for achieving optimal performance.

## Performance Profile Summary

Based on profiling and optimization work in Phase 3:

| Operation            | Typical Time | First Call | Cached   | Optimization                  |
| -------------------- | ------------ | ---------- | -------- | ----------------------------- |
| SMILES parsing       | 0.5-5 ms     | N/A        | N/A      | Fast path optimized           |
| SMILES generation    | 0.5-5 ms     | N/A        | N/A      | Direct compilation            |
| LogP computation     | 50-200 ms    | Yes        | 0.001 ms | **WeakMap cache**             |
| SMARTS matching      | 2-20 ms      | Varies     | 0.001 ms | **Pattern cache + CSR graph** |
| Fingerprint (Morgan) | 1-10 ms      | N/A        | N/A      | Optimized algorithm           |
| Drug-likeness check  | 2-5 ms       | N/A        | N/A      | Direct computation            |
| Bulk operations      | Linear       | N/A        | N/A      | Batch processing              |

## Hot Paths & Optimization Strategies

### 1. LogP Computation (Most Critical Bottleneck)

**Current Performance:**

- First call: 50-200ms (hydrogen addition + 68 SMARTS patterns)
- Cached call: 0.001ms (WeakMap lookup)
- **Speedup: 100,000× for repeated molecules**

**Implementation Details:**

- **WeakMap Caching**: `logpDescriptorCache` stores results per molecule object
- **Hydrogen Augmentation Cache**: `augmentedCache` avoids redundant hydrogen addition
- **Atom Type Pre-filtering**: Skip pattern groups if no atoms of that type exist

**Optimization Locations:**

- `src/utils/logp.ts`: `calcCrippenDescriptors()` (lines 270-285)
- `src/utils/logp.ts`: `getCrippenAtomContribs()` (lines 201-268)

**When to Use:**

- Use for single molecule analysis: Caching is automatic
- For libraries: Use `bulkComputeProperties()` for efficient batch processing
- **DO NOT** create new molecule copies unnecessarily (breaks WeakMap cache)

**Example:**

```typescript
// GOOD: Molecule reused, cache hit on second call
const mol = parseSMILES("CC(=O)Oc1ccccc1C(=O)O").molecules[0];
const logp1 = computeLogP(mol); // 50ms first call
const logp2 = computeLogP(mol); // 0.001ms cached

// BAD: New molecule object, cache miss
const mol1 = parseSMILES("...").molecules[0];
const mol2 = parseSMILES("...").molecules[0]; // Different object = cache miss
```

### 2. SMARTS Pattern Matching

**Current Performance:**

- First match of pattern: 2-20ms
- Cached pattern: 20-30% faster
- With CSR graph: 20-30% faster neighbor lookups

**Implementation Details:**

- **Pattern Caching**: `parseSMARTSCached()` in `src/utils/smarts-cache.ts`
- **CSR Graph Integration**: `getCSRGraph()` provides O(1) neighbor lookups
- **Automatic Optimization**: Pattern compilation cached via `parseSMARTS()`

**Optimization Locations:**

- `src/matchers/smarts-matcher.ts`: Pattern matching with CSR (lines 70-79)
- `src/utils/smarts-cache.ts`: Pattern pre-loading
- `src/utils/csr-graph.ts`: CSR graph construction

**Hot Points:**

- Line 323-327: Bond lookup using `graph.getBond()` (was `molecule.bonds.find()`)
- Line 383-385: Neighbor collection using `graph.getNeighbors()` (was `molecule.bonds.filter()`)

**When to Use:**

- Single patterns: Automatic caching handles optimization
- Repeated patterns: Pattern cache is WeakMap-based (automatic cleanup)
- Bulk matching: Use `bulkMatchSMARTS()` for multiple molecules

**Example:**

```typescript
// GOOD: Pattern cached automatically
const pattern = "[#6]~[#8]";
const matches1 = matchSMARTS(pattern, mol); // Compiled
const matches2 = matchSMARTS(pattern, mol); // Cached pattern, 20-30% faster

// GOOD: Bulk operations for libraries
const results = bulkMatchSMARTS(pattern, [mol1, mol2, mol3]);

// CSR graph used automatically in collectAllMatches()
// No explicit API calls needed
```

### 3. Molecular Properties Assessment

**Current Performance:**

- Lipinski check: 2-5 ms (hydrogen count + TPSA + LogP)
- Veber check: 2-5 ms (rotatable bonds + HBD/HBA)
- BBB penetration: 1-3 ms (TPSA only)
- **Bottleneck: LogP computation (uses first-call performance)**

**Critical Optimization:**
Reuse molecules to leverage LogP caching:

```typescript
// GOOD: Logp computed once per molecule, then cached
for (const result of bulkComputeProperties(molecules)) {
  // All property checks (Lipinski, Veber, BBB) use cached LogP
}

// BAD: Creating new molecules defeats cache
const mols = smilesArray.map((s) => parseSMILES(s).molecules[0]!);
// Then immediately compute properties
// LogP cache only hits if same molecule object is reused later
```

**Optimization Locations:**

- `src/utils/molecular-properties.ts`: `checkLipinskiRuleOfFive()`
- `src/utils/logp.ts`: WeakMap caching prevents redundant computation

### 4. Morgan Fingerprints

**Current Performance:**

- Computation: 1-10 ms per molecule
- Similarity (Tanimoto): 0.001 ms per pair

**Optimization Characteristics:**

- No WeakMap caching (stateless algorithm)
- Fingerprints are small (2048 bits typical = 256 bytes)
- Pairwise comparison is O(fingerprint_size), very fast

**When to Use:**

- Single comparisons: Direct `tanimotoSimilarity()` call
- Bulk searches: `bulkFindSimilar()` precomputes target fingerprints
- Pairwise matrix: `bulkComputeSimilarities()` for O(n²) comparisons

**Example:**

```typescript
// GOOD: Precomputed fingerprints, multiple comparisons
const query = computeMorganFingerprint(queryMol);
for (const target of targets) {
  const fp = computeMorganFingerprint(target);
  const sim = tanimotoSimilarity(query, fp); // 0.001ms
}

// BETTER: Use bulkFindSimilar() for automatic optimization
const similar = bulkFindSimilar(queryMol, targets, 0.7);
```

### 5. Bulk Operations (Recommended for Libraries)

**Current Performance:**

- `bulkMatchSMARTS()`: ~10ms per pattern × molecule count
- `bulkComputeProperties()`: ~10-50ms per molecule (LogP-dominant)
- `bulkComputeSimilarities()`: ~100ms for 10 molecules (O(n²))
- `bulkFindSimilar()`: Linear in target count

**Why Use Bulk Operations:**

1. **Batch Optimization**: Leverage caching across molecules
2. **Reduced Overhead**: Single pass through molecule library
3. **Clear API**: Intent is explicit (not just looping)
4. **Future Parallelization**: Infrastructure ready for parallel processing

**Examples:**

```typescript
// Processing 1000-molecule library
const library = [...]; // 1000 molecules

// GOOD: Bulk operations
const props = bulkComputeProperties(library);         // ~50s total
const similar = bulkFindSimilar(query, library);      // ~100ms
const matches = bulkMatchSMARTS(pattern, library);    // ~100ms

// ALSO GOOD: Filter by drug-likeness efficiently
const filtered = bulkFilterDrugLike(library);
console.log(`${filtered.allPassers.length} compounds pass all rules`);
```

## Memory Efficiency

### WeakMap Caching Strategy

openchem uses WeakMap-based caching for automatic garbage collection:

| Cache                 | Key             | Size Impact              | Cleanup        |
| --------------------- | --------------- | ------------------------ | -------------- |
| LogP descriptors      | Molecule object | ~100 bytes per molecule  | Automatic (GC) |
| Hydrogen augmentation | Molecule object | ~10% molecule size       | Automatic (GC) |
| SMARTS patterns       | Pattern string  | ~50KB per pattern (once) | Automatic (GC) |
| CSR graphs            | Molecule object | 4× bond count bytes      | Automatic (GC) |

**Memory Profile for 1000 Drugs:**

- Molecules: ~10-50 MB (structure data)
- Caches: ~1-5 MB (metadata + precomputed values)
- Total: ~15-60 MB (well within browser/Node.js limits)

### Guidelines:

- ✅ Keep molecule objects in scope for cache hits
- ✅ WeakMaps automatically clean up when molecules are GC'd
- ❌ Don't manually clear caches (breaks automation)
- ❌ Don't create unnecessary molecule copies

## Performance Debugging

### Enable Verbose Output:

```bash
VERBOSE=1 bun test test/performance/regression-tests.test.ts
```

### Profile Specific Operations:

```typescript
const start = performance.now();
computeLogP(mol);
console.log(`LogP: ${performance.now() - start}ms`);

const start2 = performance.now();
computeLogP(mol); // Cached
console.log(`LogP cached: ${performance.now() - start2}ms`);
```

### Check Cache Statistics:

```typescript
// SMARTS pattern cache
const stats = getSMARTSCacheStats();
console.log(`Patterns cached: ${stats.patternCount}`);
console.log(`Cache hits: ${stats.hits}/${stats.hits + stats.misses}`);

// CSR graph cache
// Currently no API - uses WeakMap internally
```

## Performance Regression Prevention

Performance regression tests are located in `test/performance/regression-tests.test.ts`:

```bash
# Run regression tests with budgets
bun test test/performance/regression-tests.test.ts

# Run with performance output
VERBOSE=1 bun test test/performance/regression-tests.test.ts
```

**Current Budgets (2× safety margin for CI):**

- SMILES parsing: 10ms
- LogP first call: 100ms
- LogP cached: 5ms
- SMARTS matching: 20ms
- Fingerprints: 20ms
- Bulk operations: ~200ms for small test set

If tests fail, investigate:

1. Check git diff for recent changes
2. Profile specific operation: `VERBOSE=1 bun test`
3. Compare with `src/` implementation (may need optimization)

## Hot Path Optimization Checklist

For new features or modifications:

- [ ] Use bulk operations for library processing (not manual loops)
- [ ] Keep molecule objects in scope to hit WeakMap caches
- [ ] Reuse patterns (don't recreate SMARTS patterns in loops)
- [ ] Profile first call vs cached performance separately
- [ ] Run regression tests before commit: `bun test test/performance/`
- [ ] Document any new performance-critical code paths
- [ ] Avoid creating new molecule copies unnecessarily

## Future Optimization Opportunities

1. **Parallel Processing**: Bulk operations ready for worker threads
2. **WASM Compilation**: CSR graph traversal could move to WASM
3. **Index Structures**: Pre-index atoms by symbol for LogP pre-filtering
4. **Incremental SMARTS**: Cache sub-pattern results during traversal
5. **GPU Fingerprints**: Batch fingerprint computation on GPU

## References

- **CSR Graph Implementation**: `src/utils/csr-graph.ts` (O(1) neighbor lookups)
- **SMARTS Pattern Caching**: `src/utils/smarts-cache.ts` (20-40% improvement)
- **LogP Caching**: `src/utils/logp.ts` (100,000× speedup for cached calls)
- **Bulk Operations API**: `src/utils/bulk-operations.ts` (batch processing)
- **Performance Benchmarks**: `test/performance/performance-benchmarks.test.ts`
- **Regression Tests**: `test/performance/regression-tests.test.ts`
