import { toHtmlPreviewUrl } from "@tetris/shared/collab-file-url";

export function HtmlPreview({ filePath, revision }: { filePath: string; revision: string }) {
  return (
    <iframe
      key={`${filePath}:${revision}`}
      className="html-preview"
      src={toHtmlPreviewUrl(filePath)}
      title={`HTML 预览：${filePath.split(/[\\/]/).pop()}`}
      // collab-preview is a separate origin from the application (file/http).
      // Keep scripts and relative assets working without access to the host API.
      sandbox="allow-scripts allow-same-origin"
    />
  );
}
