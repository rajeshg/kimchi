import type { ImmutableNamingContext } from "../immutable-context";

/**
 * Simple HTML Trace Report Generator
 * Produces an HTML document summarizing the rule execution trace,
 * before/after snapshots (shallow), and final result.
 */
export class TraceReportGenerator {
  generateHTMLReport(context: ImmutableNamingContext): string {
    const state = context.getState();
    const history = context.getHistory();

    function safe(s: unknown): string {
      try {
        if (typeof s === "string") return escapeHtml(s);
        return escapeHtml(JSON.stringify(s, null, 2));
      } catch (_e) {
        return String(s);
      }
    }

    const rows = history
      .map(
        (h) => `
      <tr>
        <td>${escapeHtml(h.ruleId)}</td>
        <td>${escapeHtml(h.ruleName)}</td>
        <td>${escapeHtml(h.blueBookSection)}</td>
        <td>${escapeHtml(h.phase)}</td>
        <td>${escapeHtml(h.timestamp.toISOString())}</td>
        <td><pre>${safe(h.description)}</pre></td>
        <td><details><summary>before</summary><pre>${safe(h.beforeState)}</pre></details>
            <details><summary>after</summary><pre>${safe(h.afterState)}</pre></details></td>
      </tr>`,
      )
      .join("\n");

    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>IUPAC Naming Trace ${escapeHtml(state.moleculeId || "")}</title>
  <style>
    body { font-family: system-ui, -apple-system, Arial; margin: 18px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #ddd; padding: 8px; vertical-align: top; }
    th { background: #f4f4f4; }
    pre { white-space: pre-wrap; word-break: break-word; }
  </style>
</head>
<body>
  <h1>IUPAC Naming Trace</h1>
  <h2>Molecule: ${escapeHtml(state.moleculeId || "unknown")}</h2>
  <h3>Final result</h3>
  <p><strong>Name:</strong> ${escapeHtml(state.finalName || "")}</p>
  <p><strong>Confidence:</strong> ${String(state.confidence ?? "")}</p>
  <h3>Rule execution history (${history.length})</h3>
  <table>
    <thead>
      <tr><th>Rule</th><th>Rule name</th><th>BlueBook</th><th>Phase</th><th>Timestamp</th><th>Description</th><th>State (before/after)</th></tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
</body>
</html>`;

    return html;
  }
}

function escapeHtml(s: string): string {
  return (s || "")
    .toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
