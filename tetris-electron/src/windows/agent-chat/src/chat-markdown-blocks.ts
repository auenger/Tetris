import { parseMarkdownIntoBlocks } from 'streamdown';

/** Reference definitions affect earlier paragraphs, so they require document context. */
export function chatMarkdownBlocks(content: string): string[] {
  if (/^ {0,3}\[(?:\\[^\r\n]|[^\]\\\r\n])+\]:/m.test(content)) return [content];
  return parseMarkdownIntoBlocks(content);
}
