import { accessSync, constants, readdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

const executable = (path: string) => { try { accessSync(path, constants.X_OK); return true; } catch { return false; } };

/** Use the app's bundled Node runtime without registering a second foreground macOS app. */
export function getNodeHostExecutable(execPath = process.execPath, platform: NodeJS.Platform = process.platform): string {
  if (platform !== 'darwin') return execPath;
  const contents = dirname(dirname(execPath)), bundle = dirname(contents);
  // ACP and its nested SDK/MCP processes already inherit the Helper as process.execPath.
  if (basename(dirname(bundle)) === 'Frameworks' && / Helper(?: \((?:GPU|Plugin|Renderer)\))?\.app$/.test(basename(bundle)) && executable(execPath)) return execPath;
  const frameworks = join(contents, 'Frameworks');
  const names = new Set([`${basename(execPath)} Helper.app`, `${basename(bundle, '.app')} Helper.app`]);
  // Electron packagers may customize the main executable name independently of the bundle.
  try { for (const name of readdirSync(frameworks)) if (name.endsWith(' Helper.app')) names.add(name); } catch { /* Report the missing bundled host below. */ }
  for (const name of names) {
    const helper = join(frameworks, name, 'Contents', 'MacOS', basename(name, '.app'));
    if (executable(helper)) return helper;
  }
  throw new Error('未找到应用内置的 Electron Helper，无法启动后台 Agent。请检查应用安装是否完整。');
}
