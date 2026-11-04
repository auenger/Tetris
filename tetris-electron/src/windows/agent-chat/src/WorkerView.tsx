import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Square, FileText, Check, Terminal, LoaderCircle } from 'lucide-react';

export type WorkerTask = Awaited<ReturnType<typeof window.api.agentTasks>>[number];
export const taskLabels: Record<string, string> = { queued: '排队中', running: '执行中', ready_for_review: '待验收', cancelled: '已停止', failed: '失败', interrupted: '已中断' };

export function WorkerView({ sessionId }: { sessionId: string }) {
  const [task, setTask] = useState<WorkerTask>();
  const [pending, setPending] = useState<Awaited<ReturnType<typeof window.api.agentPermissions>>>([]);
  const [error, setError] = useState('');
  const [diff, setDiff] = useState<string | null>(null);
  useEffect(() => {
    let disposed = false;
    async function refresh() {
      try {
        const [tasks, permissions] = await Promise.all([window.api.agentTasks(), window.api.agentPermissions(sessionId)]);
        if (!disposed) { setTask(tasks.find(t => t.sessionId === sessionId)); setPending(permissions); }
      } catch (error) { if (!disposed) setError(String(error)); }
    }
    void refresh(); const timer = setInterval(refresh, 1000);
    return () => { disposed = true; clearInterval(timer); };
  }, [sessionId]);
  const run = task?.runs.at(-1);
  const active = run?.status === 'running' || run?.status === 'queued';
  const act = (action: () => Promise<unknown>) => { setError(''); void action().catch(error => setError(String(error))); };
  return <div className="worker-view">
    <header className="worker-header">
      <div className="worker-status"><span className={`status-dot ${pending.length ? 'waiting' : active ? 'active' : ''}`} />{pending.length ? '等待授权' : task?.completed ? '已验收' : taskLabels[run?.status || ''] || '准备执行'}</div>
      <span>{task?.provider === 'codex' ? 'Codex' : 'Claude Code'}</span>
      {active && <button className="icon-action" title="停止任务" aria-label="停止任务" onClick={() => act(() => window.api.agentCancel(sessionId))}><Square size={13} /></button>}
    </header>
    <div className="worker-body">
      <div className="worker-directory" title={task?.cwd}>{task?.cwd}</div>
      {error && <p className="supervisor-error" role="alert">{error}</p>}
      {pending.map(permission => <section className="worker-permission" key={permission.id}>
        <strong>需要你的授权</strong><p>{permission.title}</p>
        <details><summary>操作详情</summary><pre>{JSON.stringify(permission.input, null, 2)}</pre></details>
        <div className="worker-actions">{permission.options.filter(o => o.kind === 'allow_once' || o.kind === 'reject_once').map(option =>
          <button key={option.optionId} onClick={() => act(() => window.api.agentPermissionAnswer(sessionId, permission.id, option.optionId))}>{option.kind === 'allow_once' ? '允许这一次' : '拒绝'}</button>)}
          <button onClick={() => act(() => window.api.agentPermissionAnswer(sessionId, permission.id))}>取消</button>
        </div>
      </section>)}
      {run?.activity?.map(item => <details className="worker-tool" key={item.id}>
        <summary>{item.status === 'completed' ? <Check size={12} /> : <Terminal size={12} />}<span>{item.title}</span><small>{item.status === 'completed' ? '完成' : item.status === 'failed' ? '失败' : '执行'}</small></summary>
        <pre>{item.detail || '没有附加输出'}</pre>
      </details>)}
      {run?.output ? <div className="aui-md worker-output"><ReactMarkdown>{run.output}</ReactMarkdown></div> : <div className="worker-empty">{active ? <><LoaderCircle size={16} className="supervisor-spin" />正在执行，可以继续与 Super Agent 对话。</> : '等待执行器接收任务…'}</div>}
      {run?.detail && !active && run.status !== 'ready_for_review' && <p className="supervisor-error">{run.detail}</p>}
      {!!task?.pendingMessages?.length && <div className="worker-queue">{task.pendingMessages.length} 条补充要求已排队，将在当前轮次结束后处理。</div>}
      {task?.branch && <details className="worker-tools"><summary>独立工作目录 · {task.branch}</summary>
        <button onClick={() => act(async () => { const result = await window.api.agentWorktree(task.id, 'inspect'); setDiff(`${result.status}\n${result.diff}`); })}>查看变更</button>
        {diff !== null && <><pre>{diff}</pre><div className="worker-actions">
          <button onClick={() => act(() => window.api.agentWorktree(task.id, 'integrate'))}>快进集成已提交变更</button>
          <button onClick={() => act(() => window.api.agentWorktree(task.id, 'remove'))}>清理已集成目录</button>
        </div></>}
      </details>}
    </div>
    <footer className="worker-footer">
      <span>由 Super Agent 派发</span>
      {run?.artifactPath && <button onClick={() => act(() => window.api.agentArtifactOpen(run.id))}><FileText size={13} />报告</button>}
      {task && run?.status === 'ready_for_review' && !task.completed && <button onClick={() => act(() => window.api.agentTaskComplete(task.id))}><Check size={13} />验收</button>}
    </footer>
  </div>;
}
