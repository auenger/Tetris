import { useState, useEffect } from "react";
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { AgentThread } from "./AgentThread";
import {
  useAcpRuntime,
  type ConnectResult,
} from "./use-acp-runtime";

export default function App() {
  const [chats, setChats] = useState<Array<ConnectResult & { initialPrompt?: string; workspaceCwd: string; provider: "claude" | "codex" }>>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const connectResult = chats.find(chat => chat.sessionId === activeId);
  function activate(result: ConnectResult & { initialPrompt?: string }, selected: "claude" | "codex") {
    setChats(current => current.some(chat => chat.sessionId === result.sessionId) ? current.map(chat => chat.sessionId === result.sessionId ? { ...result, workspaceCwd: cwd, provider: selected } : chat) : [...current, { ...result, workspaceCwd: cwd, provider: selected }]);
    setActiveId(result.sessionId);
  }
  const [request, setRequest] = useState("");
  const [routeProvider, setRouteProvider] = useState<"claude" | "codex">("codex");
  const [worktreeDiff, setWorktreeDiff] = useState<{ id: string; text: string } | null>(null);
  const [routeResult, setRouteResult] = useState("");
  const [error, setError] = useState("");
  const [isolated, setIsolated] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [tasks, setTasks] = useState<Awaited<ReturnType<typeof window.api.agentTasks>>>([]);
  const [cwd, setCwd] = useState(new URLSearchParams(window.location.search).get("cwd") || ".");
  const [workspaces, setWorkspaces] = useState<string[]>([]);
  useEffect(() => {
    window.api.agentWorkspaces(cwd).then(result => { setWorkspaces(result.workspaces); if (result.current) setCwd(result.current); }).catch(() => {});
  }, [activeId]);
  useEffect(() => {
    let disposed = false;
    const refresh = () => window.api.agentTasks().then(value => { if (!disposed) setTasks(value); }).catch(() => {});
    void refresh(); const timer = setInterval(refresh, 2000);
    return () => { disposed = true; clearInterval(timer); };
  }, []);
  async function connect(selected: "claude" | "codex", sessionId?: string) {
    setConnecting(true); setError("");
    try {
      if (sessionId && chats.some(chat => chat.sessionId === sessionId)) setActiveId(sessionId);
      else activate(await window.api.agentSpawn(cwd, selected, sessionId, !sessionId && isolated), selected);
    }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setConnecting(false); }
  }
  return <div className="h-full">
    {chats.map(chat => <div key={`${chat.sessionId}:${chat.background ? "monitor" : "chat"}`} className="h-full" style={{ display: activeId === chat.sessionId ? "block" : "none" }}>
      <ConnectedChat connectResult={chat} provider={chat.provider} cwd={chat.workspaceCwd} onHandoff={activate} onBack={() => setActiveId(null)} />
    </div>)}
    {!connectResult && <div className="flex h-full flex-col gap-4 overflow-auto p-4 text-sm">
    <h1 className="font-semibold">Super Agent</h1>
    <label className="text-xs text-muted-foreground">工作目录
      <select className="mt-1 w-full rounded border bg-transparent p-2 text-sm" value={cwd} aria-label="工作目录" disabled={connecting} onChange={event => { setCwd(event.target.value); setWorktreeDiff(null); setRouteResult(""); }}>
        {[...new Set([cwd, ...workspaces])].map(path => <option key={path} value={path}>{path}</option>)}
      </select>
    </label>
    <form className="space-y-2" onSubmit={async event => {
      event.preventDefault(); if (connecting || !request.trim()) return;
      setConnecting(true); setError(""); setRouteResult("");
      try {
        const result = await window.api.agentRoute(cwd, request, routeProvider, isolated);
        setRouteResult(result.reason);
        if (result.connection && result.provider) { activate(result.connection, result.provider); setRequest(""); }
      } catch (error) { setError(String(error)); }
      finally { setConnecting(false); }
    }}>
      <textarea className="w-full rounded border bg-transparent p-2" rows={3} aria-label="工作要求" placeholder="描述新工作，或补充、停止已有任务…" value={request} onChange={event => setRequest(event.target.value)} />
      <div className="flex items-center gap-2">
        <select className="rounded border bg-transparent p-2" aria-label="新任务执行器" value={routeProvider} onChange={event => setRouteProvider(event.target.value as "claude" | "codex")}><option value="codex">Codex</option><option value="claude">Claude Code</option></select>
        <button className="rounded border px-3 py-2" disabled={connecting || !request.trim()}>安排工作</button>
      </div>
      <p className="text-xs text-muted-foreground">自动判断新建或跟进已有任务；不确定时会询问。路由使用本机 Codex。</p>
      {routeResult && <p role="status">{routeResult}</p>}
    </form>
    <p className="text-xs text-muted-foreground">也可以直接打开执行会话：</p>
    <label className="flex gap-2"><input type="checkbox" checked={isolated} onChange={event => setIsolated(event.target.checked)} />独立 worktree（基于已提交版本）</label>
    <div className="flex gap-2">
      <button className="rounded border px-3 py-2" disabled={connecting} onClick={() => connect("claude")}>Claude Code</button>
      <button className="rounded border px-3 py-2" disabled={connecting} onClick={() => connect("codex")}>Codex</button>
    </div>
    {connecting && <p role="status">正在连接…</p>}
    {error && <p role="alert" className="text-destructive">{error}</p>}
    <div className="space-y-3" aria-label="任务总览">
    {tasks.filter(t => t.cwd === cwd || t.sourceCwd === cwd).map(task => {
      const run = task.runs.at(-1);
      const status: Record<string, string> = { queued: "排队中", running: "执行中", ready_for_review: "待验收", failed: "失败", cancelled: "已取消", interrupted: "已中断" };
      const parent = tasks.find(parent => parent.id === task.parentTaskId);
      return <div key={task.id} className="rounded border-l-4 border p-3" style={{ marginLeft: parent ? 16 : 0, borderLeftColor: task.provider === "codex" ? "#2789c3" : "#a576c6" }}>
        {parent && <div className="mb-1 text-xs text-muted-foreground">↳ 检查：{parent.title}</div>}
        <button disabled={connecting || task.archived} className="text-left" onClick={() => connect(task.provider || "claude", task.sessionId)}>
          <div>{task.title}</div><div className="text-xs text-muted-foreground">{task.provider || "claude"} · {task.archived ? "目录已清理" : task.completed ? "已验收" : status[run?.status || ""] || "未开始"} · {task.branch || "当前目录"}</div>
        </button>
        {!!task.pendingMessages?.length && <div className="text-xs">{task.pendingMessages.length} 条补充要求待处理</div>}
        {run?.handoff && <div className="mt-1 text-xs">检查交接：{run.handoff.provider} · {run.handoff.status}{run.handoff.error ? ` · ${run.handoff.error}` : ""}</div>}
        {task.branch && !task.archived && <div className="mt-2 flex flex-wrap gap-3 text-xs">
          <button className="underline" onClick={async () => {
            try { const result = await window.api.agentWorktree(task.id, "inspect"); setWorktreeDiff({ id: task.id, text: `${result.status || "干净工作目录"}\n${result.diff || "没有已跟踪文件差异"}` }); }
            catch (error) { setError(String(error)); }
          }}>查看变更</button>
          {worktreeDiff?.id === task.id && <>
            <button className="underline" onClick={() => window.api.agentWorktree(task.id, "integrate").then(result => setRouteResult(`已快进集成 ${result.commit}`)).catch(error => setError(String(error)))}>快进集成已提交变更</button>
            <button className="underline" onClick={() => window.api.agentWorktree(task.id, "remove").then(() => { setWorktreeDiff(null); setRouteResult("已清理工作目录，保留分支和任务历史。"); }).catch(error => setError(String(error)))}>清理已集成目录</button>
          </>}
        </div>}
        {worktreeDiff?.id === task.id && <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-xs">{worktreeDiff.text}</pre>}
        <div className="mt-2 flex gap-3 text-xs">
          {run?.artifactPath && <button className="underline" onClick={() => window.api.agentArtifactOpen(run.id).catch(error => setError(String(error)))}>打开报告</button>}
          {(run?.status === "running" || run?.status === "queued") && <button className="underline" onClick={() => window.api.agentCancel(task.sessionId).catch(error => setError(String(error)))}>停止</button>}
        </div>
      </div>;
    })}
    </div>
    </div>}
  </div>;
}

