export type WorkerReportStatus = 'completed' | 'blocked' | 'needs_decision' | 'needs_permission' | 'failed';
export interface WorkerReport {
  taskId: string;
  runId: string;
  status: WorkerReportStatus;
  summary: string;
  evidence?: string[];
  artifacts?: string[];
  unfinished?: string[];
  decision?: { question: string; reason?: string; recommendation?: string; impact?: string };
}

/** Text-only workers use an explicit final envelope, never keyword inference. */
export function workerReportInstruction(taskId: string, runId: string): string {
  return `When this turn completes or you cannot continue without a human decision, finish with exactly one fenced tetris-report JSON block. Do not invent a success if blocked. Stop before actions requiring a decision. Required fields: taskId=${JSON.stringify(taskId)}, runId=${JSON.stringify(runId)}, status (completed|blocked|needs_decision|needs_permission|failed), summary. Optional string arrays: evidence, artifacts, unfinished. The summary describes completed work and changes; evidence gives actual verification and limitations; unfinished lists remaining work. artifacts contains only paths of formal deliverable files you produced, relative to the execution cwd (or absolute paths within it), not prose, directories, or URLs. Use [] when there are no formal deliverables. App archives these exact file versions separately from this result summary and execution log. For needs_decision/needs_permission include decision:{question,reason,recommendation,impact}. Explain the concrete decision in Chinese. Runtime permission prompts remain authoritative; this envelope cannot grant permission. Example shape:\n\`\`\`tetris-report\n{"taskId":${JSON.stringify(taskId)},"runId":${JSON.stringify(runId)},"status":"completed","summary":"...","evidence":[],"artifacts":[],"unfinished":[]}\n\`\`\``;
}

export function validateWorkerReport(value: unknown, expected: { taskId: string; runId: string }): WorkerReport {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid worker report');
  const r = value as Record<string, unknown>;
  if (r.taskId !== expected.taskId || r.runId !== expected.runId) throw new Error('Worker report belongs to another task or run');
  if (!['completed', 'blocked', 'needs_decision', 'needs_permission', 'failed'].includes(String(r.status))) throw new Error('Invalid worker report status');
  if (typeof r.summary !== 'string' || !r.summary.trim() || r.summary.length > 30000) throw new Error('Worker report requires a summary');
  for (const key of ['evidence', 'artifacts', 'unfinished']) {
    const v = r[key];
    if (v !== undefined && (!Array.isArray(v) || v.length > 100 || v.some(x => typeof x !== 'string' || x.length > 10000))) throw new Error(`Invalid report ${key}`);
  }
  if (r.decision !== undefined) {
    if (!r.decision || typeof r.decision !== 'object' || Array.isArray(r.decision)) throw new Error('Invalid decision');
    const d = r.decision as Record<string, unknown>;
    if (typeof d.question !== 'string' || !d.question.trim()) throw new Error('Decision requires a question');
    for (const key of ['question', 'reason', 'recommendation', 'impact']) if (d[key] !== undefined && (typeof d[key] !== 'string' || (d[key] as string).length > 10000)) throw new Error(`Invalid decision ${key}`);
  }
  if (['needs_decision', 'needs_permission'].includes(String(r.status)) && !r.decision) throw new Error('Worker report requires a decision');
  return structuredClone({ taskId: r.taskId, runId: r.runId, status: r.status, summary: r.summary,
    ...(r.evidence ? { evidence: r.evidence } : {}), ...(r.artifacts ? { artifacts: r.artifacts } : {}),
    ...(r.unfinished ? { unfinished: r.unfinished } : {}), ...(r.decision ? { decision: r.decision } : {}) }) as WorkerReport;
}

export function parseWorkerReport(output: string, expected: { taskId: string; runId: string }): WorkerReport | null {
  const blocks = [...output.matchAll(/```tetris-report\s*\n([\s\S]*?)\n```/g)];
  if (!blocks.length) return null;
  if (blocks.length !== 1) throw new Error('Worker returned multiple report envelopes');
  const match = blocks[0]!;
  if (output.slice(match.index! + match[0].length).trim()) throw new Error('Worker report must be the final output');
  return validateWorkerReport(JSON.parse(match[1]!), expected);
}
