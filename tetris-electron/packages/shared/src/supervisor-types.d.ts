export type Executor = 'claude' | 'codex';
export type SupervisorCall = {
  tool: 'create_task' | 'send_task_message' | 'get_task_status' | 'cancel_task';
  taskId?: string; title?: string; instruction?: string; provider?: Executor;
};
export type SupervisorMessage = {
  id: string; role: 'user' | 'assistant' | 'event'; text: string;
  state: 'pending' | 'done' | 'failed'; createdAt: string; taskIds: string[];
};
export type SupervisorSnapshot = { cwd: string; busy: boolean; messages: SupervisorMessage[] };
