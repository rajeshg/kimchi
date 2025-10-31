# New IUPAC Rule Engine Implementation Plan

## Overview
New implementation aligned with IUPAC Blue Book rules while maintaining compatibility with existing system. Non-destructive approach allows gradual migration. **Key Enhancement**: Implementation follows Blue Book's logical structure (sections → rule layers) for maintainability and scientific correctness.

## Directory Structure
```
src/
  iupac-engine/
    rules/                   # Individual rule implementations
      bluebook/              # P-44, P-51, etc. (metadata-driven)
      functional-groups/
    metadata/                # Rule metadata and contracts
    context.ts              # Immutable NamingContext
    engine.ts               # RuleEngine core with phase control
    contracts/              # Layer contracts and interfaces
    compatibility/          # OPSIN regression layer (read-only)
    trace/                  # Rule execution traceability
```

## Core Components

### 1. Immutable Context with Traceability
```typescript
// src/iupac-engine/context.ts
interface NamingContext {
  readonly molecule: Molecule;
  readonly history: RuleExecutionTrace[];
  readonly state: Readonly<ContextState>;
}

interface RuleExecutionTrace {
  rule: string;
  blueBookSection: string;
  before: ContextState;
  after: ContextState;
  timestamp: Date;
}

// Functional transitions ensure immutable context updates
const newContext = context.withUpdatedCandidates(
  filteredCandidates, 
  'P-44.3.1',
  'Longest chain selection applied'
);
```

### 2. Rule Phase Controller (No Global Priority)
```typescript
// src/iupac-engine/engine.ts
enum ExecutionPhase {
  NOMENCLATURE_SELECTION = 'nomenclature',
  FUNCTIONAL_GROUP = 'functional-groups', 
  PARENT_STRUCTURE = 'parent-structure',
  NUMBERING = 'numbering',
  ASSEMBLY = 'assembly'
}

class RuleEngine {
  private phases = new Map<ExecutionPhase, PhaseController>();
  
  run(molecule: Molecule): NamingResult {
    let context = NamingContext.create(molecule);
    
    for (const [phase, controller] of this.phases) {
      if (controller.canExecute(context)) {
        context = controller.execute(context);
        context.addTrace(`Phase ${phase} completed`);
      }
    }
    
    return context.generateResult();
  }
}
```

### 3. Layer Contracts and Dependencies
```typescript
// src/iupac-engine/contracts/layer-contracts.ts
interface LayerContract {
  phase: ExecutionPhase;
  dependencies: DependencyRequirement[];
  provides: DataStructureDefinition[];
  validationRules: ValidationRule[];
}

interface DependencyRequirement {
  name: string;
  type: 'functionalGroups' | 'parentChain' | 'ringSystem';
  validation: (data: any) => boolean;
}

const CHAIN_SELECTION_CONTRACT: LayerContract = {
  phase: ExecutionPhase.PARENT_STRUCTURE,
  dependencies: [
    { 
      name: 'functionalGroups',
      type: 'functionalGroups',
      validation: (fg) => fg.length > 0
    }
  ],
  provides: [
    { name: 'selectedParentChain', type: 'Chain' },
    { name: 'chainSelectionHistory', type: 'SelectionTrace[]' }
  ]
};
```

### 4. Rule Implementation (Metadata-Driven)
```typescript
// src/iupac-engine/rules/bluebook/P-44.3.1.ts
interface RuleMetadata {
  id: string;
  title: string;
  blueBookSection: string;
  phase: ExecutionPhase;
  dependencies: string[];
  supersededBy?: string;
  testCases: TestCase[];
}

const P44_3_1_RULE_METADATA: RuleMetadata = {
  id: 'P-44.3.1',
  title: 'Maximum Length of Continuous Chain',
  blueBookSection: 'Parent Structure Selection',
  phase: ExecutionPhase.PARENT_STRUCTURE,
  dependencies: ['atomic-analysis'],
  supersededBy: null,
  testCases: [
    { smiles: 'CC(C)C(C(C(C)C)C)C', expectedChainLength: 6 }
  ]
};

export const P44_3_1_Rule: IUPACRule = {
  metadata: P44_3_1_RULE_METADATA,
  conditions: (ctx) => ctx.state.functionalGroups.length > 0,
  action: (ctx) => {
    const chains = ctx.getCandidateChains();
    const maxLength = Math.max(...chains.map(c => c.length));
    const longestChains = chains.filter(c => c.length === maxLength);
    
    return ctx.withUpdatedCandidates(longestChains, metadata.id, 
      `Selected ${maxLength}-carbon chain from ${chains.length} candidates`);
  }
};
```

