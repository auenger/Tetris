import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { validateWorkerReport, type WorkerReport } from './worker-report';

export type RunStatus = 'queued' | 'running' | 'ready_for_review' | 'waiting_for_decision' | 'waiting_for_permission' | 'blocked' | 'cancelled' | 'failed' | 'interrupted';
export interface TaskEvent {
  id: string; taskId: string; runId?: string | undefined; sequence: number; at: string;
  actor: 'user' | 'agent' | 'worker' | 'app'; type: string; payload: unknown; operationId?: string | undefined;
}
export interface TaskArtifact {
  id: string; taskId: string; runId: string; version: number; kind: string; path: string; sourcePath?: string | undefined; hash: string; createdAt: string;
}
export interface TaskSpec {
  schemaVersion: 1; goal: string; workspaceId: string; sourceCwd: string; executionCwd: string; provider: 'claude' | 'codex';
  scope: string[]; expectedArtifacts: string[]; acceptance: string[];
}
export interface TaskUserIntent {
  action: 'create_task' | 'send_task_message' | 'cancel_task'; conversationId: string; userMessageId: string;
  userText: string; instruction: string; operationId: string;
}
export function makeTaskSpec(input: Omit<TaskSpec, 'schemaVersion' | 'scope' | 'expectedArtifacts' | 'acceptance'> & Partial<Pick<TaskSpec, 'scope' | 'expectedArtifacts' | 'acceptance'>>): TaskSpec {
  for (const key of ['scope', 'expectedArtifacts', 'acceptance'] as const) {
    const values = input[key];
    if (values !== undefined && (!Array.isArray(values) || values.length > 100 || values.some(value => typeof value !== 'string' || !value.trim() || value.length > 10000))) throw new Error(`Invalid TaskSpec ${key}`);
  }
  return structuredClone({ ...input, schemaVersion: 1, scope: input.scope || [], expectedArtifacts: input.expectedArtifacts || [], acceptance: input.acceptance || [] });
}
export interface DecisionResponse {
  id: string; userMessageId: string; userText: string; instruction: string; interpretation?: string | undefined; optionId?: string | undefined;
  createdAt: string; deliveryStatus: 'pending' | 'delivered' | 'failed' | 'unconfirmed'; deliveryDetail?: string | undefined;
}
export interface DecisionRequest {
  id: string; taskId: string; runId: string; kind: 'decision' | 'permission'; question: string; reason?: string | undefined; recommendation?: string | undefined; impact?: string | undefined;
  permissionRequestId?: string | undefined; options?: Array<{ optionId: string; name?: string | undefined; kind: string }>;
  createdAt: string; status: 'pending' | 'resolved' | 'cancelled'; response?: DecisionResponse; operationId?: string | undefined;
}
export type DecisionInput = Pick<DecisionRequest, 'question' | 'reason' | 'recommendation' | 'impact' | 'permissionRequestId' | 'options'> & { kind?: DecisionRequest['kind'] };
export interface TaskRun {
  activity?: Array<{ id: string; title: string; status: string; detail: string; detailPath?: string | undefined }>;
  id: string; prompt: string; context: unknown; status: RunStatus;
  recovery?: { previousRunId: string; previousSessionId: string; reason: string };
  workerSessionId?: string | undefined; previousRunId?: string | undefined; operationId?: string | undefined; report?: WorkerReport; stopReason?: string;
  startedAt: string; endedAt?: string | undefined; detail?: string | undefined; output?: string | undefined; outputLogPath?: string | undefined; artifactPath?: string | undefined;
  handoff?: { provider: 'claude' | 'codex'; status: 'starting' | 'started' | 'failed'; sessionId?: string | undefined; error?: string };
}
export interface WorkspaceTask {
  supervisorCwd?: string | undefined; taskTileId?: string | undefined; dispatchMessageId?: string | undefined;
  originConversationId?: string | undefined; originMessageId?: string | undefined; workspaceId?: string | undefined; operationId?: string | undefined;
  id: string; sessionId: string; cwd: string; title: string; runs: TaskRun[];
  spec?: TaskSpec;
  events?: TaskEvent[]; decisions?: DecisionRequest[]; artifacts?: TaskArtifact[]; historyIncomplete?: boolean;
  pendingMessages?: string[];
  archived?: boolean; sourceCwd?: string | undefined; branch?: string | undefined; parentTaskId?: string | undefined; completed?: boolean; provider?: 'claude' | 'codex'; threadId?: string | undefined; messages?: unknown[];
}
type TaskMeta = Pick<WorkspaceTask, 'originConversationId' | 'originMessageId' | 'workspaceId' | 'operationId' | 'provider' | 'supervisorCwd' | 'spec'>;
type SessionPatch = Partial<Omit<WorkspaceTask, 'id' | 'runs' | 'events' | 'decisions' | 'artifacts'>>;
const now = () => new Date().toISOString();

