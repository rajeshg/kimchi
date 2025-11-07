import { describe, test } from "bun:test";
import { getSharedOPSINService } from "src/iupac-engine/opsin-service";
import { OPSINFunctionalGroupDetector } from "src/iupac-engine/opsin-functional-group-detector";

describe("Priority Verification", () => {
  test("should verify all functional groups have correct priorities from OPSIN rules", () => {
    const opsinService = getSharedOPSINService();
    const detector = new OPSINFunctionalGroupDetector();

    const rawRules = opsinService.getRawRules();
    const allGroups = opsinService.getAllFunctionalGroups();

    console.log("\n=== Sample Functional Group Priorities ===\n");

    // Check specific important groups
    const importantGroups = [
      { pattern: "C(=O)[OX2H1]", name: "carboxylic acid", expectedPriority: 1 },
      { pattern: "C(=O)O", name: "ester", expectedPriority: 4 },
      { pattern: "C(=O)N", name: "amide", expectedPriority: 6 },
      { pattern: "C#N", name: "nitrile", expectedPriority: 7 },
      { pattern: "C=O", name: "aldehyde", expectedPriority: 8 },
      { pattern: "[CX3](=O)[CX4]", name: "ketone", expectedPriority: 9 },
      { pattern: "[OX2H]", name: "alcohol", expectedPriority: 10 },
      { pattern: "[NX3][CX4]", name: "amine", expectedPriority: 13 },
      { pattern: "ROR", name: "ether", expectedPriority: 14 },
    ];

    for (const group of importantGroups) {
      const fgData = allGroups.get(group.pattern);
      const rulesPriority = rawRules.functionalGroupPriorities?.[group.name];

      if (fgData) {
        const status = fgData.priority === group.expectedPriority ? "✓" : "✗";
        console.log(
          `${status} ${group.name.padEnd(20)} Pattern: ${group.pattern.padEnd(20)} ` +
            `Priority: ${fgData.priority} (expected: ${group.expectedPriority}, OPSIN rule: ${rulesPriority ?? "none"})`,
        );
      }
    }
  });
});
