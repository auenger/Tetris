import { createRoot } from 'react-dom/client';
import '@tetris/theme/styles.css';
import '../../src/windows/agent-chat/src/styles.css';
import '../../src/windows/agent-chat/src/supervisor.css';
import { SupervisorView } from '../../src/windows/agent-chat/src/SupervisorView';

// This fixture drives actual component effects with controlled IPC promises. No model is invoked.
const clone = <T,>(value: T): T => structuredClone(value);
const tick = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 0))));
const root = createRoot(document.getElementById('root')!);
const snapshots = new Map<string, any>();
const listeners = new Set<(snapshot: any) => void>();
const pollers = new Map<number, () => void>();
let timerId = 1000000, generation = 0;
const realInterval = window.setInterval.bind(window), realClearInterval = window.clearInterval.bind(window);
window.setInterval = ((handler: TimerHandler, delay: number, ...args: any[]) => {
  if (delay === 1500 && typeof handler === 'function') { const id = ++timerId; pollers.set(id, () => handler(...args)); return id; }
  return realInterval(handler, delay, ...args);
}) as typeof window.setInterval;
window.clearInterval = (id?: number) => { if (id && pollers.delete(id)) return; realClearInterval(id); };
let conversations: any[] = [], tasks: any[] = [], calls: any[] = [], sends: Array<() => void> = [];
let sendRejections: Array<(error: Error) => void> = [];
let pendingSnapshot: { value: any; resolve(value: any): void } | undefined;
let holdSnapshot = false, holdSend = false;
const date = '2026-11-04T04:00:00.000Z';
const message = (id: string, text: string, role = 'assistant', state = 'complete', taskIds: string[] = []) => ({ id, text, role, state, taskIds, createdAt: date });
const snapshot = (id: string, revision: number, messages: any[], busy = false) => ({ conversationId: id, cwd: '/fixture/agent', revision, messages, busy });
const conversation = (id: string, title: string, archived = false) => ({ id, title, createdAt: date, updatedAt: date, unread: 0, ...(archived ? { archivedAt: date } : {}) });
const api = {
  agentWorkspaces: async () => ({ workspaces: ['/Users/ryan/personal-site', '/Users/ryan/mycode/collab'] }),
  agentTasks: async () => clone(tasks),
  getPref: async (name: string) => name === 'defaultWorker' ? 'claude' : true,
  setPref: async (name: string, value: any) => { calls.push({ kind: 'pref', name, value }); },
  supervisorConversations: async () => clone(conversations),
  supervisorSnapshot: async (id: string) => {
    const value = clone(snapshots.get(id));
    if (holdSnapshot) { holdSnapshot = false; return new Promise(resolve => { pendingSnapshot = { value, resolve }; }); }
    return value;
  },
  onSupervisorSnapshot: (listener: (snapshot: any) => void) => { listeners.add(listener); return () => listeners.delete(listener); },
  onSupervisorVisibility: () => () => {},
  onSupervisorNotificationOpen: () => () => {},
  supervisorNotifications: async () => [],
  supervisorRead: async (id: string) => { calls.push({ kind: 'read', id }); },
  supervisorCreate: async () => {
    const id = `new-${conversations.length}`; conversations.unshift(conversation(id, '新的对话'));
    snapshots.set(id, snapshot(id, 1, [])); calls.push({ kind: 'create', id }); return { id };
  },
  supervisorArchive: async (id: string) => { conversations = conversations.map(item => item.id === id ? { ...item, archivedAt: date } : item); calls.push({ kind: 'archive', id }); },
  supervisorRestore: async (id: string) => {
    const item = conversations.find(item => item.id === id); delete item.archivedAt;
    calls.push({ kind: 'restore', id }); return clone(item);
  },
  supervisorSend: async (id: string, text: string, provider: string, isolated: boolean, taskIds: string[]) => {
    calls.push({ kind: 'send', id, text, provider, isolated, taskIds });
    if (holdSend) await new Promise<void>((resolve, reject) => { sends.push(resolve); sendRejections.push(reject); });
    return `send-${calls.length}`;
  },
  supervisorMemory: async () => ({ text: '# 长期记忆\n\n偏好自然语言协作。', revision: 'memory-1' }),
  supervisorSaveMemory: async () => {}, supervisorTaskOpen: async () => {}, supervisorTaskReplay: async () => {},
  supervisorReadNotification: async () => {}, agentCancel: async () => {}, sendToHost: () => {},
};
(window as any).api = api;
Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text: string) => { calls.push({ kind: 'copy', text }); } } });