/** Atomic task ledger. Every durable event precedes external dispatch/notification. */
export class SuperAgentTasks {
  private tasks: WorkspaceTask[];
  constructor(private path: string) {
    let migrated = false;
    try {
      const data = JSON.parse(readFileSync(path, 'utf8'));
      if (![1, 2].includes(data.version) || !Array.isArray(data.tasks)) throw new Error('Invalid task store');
      this.tasks = data.tasks;
      if (data.version === 1) {
        if (!existsSync(`${path}.v1.backup`)) copyFileSync(path, `${path}.v1.backup`, 1);
        for (const task of this.tasks) { task.historyIncomplete = true; task.events ||= []; task.decisions ||= []; task.artifacts ||= []; }
        migrated = true;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      this.tasks = [];
    }
    let changed = migrated;
    for (const task of this.tasks) {
      if (task.pendingMessages?.length) {
        const texts = [...task.pendingMessages]; task.pendingMessages = [];
        this.event(task, 'instructions.interrupted', { texts, reason: '应用关闭时排队指令尚未执行，未自动重放' }); changed = true;
      }
      if ((task.supervisorCwd || task.originConversationId) && !task.runs.length) {
        task.runs.push({ id: randomUUID(), prompt: task.title, context: {}, status: 'interrupted', startedAt: now(), endedAt: now(), detail: '应用在派工准备期间关闭；未自动重放任务。' });
        this.event(task, 'dispatch.interrupted', {}, { actor: 'app' }); changed = true;
      }
      for (const run of task.runs) {
        if (run.outputLogPath && existsSync(run.outputLogPath)) run.output = readFileSync(run.outputLogPath, 'utf8');
        if (run.handoff?.status === 'starting') { run.handoff = { ...run.handoff, status: 'failed', error: 'Application stopped during handoff; review was not replayed' }; changed = true; }
        if (run.status === 'running' || run.status === 'queued' || run.status === 'waiting_for_permission') {
          run.status = 'interrupted'; run.endedAt = now(); run.detail = 'Application stopped before execution was confirmed finished';
          this.event(task, 'run.interrupted', { reason: run.detail }, { runId: run.id }); changed = true;
          for (const decision of task.decisions || []) if (decision.runId === run.id && decision.kind === 'permission' && decision.status === 'pending') {
            decision.status = 'cancelled'; this.event(task, 'decision.cancelled', { decisionId: decision.id, reason: 'Permission process no longer running' }, { runId: run.id });
          }
        }
      }
      // Resolution and external delivery are distinct commits. Never infer delivery
      // from the saved decision, or replay an instruction after an uncertain exit.
      for (const decision of task.decisions || []) if (decision.status === 'resolved' && decision.response?.deliveryStatus === 'pending') {
        const detail = '应用关闭时交付未确认，未自动重放';
        decision.response.deliveryStatus = 'unconfirmed'; decision.response.deliveryDetail = detail;
        this.event(task, 'decision.delivery_unconfirmed', { decisionId: decision.id, responseId: decision.response.id, detail },
          { runId: decision.runId, operationId: `decision-unconfirmed:${decision.response.id}` });
        this.blockUndeliveredDecision(task, decision, detail); changed = true;
      }
    }
    if (changed) this.save();
  }
  list(cwd?: string): WorkspaceTask[] { return structuredClone(this.tasks.filter(task => !cwd || task.cwd === cwd)); }
  get(id: string): WorkspaceTask | undefined { const task = this.tasks.find(t => t.id === id); return task && structuredClone(task); }
  timeline(taskId: string): TaskEvent[] { return structuredClone(this.requireTask(taskId).events || []); }
  register(sessionId: string, cwd: string, title: string, meta: TaskMeta = {}, intent?: TaskUserIntent): string {
    const existing = this.tasks.find(task => task.sessionId === sessionId || (meta.operationId && task.operationId === meta.operationId));
    if (existing) return existing.id;
    const task: WorkspaceTask = { id: randomUUID(), sessionId, cwd, title: title.slice(0, 120), runs: [], events: [], decisions: [], artifacts: [], ...meta };
    this.tasks.push(task); this.event(task, 'task.created', { title: task.title, cwd, provider: meta.provider, originConversationId: meta.originConversationId }, { operationId: meta.operationId });
    if (task.spec) this.event(task, 'task.specified', task.spec);
    if (intent) this.userIntent(task, intent);
    this.save(); return task.id;
  }
  bindSession(taskId: string, sessionId: string): void {
    const task = this.requireTask(taskId);
    if (this.tasks.some(other => other.id !== taskId && other.sessionId === sessionId)) throw new Error('Worker session already belongs to another task');
    if (task.sessionId === sessionId) return;
    if (task.runs.some(run => ['running', 'waiting_for_permission'].includes(run.status)) || (task.runs.some(run => run.status === 'queued') && !task.sessionId.startsWith('pending:'))) throw new Error('Cannot replace an active worker');
    const previousSessionId = task.sessionId; task.sessionId = sessionId;
    for (const run of task.runs) if (run.status === 'queued' && run.workerSessionId === previousSessionId) run.workerSessionId = sessionId;
    this.event(task, 'worker.bound', { sessionId, previousSessionId }); this.save();
  }
  reserveRecovery(taskId: string, runId: string, reason: string, instruction: string): string {
    const task = this.requireTask(taskId), previous = task.runs.find(r => r.id === runId);
    const operationId = `recovery:${runId}`;
    const existing = task.runs.find(r => r.operationId === operationId); if (existing) return existing.id;
    if (!previous || task.runs.at(-1)?.id !== runId || previous.recovery) throw new Error('Recovery is stale or was already attempted');
    if (!['queued', 'running', 'failed'].includes(previous.status) || task.decisions?.some(d => d.status === 'pending')) throw new Error('Task cannot recover while cancelled or awaiting a decision');
    const previousSessionId = task.sessionId;
    previous.status = 'failed'; previous.detail = reason; previous.endedAt = now();
    this.event(task, 'run.session_missing', { previousSessionId, reason }, { runId, actor: 'app' });
    task.sessionId = `pending:${operationId}`; delete task.threadId;
    const next: TaskRun = { id: randomUUID(), prompt: instruction, context: structuredClone(previous.context), status: 'queued', startedAt: now(),
      workerSessionId: task.sessionId, previousRunId: runId, operationId, recovery: { previousRunId: runId, previousSessionId, reason } };
    task.runs.push(next); task.completed = false;
    this.event(task, 'worker.recovery_queued', { previousRunId: runId, previousSessionId, reason, instruction }, { runId: next.id, operationId });
    this.save(); return next.id;
  }
  dismissDecision(taskId: string, requestId: string, reason = 'Decision cancelled'): void {
    const { task, decision, run } = this.requireDecision(taskId, requestId);
    if (decision.status !== 'pending') return;
    decision.status = 'cancelled';
    this.event(task, 'decision.cancelled', { decisionId: requestId, reason }, { runId: run.id }); this.save();
  }
  recordEvent(taskId: string, type: string, payload: unknown = {}, options: Partial<Pick<TaskEvent, 'runId' | 'actor' | 'operationId'>> = {}): TaskEvent {
    const event = this.event(this.requireTask(taskId), type, payload, options); this.save(); return structuredClone(event);
  }
  activity(sessionId: string, update: { toolCallId?: string | undefined; title?: string | null; status?: string | null; rawInput?: unknown; rawOutput?: unknown; content?: unknown }) {
    const task = this.tasks.find(t => t.sessionId === sessionId), run = task?.runs.at(-1);
    if (!task || !run || !['running', 'waiting_for_permission'].includes(run.status)) return;
    const items = run.activity ||= [], id = update.toolCallId || randomUUID(), previous = items.find(item => item.id === id);
    const detail = update.rawOutput ?? update.content ?? update.rawInput;
    const fullDetail = detail === undefined ? undefined : typeof detail === 'string' ? detail : JSON.stringify(detail);
    const detailPath = fullDetail === undefined ? previous?.detailPath : this.writeLog(run.id, fullDetail);
    const item = { id, title: update.title || previous?.title || '工具调用', status: update.status || previous?.status || 'in_progress', detail: fullDetail === undefined ? previous?.detail || '' : fullDetail.slice(-4000), detailPath };
    if (previous) Object.assign(previous, item); else items.push(item);
    // This array is a compact live view. The event log retains every update and full detail reference.
    if (items.length > 100) items.shift();
    this.event(task, 'tool.updated', item, { runId: run.id, actor: 'worker' }); this.save();
  }
  enqueue(sessionId: string, text: string, intent?: TaskUserIntent): void {
    const task = this.requireSession(sessionId);
    if (task.runs.at(-1)?.status === 'cancelled') throw new Error('Task has been cancelled; start an explicit new run to continue');
    if (intent && task.events?.some(event => event.operationId === `user-intent:${intent.operationId}`)) return;
    (task.pendingMessages ||= []).push(text);
    if (intent) this.userIntent(task, intent);
    this.event(task, 'instruction.queued', { text }, { actor: 'agent' }); this.save();
  }
  clearPending(sessionId: string): void {
    const task = this.tasks.find(task => task.sessionId === sessionId);
    if (task?.pendingMessages?.length) { task.pendingMessages = []; this.event(task, 'instructions.cleared', {}); this.save(); }
  }
  takeNext(sessionId: string): string | undefined {
    const task = this.tasks.find(task => task.sessionId === sessionId), text = task?.pendingMessages?.shift();
    if (text && task) { this.event(task, 'instruction.dequeued', { text }); this.save(); } return text;
  }
  appendOutput(sessionId: string, text: string): void {
    const task = this.tasks.find(t => t.sessionId === sessionId), run = task?.runs.at(-1);
    if (!run || !['running', 'waiting_for_permission'].includes(run.status)) return;
    if (!run.outputLogPath) {
      run.outputLogPath = join(this.logDirectory(), `${run.id}.output.log`);
      writeFileSync(run.outputLogPath, run.output || '', { mode: 0o600 }); this.save();
    }
    appendFileSync(run.outputLogPath, text, { mode: 0o600 }); run.output = (run.output || '') + text;
  }
  complete(id: string): void {
    const task = this.requireTask(id);
    if (task.runs.at(-1)?.status !== 'ready_for_review') throw new Error('Task is not ready for review');
    if (task.completed) return;
    task.completed = true; this.event(task, 'task.accepted', {}, { runId: task.runs.at(-1)?.id, actor: 'user' }); this.save();
  }
  messages(sessionId: string): unknown[] {
    return this.tasks.find(t => t.sessionId === sessionId)?.runs.flatMap(run => [
      { role: 'user', content: [{ type: 'text', text: run.prompt }] }, ...(run.output ? [{ role: 'assistant', content: [{ type: 'text', text: run.output }] }] : []),
    ]) || [];
  }
  updateSession(sessionId: string, patch: SessionPatch): void {
    const task = this.tasks.find(t => t.sessionId === sessionId); if (!task) return;
    const changedTile = patch.taskTileId && patch.taskTileId !== task.taskTileId;
    Object.assign(task, patch);
    if (task.spec && (task.spec.executionCwd !== task.cwd || task.spec.sourceCwd !== (task.sourceCwd || task.spec.sourceCwd) || task.spec.provider !== (task.provider || task.spec.provider))) {
      task.spec = { ...task.spec, executionCwd: task.cwd, sourceCwd: task.sourceCwd || task.spec.sourceCwd, provider: task.provider || task.spec.provider };
      this.event(task, 'task.execution_resolved', task.spec);
    }
    if (changedTile) this.event(task, 'worker.linked', { tileId: patch.taskTileId, sessionId: task.sessionId, cwd: task.cwd, provider: task.provider }, { operationId: `worker-tile:${patch.taskTileId}` });
    this.save();
  }
  start(sessionId: string, cwd: string, prompt: string, context: unknown, queued = false, operationId?: string, intent?: TaskUserIntent): string {
    let task = this.tasks.find(t => t.sessionId === sessionId && t.cwd === cwd);
    if (!task) { const id = this.register(sessionId, cwd, prompt); task = this.requireTask(id); }
    const existing = operationId && task.runs.find(r => r.operationId === operationId); if (existing) return existing.id;
    if (task.runs.some(r => ['running', 'queued', 'waiting_for_permission'].includes(r.status))) throw new Error('This task is already running');
    if (task.decisions?.some(d => d.status === 'pending')) throw new Error('This task is waiting for a human decision');
    if (!task.spec) {
      task.spec = makeTaskSpec({ goal: prompt, workspaceId: task.workspaceId || task.sourceCwd || cwd, sourceCwd: task.sourceCwd || cwd, executionCwd: cwd, provider: task.provider || 'claude' });
      this.event(task, 'task.specified', task.spec);
    }
    task.completed = false;
    const run: TaskRun = { id: randomUUID(), prompt, context, status: queued ? 'queued' : 'running', startedAt: now(), workerSessionId: sessionId, previousRunId: task.runs.at(-1)?.id, operationId };
    if (intent) this.userIntent(task, intent, run.id);
    task.runs.push(run); this.event(task, queued ? 'run.queued' : 'run.started', { prompt, cwd, provider: task.provider, workerSessionId: sessionId }, { runId: run.id, operationId });
    this.save(); return run.id;
  }
  setHandoff(id: string, handoff: NonNullable<TaskRun['handoff']>): void {
    const { task, run } = this.requireRun(id); run.handoff = handoff;
    this.event(task, 'run.handoff', handoff, { runId: id }); this.save();
  }
  attachArtifact(id: string, path: string, kind = 'report'): TaskArtifact {
    const { task, run } = this.requireRun(id), content = readFileSync(path), hash = createHash('sha256').update(content).digest('hex');
    const existing = task.artifacts?.find(a => a.runId === id && a.sourcePath === path && a.hash === hash && a.kind === kind); if (existing) return structuredClone(existing);
    const artifacts = task.artifacts ||= [], artifactId = randomUUID();
    const destination = join(this.logDirectory(), `${id}-${artifactId}${extname(path) || '.bin'}`);
    writeFileSync(destination, content, { mode: 0o600, flag: 'wx' });
    const artifact: TaskArtifact = { id: artifactId, taskId: task.id, runId: id, version: artifacts.length + 1, kind, path: destination, sourcePath: path, hash, createdAt: now() };
    artifacts.push(artifact);
    if (kind !== 'deliverable' && kind !== 'raw-execution-log') run.artifactPath = destination;
    this.event(task, 'artifact.created', artifact, { runId: id }); this.save(); return structuredClone(artifact);
  }
  artifactView(runId: string, artifactId?: string): string {
    const { task, run } = this.requireRun(runId);
    const artifact = task.artifacts?.find(a => a.runId === runId && (artifactId ? a.id === artifactId : a.path === run.artifactPath));
    if (artifactId && !artifact) throw new Error('Artifact does not belong to this run');
    const archivePath = artifact?.path || run.artifactPath;
    if (!archivePath) throw new Error('Report is not available');
    const bytes = readFileSync(archivePath);
    if (artifact && createHash('sha256').update(bytes).digest('hex') !== artifact.hash) throw new Error('历史报告内容已变化，不能打开为原始版本');
    const directory = join(this.logDirectory(), 'views'); mkdirSync(directory, { recursive: true });
    const path = join(directory, `${runId}-${artifact?.id || 'legacy'}${extname(archivePath) || '.bin'}`);
    if (!existsSync(path)) writeFileSync(path, bytes, { mode: 0o600, flag: 'wx' });
    return path;
  }
  activate(id: string): void {
    const { task, run } = this.requireRun(id); if (run.status !== 'queued') throw new Error('Task is no longer queued');
    run.status = 'running'; run.startedAt = now(); this.event(task, 'run.started', { prompt: run.prompt, cwd: task.cwd, provider: task.provider }, { runId: id }); this.save();
  }
  recordStopReason(id: string, stopReason: string): void {
    const { task, run } = this.requireRun(id);
    if (run.stopReason === stopReason) return;
    if (run.stopReason !== undefined) throw new Error('Worker stop reason already recorded');
    run.stopReason = stopReason;
    this.event(task, 'run.stopped', { stopReason, provider: task.provider }, { runId: id, actor: 'worker', operationId: `stop:${id}` }); this.save();
  }
  cancel(taskId: string, detail = '用户取消任务'): WorkspaceTask {
    const task = this.requireTask(taskId);
    if (task.completed) throw new Error('任务已经验收完成，不能取消已验收结果');
    const run = task.runs.at(-1);
    if (!run) throw new Error('任务没有可取消的执行记录');
    this.finish(run.id, 'cancelled', detail);
    if (run.status !== 'cancelled') throw new Error('任务取消未生效');
    return structuredClone(task);
  }
  finish(id: string, status: Exclude<RunStatus, 'running'>, detail?: string): boolean {
    const found = this.findRun(id); if (!found) return false;
    const { task, run } = found;
    if (status === 'cancelled') {
      // Cancellation is a durable Task decision even after execution has finished.
      // Never rewrite an accepted result, a historical run, or an existing cancellation.
      if (task.completed || task.runs.at(-1)?.id !== id || run.status === 'cancelled') return false;
      if (task.pendingMessages?.length) {
        const texts = [...task.pendingMessages]; task.pendingMessages = [];
        this.event(task, 'instructions.cleared', { texts, reason: detail || '任务已取消' }, { runId: id });
      }
    } else if (!['running', 'queued', 'waiting_for_permission'].includes(run.status) && !(['interrupted', 'failed'].includes(status) && ['waiting_for_decision', 'blocked'].includes(run.status))) return false;
    Object.assign(run, { status, detail, endedAt: status === 'cancelled' && run.endedAt ? run.endedAt : now() });
    if (['cancelled', 'failed', 'interrupted'].includes(status)) for (const decision of task.decisions || []) if ((status === 'cancelled' || decision.runId === id) && (decision.status === 'pending' || (status === 'cancelled' && decision.response?.deliveryStatus === 'pending'))) {
      if (decision.response?.deliveryStatus === 'pending') { decision.response.deliveryStatus = 'failed'; decision.response.deliveryDetail = '任务已取消，决定未继续交付'; }
      decision.status = 'cancelled'; this.event(task, 'decision.cancelled', { decisionId: decision.id }, { runId: id });
    }
    this.event(task, `run.${status}`, { status, detail, output: run.output?.slice(-12000), outputLogPath: run.outputLogPath, artifactPath: run.artifactPath }, { runId: id }); this.save(); return true;
  }
  applyReport(report: WorkerReport, appIssues: string[] = []): void {
    report = validateWorkerReport(report, { taskId: report.taskId, runId: report.runId });
    const { task, run } = this.requireRun(report.runId);
    if (task.id !== report.taskId || task.runs.at(-1)?.id !== run.id) throw new Error('Stale worker report');
    if (run.status === 'cancelled') throw new Error('Cancelled run no longer accepts a report');
    if (run.report) { if (JSON.stringify(run.report) === JSON.stringify(report)) return; throw new Error('Run already has a different report'); }
    if (!['running', 'queued'].includes(run.status)) throw new Error('Run no longer accepts a report');
    run.report = structuredClone(report);
    this.event(task, 'worker.reported', report, { runId: run.id, actor: 'worker', operationId: `report:${run.id}` });
    if (report.status === 'needs_decision' || report.status === 'needs_permission') {
      this.addDecision(task, run, { ...report.decision!, kind: 'decision' }, `report-decision:${run.id}`);
    } else {
      const abnormalStop = report.status === 'completed' && run.stopReason && run.stopReason !== 'end_turn';
      const incompleteArtifacts = report.status === 'completed' && appIssues.length > 0;
      run.status = abnormalStop || incompleteArtifacts ? 'blocked' : report.status === 'completed' ? 'ready_for_review' : report.status;
      run.endedAt = now(); run.detail = abnormalStop ? `执行器提前停止（${run.stopReason}）；报告声称完成，尚待确认。` : incompleteArtifacts ? `Worker 声称完成，但正式产物未完整归档：${appIssues.join('；')}` : report.summary;
      this.event(task, `run.${run.status}`, { summary: run.detail, stopReason: run.stopReason }, { runId: run.id, actor: 'worker' });
    }
    this.save();
  }
  requestDecision(taskId: string, runId: string, input: DecisionInput, operationId?: string): DecisionRequest {
    const task = this.requireTask(taskId), run = task.runs.find(r => r.id === runId);
    if (!run || task.runs.at(-1)?.id !== runId) throw new Error('Stale decision request');
    const old = operationId && task.decisions?.find(d => d.operationId === operationId); if (old) return structuredClone(old);
    if (!['running', 'queued', 'waiting_for_decision', 'waiting_for_permission', 'blocked'].includes(run.status)) throw new Error('Run cannot request a decision');
    const decision = this.addDecision(task, run, input, operationId); this.save(); return structuredClone(decision);
  }
  resolveDecision(taskId: string, requestId: string, input: Pick<DecisionResponse, 'userMessageId' | 'userText' | 'instruction' | 'interpretation' | 'optionId'>) {
    const { task, decision, run } = this.requireDecision(taskId, requestId);
    if (decision.status === 'resolved' && decision.response?.userMessageId === input.userMessageId && (decision.response.userText !== input.userText || decision.response.instruction !== input.instruction || decision.response.optionId !== input.optionId)) throw new Error('Repeated decision message has different content');
    if (decision.status === 'resolved' && decision.response?.userMessageId === input.userMessageId) return { decision: structuredClone(decision), response: structuredClone(decision.response), alreadyResolved: true };
    if (decision.status !== 'pending' || task.runs.at(-1)?.id !== decision.runId) throw new Error('Decision is no longer pending');
    if (!input.userMessageId || !input.userText.trim() || !input.instruction.trim()) throw new Error('Decision requires user text and an instruction');
    if (decision.kind === 'permission' && (!input.optionId || !decision.options?.some(o => o.optionId === input.optionId && ['allow_once', 'reject_once'].includes(o.kind)))) throw new Error('Select a valid one-time permission option');
    const response: DecisionResponse = { id: randomUUID(), ...input, createdAt: now(), deliveryStatus: 'pending' };
    decision.status = 'resolved'; decision.response = response;
    this.event(task, 'decision.responded', { decisionId: decision.id, ...response }, { runId: run.id, actor: 'user', operationId: `decision:${decision.id}:${input.userMessageId}` }); this.save();
    return { decision: structuredClone(decision), response: structuredClone(response), alreadyResolved: false };
  }
  markDecisionDelivered(taskId: string, requestId: string): void {
    const { task, decision, run } = this.requireDecision(taskId, requestId);
    if (!decision.response || decision.status !== 'resolved') throw new Error('Decision has no response');
    if (decision.response.deliveryStatus === 'delivered') return;
    decision.response.deliveryStatus = 'delivered';
    if (decision.kind === 'permission' && run.status === 'waiting_for_permission') run.status = 'running';
    this.event(task, 'decision.delivered', { decisionId: requestId, instruction: decision.response.instruction }, { runId: run.id, actor: 'agent' }); this.save();
  }
  markDecisionDeliveryFailed(taskId: string, requestId: string, detail: string): void {
    const { task, decision, run } = this.requireDecision(taskId, requestId); if (!decision.response || decision.response.deliveryStatus === 'delivered') return;
    if (decision.response.deliveryStatus === 'failed' && decision.response.deliveryDetail === detail) return;
    decision.response.deliveryStatus = 'failed'; decision.response.deliveryDetail = detail;
    this.event(task, 'decision.delivery_failed', { decisionId: requestId, detail }, { runId: run.id });
    this.blockUndeliveredDecision(task, decision, detail); this.save();
  }
  private blockUndeliveredDecision(task: WorkspaceTask, decision: DecisionRequest, detail: string): void {
    const latest = task.runs.at(-1);
    if (latest?.id !== decision.runId || latest.status !== 'waiting_for_decision' || task.pendingMessages?.length) return;
    latest.status = 'blocked'; latest.endedAt = now(); latest.detail = `你的决定已保存，但继续执行未确认：${detail}`;
    this.event(task, 'run.blocked', { decisionId: decision.id, status: latest.status, detail: latest.detail }, { runId: latest.id });
  }
  private addDecision(task: WorkspaceTask, run: TaskRun, input: DecisionInput, operationId?: string): DecisionRequest {
    if (!input.question?.trim()) throw new Error('Decision requires a question');
    if (input.kind === 'permission' && (!input.permissionRequestId || !input.options?.length)) throw new Error('Permission decision requires a live permission request');
    const decision: DecisionRequest = { id: randomUUID(), taskId: task.id, runId: run.id, ...structuredClone(input), kind: input.kind || 'decision', status: 'pending', createdAt: now(), operationId };
    (task.decisions ||= []).push(decision); run.status = decision.kind === 'permission' ? 'waiting_for_permission' : 'waiting_for_decision';
    if (decision.kind !== 'permission') run.endedAt = now();
    this.event(task, 'decision.requested', decision, { runId: run.id, actor: 'worker', operationId }); return decision;
  }
  private requireTask(id: string) { const task = this.tasks.find(t => t.id === id); if (!task) throw new Error('Task not found'); return task; }
  private requireSession(id: string) { const task = this.tasks.find(t => t.sessionId === id); if (!task) throw new Error('Task not found'); return task; }
  private findRun(id: string) { for (const task of this.tasks) { const run = task.runs.find(r => r.id === id); if (run) return { task, run }; } return undefined; }
  private requireRun(id: string) { const result = this.findRun(id); if (!result) throw new Error('Run not found'); return result; }
  private requireDecision(taskId: string, id: string) { const task = this.requireTask(taskId), decision = task.decisions?.find(d => d.id === id); if (!decision) throw new Error('Decision not found'); const run = task.runs.find(r => r.id === decision.runId)!; return { task, decision, run }; }
  private userIntent(task: WorkspaceTask, intent: TaskUserIntent, runId?: string) {
    this.event(task, 'user.intent', intent, { actor: 'user', operationId: `user-intent:${intent.operationId}`, ...(runId ? { runId } : {}) });
  }
  private event(task: WorkspaceTask, type: string, payload: unknown, options: Partial<Pick<TaskEvent, 'runId' | 'actor' | 'operationId'>> = {}) {
    const events = task.events ||= [];
    const previous = options.operationId && events.find(e => e.operationId === options.operationId); if (previous) return previous;
    const event: TaskEvent = { id: randomUUID(), taskId: task.id, sequence: (events.at(-1)?.sequence || 0) + 1, at: now(), actor: options.actor || 'app', ...options, type, payload: structuredClone(payload) };
    events.push(event); return event;
  }
  private logDirectory() { const path = `${this.path}.assets`; mkdirSync(path, { recursive: true }); return path; }
  private writeLog(runId: string, value: string) { const path = join(this.logDirectory(), `${runId}-${randomUUID()}.tool.log`); writeFileSync(path, value, { mode: 0o600 }); return path; }
  private save(): void {
    mkdirSync(dirname(this.path), { recursive: true }); const temporary = `${this.path}.${randomUUID()}.tmp`;
    writeFileSync(temporary, JSON.stringify({ version: 2, tasks: this.tasks }, null, 2), { mode: 0o600 }); renameSync(temporary, this.path);
  }
}