function ConnectedChat({
  connectResult, provider, onBack, onHandoff, cwd,
}: {
  connectResult: ConnectResult & { initialPrompt?: string };
  onHandoff: (result: ConnectResult & { initialPrompt?: string }, provider: "claude" | "codex") => void;
  provider: "claude" | "codex";
  onBack: () => void;
  cwd: string;
}) {
  const { runtime, ready } = useAcpRuntime(connectResult);

  const [permissions, setPermissions] = useState<Awaited<ReturnType<typeof window.api.agentPermissions>>>([]);
  const [permissionError, setPermissionError] = useState("");
  useEffect(() => {
    if (connectResult.initialPrompt) runtime.thread.composer.setText(connectResult.initialPrompt);
  }, [connectResult.initialPrompt, runtime]);
  const [context, setContext] = useState<Awaited<ReturnType<typeof window.api.agentContext>> | null>(null);
  const [reportRunId, setReportRunId] = useState("");
  const refreshContext = () => window.api.agentContext(cwd).then(setContext).catch(error => setPermissionError(String(error)));
  useEffect(() => { void refreshContext(); }, [cwd]);
  const [executionCwd, setExecutionCwd] = useState("");
  const [taskId, setTaskId] = useState("");
  const [review, setReview] = useState(false);
  const [liveOutput, setLiveOutput] = useState("");
  const [taskStatus, setTaskStatus] = useState("");
  useEffect(() => {
    let disposed = false;
    const refresh = async () => {
      try {
        const [tasks, pending] = await Promise.all([window.api.agentTasks(), window.api.agentPermissions(connectResult.sessionId)]);
        if (!disposed) setPermissions(pending);
        const task = tasks.find(t => t.sessionId === connectResult.sessionId);
        if (!disposed) { setTaskId(task?.id || ""); setExecutionCwd(task?.cwd || ""); }
        const run = task?.runs.at(-1);
        if (!disposed) { setReportRunId(run?.artifactPath ? run.id : ""); setLiveOutput(run?.output || "等待执行输出…"); }
        const labels: Record<string, string> = {
          queued: "排队中", running: "执行中", ready_for_review: "本轮结束 · 待验收",
          cancelled: "已取消", failed: "执行失败", interrupted: "执行已中断",
        };
        if (!disposed) setTaskStatus(task?.completed ? "已验收" : run ? labels[run.status] || run.status : "尚未开始任务");
      } catch { if (!disposed) setTaskStatus("任务记录暂不可用"); }
    };
    void refresh();
    const timer = setInterval(refresh, 2000);
    return () => { disposed = true; clearInterval(timer); };
  }, [connectResult.sessionId]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b px-4 py-2 text-xs text-muted-foreground" role="status">
        <button className="mb-2 underline" onClick={onBack}>返回任务列表</button>
        <div>Super Agent · {provider === "codex" ? "Codex" : "Claude"} · {taskStatus}</div>
        {taskStatus === "本轮结束 · 待验收" && <button className="my-2 underline" onClick={() => {
          window.api.agentTaskComplete(taskId).then(() => setTaskStatus("已验收")).catch(error => setTaskStatus(String(error)));
        }}>确认验收</button>}
        {taskStatus === "本轮结束 · 待验收" && <button className="ml-3 underline" onClick={async () => {
          const nextProvider = provider === "codex" ? "claude" : "codex";
          try { onHandoff(await window.api.agentHandoff(taskId, nextProvider), nextProvider); }
          catch (error) { setPermissionError(String(error)); }
        }}>交给 {provider === "codex" ? "Claude" : "Codex"} 检查</button>}
        {permissionError && <p role="alert">{permissionError}</p>}
        {!connectResult.background && <label className="my-2 flex gap-2"><input type="checkbox" checked={review} disabled={taskStatus === "执行中" || taskStatus === "排队中"} onChange={async event => {
          const checked = event.target.checked;
          try { await window.api.agentReviewProvider(connectResult.sessionId, checked ? (provider === "codex" ? "claude" : "codex") : undefined); setReview(checked); }
          catch (error) { setPermissionError(String(error)); }
        }} />本轮完成后自动交给 {provider === "codex" ? "Claude" : "Codex"} 检查</label>}
        {executionCwd && <div className="break-all">执行目录：{executionCwd}</div>}
        <div className="mt-2 flex flex-wrap gap-3">
          <button className="underline" onClick={refreshContext}>读取当前选择</button>
          {taskId && <button className="underline" onClick={() => window.api.agentTaskFocus(taskId).catch(error => setPermissionError(String(error)))}>定位关联 tiles</button>}
          {reportRunId && <button className="underline" onClick={() => window.api.agentArtifactOpen(reportRunId).catch(error => setPermissionError(String(error)))}>在画布打开报告</button>}
        </div>
        {!connectResult.background && liveOutput && <details className="mt-2"><summary>最近执行记录（包含后台跟进）</summary><pre className="max-h-40 overflow-auto whitespace-pre-wrap">{liveOutput}</pre></details>}
        {context && <details className="mt-2"><summary>上下文预览 · {context.tiles.length} 个 tiles{context.groups.length ? ` · ${context.groups.map(group => group.name).join("、")}` : ""}</summary>
          {context.tiles.map(tile => <div key={tile.id} className="break-all">{tile.userTitle || tile.filePath || `${tile.type} · ${tile.id}`}</div>)}
          <div>发送时读取最新选择；未选择时使用聚焦窗口或当前目录。</div>
        </details>}
      </div>
      {permissions.length > 0 && <div className="max-h-64 overflow-auto border-b p-4 text-sm">
        <div className="font-semibold">等待操作授权</div>
        {permissions.map(request => <div key={request.id} className="mt-3">
          <div>{request.title}</div>
          <pre className="my-2 max-h-24 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(request.input, null, 2)}</pre>
          <div className="flex flex-wrap gap-2">{request.options.filter(option => option.kind === "allow_once" || option.kind === "reject_once").map(option =>
            <button key={option.optionId} className="rounded border px-2 py-1" onClick={async () => {
              try { await window.api.agentPermissionAnswer(connectResult.sessionId, request.id, option.optionId); setPermissions(current => current.filter(p => p.id !== request.id)); setPermissionError(""); }
              catch (error) { setPermissionError(String(error)); }
            }}>{option.name}</button>)}
            <button className="rounded border px-2 py-1" onClick={() => window.api.agentPermissionAnswer(connectResult.sessionId, request.id).then(() => setPermissions(current => current.filter(p => p.id !== request.id))).catch(error => setPermissionError(String(error)))}>取消操作</button>
          </div>
        </div>)}
        {permissionError && <p role="alert">{permissionError}</p>}
      </div>}
      <div className="min-h-0 flex-1">
        {connectResult.background ? <div className="h-full overflow-auto p-4 text-sm">
          <pre className="whitespace-pre-wrap">{liveOutput}</pre>
          {taskStatus !== "执行中" && taskStatus !== "排队中" && <button className="mt-3 underline" onClick={async () => {
            try { onHandoff(await window.api.agentSpawn(cwd, provider, connectResult.sessionId), provider); }
            catch (error) { setPermissionError(String(error)); }
          }}>继续对话</button>}
        </div> : <AssistantRuntimeProvider runtime={runtime}>
          <AgentThread ready={ready} />
        </AssistantRuntimeProvider>}
      </div>
    </div>
  );
}