const query = <T extends Element = HTMLElement,>(selector: string): T => {
  const element = document.querySelector<T>(selector); if (!element) throw Error(`Missing fixture element: ${selector}`); return element;
};
async function click(selector: string) { query<HTMLElement>(selector).click(); await tick(); }
async function type(selector: string, value: string) {
  const element = query<HTMLInputElement | HTMLTextAreaElement>(selector);
  const prototype = element.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(element, value);
  element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value })); await tick();
}
const composer = '.supervisor-input-box textarea';
const composerValue = () => query<HTMLTextAreaElement>(composer).value;
const selectedId = () => query<HTMLSelectElement>('select[aria-label="历史对话"]').value;
async function chooseConversation(id: string) {
  const native = query<HTMLSelectElement>('select[aria-label="历史对话"]');
  const index = Array.from(native.options).findIndex(option => option.value === id);
  if (index < 0) throw Error(`Conversation unavailable: ${id}`);
  await click('button[role="combobox"][aria-label="历史对话"]');
  const trigger = query('button[role="combobox"][aria-label="历史对话"]');
  const list = document.getElementById(trigger.getAttribute('aria-controls')!)!;
  (list.querySelectorAll<HTMLElement>('[role="option"]')[index]!).click(); await tick();
}
function emit(value: any) { snapshots.set(value.conversationId, clone(value)); for (const listener of listeners) listener(clone(value)); }
async function reset() {
  for (const resolve of sends) resolve(); sends = []; sendRejections = []; holdSend = false; holdSnapshot = false;
  if (pendingSnapshot) { pendingSnapshot.resolve(pendingSnapshot.value); pendingSnapshot = undefined; }
  conversations = [conversation('alpha', '个人站内容检查'), conversation('beta', 'Tetris 工作台'), conversation('archive-1', '记忆与任务的设计', true), conversation('archive-2', '旧版导航检查', true)];
  calls = []; tasks = []; snapshots.clear();
  snapshots.set('alpha', snapshot('alpha', 1, [message('alpha-answer', '可以一起检查个人站内容。')]));
  snapshots.set('beta', snapshot('beta', 1, [message('beta-answer', '这里是 Tetris 工作台对话。')]));
  snapshots.set('archive-1', snapshot('archive-1', 1, [message('archive-answer', '已归档的记忆设计原始记录。')]));
  snapshots.set('archive-2', snapshot('archive-2', 1, [message('archive-answer-2', '已归档的导航检查原始记录。')]));
  root.render(<SupervisorView key={++generation} />); await tick(); await tick();
}

