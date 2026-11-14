import { Children, isValidElement, memo, useEffect, useRef, useState, type ComponentPropsWithoutRef, type ReactElement, type ReactNode } from 'react';
import { defaultRehypePlugins, Streamdown, type Components, type ExtraProps } from 'streamdown';
import remarkGfm from 'remark-gfm';
import { safeMarkdownHref } from './chat-markdown-links';
import { chatMarkdownBlocks } from './chat-markdown-blocks';
import './chat-markdown.css';

export interface ChatMarkdownProps { content: string; isStreaming?: boolean; className?: string; }

function plainText(value: ReactNode): string {
  return Children.toArray(value).map(child => typeof child === 'string' || typeof child === 'number' ? String(child)
    : isValidElement<{ children?: ReactNode }>(child) ? plainText(child.props.children) : '').join('');
}

function CodeBlock({ children }: { children?: ReactNode } & ExtraProps) {
  const child = Children.toArray(children).find(isValidElement) as ReactElement<{ children?: ReactNode; className?: string }> | undefined;
  const content = plainText(child?.props.children ?? children).replace(/\n$/, '');
  const language = /(?:^|\s)language-([^\s]+)/.exec(child?.props.className || '')?.[1] || '代码';
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const reset = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(reset.current), []);
  async function copy() {
    try { await navigator.clipboard.writeText(content); setCopyState('copied'); }
    catch { setCopyState('failed'); }
    clearTimeout(reset.current); reset.current = setTimeout(() => setCopyState('idle'), 1800);
  }
  return <section className="chat-markdown-code" aria-label={`${language} 代码块`}>
    <header><span>{language}</span><button type="button" onClick={() => void copy()} aria-label="复制代码">
      {copyState === 'copied' ? '已复制' : copyState === 'failed' ? '复制失败' : '复制'}
    </button></header>
    <pre tabIndex={0}><code className={child?.props.className}>{content}</code></pre>
  </section>;
}

// Stable module-level references let Streamdown retain parsed, completed blocks.
const remarkPlugins = [[remarkGfm, { singleTilde: false }]] as NonNullable<ComponentPropsWithoutRef<typeof Streamdown>['remarkPlugins']>;
// No raw-HTML parser: model-authored tags stay inert text. Links are checked below.
const rehypePlugins = [defaultRehypePlugins['sanitize']!] as NonNullable<ComponentPropsWithoutRef<typeof Streamdown>['rehypePlugins']>;
const components: Components = {
  p:'p', strong:'strong', em:'em', del:'del', blockquote:'blockquote', ul:'ul', ol:'ol', li:'li',
  h1:'h1', h2:'h2', h3:'h3', h4:'h4', h5:'h5', h6:'h6', hr:'hr',
  thead:'thead', tbody:'tbody', tr:'tr', th:'th', td:'td',
  pre: CodeBlock,
  code: ({ children, className }) => <code className={className}>{children}</code>,
  a: ({ children, href, title }) => {
    const safe = safeMarkdownHref(href);
    return safe ? <a href={safe} target="_blank" rel="noopener noreferrer" title={title}>{children}</a> : <span>{children}</span>;
  },
  img: ({ alt, src }) => {
    const safe = typeof src === 'string' ? safeMarkdownHref(src) : undefined;
    return safe ? <a href={safe} target="_blank" rel="noopener noreferrer">{alt || '查看图片'}</a> : <span>{alt || ''}</span>;
  },
  table: ({ children }) => <div className="chat-markdown-table" role="region" aria-label="表格" tabIndex={0}><table>{children}</table></div>,
};

/** Same block tree during and after streaming: completed text never gets replaced by a loading fallback. */
export const ChatMarkdown = memo(function ChatMarkdown({ content, isStreaming = false, className }: ChatMarkdownProps) {
  return <Streamdown
    className={`chat-markdown${className ? ` ${className}` : ''}`}
    mode="streaming" parseIncompleteMarkdown={isStreaming} isAnimating={isStreaming}
    animated={false} controls={false} components={components} remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins}
    parseMarkdownIntoBlocksFn={chatMarkdownBlocks}
    skipHtml urlTransform={safeMarkdownHref}
  >{content}</Streamdown>;
}, (previous, next) => previous.content === next.content && !!previous.isStreaming === !!next.isStreaming && previous.className === next.className);
