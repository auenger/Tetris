import { useMemo, useState } from 'react';
import { Archive, ArrowLeft, RotateCcw, Search } from 'lucide-react';

type Conversation = Awaited<ReturnType<typeof window.api.supervisorConversations>>[number];

export function ConversationArchive({ conversations, onOpen, onRestore, onClose }: {
  conversations: Conversation[];
  onOpen(id: string): void;
  onRestore(id: string): Promise<void>;
  onClose(): void;
}) {
  const [query, setQuery] = useState('');
  const [restoring, setRestoring] = useState<string | null>(null);
  const [error, setError] = useState('');
  const archived = useMemo(() => conversations.filter(item => item.archivedAt)
    .sort((a, b) => (b.archivedAt || '').localeCompare(a.archivedAt || '')), [conversations]);
  const matches = archived.filter(item => item.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return <section className="conversation-archive" aria-label="归档记录">
    <div className="conversation-archive-heading">
      <button type="button" className="icon-action" aria-label="返回对话" title="返回对话" onClick={onClose}><ArrowLeft size={16} /></button>
      <h2>归档记录</h2><span>{archived.length} 个对话</span>
    </div>
    <p className="conversation-archive-description">归档保留对话和任务。恢复后，可以接着原来的内容继续聊。</p>
    <label className="conversation-archive-search"><Search size={15} /><input autoFocus type="search" value={query} onChange={event => setQuery(event.target.value)} aria-label="搜索归档对话" placeholder="搜索对话标题" /></label>
    {error && <p className="supervisor-error" role="alert">{error}</p>}
    {matches.length ? <ul className="conversation-archive-list">{matches.map(item => <li key={item.id}>
      <button type="button" className="conversation-archive-open" onClick={() => onOpen(item.id)} title={item.title}>
        <strong>{item.title || '未命名对话'}{!!item.unread && <span className="conversation-unread" aria-label={`${item.unread} 条未读`}>{item.unread}</span>}</strong>
        <span>归档于 {new Date(item.archivedAt!).toLocaleString('zh-CN', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
      </button>
      <button type="button" className="conversation-restore" disabled={restoring !== null} aria-label={`恢复 ${item.title}`} onClick={async () => {
        setRestoring(item.id); setError('');
        try { await onRestore(item.id); }
        catch (error) { setError(String(error)); }
        finally { setRestoring(null); }
      }}><RotateCcw size={13} />{restoring === item.id ? '恢复中…' : '恢复'}</button>
    </li>)}</ul> : <div className="conversation-archive-empty"><Archive size={24} strokeWidth={1.4} /><strong>{query ? '没有匹配的归档对话' : '还没有归档对话'}</strong><p>{query ? '试试其他标题关键词。' : '归档后的对话会保留在这里，随时可以找回。'}</p></div>}
  </section>;
}
