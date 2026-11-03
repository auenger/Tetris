import type { Icon } from "@phosphor-icons/react";
import {
  Terminal,
  Browser,
  ChartLineUp,
  Note,
  Code,
  Image,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import "./App.css";

type TileType = "term" | "note" | "code" | "image" | "graph" | "browser";

interface AgentSession {
  agent:string; status:string; tool:string; started:number; activeSince:number; runningMs:number; waitingSince:number; completedAt:number; unread:boolean;
}
const duration=(start:number,now:number)=>start?`${Math.max(0,Math.floor((now-start)/60000))}m ${Math.max(0,Math.floor((now-start)/1000))%60}s`:'—';
const statusLabel=(s:AgentSession)=>s.status==='attention'?'待处理':s.status==='working'?'进行中':s.status==='done'?(s.unread?'完成未读':'本轮回复完成'):s.status==='idle'?'已中断':'状态未知';
const activityTime=(s:AgentSession,now:number)=>s.status==='attention'?`等待 ${duration(s.waitingSince,now)}`:s.status==='working'?`运行 ${duration(now-(s.runningMs||0)-(s.activeSince?now-s.activeSince:0),now)}`:s.status==='done'&&s.completedAt?`${duration(s.completedAt,now)} 前结束`:'';
function detail(entry:TileEntry,now:number){const s=entry.agentSession;if(!s)return entry.description;
 return [s.agent,entry.description,s.tool,activityTime(s,now)].filter(Boolean).join(' · ');
}
interface TileEntry {
  id: string;
  type: TileType;
  title: string;
  description: string;
  agentSession?: AgentSession | null;
  status: "running" | "exited" | "idle" | null;
}

function isTileEntry(value: unknown): value is TileEntry {
  if (!value || typeof value !== "object") return false;
  const e = value as Record<string, unknown>;
  return (
    typeof e.id === "string" &&
    typeof e.type === "string" &&
    typeof e.title === "string" &&
    typeof e.description === "string"
  );
}

const TYPE_ICONS: Record<TileType, { icon: Icon; color: string }> = {
  term: { icon: Terminal, color: "#7aab6e" },
  browser: { icon: Browser, color: "#5c9bcf" },
  graph: { icon: ChartLineUp, color: "#c8a35a" },
  note: { icon: Note, color: "#8a7aab" },
  code: { icon: Code, color: "#7a8aab" },
  image: { icon: Image, color: "#c07a6e" },
};

function TileEntryRow({
  entry,
  now,
  focused,
  isRenaming,
  renameValue,
  onClick,
  onDoubleClick,
  onContextMenu,
  onRenameChange,
  onRenameConfirm,
  onRenameCancel,
}: {
  entry: TileEntry;
  now: number;
  focused: boolean;
  isRenaming: boolean;
  renameValue: string;
  onClick: () => void;
  onDoubleClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onRenameChange: (value: string) => void;
  onRenameConfirm: () => void;
  onRenameCancel: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isRenaming) {
      inputRef.current?.select();
    }
  }, [isRenaming]);

  return (
    <div
      className={`tile-entry${focused ? " focused" : ""} ${entry.agentSession?.status||''}`}
      data-tile-id={entry.id} role="button" tabIndex={0} aria-label={`${entry.title} ${entry.agentSession?statusLabel(entry.agentSession):''}`}
      title={detail(entry,now)}
      onKeyDown={e=>{if(e.target!==e.currentTarget)return;if(e.key==='Enter'||e.key===' '){e.preventDefault();onDoubleClick();}}}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
    >
      <div className="tile-icon">
        {(() => {
          const def = TYPE_ICONS[entry.type];
          const IconComp = def?.icon ?? Terminal;
          const color = def?.color ?? "#7a8aab";
          return <IconComp size={14} weight="regular" style={{ color }} />;
        })()}
      </div>
      {isRenaming ? (
        <input
          ref={inputRef}
          className="tile-rename-input"
          value={renameValue}
          onChange={(e) => onRenameChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onRenameConfirm();
            } else if (e.key === "Escape") {
              e.preventDefault();
              onRenameCancel();
            }
          }}
          onBlur={onRenameConfirm}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <div className="tile-copy">
          <div className="tile-title-line"><div className="tile-title">{entry.title}</div>
            {(entry.agentSession||entry.type==='term')&&<span className={`tile-status ${entry.agentSession?.status||'unknown'}`}>
              {entry.agentSession?statusLabel(entry.agentSession):'状态未知'}
            </span>}
          </div>
          <div className="tile-detail"><span className="tile-detail-text">{entry.agentSession?[entry.agentSession.agent,entry.agentSession.tool].filter(Boolean).join(' · '):entry.description}</span>
            {entry.agentSession&&<span className="tile-time">{activityTime(entry.agentSession,now)}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

function App() {
  const [filter,setFilter]=useState('all');
  const [now,setNow]=useState(Date.now());
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return ()=>clearInterval(timer);},[]);
  const [entries, setEntries] = useState<TileEntry[]>([]);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  useEffect(() => {
    const cleanup = window.api.onTileListMessage(
      (channel: string, ...args: unknown[]) => {
        if (channel === "tile-list:init") {
          const tiles = Array.isArray(args[0])
            ? args[0].filter(isTileEntry)
            : [];
          setEntries(tiles);
        } else if (channel === "tile-list:add") {
          const tile = args[0];
          if (!isTileEntry(tile)) return;
          setEntries((prev) => [
            ...prev.filter((e) => e.id !== tile.id),
            tile,
          ]);
        } else if (channel === "tile-list:remove") {
          const id = args[0] as string;
          setEntries((prev) => prev.filter((e) => e.id !== id));
        } else if (channel === "tile-list:update") {
          const tile = args[0];
          if (!isTileEntry(tile)) return;
          setEntries((prev) =>
            prev.map((e) => (e.id === tile.id ? tile : e)),
          );
        } else if (channel === "tile-list:focus") {
          setFocusedId(args[0] as string | null);
        }
      },
    );

    return () => {
      cleanup();
    };
  }, []);

  const handleClick = useCallback((id: string) => {
    setFocusedId(id);
    window.api.sendToHost("tile-list:peek-tile", id);
  }, []);

  const handleDoubleClick = useCallback((id: string) => {
    setFocusedId(id);
    window.api.sendToHost("tile-list:focus-tile", id);
  }, []);

  const handleContextMenu = useCallback(
    async (id: string, e: React.MouseEvent) => {
      e.preventDefault();
      const selected = await window.api.showContextMenu([
        { id: "rename", label: "Rename" },
      ]);
      if (selected === "rename") {
        const entry = entries.find((en) => en.id === id);
        if (entry) {
          setRenameValue(entry.title);
          setRenamingId(id);
        }
      }
    },
    [entries],
  );

  const commitRename = useCallback(
    (id: string) => {
      const trimmed = renameValue.trim();
      window.api.sendToHost("tile-list:rename-tile", id, trimmed);
      setRenamingId(null);
      setRenameValue("");
    },
    [renameValue],
  );

  const cancelRename = useCallback(() => {
    setRenamingId(null);
    setRenameValue("");
  }, []);

  const matches=(entry:TileEntry,key:string)=>key==='all'||(key==='done'?entry.agentSession?.status==='done'&&entry.agentSession.unread:entry.agentSession?.status===key);
  const rank=(entry:TileEntry)=>entry.agentSession?.status==='attention'?0:entry.agentSession?.status==='done'&&entry.agentSession.unread?1:entry.agentSession?.status==='working'?2:3;
  const visibleEntries=entries.filter(entry=>matches(entry,filter)).sort((a,b)=>rank(a)-rank(b)||(a.agentSession?.status==='attention'&&b.agentSession?.status==='attention'?a.agentSession.waitingSince-b.agentSession.waitingSince:0));
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (renamingId || (e.target instanceof Element && e.target.closest('.tile-filters'))) return;
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      if (visibleEntries.length === 0) return;
      e.preventDefault();
      const dir = e.key === "ArrowUp" ? -1 : 1;
      const currentIdx = visibleEntries.findIndex((entry) => entry.id === focusedId);
      const nextIdx =
        currentIdx < 0
          ? 0
          : (currentIdx + dir + visibleEntries.length) % visibleEntries.length;
      const next=visibleEntries[nextIdx];if(next){handleClick(next.id);Array.from(document.querySelectorAll<HTMLElement>('[data-tile-id]')).find(el=>el.dataset.tileId===next.id)?.focus();}
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [visibleEntries, focusedId, handleClick, renamingId]);

  return (
    <div className="tile-list">
      <div className="tile-filters" role="group" aria-label="按 Agent 状态筛选">
        {([['all','全部'],['attention','待处理'],['working','进行中'],['done','新完成']] as const).map(([key,label])=>
          <button type="button" key={key} aria-pressed={filter===key} onClick={()=>setFilter(key)}>{label} <span>{entries.filter(entry=>matches(entry,key)).length}</span></button>)}
      </div>
      {visibleEntries.map((entry) => (
        <TileEntryRow
          key={entry.id}
          entry={entry}
          now={now}
          focused={entry.id === focusedId}
          isRenaming={entry.id === renamingId}
          renameValue={entry.id === renamingId ? renameValue : ""}
          onClick={() => handleClick(entry.id)}
          onDoubleClick={() => handleDoubleClick(entry.id)}
          onContextMenu={(e) => handleContextMenu(entry.id, e)}
          onRenameChange={setRenameValue}
          onRenameConfirm={() => commitRename(entry.id)}
          onRenameCancel={cancelRename}
        />
      ))}
      {visibleEntries.length === 0 && (
        <div className="tile-empty">
          {entries.length?"没有符合此状态的任务":"No tiles on canvas"}
        </div>
      )}
    </div>
  );
}

export default App;
