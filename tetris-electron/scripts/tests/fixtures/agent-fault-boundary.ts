/** Test-only native provider boundaries. App IPC, scheduler and persistence stay real. */
export const faults = {
  resume: 'ok' as 'ok' | 'missing' | 'network',
  holdInitialize: undefined as Promise<void> | undefined,
  initialized: 0, sessions: 0, resumes: 0,
  prompts: [] as Array<{ sessionId: string; text: string }>,
  permission: false,
  supervisorInputs: [] as any[],
  stopReason: 'end_turn', artifacts: [] as string[],
};
export const ndJsonStream = () => ({});
export class ClientSideConnection {
  private client: any;
  private cancelled = false;
  constructor(factory: () => unknown) { this.client = factory(); }
  async initialize() { faults.initialized++; await faults.holdInitialize; return {}; }
  async newSession() { return { sessionId: `fixture-worker-${++faults.sessions}` }; }
  async setSessionMode() { return {}; }
  async unstable_resumeSession({ sessionId }: { sessionId: string }) {
    faults.resumes++;
    if (faults.resume === 'missing') throw { code: -32002, data: { uri: sessionId }, message: 'Resource not found' };
    if (faults.resume === 'network') throw new Error('ECONNRESET fixture connection failed');
    return {};
  }
  async prompt({ sessionId, prompt }: any) {
    const text = prompt[0].text; faults.prompts.push({ sessionId, text });
    if (faults.permission) {
      faults.permission = false;
      await this.client.requestPermission({ sessionId, toolCall: { toolCallId: 'fixture-edit', title: 'Allow fixture edit?', kind: 'edit' },
        options: [{ optionId: 'allow', name: 'Allow once', kind: 'allow_once' }, { optionId: 'reject', name: 'Reject once', kind: 'reject_once' }] });
    }
    if (this.cancelled) return { stopReason: 'cancelled' };
    const ids = /Required fields: taskId=("[^"]+"), runId=("[^"]+")/.exec(text)!;
    const report = { taskId: JSON.parse(ids[1]!), runId: JSON.parse(ids[2]!), status: 'completed', summary: 'Fixture execution finished.', evidence: ['Injected provider boundary; real App lifecycle.'], artifacts: faults.artifacts };
    await this.client.sessionUpdate({ sessionId, update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: '```tetris-report\n' + JSON.stringify(report) + '\n```' } } });
    return { stopReason: faults.stopReason };
  }
  async cancel() { this.cancelled = true; return {}; }
}
export class SupervisorRuntime {
  constructor(_cwd: string) {}
  async run(input: any, execute: (call: any) => Promise<unknown>, onSession: (id: string) => void) {
    faults.supervisorInputs.push(input);
    const sessionId = input.runtimeSessionId || `fixture-supervisor-${input.conversationId}`; onSession(sessionId);
    let reply = 'Fixture result summary.';
    if (!input.eventOnly) {
      const request = JSON.parse(input.incoming.text);
      if (request.calls) { const results = []; for (const call of request.calls) results.push(await execute(call)); reply = JSON.stringify(results); }
      else reply = JSON.stringify(await execute(request));
    }
    return { sessionId, reply };
  }
  close() {}
}
