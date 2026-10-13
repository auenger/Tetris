export type TerminalClipboard = { kind: "image" } | { kind: "text"; text: string };

// Keep image bytes in the OS clipboard. Ctrl+V asks the foreground agent to
// consume them through its native clipboard integration; no files or base64.
export function createTerminalPaste(options: {
  readClipboard: () => Promise<TerminalClipboard>;
  pasteText: (text: string) => void;
  pasteImage: () => void;
  onError?: (error: unknown) => void;
}) {
  let disposed = false;
  let queue = Promise.resolve();
  const paste = () => {
    queue = queue.then(async () => {
      if (disposed) return;
      const content = await options.readClipboard();
      if (disposed) return;
      if (content.kind === "image") options.pasteImage();
      else if (content.text) options.pasteText(content.text);
    }).catch(error => options.onError?.(error));
    return queue;
  };
  return { paste, dispose() { disposed = true; } };
}

export function isTerminalPasteShortcut(e: KeyboardEvent, isMac: boolean): boolean {
  if (e.altKey) return false;
  return (e.key.toLowerCase() === "v" && (isMac ? e.metaKey && !e.ctrlKey : e.ctrlKey)) ||
    (e.key === "Insert" && e.shiftKey && !e.ctrlKey && !e.metaKey);
}
