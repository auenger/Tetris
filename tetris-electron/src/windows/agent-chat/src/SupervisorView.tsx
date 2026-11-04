import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { ArrowUp, Folder, Layers, Plus, Square, ArrowUpRight, Sparkles } from 'lucide-react';
import type { SupervisorSnapshot } from '@tetris/shared/supervisor-types';
import { taskLabels, type WorkerTask } from './WorkerView';

export function SupervisorView() {
  const [cwd, setCwd] = useState(new URLSearchParams(location.search).get('cwd') || '.');
  const [workspaces, setWorkspaces] = useState<string[]>([]);
  const [state, setState] = useState<SupervisorSnapshot>({ cwd, busy: false, messages: [] });
  const [tasks, setTasks] = useState<WorkerTask[]>([]);
  const [request, setRequest] = useState('');
  const [provider, setProvider] = useState<'claude' | 'codex'>('claude');
  const [isolated, setIsolated] = useState(false);
  const [showTasks, setShowTasks] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [context, setContext] = useState<Awaited<ReturnType<typeof window.api.agentContext>>>();
  const scroll = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { window.api.agentWorkspaces(cwd).then(result => { setWorkspaces(result.workspaces); if (result.current) setCwd(result.current); }).catch(error => setError(String(error))); }, []);
  useEffect(() => {
    let disposed = false;
    setState({ cwd, busy: false, messages: [] }); setContext(undefined);
    async function refresh() {
      try {
        const [next, tasks] = await Promise.all([window.api.supervisorSnapshot(cwd), window.api.agentTasks()]);
        if (!disposed) { setState(next); setTasks(tasks.filter(t => t.cwd === next.cwd || t.sourceCwd === next.cwd)); }
      } catch (error) { if (!disposed) setError(String(error)); }
    }
    void refresh(); const timer = setInterval(refresh, 800);
    return () => { disposed = true; clearInterval(timer); };
  }, [cwd]);
  const messageVersion = state.messages.map(m => `${m.id}:${m.state}:${m.text.length}:${m.taskIds.length}`).join('|');
  useEffect(() => {
    if (nearBottom.current && scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight;
  }, [messageVersion, showTasks]);
  useEffect(() => {
    const element = scroll.current;
    if (!element) return;
    let frame = 0;
    function report() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const bounds = element!.getBoundingClientRect();
        const anchors = [...element!.querySelectorAll<HTMLElement>('[data-supervisor-message]')].map(node => {
          const rect = node.getBoundingClientRect();
          return { id: node.dataset.supervisorMessage, top: rect.top, left: rect.left, width: rect.width, height: rect.height,
            visible: rect.bottom > bounds.top && rect.top < bounds.bottom };
        });
        window.api.sendToHost('supervisor:anchors', { anchors, width: innerWidth, height: innerHeight });
      });
    }
    report(); const observer = new ResizeObserver(report); observer.observe(element);
    element.addEventListener('scroll', report); window.addEventListener('resize', report);
    return () => { observer.disconnect(); element.removeEventListener('scroll', report); window.removeEventListener('resize', report); cancelAnimationFrame(frame); };
  }, [messageVersion, showTasks]);
  const active = tasks.filter(t => ['queued', 'running'].includes(t.runs.at(-1)?.status || '')).length;
  async function submit() {
    const text = request.trim(); if (!text || sending) return;
    setSending(true); setError('');
    try { await window.api.supervisorSend(cwd, text, provider, isolated); setRequest(''); nearBottom.current = true; setShowTasks(false); input.current?.focus(); }
    catch (error) { setError(String(error)); }
    finally { setSending(false); }
  }
  function taskCard(task: WorkerTask) {
    const status = task.runs.at(-1)?.status || '';
    return <div className="supervisor-task" key={task.id} style={{ '--task-accent': task.provider === 'codex' ? '#2789c3' : '#a576c6' } as React.CSSProperties}>
      <button className="supervisor-task-main" onClick={() => window.api.supervisorTaskOpen(cwd, task.id).catch(error => setError(String(error)))}>
        <span className="supervisor-task-label">{task.provider === 'codex' ? 'Codex' : 'Claude Code'}<span>{task.waitingForPermission ? '需要授权' : task.completed ? '已验收' : taskLabels[status] || '准备中'}</span></span>
        <strong>{task.title}</strong><span className="supervisor-task-link">在画布查看 <ArrowUpRight size={12} /></span>
      </button>
      {!!task.pendingMessages?.length && <small>补充要求排队中 · {task.pendingMessages.length}</small>}
      {['queued', 'running'].includes(status) && <button className="supervisor-task-stop" aria-label={`停止 ${task.title}`} onClick={() => window.api.agentCancel(task.sessionId).catch(error => setError(String(error)))}><Square size={11} />停止</button>}
    </div>;
  }
  return <div className="supervisor-view">
    <header className="supervisor-header"><span className="supervisor-brand"><Layers size={16} /><strong>Super Agent</strong></span>
      <button className={`icon-action ${showTasks ? 'selected' : ''}`} title={showTasks ? '返回对话' : '任务记录'} aria-label="任务记录" onClick={() => setShowTasks(!showTasks)}><Layers size={15} />{active > 0 && <span className="supervisor-count">{active}</span>}</button>
    </header>
    <div className="supervisor-workspace"><Folder size={13} /><select aria-label="工作目录" value={cwd} onChange={e => { setCwd(e.target.value); setError(''); }} title={cwd}>
      {[...new Set([cwd, ...workspaces])].map(path => <option key={path} value={path}>{path.split('/').filter(Boolean).at(-1) || path}</option>)}
    </select><span>{active ? `${active} 项执行中` : '工作空间主管'}</span></div>
    <div className="supervisor-messages" ref={scroll} onScroll={e => { const el = e.currentTarget; nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }}>
      {showTasks ? <div className="supervisor-task-list"><h2>任务记录</h2>{tasks.length ? tasks.map(taskCard) : <p className="supervisor-hint">还没有任务，告诉我你想做什么。</p>}</div> : <>
        {!state.messages.length && <div className="supervisor-welcome"><span className="supervisor-welcome-icon"><Sparkles size={22} strokeWidth={1.4} /></span><h1>想一起完成什么？</h1><p>我会结合当前工作空间安排任务，<br />让 Claude Code 或 Codex 在画布上执行。</p><span>任务执行时，你仍然可以在这里和我交流。</span></div>}
        {state.messages.map(message => message.role === 'event' ? <div key={message.id} className="supervisor-event"><span className="status-dot" />任务状态已更新{message.state === 'pending' ? ' · 正在整理结果' : ''}</div> :
          <article key={message.id} data-supervisor-message={message.id} className={`supervisor-message ${message.role}`}>
            {message.role === 'assistant' && <div className="supervisor-speaker">Super Agent</div>}
            <div className="supervisor-message-text aui-md"><ReactMarkdown>{message.text}</ReactMarkdown></div>
            {message.role === 'user' && message.state === 'pending' && <small>已收到{state.busy ? ' · 正在处理' : ''}</small>}
            {message.state === 'failed' && <small className="supervisor-error">本轮未全部完成，可以继续说明或重试。</small>}
            {[...new Set(message.taskIds)].map(id => tasks.find(t => t.id === id)).filter((t): t is WorkerTask => !!t).map(taskCard)}
          </article>)}
        {state.busy && <div className="supervisor-thinking"><span />主管正在处理消息，执行任务继续运行</div>}
      </>}
    </div>
    <form className="supervisor-composer" onSubmit={e => { e.preventDefault(); void submit(); }}>
      {error && <div className="supervisor-error" role="alert">{error}</div>}
      {context && <details className="supervisor-context" open><summary>当前上下文 · {context.tiles.length} 个 tiles</summary>{context.tiles.map(tile => <div key={tile.id}>{tile.userTitle || tile.filePath || tile.type}</div>)}</details>}
      <div className="supervisor-input-box"><textarea ref={input} rows={2} aria-label="给 Super Agent 发消息" placeholder={active ? '继续提问、补充要求，或安排另一件事…' : '说说你想做什么…'} value={request} onChange={e => setRequest(e.target.value)} onKeyDown={e => {
        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void submit(); }
      }} />
        <div className="supervisor-compose-tools"><button type="button" className="icon-action" title="查看当前 tiles 上下文" aria-label="查看上下文" onClick={() => window.api.agentContext(cwd).then(setContext).catch(error => setError(String(error)))}><Plus size={15} /></button>
          <select aria-label="优先执行器" value={provider} onChange={e => setProvider(e.target.value as 'claude' | 'codex')}><option value="claude">派给 Claude Code</option><option value="codex">派给 Codex</option></select>
          <button className="supervisor-send" type="submit" aria-label="发送消息" disabled={sending || !request.trim()}><ArrowUp size={16} /></button>
        </div>
      </div>
      <div className="supervisor-compose-footer"><span>主管 · Claude</span><label><input type="checkbox" checked={isolated} onChange={e => setIsolated(e.target.checked)} />独立工作目录</label></div>
    </form>
  </div>;
}