async function test() {
  const checks: Array<{ name: string; pass: boolean; detail?: any }> = [];
  const check = (name: string, pass: boolean, detail?: any) => checks.push({ name, pass, ...(detail !== undefined ? { detail } : {}) });
  await reset();
  check('real SupervisorView mounts initial conversation', selectedId() === 'alpha' && document.body.textContent!.includes('可以一起检查个人站内容'));
  await click('button[aria-label="归档记录"]');
  check('archive list is reachable with two records', document.querySelectorAll('.conversation-archive-list li').length === 2);
  await type('input[aria-label="搜索归档对话"]', '记忆');
  check('archive search filters title', document.querySelectorAll('.conversation-archive-list li').length === 1 && query('.conversation-archive-list').textContent!.includes('记忆与任务'));
  await click('.conversation-archive-open');
  check('archived conversation opens read-only with original ID and messages', selectedId() === 'archive-1' && !!document.querySelector('.supervisor-archived-banner') && !document.querySelector(composer) && document.body.textContent!.includes('原始记录'));
  await click('.supervisor-archived-banner > button');
  check('restore keeps original conversation ID and creates no new session', selectedId() === 'archive-1' && !!document.querySelector(composer) && calls.some(call => call.kind === 'restore' && call.id === 'archive-1') && !calls.some(call => call.kind === 'create'));
  check('restored composer is focused and has usable height', document.activeElement === query(composer) && query(composer).getBoundingClientRect().height >= 44);
  await chooseConversation('alpha');
  await click('button[aria-label="归档当前对话"]');
  check('archive current opens another active conversation', selectedId() === 'beta' && calls.some(call => call.kind === 'archive' && call.id === 'alpha'));
  await click('button[aria-label="归档记录"]');
  await click('button[aria-label="恢复 个人站内容检查"]');
  check('restore directly from archive list retains same ID', selectedId() === 'alpha' && !document.querySelector('.conversation-archive') && !conversations.find(item => item.id === 'alpha').archivedAt);

  await reset();
  await type(composer, '对话 A 尚未发送的草稿');
  await chooseConversation('beta');
  check('new conversation starts with its own empty draft', composerValue() === '');
  await type(composer, '对话 B 的草稿');
  await chooseConversation('alpha');
  check('switching back restores A draft', composerValue() === '对话 A 尚未发送的草稿');
  await chooseConversation('beta');
  check('switching back restores B draft', composerValue() === '对话 B 的草稿');
  await chooseConversation('alpha');
  holdSend = true;
  await type(composer, '第一条任务'); await click('button[aria-label="发送消息"]');
  await type(composer, '发送等待期间继续输入');
  query(composer).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await tick();
  check('pending request blocks duplicate submission but accepts typing', calls.filter(call => call.kind === 'send').length === 1 && composerValue() === '发送等待期间继续输入' && !query<HTMLTextAreaElement>(composer).disabled);
  sends.shift()!(); await tick();
  check('send acknowledgement does not erase newer input', composerValue() === '发送等待期间继续输入');
  await type(composer, 'A 的下一条消息'); await click('button[aria-label="发送消息"]');
  await chooseConversation('beta'); await type(composer, 'B 编辑中的内容');
  sends.shift()!(); await tick();
  check('acknowledgement for A does not change B draft or conversation', selectedId() === 'beta' && composerValue() === 'B 编辑中的内容');
  await chooseConversation('alpha');
  check('accepted unchanged source draft is cleared only for source', composerValue() === '');

  await reset(); holdSend = true;
  await type(composer, '发送失败时应保留的 A 草稿'); await click('button[aria-label="发送消息"]');
  await chooseConversation('beta'); await type(composer, 'B 不应受到 A 错误影响');
  sendRejections.shift()!(new Error('fixture delayed send failure')); await tick();
  check('delayed source send failure does not contaminate another conversation', selectedId() === 'beta' && composerValue() === 'B 不应受到 A 错误影响' && !document.body.textContent!.includes('fixture delayed send failure'));
  await chooseConversation('alpha');
  check('failed source conversation restores its own error and unsent draft', composerValue() === '发送失败时应保留的 A 草稿' && !!document.querySelector('.supervisor-error') && document.body.textContent!.includes('fixture delayed send failure'));

  await reset(); await type(composer, '正在输入中文');
  const textarea = query<HTMLTextAreaElement>(composer);
  textarea.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: 'zhongwen' }));
  textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, isComposing: true }));
  await tick(); check('Chinese IME composing Enter does not send', !calls.some(call => call.kind === 'send'));
  textarea.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '中文' }));
  textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, keyCode: 229 }));
  await tick(); check('IME keyCode 229 Enter does not send', !calls.some(call => call.kind === 'send'));
  textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, shiftKey: true }));
  await tick(); check('Shift Enter does not submit', !calls.some(call => call.kind === 'send'));
  textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await tick(); check('ordinary Enter sends once and clears accepted input', calls.filter(call => call.kind === 'send').length === 1 && composerValue() === '');

  await type(composer, '短句'); const shortHeight = query(composer).getBoundingClientRect().height;
  await type(composer, '每行描述一个清晰的检查点。\n'.repeat(5)); const mediumHeight = query(composer).getBoundingClientRect().height;
  await type(composer, '更长的计划，保留每一条想法。\n'.repeat(30)); const tall = query(composer);
  check('composer grows with multiple lines and caps with internal scrolling', shortHeight >= 44 && mediumHeight > shortHeight && tall.getBoundingClientRect().height === 200 && tall.scrollHeight > tall.clientHeight, { shortHeight, mediumHeight, maxHeight: tall.getBoundingClientRect().height });
  await type(composer, '短句');
  check('composer shrinks after deleting long text', query(composer).getBoundingClientRect().height === shortHeight);

  await reset();
  holdSnapshot = true; for (const refresh of pollers.values()) refresh(); await tick();
  emit(snapshot('alpha', 8, [message('stream-reply', '新的流式正文，版本八。', 'assistant', 'pending')], true)); await tick();
  pendingSnapshot!.resolve(pendingSnapshot!.value); pendingSnapshot = undefined; await tick();
  check('older polling response cannot replace streamed snapshot revision', !!document.querySelector('[data-supervisor-message="stream-reply"]') && document.body.textContent!.includes('版本八') && !document.body.textContent!.includes('可以一起检查个人站内容'));
  emit(snapshot('alpha', 7, [message('stale', '旧的事件正文，不应出现')])); await tick();
  check('out-of-order snapshot event is rejected', !document.body.textContent!.includes('旧的事件正文'));
  emit(snapshot('beta', 90, [message('wrong', '其他会话事件不应污染')])); await tick();
  check('other conversation snapshot event is ignored', selectedId() === 'alpha' && !document.body.textContent!.includes('其他会话事件不应污染'));
  await type(composer, '运行期间仍然可以补充'); await click('button[aria-label="发送消息"]');
  check('running assistant does not block new messages', calls.some(call => call.kind === 'send' && call.text === '运行期间仍然可以补充'));

  await reset();
  const longText = Array.from({ length: 35 }, (_, i) => `第 ${i + 1} 个检查点：保留阅读位置，任务执行期间也可以查看已经完成的内容。`).join('\n\n');
  emit(snapshot('alpha', 10, [message('long-reply', longText, 'assistant', 'pending')], true)); await tick();
  const viewport = query<HTMLElement>('.supervisor-messages');
  check('stream follows latest when user is already at bottom', Math.abs(viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop) <= 2);
  viewport.scrollTop = 120; viewport.dispatchEvent(new Event('scroll', { bubbles: true })); await tick(); const readingTop = viewport.scrollTop;
  emit(snapshot('alpha', 11, [message('long-reply', longText + '\n\n新增的一段执行结果。', 'assistant', 'pending')], true)); await tick();
  check('stream does not pull a scrolled-up reader to bottom', Math.abs(viewport.scrollTop - readingTop) <= 1 && !!document.querySelector('.supervisor-jump-latest'), { before: readingTop, after: viewport.scrollTop });
  await click('.supervisor-jump-latest');
  check('jump to latest returns to bottom and hides affordance', Math.abs(viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop) <= 2 && !document.querySelector('.supervisor-jump-latest'));
  emit(snapshot('alpha', 12, [message('long-reply', longText + '\n\n最新内容继续增长。'.repeat(5), 'assistant', 'pending')], true)); await tick();
  check('stream continues following after jump to latest', Math.abs(viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop) <= 2);
  holdSend = true; await type(composer, '继续检查但我先阅读上文'); await click('button[aria-label="发送消息"]');
  viewport.scrollTop = 160; viewport.dispatchEvent(new Event('scroll', { bubbles: true })); await tick(); const waitingTop = viewport.scrollTop;
  sends.shift()!(); await tick();
  emit(snapshot('alpha', 13, [message('long-reply', longText + '\n\n回执后的流式增量。'.repeat(7), 'assistant', 'pending')], true)); await tick();
  check('send acknowledgement preserves reader position chosen while request was pending', Math.abs(viewport.scrollTop - waitingTop) <= 1 && !!document.querySelector('.supervisor-jump-latest'), { before: waitingTop, after: viewport.scrollTop });
  return checks;
}

