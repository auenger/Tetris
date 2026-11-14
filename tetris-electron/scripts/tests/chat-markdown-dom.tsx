import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { ChatMarkdown } from '../../src/windows/agent-chat/src/ChatMarkdown';
const root = createRoot(document.getElementById('root')!);
Object.assign(window, {
  renderMarkdown(content: string, isStreaming: boolean) {
    flushSync(() => root.render(<ChatMarkdown content={content} isStreaming={isStreaming} />));
  },
});
Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text: string) => { Object.assign(window, { copiedMarkdownCode: text }); } } });
