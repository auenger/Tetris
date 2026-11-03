const WINDOWS_DRIVE_PATH_RE = /^[A-Za-z]:[\\/]/;
const WINDOWS_DRIVE_URL_PATH_RE = /^\/[A-Za-z]:\//;
const WINDOWS_DRIVE_HOST_RE = /^[A-Za-z]$/;

export function toCollabFileUrl(absolutePath: string): string {
  let normalized = absolutePath.replace(/\\/g, "/");

  if (WINDOWS_DRIVE_PATH_RE.test(absolutePath)) {
    normalized = `/${normalized}`;
  }

  return `collab-file://${encodeURI(normalized).replace(/#/g, "%23").replace(/\?/g, "%3F")}`;
}

export function fromCollabFileUrl(url: string): string {
  const parsed = new URL(url);
  if (parsed.protocol !== "collab-file:") {
    throw new Error(`Unsupported protocol: ${parsed.protocol}`);
  }

  const host = decodeURIComponent(parsed.hostname);
  const pathname = decodeURIComponent(parsed.pathname);

  if (host) {
    if (!pathname) return host;
    if (WINDOWS_DRIVE_HOST_RE.test(host)) {
      return `${host}:${pathname}`;
    }
    return `//${host}${pathname}`;
  }

  if (WINDOWS_DRIVE_URL_PATH_RE.test(pathname)) {
    return pathname.slice(1);
  }

  return pathname;
}

// A standard preview URL needs a host. Without one Chromium promotes the first
// path segment to the host (and lowercases it), breaking local paths and assets.
export function toHtmlPreviewUrl(absolutePath: string): string {
  return toCollabFileUrl(absolutePath).replace("collab-file://", "collab-preview://local");
}

export function fromHtmlPreviewUrl(url: string): string {
  const parsed = new URL(url);
  if (parsed.protocol !== "collab-preview:" || parsed.hostname !== "local") {
    throw new Error(`Unsupported preview URL: ${url}`);
  }
  return fromCollabFileUrl(`collab-file://${parsed.pathname}`);
}
