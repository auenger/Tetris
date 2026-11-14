import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { RotateCcw, ArrowUp, ArrowDown, Layers, Plus, Square, ArrowUpRight, Bell, Archive, BookOpen, History, Copy, Check } from 'lucide-react';
import type { SupervisorSnapshot } from '@tetris/shared/supervisor-types';
import { taskLabels, type WorkerTask } from './WorkerView';
import { Select } from '../../../shared/ui/Select';
import { ChatMarkdown } from './ChatMarkdown';
import { ConversationArchive } from './ConversationArchive';
import './supervisor-chat.css';
const logo = new URL('../../shell/src/assets/tetris-icon.png', import.meta.url).href;

export function SupervisorView() {
  const [conversationId, setConversationId] = useState('');
  const [conversations, setConversations] = useState<Awaited<ReturnType<typeof window.api.supervisorConversations>>>([]);
  const [selectedTask, setSelectedTask] = useState<string | null>(null);
  const [taskScope, setTaskScope] = useState('conversation');
  const [notices, setNotices] = useState<Awaited<ReturnType<typeof window.api.supervisorNotifications>>>([]);
  const [showNotices, setShowNotices] = useState(false);
  const [memory, setMemory] = useState<string | null>(null);
  const memoryRevision = useRef('');
  const [workspaces, setWorkspaces] = useState<string[]>([]);
  const [state, setState] = useState<SupervisorSnapshot>({ cwd: '', busy: false, messages: [] } as SupervisorSnapshot);
  const [tasks, setTasks] = useState<WorkerTask[]>([]);
  const [request, setRequest] = useState('');
  const [provider, setProvider] = useState<'claude' | 'codex'>('claude');
  const [isolated, setIsolated] = useState(false);
  const [systemNotifications, setSystemNotifications] = useState(true);
  const [showTasks, setShowTasks] = useState(false);
  const [showArchives, setShowArchives] = useState(false);
  const [sendingIds, setSendingIds] = useState<string[]>([]);
  const sendLocks = useRef(new Set<string>());
  const creating = useRef(false);
  const [archiving, setArchiving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [awayFromBottom, setAwayFromBottom] = useState(false);
  const [copiedId, setCopiedId] = useState('');
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const drafts = useRef(new Map<string, { text: string; revision: number }>());
  const sendErrors = useRef(new Map<string, string>());
  const currentConversation = useRef(conversationId);
  currentConversation.current = conversationId;
  const [replaying, setReplaying] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [context, setContext] = useState<Awaited<ReturnType<typeof window.api.agentContext>>>();
  const scroll = useRef<HTMLDivElement>(null);
  const messageContent = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const input = useRef<HTMLTextAreaElement>(null);
  const pendingTaskSelection = useRef<string | null>(null);
  const hostVisible = useRef(false);
  const readingConversation = useRef(true);
  readingConversation.current = !showTasks && !showArchives && !showNotices && memory === null;
  useEffect(() => window.api.onSupervisorVisibility(view => { hostVisible.current = view.visible; }), []);
  useEffect(() => {
    window.api.agentWorkspaces().then(r => setWorkspaces(r.workspaces)).catch(e => setError(String(e)));
    window.api.getPref('taskSystemNotifications').then(value => setSystemNotifications(value !== false));
    window.api.getPref('defaultWorker').then(value => { if (value === 'claude' || value === 'codex') setProvider(value); });
    window.api.supervisorConversations(true).then(async items => {
      setConversations(items);
      const initialId = items.find(c => !c.archivedAt)?.id || (await window.api.supervisorCreate()).id;
      setConversationId(current => current || initialId);
    }).catch(e => { setError(String(e)); setLoading(false); });
  }, []);
  useEffect(() => {
    if (!conversationId) return;
    let disposed = false;
    let refreshing = false;
    nearBottom.current = true; setAwayFromBottom(false); setLoading(true); setError(sendErrors.current.get(conversationId) || '');
    setRequest(drafts.current.get(conversationId)?.text || '');
    setState({ cwd: '', busy: false, messages: [] } as SupervisorSnapshot); setContext(undefined); setSelectedTask(pendingTaskSelection.current); pendingTaskSelection.current = null;
    function applySnapshot(next: SupervisorSnapshot) {
      if (disposed || (next.conversationId && next.conversationId !== conversationId)) return;
      setLoading(false);
      setState(current => current.conversationId === next.conversationId && next.revision !== undefined && current.revision !== undefined && next.revision <= current.revision ? current : next);
    }
    async function refresh() {
      if (refreshing) return;
      refreshing = true;
      try {
        const [next, tasks, list, notifications] = await Promise.all([window.api.supervisorSnapshot(conversationId), window.api.agentTasks(), window.api.supervisorConversations(true), window.api.supervisorNotifications()]);
        if (!disposed) {
          applySnapshot(next); setTasks(tasks); setConversations(list); setNotices(notifications);
          if (hostVisible.current && !document.hidden && readingConversation.current && nearBottom.current) void window.api.supervisorRead(conversationId);
        }
      } catch (error) { if (!disposed) { setError(String(error)); setLoading(false); } }
      finally { refreshing = false; }
    }
    const unsubscribe = window.api.onSupervisorSnapshot?.(applySnapshot);
    void refresh(); const timer = setInterval(refresh, 1500);
    return () => { disposed = true; clearInterval(timer); unsubscribe?.(); };
  }, [conversationId]);
  useEffect(() => () => clearTimeout(copyTimer.current), []);
  function openConversation(id: string) {
    setConversationId(id); setShowTasks(false); setShowArchives(false); setShowNotices(false);
    nearBottom.current = true; setAwayFromBottom(false); setSelectedTask(null);
  }
  async function restoreConversation(id: string) {
    await window.api.supervisorRestore(id);
    setConversations(await window.api.supervisorConversations(true));
    openConversation(id);
    requestAnimationFrame(() => input.current?.focus());
  }
  function openTaskTarget(target: { conversationId?: string; taskId: string }) {
    if (target.conversationId && target.conversationId !== conversationId) {
      pendingTaskSelection.current = target.taskId; setConversationId(target.conversationId);
    } else setSelectedTask(target.taskId);
    setShowTasks(true); setShowArchives(false); setTaskScope('all');
    void window.api.supervisorTaskOpen(target.conversationId || conversationId, target.taskId).catch(error => setError(String(error)));
  }
  useEffect(() => {
    const unsubscribe = window.api.onSupervisorNotificationOpen(openTaskTarget);
    window.api.sendToHost('supervisor:ready');
    return unsubscribe;
  }, [conversationId]);
  async function newConversation() {
    if (creating.current) return;
    creating.current = true;
    try { const next = await window.api.supervisorCreate(); setConversations(await window.api.supervisorConversations(true)); openConversation(next.id); }
    catch (error) { setError(String(error)); }
    finally { creating.current = false; }
  }
  async function archiveConversation() {
    if (!conversationId || archiving) return;
    const sourceId = conversationId;
    setArchiving(true); setError('');
    try {
      await window.api.supervisorArchive(sourceId);
      const list = await window.api.supervisorConversations(true); setConversations(list);
      if (currentConversation.current === sourceId) {
        const next = list.find(item => !item.archivedAt);
        if (next) openConversation(next.id); else await newConversation();
      }
    } catch (error) { setError(String(error)); }
    finally { setArchiving(false); }
  }
  const messageVersion = state.messages.map(m => `${m.id}:${m.state}:${m.text.length}:${m.taskIds.length}`).join('|');
  useLayoutEffect(() => {
    if (nearBottom.current && scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight;
  }, [messageVersion, showTasks, showArchives, conversationId]);
  useEffect(() => {
    const content = messageContent.current, viewport = scroll.current;
    if (!content || !viewport) return;
    const observer = new ResizeObserver(() => { if (nearBottom.current) viewport.scrollTop = viewport.scrollHeight; });
    observer.observe(content);
    return () => observer.disconnect();
  }, [showTasks, showArchives]);
  useLayoutEffect(() => {
    const el = input.current;
    if (!el) return;
    const resize = () => { el.style.height = '0px'; el.style.height = `${Math.min(200, Math.max(44, el.scrollHeight))}px`; };
    resize();
    let width = el.getBoundingClientRect().width;
    const observer = new ResizeObserver(() => { const nextWidth = el.getBoundingClientRect().width; if (nextWidth !== width) { width = nextWidth; resize(); } });
    observer.observe(el);
    return () => observer.disconnect();
  }, [request, conversationId, showArchives, conversations.some(item => item.id === conversationId && !!item.archivedAt)]);
  useEffect(() => {
    if (!showTasks || !selectedTask) return;
    const card = [...(scroll.current?.querySelectorAll<HTMLElement>('[data-task-id]') || [])].find(node => node.dataset.taskId === selectedTask);
    card?.scrollIntoView({ block: 'nearest' });
  }, [showTasks, selectedTask, tasks.length]);
  const taskVersion = tasks.map(t => `${t.id}:${t.sessionId}:${t.title}:${t.runs.at(-1)?.status}:${t.pendingMessages?.length}`).join('|');
  useEffect(() => {
    const element = scroll.current;
    if (!element) return;
    let frame = 0;
    function report() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const bounds = element!.getBoundingClientRect();
        const anchors = [...element!.querySelectorAll<HTMLElement>('[data-supervisor-task-anchor]')].map(node => {
          const rect = node.getBoundingClientRect();
          return { id: node.dataset.supervisorTaskAnchor, taskId: node.dataset.taskId, messageId: node.dataset.messageId, sessionId: node.dataset.sessionId, top: rect.top, left: rect.left, width: rect.width, height: rect.height,
            visible: rect.top + rect.height / 2 > bounds.top && rect.top + rect.height / 2 < bounds.bottom };
        });
        window.api.sendToHost('supervisor:anchors', { anchors, width: innerWidth, height: innerHeight });
        window.api.sendToHost('supervisor:view', { conversationId, taskIds: anchors.filter(anchor => anchor.visible).map(anchor => anchor.taskId) });
      });
    }
    report(); const observer = new ResizeObserver(report); observer.observe(element);
    element.querySelectorAll('[data-supervisor-task-anchor]').forEach(node => observer.observe(node));
    element.addEventListener('scroll', report); window.addEventListener('resize', report);
    return () => { observer.disconnect(); element.removeEventListener('scroll', report); window.removeEventListener('resize', report); cancelAnimationFrame(frame); };
  }, [messageVersion, taskVersion, showTasks, showArchives, taskScope, conversationId, showNotices, memory !== null]);
  const active = tasks.filter(t => ['queued', 'running'].includes(t.runs.at(-1)?.status || '')).length;
  const conversation = conversations.find(item => item.id === conversationId);
  const archived = !!conversation?.archivedAt;
  const sending = sendingIds.includes(conversationId);
  function updateDraft(text: string) {
    const revision = (drafts.current.get(conversationId)?.revision || 0) + 1;
    drafts.current.set(conversationId, { text, revision }); setRequest(text);
  }
  async function submit() {
    const text = request.trim(); if (!text || !conversationId || archived || sendLocks.current.has(conversationId)) return;
    const sourceId = conversationId, sourceRevision = drafts.current.get(sourceId)?.revision || 0;
    sendLocks.current.add(sourceId); setSendingIds([...sendLocks.current]); sendErrors.current.delete(sourceId); setError('');
    // Follow this send immediately. A later acknowledgement must not undo a scroll or view switch.
    nearBottom.current = true; setAwayFromBottom(false); setShowTasks(false); setShowArchives(false); input.current?.focus();
    try {
      await window.api.supervisorSend(sourceId, text, provider, isolated, selectedTask ? [selectedTask] : []);
      const ownsDraft = (drafts.current.get(sourceId)?.revision || 0) === sourceRevision;
      if (ownsDraft) drafts.current.delete(sourceId);
      if (currentConversation.current === sourceId) {
        if (ownsDraft) setRequest('');
      }
    }
    catch (error) { sendErrors.current.set(sourceId, String(error)); if (currentConversation.current === sourceId) setError(String(error)); }
    finally { sendLocks.current.delete(sourceId); setSendingIds([...sendLocks.current]); }
  }
  function taskCard(task: WorkerTask, messageId?: string) {
    const status = task.runs.at(-1)?.status || '';
    const latestDecision = task.decisions?.filter(d => d.status === 'resolved').at(-1);
    const anchorId = `task:${JSON.stringify([messageId || null, task.sessionId])}`;
    return <div className="supervisor-task" data-supervisor-task-anchor={anchorId} data-task-id={task.id} data-message-id={messageId} data-session-id={task.sessionId} key={task.id} style={{ '--task-accent': task.provider === 'codex' ? '#2789c3' : '#a576c6' } as React.CSSProperties}>
      <button className="supervisor-task-main" onClick={() => { setSelectedTask(task.id); void window.api.supervisorTaskOpen(conversationId, task.id, anchorId).catch(error => setError(String(error))); }}>
        <span className="supervisor-task-label">{task.provider === 'codex' ? 'Codex' : 'Claude Code'}<span>{task.waitingForPermission ? '需要授权' : task.completed ? '已验收' : taskLabels[status] || '准备中'}</span></span>
        <strong>{task.title}</strong><span className="supervisor-task-link">在画布查看 <ArrowUpRight size={12} /></span>
      </button>
      <button className="supervisor-task-replay" disabled={!!replaying} title="在画布中重现任务过程" onClick={async () => {
        setReplaying(task.id); setError('');
        try { await window.api.supervisorTaskReplay(conversationId, task.id, anchorId); }
        catch (error) { setError(String(error)); }
        finally { setReplaying(null); }
      }}><RotateCcw size={12} />{replaying === task.id ? '正在打开…' : '回放任务'}</button>
      {task.decisions?.filter(d => d.status === 'pending').map(decision => <button key={decision.id} className="task-decision" onClick={() => { setSelectedTask(task.id); input.current?.focus(); }}>
        <strong>等待你的决定</strong><span>{decision.question}</span>{decision.reason && <small>{decision.reason}</small>}{decision.recommendation && <small>建议：{decision.recommendation}</small>}{decision.impact && <small>影响：{decision.impact}</small>}<small>在对话中告诉我你的决定 →</small>
      </button>)}
      {latestDecision?.response && <div className="task-decision resolved">
        <strong>已决定：{latestDecision.response.userText}</strong>
        <small>{latestDecision.response.deliveryStatus === 'delivered' ? '已交给 Worker 继续处理' : latestDecision.response.deliveryStatus === 'failed' ? `交付失败：${latestDecision.response.deliveryDetail || '可继续对话处理'}` : latestDecision.response.deliveryStatus === 'unconfirmed' ? `交付未确认：${latestDecision.response.deliveryDetail || '请核对任务进度后继续'}` : '决定已保存，尚未确认交付'}</small>
      </div>}
      {!!task.pendingMessages?.length && <small>补充要求排队中 · {task.pendingMessages.length}</small>}
      {['queued', 'running'].includes(status) && <button className="supervisor-task-stop" aria-label={`停止 ${task.title}`} onClick={() => window.api.agentCancel(task.sessionId).catch(error => setError(String(error)))}><Square size={11} />停止</button>}
    </div>;
  }
  return <div className="supervisor-view">
    <header className="supervisor-header"><span className="supervisor-brand"><img src={logo} className="tetris-agent-logo" alt="" /><strong>Tetris Agent</strong></span>
      <div className="supervisor-header-actions">
        <button type="button" className={`icon-action supervisor-archive-trigger ${showArchives ? 'selected' : ''}`} title="归档记录" aria-label="归档记录" aria-pressed={showArchives} onClick={() => { setShowArchives(!showArchives); setShowTasks(false); setShowNotices(false); }}><History size={15} /><span>归档记录</span></button>
        <button type="button" className={`icon-action ${showNotices ? 'selected' : ''}`} title="任务通知" aria-label="任务通知" aria-pressed={showNotices} onClick={() => setShowNotices(!showNotices)}><Bell size={15} />{!!notices.filter(n => !n.read).length && <span className="supervisor-count">{notices.filter(n => !n.read).length}</span>}</button>
        <button type="button" className={`icon-action ${showTasks ? 'selected' : ''}`} title={showTasks ? '返回对话' : '任务记录'} aria-label="任务记录" aria-pressed={showTasks} onClick={() => { setShowTasks(!showTasks); setShowArchives(false); }}><Layers size={15} />{active > 0 && <span className="supervisor-count">{active}</span>}</button>
      </div>
    </header>
    <div className="supervisor-workspace">
      <Select variant="ghost" className="supervisor-conversation-select" aria-label="历史对话" value={conversationId} onChange={e => openConversation(e.target.value)} disabled={!conversationId}>
        {conversations.filter(c => !c.archivedAt || c.id === conversationId).map(c => <option key={c.id} value={c.id}>{c.unread ? '● ' : ''}{c.title}{c.archivedAt ? '（已归档）' : ''}</option>)}
      </Select>
      <button type="button" className="icon-action" title="新对话" aria-label="新对话" onClick={newConversation}><Plus size={16} /></button>
      {!archived && <button type="button" className="icon-action" title="归档当前对话" aria-label="归档当前对话" disabled={!conversationId || archiving} onClick={archiveConversation}><Archive size={15} /></button>}
      <span className="supervisor-workspace-status" title={workspaces.join('\n')}>{active ? `${active} 项执行中` : `${workspaces.length} 个工作目录`}</span>
    </div>
    {showNotices && <div className="agent-notice-list">{notices.length ? notices.map(notice => <button key={notice.id} onClick={async () => { openTaskTarget(notice); await window.api.supervisorReadNotification(notice.id); setShowNotices(false); }}><strong>{notice.read ? '' : '● '}{notice.title}</strong><span>{notice.body}</span></button>) : <p>暂无通知</p>}</div>}
    {memory !== null && <div className="agent-memory"><label>长期记忆<textarea aria-label="长期记忆" value={memory} onChange={e => setMemory(e.target.value)} /></label><button onClick={async () => { try { await window.api.supervisorSaveMemory(memory, memoryRevision.current); setMemory(null); } catch (error) { setError(String(error)); } }}>保存</button><button onClick={() => setMemory(null)}>关闭</button></div>}
    <div className="supervisor-message-region">
      <div className="supervisor-messages" ref={scroll} onScroll={e => {
        const el = e.currentTarget; nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 64;
        setAwayFromBottom(!nearBottom.current);
        if (nearBottom.current && hostVisible.current && !document.hidden && readingConversation.current) void window.api.supervisorRead(conversationId);
      }}>
        <div className="supervisor-message-content" ref={messageContent}>
          {showArchives ? <ConversationArchive conversations={conversations} onOpen={openConversation} onRestore={restoreConversation} onClose={() => setShowArchives(false)} /> : showTasks ?
            <div className="supervisor-task-list"><h2>任务记录</h2><Select aria-label="任务范围" value={taskScope} onChange={e => setTaskScope(e.target.value)}><option value="conversation">当前对话</option><option value="all">全部任务</option>{workspaces.map(path => <option value={path} key={path}>{path.split('/').at(-1)}</option>)}</Select>{tasks.filter(t => taskScope === 'all' || (taskScope === 'conversation' ? t.originConversationId === conversationId : t.cwd === taskScope || t.sourceCwd === taskScope)).length ? tasks.filter(t => taskScope === 'all' || (taskScope === 'conversation' ? t.originConversationId === conversationId : t.cwd === taskScope || t.sourceCwd === taskScope)).map(task => taskCard(task)) : <p className="supervisor-hint">这个范围还没有任务。</p>}</div> : <>
            {loading && <div className="supervisor-loading" role="status">正在加载对话…</div>}
            {!loading && !state.messages.length && <div className="supervisor-welcome"><span className="supervisor-welcome-icon"><img src={logo} alt="" className="tetris-agent-logo large" /></span><h1>想一起完成什么？</h1><p>我会结合当前工作空间安排任务，<br />让 Claude Code 或 Codex 在画布上执行。</p><span>任务执行时，你仍然可以在这里和我交流。</span></div>}
            {state.messages.map(message => message.role === 'event' ? <div key={message.id} className="supervisor-event"><span className="status-dot" />任务状态已更新{message.state === 'pending' ? ' · 正在整理结果' : ''}</div> :
              <article key={message.id} data-supervisor-message={message.id} className={`supervisor-message ${message.role}`} aria-busy={message.role === 'assistant' && message.state === 'pending'}>
                {message.role === 'assistant' && <div className="supervisor-speaker">Tetris Agent{message.state === 'pending' && <span className="supervisor-stream-label">正在回复</span>}</div>}
                {message.role === 'user' ? <div className="supervisor-message-text supervisor-user-text">{message.text}</div> : <ChatMarkdown className="supervisor-message-text" content={message.text} isStreaming={message.state === 'pending'} />}
                {message.role === 'assistant' && message.state === 'pending' && !message.text && <div className="supervisor-reply-placeholder" role="status"><span />正在思考…</div>}
                {message.role === 'user' && message.state === 'pending' && <small>已收到{state.busy ? ' · 正在处理' : ''}</small>}
                {message.state === 'failed' && <small className="supervisor-error">{message.failureDetail || '本轮未全部完成，可以继续说明或重试。'}</small>}
                {[...new Set(message.taskIds)].map(id => tasks.find(t => t.id === id)).filter((t): t is WorkerTask => !!t).map(task => taskCard(task, message.id))}
                {message.role === 'assistant' && message.text && message.state !== 'pending' && <div className="supervisor-message-actions"><button type="button" className="icon-action" aria-label="复制回复" title={copiedId === message.id ? '已复制' : '复制回复'} onClick={async () => {
                  try { await navigator.clipboard.writeText(message.text); setCopiedId(message.id); clearTimeout(copyTimer.current); copyTimer.current = setTimeout(() => setCopiedId(''), 1600); }
                  catch { setError('复制失败，请选中文字后复制。'); }
                }}>{copiedId === message.id ? <Check size={13} /> : <Copy size={13} />}</button></div>}
              </article>)}
            {state.busy && !state.messages.some(message => message.role === 'assistant' && message.state === 'pending') && <div className="supervisor-thinking" role="status"><span />正在处理消息</div>}
          </>}
        </div>
      </div>
      {awayFromBottom && !showTasks && !showArchives && <button type="button" className="supervisor-jump-latest" onClick={() => { nearBottom.current = true; setAwayFromBottom(false); if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight; }}><ArrowDown size={14} />回到最新</button>}
    </div>
    {showArchives ? <div className="supervisor-archive-footer"><button type="button" onClick={() => setShowArchives(false)}>返回当前对话</button></div> : archived ? <div className="supervisor-archived-banner"><Archive size={16} /><div><strong>这段对话已归档</strong><span>消息和关联任务都已保留。</span></div><button type="button" onClick={() => restoreConversation(conversationId).catch(error => setError(String(error)))}>恢复并继续</button>{error && <p className="supervisor-error" role="alert">{error}</p>}</div> :
      <form className="supervisor-composer" onSubmit={e => { e.preventDefault(); void submit(); }}>
        {error && <div className="supervisor-error" role="alert">{error}</div>}
        {context && <details className="supervisor-context" open><summary>当前上下文 · {context.tiles.length} 个 tiles</summary>{context.tiles.map(tile => <div key={tile.id}>{tile.userTitle || tile.filePath || tile.type}</div>)}</details>}
        {selectedTask && <div className="selected-task-context">关联任务：{tasks.find(t => t.id === selectedTask)?.title || selectedTask}<button type="button" onClick={() => setSelectedTask(null)}>取消关联</button></div>}
        <div className="supervisor-input-box"><textarea ref={input} rows={2} aria-label="给 Tetris Agent 发消息" placeholder={active ? '继续提问、补充要求，或安排另一件事…' : '说说你想做什么…'} value={request} onChange={e => updateDraft(e.target.value)} onKeyDown={e => {
          if (e.key === 'Enter' && !e.shiftKey && !e.altKey && !e.nativeEvent.isComposing && e.nativeEvent.keyCode !== 229) { e.preventDefault(); void submit(); }
        }} />
          <div className="supervisor-compose-tools"><button type="button" className="icon-action" title="查看长期记忆" aria-label="查看长期记忆" onClick={() => window.api.supervisorMemory().then(value => { memoryRevision.current = value.revision; setMemory(value.text); }).catch(error => setError(String(error)))}><BookOpen size={15} /></button>
            <Select variant="ghost" className="supervisor-provider-select" aria-label="默认 Worker" value={provider} onChange={e => { const value = e.target.value as 'claude' | 'codex'; setProvider(value); void window.api.setPref('defaultWorker', value); }}><option value="claude">Claude Code</option><option value="codex">Codex</option></Select>
            <span className="supervisor-input-hint">Shift + Enter 换行</span>
            <button className="supervisor-send" type="submit" aria-label="发送消息" title="发送消息" disabled={sending || !conversationId || !request.trim()}><ArrowUp size={17} /></button>
          </div>
        </div>
        <div className="supervisor-compose-footer"><span>{state.busy ? '回复中 · 可以继续发送' : 'Tetris Agent · Claude'}</span><div className="supervisor-compose-options"><label><input type="checkbox" checked={systemNotifications} onChange={e => { setSystemNotifications(e.target.checked); void window.api.setPref('taskSystemNotifications', e.target.checked); }} />系统提醒</label><label><input type="checkbox" checked={isolated} onChange={e => setIsolated(e.target.checked)} />独立工作目录</label></div></div>
      </form>}
  </div>;
}