async function showcase(theme: string) {
  document.documentElement.classList.toggle('dark', theme === 'dark'); await reset();
  tasks = [{ id: 'task-1', sessionId: 'worker-1', originConversationId: 'alpha', title: '核对首页项目与链接', provider: 'claude', cwd: '/Users/ryan/personal-site', pendingMessages: [], decisions: [], runs: [{ id: 'run-1', status: 'ready_for_review', output: '' }] }];
  const content = '已完成首页检查。项目内容基本完整，有两项值得更新。\n\n| 检查项 | 结果 |\n| --- | --- |\n| 项目入口与链接 | 链接正常 |\n| 最近发布的项目 | 建议补充 PingTask |\n\n建议先做这两步：\n\n1. 补充项目简介，让读者清楚了解用途。\n2. 核对截图和上线日期，保持内容一致。\n\n> 现有页面可以继续使用，更新会放在独立任务中执行。\n\n```typescript\nconst projects = ["Tetris", "PingTask", "Personal Site"];\n```';
  emit(snapshot('alpha', 20, [message('demo-user', '检查个人站首页，把需要更新的内容整理一下。', 'user'), message('demo-assistant', content, 'assistant', 'complete', ['task-1'])]));
  for (const refresh of pollers.values()) refresh(); await tick(); await tick();
  await type(composer, '先补充 PingTask 的项目简介，保留现有页面布局。');
  const viewport = query<HTMLElement>('.supervisor-messages'); viewport.scrollTop = 0; viewport.dispatchEvent(new Event('scroll', { bubbles: true })); await tick();
  const input = query(composer), form = query('.supervisor-composer');
  return { width: innerWidth, theme, pageOverflow: document.documentElement.scrollWidth > innerWidth, composerOverflow: form.getBoundingClientRect().right > innerWidth + 1, textareaHeight: input.getBoundingClientRect().height, taskCardCount: document.querySelectorAll('.supervisor-task').length, tableCount: document.querySelectorAll('.chat-markdown table').length };
}
async function archiveShowcase() { await reset(); document.documentElement.classList.add('dark'); await click('button[aria-label="归档记录"]'); }
(window as any).chatFixture = { test, showcase, archiveShowcase };
await reset();