### 5. Dynamic Layer Registration (No Hard-Coded Dependencies)
```typescript
// src/iupac-engine/engine.ts
class RuleEngine {
  registerLayer(phase: ExecutionPhase, rulePatterns: string[]): void {
    const rules = this.discoverRules(rulePatterns);
    this.phases.set(phase, new PhaseController(phase, rules));
  }
  
  private discoverRules(pattern: string): IUPACRule[] {
    // Dynamic rule discovery using file glob patterns
    const ruleFiles = glob(pattern);
    return ruleFiles.map(file => importRule(file));
  }
}

// Layer registration in main entry point
engine.registerLayer(ExecutionPhase.PARENT_STRUCTURE, 'rules/bluebook/P-44.3.*');
```

### 6. OPSIN Compatibility Layer (Regression Only)
```typescript
// src/iupac-engine/compatibility/opsin-adapter.ts
/**
 * OPSIN integration is STRICTLY for regression testing and compatibility.
 * NOT used for rule execution - all Blue Book logic implemented natively.
 */

class OPSINCompatibilityLayer {
  validateNewEngine(results: TestResult[]): CompatibilityReport {
    // Only for validation - never influences rule execution
    return this.compareWithOPSIN(results);
  }
  
  getOPSINRuleset(): OPSINRule[] {
    // Read-only access for testing
    return this.opsinRules;
  }
}
```

### 7. Testing Granularity (Rule + Layer Level)
```typescript
// test/iupac-engine/rules/bluebook/P-44.3.1.test.ts
describe('P-44.3.1 Maximum Chain Length Rule', () => {
  test('selects longest chain among multiple candidates', () => {
    // Unit test for specific rule logic
    const context = createTestContextWithMultipleChains([4, 5, 6]);
    const result = P44_3_1_Rule.action(context);
    
    expect(result.getCandidateChains()).toHaveLength(1);
    expect(result.getCandidateChains()[0].length).toBe(6);
    expect(result.getTrace().last().description)
      .toContain('Selected 6-carbon chain from 3 candidates');
  });
});

// test/iupac-engine/chain-selection-layer.test.ts  
describe('Chain Selection Layer', () => {
  test('applies P-44.3 hierarchy correctly', () => {
    // Layer integration test
    const molecule = parseSMILES('CC(C)C(C(C(C)C)C)C');
    const context = ChainSelectionLayer.execute(molecule);
    
    expect(context.selectedParentChain?.length).toBe(6);
    expect(context.getSelectionHistory().map(h => h.rule))
      .toEqual(['P-44.3.1', 'P-44.3.6']);
  });
});

// test/data/mini-bluebook-test-suite.json
// SMILES → expected intermediate results for each subrule
const BLUEBOOK_TEST_SUITE = {
  "CC(C)C(C(C(C)C)C)C": {
    "P-44.3.1": { selectedChains: 1, maxLength: 6 },
    "P-44.3.6": { maxSubstituents: 3 }
  }
};
```

### 8. HTML Trace Report Generation
```typescript
// src/iupac-engine/trace/html-report-generator.ts
class TraceReportGenerator {
  generateHTMLReport(context: NamingContext): string {
    return `
    <!DOCTYPE html>
    <html>
    <head><title>IUPAC Naming Trace Report</title></head>
    <body>
      <h1>IUPAC Naming Trace: ${context.molecule.id}</h1>
      <h2>Blue Book Rule Execution</h2>
      ${this.generateRuleHistoryTable(context.history)}
      <h2>Final Result</h2>
      <p>Name: ${context.generateResult().name}</p>
      <p>Confidence: ${(context.generateResult().confidence * 100).toFixed(1)}%</p>
    </body>
    </html>
    `;
  }
  
  private generateRuleHistoryTable(history: RuleExecutionTrace[]): string {
    return history.map(trace => `
      <tr>
        <td>${trace.rule}</td>
        <td>${trace.blueBookSection}</td>
        <td>${trace.description}</td>
      </tr>
    `).join('');
  }
}
```

## Implementation Order

### Phase 1: Core Infrastructure
1. **Immutable Context + Trace System** - Foundation for traceability
2. **Execution Phase Controller** - No more global priority conflicts
3. **Layer Contract System** - Clear dependencies and outputs
4. **Dynamic Rule Registration** - Extensible, no hard-coded imports

### Phase 2: Rule Implementation (Blue Book Native)
5. **Atomic Analysis Rules** - Basic molecular property extraction
6. **Functional Group Detection** - P-44.1 implementation with contracts
7. **Chain Selection Rules** - Full P-44.3 hierarchy with tie-breaking
8. **Ring System Analysis** - P-44.2 and P-44.4 implementation

### Phase 3: Integration and Validation  
9. **Numbering Assignment** - P-14.4 implementation
10. **Name Assembly Engine** - Final assembly with alphabetization
11. **HTML Trace Reports** - Debug and educational tool
12. **Legacy Compatibility Bridge** - OPSIN regression testing only

