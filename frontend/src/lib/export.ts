function download(content: string, filename: string, mime = 'text/markdown') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportAnalysis(a: {
  source: string;
  severity: string;
  summary: string;
  model: string;
  provider: string;
  findings: Array<{ issue: string; cause: string; fix: string }>;
  created_at: number;
}) {
  const date = new Date(a.created_at * 1000).toLocaleString();
  const md = `# AI Syslog Analysis

**Date:** ${date}
**Source:** ${a.source}
**Severity:** ${a.severity.toUpperCase()}
**Model:** ${a.model} (${a.provider})

## Summary

${a.summary}

## Findings

${a.findings.length === 0
  ? '_No issues found._'
  : a.findings.map(f => `### ${f.issue}\n\n**Cause:** ${f.cause}\n\n**Fix:**\n${f.fix}`).join('\n\n---\n\n')}
`;
  download(md, `syslog-analysis-${a.created_at}.md`);
}

export function exportInvestigation(inv: {
  problem: string;
  severity: string;
  summary: string;
  root_cause: string;
  evidence: string[];
  findings: Array<{ issue: string; cause: string; fix: string }>;
  data_collected: string[];
  created_at: number;
}) {
  const date = new Date(inv.created_at * 1000).toLocaleString();
  const md = `# AI Detective Investigation

**Date:** ${date}
**Problem:** ${inv.problem}
**Severity:** ${inv.severity.toUpperCase()}

## Summary

${inv.summary}

## Root Cause

${inv.root_cause}

## Evidence

${inv.evidence.map(e => `- \`${e}\``).join('\n')}

## Findings

${inv.findings.length === 0
  ? '_No specific findings._'
  : inv.findings.map(f => `### ${f.issue}\n\n**Cause:** ${f.cause}\n\n**Fix:**\n${f.fix}`).join('\n\n---\n\n')}

## Data Collected

${inv.data_collected.map(d => `- ${d}`).join('\n')}
`;
  download(md, `detective-${inv.created_at}.md`);
}
