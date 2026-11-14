/** Markdown is display data: never turn model output into an App/file URL. */
export function safeMarkdownHref(value: string | undefined): string | undefined {
  if (!value || /[\u0000-\u0020\u007f]/.test(value)) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' || url.protocol === 'http:') return url.href;
    if (url.protocol === 'mailto:' && url.pathname) return url.href;
  } catch { /* Relative/incomplete destinations remain readable text. */ }
  return undefined;
}