### Phase 4: Advanced Features
13. **Stereochemistry Rules** - R/S, E/Z assignments
14. **Special Cases and Edge Cases** - Complex functional groups
15. **Performance Optimization** - Rule caching and execution optimization  

## Key Features

### Architecture Benefits
- **Blue Book-Aligned Structure**: Code structure mirrors IUPAC's logical hierarchy (sections → phases → rules)
- **Immutable Context**: Functional transitions with full traceability for debugging and explanation
- **Phase-Based Execution**: Explicit execution phases prevent rule ordering conflicts
- **Layer Contracts**: Clear dependencies and outputs prevent subtle ordering bugs

### Debugging and Educational Value
- **HTML Trace Reports**: Visual rule-by-rule execution for debugging and teaching
- **Rule History Tracking**: Complete audit trail of why decisions were made
- **Mini Blue Book Test Suite**: SMILES → intermediate results for each subrule

### Maintainability and Extensibility
- **Metadata-Driven Rules**: Easy versioning and rule evolution without code changes
- **Dynamic Registration**: New rules can be added without modifying core engine
- **OPSIN Isolation**: Compatibility layer for regression testing only

### Scientific Correctness
- **Direct Blue Book Citations**: Every rule links to official IUPAC specification
- **Native Implementation**: No syntactic/semantic mismatches from external rule sets
- **Contract Validation**: Runtime verification of layer dependencies and outputs
- **Authoritative Validation**: Testing against official IUPAC names from Blue Book and established databases

### Migration Safety
- **Non-Destructive**: Legacy system remains active during gradual migration
- **Progressive Validation**: Rule-level and layer-level testing before integration
- **Regression Bridge**: OPSIN comparison for compatibility verification

## Layer Contracts and Interfaces

### Execution Phases (No Global Priority)
```typescript
enum ExecutionPhase {
  NOMENCLATURE_SELECTION = 'nomenclature',    // P-51: Method selection
  FUNCTIONAL_GROUP = 'functional-groups',     // P-44.1: Group detection  
  PARENT_STRUCTURE = 'parent-structure',      // P-44: Structure selection
  NUMBERING = 'numbering',                    // P-14.4: Locant assignment
  ASSEMBLY = 'assembly'                       // Final name construction
}

interface PhaseController {
  canExecute(context: NamingContext): boolean;
  execute(context: NamingContext): NamingContext;
  getContract(): LayerContract;
}
```

### Data Structure Contracts
```typescript
// Functional Groups Phase Contract
interface FunctionalGroupsPhaseContract {
  requires: ['atomicAnalysis'];
  provides: {
    principalGroup: FunctionalGroup;
    functionalGroupPriority: number;
    functionalGroups: FunctionalGroup[];
  };
}

// Parent Structure Phase Contract  
interface ParentStructurePhaseContract {
  requires: ['functionalGroups', 'atomicAnalysis'];
  provides: {
    parentStructure: ParentStructure;
    selectedParentChain?: Chain;
    selectionHistory: SelectionTrace[];
  };
}
```

## Migration Strategy
```mermaid
graph LR
  A[Current Implementation] --> B[Core Infrastructure]
  B --> C[Rule Implementation]
  C --> D[Contract Validation]
  D --> E[Integration Testing]
  E --> F[Legacy Comparison]
  F --> G[Gradual Rollout]
  G --> H[Full Replacement]
```

## Authoritative Validation Sources

### Primary Sources
1. **IUPAC Blue Book (2013)** - Definitive reference for all rules
2. **PubChem Database** - Official IUPAC names for millions of compounds
3. **NIST Chemistry WebBook** - Authoritative chemical nomenclature
4. **ChEBI (Chemical Entities of Biological Interest)** - Biologically relevant compounds

### Test Data Organization
```typescript
// test/data/authoritative-iupac-test-suite.json
const AUTHORITATIVE_TEST_SUITES = {
  "bluebook-examples": [
    {
      "category": "Alkanes",
      "source": "Blue Book Section 2.2",
      "testCases": [
        {
          "smiles": "CCCC",
          "expectedName": "butane",
          "ruleReference": "P-2.2.1"
        }
      ]
    },
    {
      "category": "Functional Group Priority",
      "source": "Blue Book Section P-44.1", 
      "testCases": [
        {
          "smiles": "CC(=O)O",
          "expectedName": "acetic acid",
          "ruleReference": "P-44.1.1"
        }
      ]
    }
  ],
  "pubchem-curated": [
    // Curated set of 100-500 diverse compounds from PubChem
    // with verified IUPAC names
  ]
};
```

### Validation Levels
- **Unit Level**: Individual rule correctness against specific Blue Book examples
- **Phase Level**: Complete phase execution against known outcomes  
- **Integration Level**: Full name generation against diverse test sets
- **Regression Level**: Performance and accuracy monitoring over time

