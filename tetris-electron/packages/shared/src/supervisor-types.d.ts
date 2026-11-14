export type Executor = 'claude' | 'codex';
export type SupervisorCall = {
  tool: 'create_task' | 'send_task_message' | 'get_task_status' | 'cancel_task' | 'resolve_decision';
  taskId?: string; title?: string; instruction?: string; provider?: Executor;
  cwd?: string; requestId?: string; decisionId?: string; optionId?: string;
  scope?: string[]; expectedArtifacts?: string[]; acceptance?: string[];
};
export type SupervisorToolCall = {
  id: string; name: string; input: unknown; result?: unknown; error?: string;
  conversationId: string; sourceMessageId: string;
  state: 'running' | 'done' | 'failed' | 'interrupted'; startedAt: string; endedAt?: string;
};
export type SupervisorMessage = {
  id: string; role: 'user' | 'assistant' | 'event'; text: string;
  state: 'pending' | 'done' | 'failed'; createdAt: string; taskIds: string[];
  eventId?: string;
  sourceMessageId?: string;
  failureDetail?: string;
};
export type SupervisorConversation = {
  id: string; title: string; createdAt: string; updatedAt: string;
  archivedAt?: string; runtimeSessionId?: string; unread: number; legacyCwd?: string;
  revision?: number;
};
export type SupervisorSnapshot = {
  conversationId?: string; cwd: string; busy: boolean; messages: SupervisorMessage[];
  revision?: number;
};
