const mismatches = [
  { n: 1, issue: "Complex substituent naming (nested alkoxy groups)" },
  {
    n: 2,
    issue: "Multiple ketones - acyl group not recognized as substituent",
  },
  { n: 3, issue: "Ester naming - incorrect structure" },
  { n: 4, issue: "Ester naming - incorrect structure + substituent locants" },
  { n: 5, issue: "Polycyclic (tricyclo) naming fallback" },
  { n: 6, issue: "Disulfide/sulfinyl naming" },
  { n: 7, issue: "Complex polycyclic (heptacyclo) fallback" },
  { n: 8, issue: "Phosphorus compound naming" },
  { n: 9, issue: "Phosphorus compound naming" },
  { n: 10, issue: "Complex polycyclic steroid with imine" },
  { n: 11, issue: "Azirine (three-membered nitrogen ring)" },
  { n: 12, issue: "Polycyclic (pentacyclo) fallback" },
  { n: 13, issue: "Borane naming" },
  { n: 14, issue: "Imidazolidinone naming" },
  { n: 15, issue: "Complex polycyclic (heptacyclo) fallback" },
  { n: 16, issue: "Formamide substituent naming" },
  { n: 17, issue: "Thiazole naming" },
  { n: 18, issue: "Very complex polycyclic with long chains" },
  { n: 19, issue: "Triazine naming" },
];

const categories: Record<string, number[]> = {
  "Polycyclic fallback": [],
  "Ester naming": [],
  "Phosphorus compounds": [],
  "Heterocycle naming": [],
  "Multiple ketones/acyl": [],
  "Complex substituents": [],
  "Special elements (B, S)": [],
};

for (const m of mismatches) {
  if (
    m.issue.includes("Polycyclic") ||
    m.issue.includes("polycyclic") ||
    m.issue.includes("fallback")
  ) {
    categories["Polycyclic fallback"]!.push(m.n);
  } else if (m.issue.includes("Ester")) {
    categories["Ester naming"]!.push(m.n);
  } else if (m.issue.includes("Phosphorus")) {
    categories["Phosphorus compounds"]!.push(m.n);
  } else if (
    m.issue.includes("Azirine") ||
    m.issue.includes("Thiazole") ||
    m.issue.includes("Triazine") ||
    m.issue.includes("Imidazolidinone")
  ) {
    categories["Heterocycle naming"]!.push(m.n);
  } else if (m.issue.includes("ketone") || m.issue.includes("acyl")) {
    categories["Multiple ketones/acyl"]!.push(m.n);
  } else if (m.issue.includes("substituent")) {
    categories["Complex substituents"]!.push(m.n);
  } else if (
    m.issue.includes("Borane") ||
    m.issue.includes("sulfinyl") ||
    m.issue.includes("Disulfide")
  ) {
    categories["Special elements (B, S)"]!.push(m.n);
  }
}

console.log("\n=== Mismatch Categories ===\n");
for (const [category, nums] of Object.entries(categories)) {
  if (nums.length > 0) {
    console.log(`${category}: ${nums.length} cases (#${nums.join(", #")})`);
  }
}

console.log("\n=== Recommended Priority ===");
console.log("1. Ester naming (2 cases) - likely quick fix");
console.log("2. Multiple ketones/acyl (1 case) - related to recent FG work");
console.log("3. Complex substituents (1 case) - alkoxy group nesting");
console.log(
  "4. Polycyclic fallback (5 cases) - complex, may need VON-BAEYER implementation",
);
console.log("5. Heterocycles (4 cases) - requires specialized naming rules");
console.log("6. Phosphorus/Boron (3 cases) - specialized element rules");
console.log("7. Sulfur compounds (1 case) - specialized element rules");
