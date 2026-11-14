import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChatMarkdown } from './ChatMarkdown';
import { safeMarkdownHref } from './chat-markdown-links';

test('chat renders GFM structures and fenced code without requiring assistant-ui context', () => {
  const html = renderToStaticMarkup(<ChatMarkdown content={'## 检查结果\n\n| 项目 | 状态 |\n| --- | --- |\n| 首页 | 完成 |\n\n- [x] 已检查\n- 待核对\n\n> 保留布局\n\n```ts\nconst count = 1;\n```'} />);
  expect(html).toContain('<h2>检查结果</h2>');expect(html).toContain('<table>');expect(html).toContain('<td>完成</td>');
  expect(html).toContain('type="checkbox"');expect(html).toContain('<blockquote>');expect(html).toContain('language-ts');
  expect(html).toContain('aria-label="复制代码"');expect(html).toContain('const count = 1;');
});

test('incomplete streamed emphasis, links and code stay readable; final text uses its original syntax', () => {
  for (const [content, expected] of [['检查 **目录结构', '目录结构'], ['查看 [详细结果](https://exam', '详细结果'], ['```ts\nconst partial = 1;', 'const partial = 1;']]) {
    expect(renderToStaticMarkup(<ChatMarkdown content={content!} isStreaming />)).toContain(expected!);
  }
  const completed = renderToStaticMarkup(<ChatMarkdown content={'检查 **目录结构'} />);
  expect(completed).toContain('**目录结构');expect(completed).not.toContain('<strong>');
  const references = renderToStaticMarkup(<ChatMarkdown content={'[查看说明][ref]\n\n[ref]: https://example.com/guide'} />);
  expect(references).toContain('href="https://example.com/guide"');expect(references).toContain('查看说明</a>');
});

test('model-authored URLs and HTML cannot become privileged or executable DOM', () => {
  for (const href of ['javascript:alert(1)', 'data:text/html,test', 'file:///Users/private', '/local/path', 'https:\n//example.com']) expect(safeMarkdownHref(href)).toBeUndefined();
  expect(safeMarkdownHref('https://example.com/docs')).toBe('https://example.com/docs');
  const html = renderToStaticMarkup(<ChatMarkdown content={'[正常](https://example.com) [脚本](javascript:alert) [文件](file:///private)\n\n<script>alert(1)</script><img src="https://example.com/pixel" onerror="alert(1)">'} />);
  expect(html).toContain('target="_blank" rel="noopener noreferrer"');expect(html).not.toContain('href="javascript:');expect(html).not.toContain('href="file:');
  expect(html).not.toContain('<script>');expect(html).not.toContain('<img');expect(html).toContain('&lt;script&gt;');
});
