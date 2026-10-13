interface NativeClipboard {
  readImage(): { isEmpty(): boolean };
  readText(): string;
  read(format: string): string;
}

export function readTerminalClipboard(clipboard: NativeClipboard): {kind:'image'} | {kind:'text';text:string} {
  // Return only the content kind for images. The foreground CLI reads the
  // original OS clipboard, preserving file/image formats and its own behavior.
  if (!clipboard.readImage().isEmpty()) return {kind:'image'};
  const fileUrl = clipboard.read('public.file-url');
  if (/^file:/i.test(fileUrl)) {
    try {
      if (/\.(png|jpe?g|gif|webp|bmp|tiff?|heic|avif)$/i.test(new URL(fileUrl).pathname)) return {kind:'image'};
    } catch { /* Not a file URL; fall back to text. */ }
  }
  return {kind:'text',text:clipboard.readText()};
}
