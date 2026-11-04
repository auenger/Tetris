/**
 * Mock window.api for standalone browser testing.
 * Simulates the ACP agent IPC without Electron.
 */

type UpdateCb = (params: unknown) => void;
type CompleteCb = (data: {
  sessionId: string; stopReason: string;
}) => void;
type ErrorCb = (data: {
  sessionId: string; error: string;
}) => void;
type ExitCb = (data: { sessionId: string }) => void;

const listeners = {
  update: [] as UpdateCb[],
  complete: [] as CompleteCb[],
  error: [] as ErrorCb[],
  exit: [] as ExitCb[],
};

function emit(
  type: keyof typeof listeners,
  data: unknown,
) {
  for (const cb of listeners[type]) {
    (cb as (d: unknown) => void)(data);
  }
}

function simulateResponse(
  sessionId: string,
  userText: string,
) {
  const response =
    `You said: "${userText}"\n\n` +
    "This is a **mock response** from the dev shim. " +
    "It supports:\n\n" +
    "- Streaming text chunks\n" +
    "- Tool calls\n" +
    "- Markdown rendering\n\n" +
    "| Feature | Status |\n" +
    "|---------|--------|\n" +
    "| Text | Working |\n" +
    "| Tools | Simulated |\n";

  // Simulate streaming: split into chunks
  const chunks = response.match(/[\s\S]{1,40}/g) ?? [response];
  let delay = 100;

  for (const chunk of chunks) {
    setTimeout(() => {
      emit("update", {
        sessionId,
        update: {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: chunk },
        },
      });
    }, delay);
    delay += 50;
  }

  // Simulate a tool call after text
  setTimeout(() => {
    emit("update", {
      sessionId,
      update: {
        sessionUpdate: "tool_call",
        toolCallId: `call_${Date.now()}`,
        title: "bash",
        kind: "command",
        status: "in_progress",
        rawInput: { command: `echo "${userText}"` },
      },
    });
  }, delay);
  delay += 200;

  // Tool call complete
  setTimeout(() => {
    emit("update", {
      sessionId,
      update: {
        sessionUpdate: "tool_call_update",
        toolCallId: `call_${Date.now() - 200}`,
        status: "completed",
        content: [{
          type: "content",
          content: {
            type: "text",
            text: userText,
          },
        }],
      },
    });
  }, delay);
  delay += 100;

  // Prompt complete
  setTimeout(() => {
    emit("complete", {
      sessionId,
      stopReason: "end_turn",
    });
  }, delay);
}

export function installDevShim() {
  if ((window as any).api) return; // Real preload exists

  const sessionId = "dev-session-" + Date.now();
  const conversations = new Map<string, any[]>();
  const demoTasks: any[] = [];

  (window as any).api = {
    agentWorkspaces: async () => ({ workspaces: ["/demo", "/demo-second"] }),
    agentTasks: async () => demoTasks,
    supervisorSnapshot: async (cwd: string) => ({ cwd, busy: false, messages: conversations.get(cwd) || [] }),
    supervisorTaskOpen: async () => ({ tileId: 'demo-worker-tile' }),
    supervisorSend: async (cwd: string, text: string, provider: string) => {
      const messages = conversations.get(cwd) || [];
      conversations.set(cwd, messages);
      const id = crypto.randomUUID();
      messages.push({ id, role: 'user', text, state: 'done', createdAt: new Date().toISOString(), taskIds: [] });
      let task = demoTasks.find(t => t.cwd === cwd);
      if (!task) {
        task = { id: 'demo-task', sessionId: 'demo-worker', cwd, title: '检查个人站首页', provider, runs: [{ id: 'demo-run', status: 'running', output: '正在检查首页内容…（浏览器模拟）', activity: [{ id: 'read', title: '读取首页文件', status: 'completed', detail: '浏览器演示数据' }] }] };
        demoTasks.push(task);
      }
      messages.push({ id: crypto.randomUUID(), role: 'assistant', text: '浏览器演示：已交给 ' + (provider === 'claude' ? 'Claude Code' : 'Codex') + ' 检查首页。你可以继续提问，执行任务保持运行。', state: 'done', createdAt: new Date().toISOString(), taskIds: [task.id] });
      return id;
    },
    agentPermissions: async () => [],
    agentContext: async () => ({ scope: "workspace", tiles: [], groups: [] }),
    agentReviewProvider: async () => {},
    agentSaveMessages: async () => {},
    agentRoute: async () => ({ reason: "浏览器演示使用模拟数据，请在 Electron 中验证真实任务路由。" }),
    onAgentSessionReady: () => () => {},
    onAgentSessionFailed: () => () => {},
    agentSpawn: async () => {
      console.log("[dev-shim] agentSpawn");
      return { sessionId, resumed: false, cachedMessages: [] };
    },

    agentPrompt: async (
      sid: string, text: string,
    ) => {
      console.log("[dev-shim] agentPrompt:", text);
      simulateResponse(sid, text);
    },

    agentCancel: async () => {
      console.log("[dev-shim] agentCancel");
    },

    agentKill: async () => {
      console.log("[dev-shim] agentKill");
    },

    onAgentUpdate: (cb: UpdateCb) => {
      listeners.update.push(cb);
      return () => {
        const i = listeners.update.indexOf(cb);
        if (i >= 0) listeners.update.splice(i, 1);
      };
    },

    onAgentPromptComplete: (cb: CompleteCb) => {
      listeners.complete.push(cb);
      return () => {
        const i = listeners.complete.indexOf(cb);
        if (i >= 0) listeners.complete.splice(i, 1);
      };
    },

    onAgentPromptError: (cb: ErrorCb) => {
      listeners.error.push(cb);
      return () => {
        const i = listeners.error.indexOf(cb);
        if (i >= 0) listeners.error.splice(i, 1);
      };
    },

    onAgentExit: (cb: ExitCb) => {
      listeners.exit.push(cb);
      return () => {
        const i = listeners.exit.indexOf(cb);
        if (i >= 0) listeners.exit.splice(i, 1);
      };
    },

    sendToHost: () => {},
  };

  console.log("[dev-shim] Mock API installed");
}