## Migration Safety Features
- **Contract Validation**: Runtime verification that layers receive expected inputs
- **Authoritative Testing**: Blue Book examples provide ground truth validation
- **Phased Activation**: Each phase can be tested independently against authoritative sources
- **Trace Validation**: HTML reports allow manual verification of rule application

## Layer Definitions

### Layer 1: Nomenclature Method Selection (P-51)
- Functional Class vs Substitutive detection
- Special cases (esters, anhydrides, etc.)

### Layer 2: Principal Characteristic Group Detection (P-44.1)
- Functional group prioritization per Blue Book Table
- Suffix vs prefix determination

### Layer 3: Parent Structure Selection (P-44)
- Ring vs chain criteria (P-44.4)
- Chain seniority hierarchy (P-44.3)
- Ring system seniority (P-44.2)

### Layer 4: Numbering Assignment (P-14.4)
- Fixed locants for retained names
- Principal group locants
- Multiple bond locants
- Substituent locants

### Layer 5: Name Assembly
- Alphabetization rules
- Enclosing marks
- Stereochemical descriptors

## Enhanced Testing Strategy

### Multi-Level Testing Approach
```typescript
// 1. Unit Tests (Individual Rules)
describe('P-44.3.1 Rule Unit Tests', () => {
  test.each(BLUEBOOK_TEST_CASES)('Rule $id', (testCase) => {
    const result = P44_3_1_Rule.execute(testCase.inputContext);
    expect(result).toMatchSnapshot();
  });
});

// 2. Integration Tests (Phase-Level)
describe('Parent Structure Selection Phase', () => {
  test('complete P-44 hierarchy application', () => {
    const context = ParentStructurePhase.execute(complexMolecule);
    expect(context.selectedParentChain).toBeDefined();
    expect(context.getSelectionHistory().length).toBeGreaterThan(0);
  });
});

// 3. Regression Tests (Legacy Comparison)
describe('Legacy Compatibility Tests', () => {
  test.each(TEST_MOLECULES)('SMILES: $smiles', async (testCase) => {
    const newResult = newEngine.generateName(testCase.smiles);
    const legacyResult = legacyEngine.generateName(testCase.smiles);
    expect(newResult.name).toEqual(legacyResult.name);
  });
});
```

### Test Data Organization
```
test/
├── rules/
│   ├── bluebook/
│   │   ├── P-44.3.1.test.ts        # Individual rule tests
│   │   ├── P-44.3.2.test.ts
│   │   └── ...
│   └── functional-groups/
│       └── carboxylic-acids.test.ts
├── phases/
│   ├── parent-structure.test.ts    # Phase integration tests
│   └── numbering.test.ts
└── validation/
    ├── authoritative/              # Blue Book and official examples
    │   ├── bluebook-examples.test.ts
    │   └── iupac-database.test.ts
    └── regression/                 # Against established tools (optional)
        ├── rdkit-comparison.test.ts
        └── opsin-comparison.test.ts
```

### Continuous Validation
- **CI Pipeline**: Rule-level tests run on every commit
- **Authoritative Validation**: Blue Book examples vs official IUPAC names
- **Performance Benchmarking**: Rule execution time tracking
- **Documentation Generation**: Auto-generated rule documentation from metadata

## Rule Reference by Blue Book Section

### P-44 (Parent Structure Selection)
- **P-44.1**: Principal characteristic group (Functional Groups Phase)
- **P-44.2**: Ring system seniority (Parent Structure Phase)
- **P-44.3**: Acyclic chain seniority (Parent Structure Phase)
- **P-44.4**: Ring vs chain criteria (Parent Structure Phase)

### P-51 (Nomenclature Method Seniority)
- **P-51.1**: Substitutive nomenclature (Nomenclature Selection Phase)
- **P-51.2**: Functional class nomenclature (Nomenclature Selection Phase)
- **P-51.3**: Skeletal replacement (Nomenclature Selection Phase)
- **P-51.4**: Multiplicative nomenclature (Nomenclature Selection Phase)

### P-14 (Locants and Numbering)
- **P-14.1**: Fixed locants (Numbering Phase)
- **P-14.2**: Lowest locant set principle (Numbering Phase)
- **P-14.3**: Principal characteristic group numbering (Numbering Phase)
- **P-14.4**: Multiple bonds and substituents (Numbering Phase)

### Rule Metadata Standards
Each rule includes metadata for versioning and traceability:
```json
{
  "id": "P-44.3.1",
  "version": "2013",
  "title": "Maximum Length of Continuous Chain",
  "blueBookSection": "Parent Structure Selection",
  "phase": "parent-structure",
  "dependencies": ["atomic-analysis"],
  "supersededBy": null,
  "testCases": [...],
  "complexity": "O(n²)",
  "validationRules": [...]
}
```