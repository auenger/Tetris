import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import config from '../../electron.vite.config.ts';

const root = fileURLToPath(new URL('../../', import.meta.url));
const output = join(tmpdir(), 'tetris-shell-isolation-build');
// Only compile the surfaces exercised by the native fixture. The live app's
// build output and userData directory remain untouched.
export default {
  preload: {
    ...config.preload,
    build: { ...config.preload.build, outDir: join(output, 'preload'), emptyOutDir: true,
      rollupOptions: { ...config.preload.build.rollupOptions, input: { shell: join(root, 'src/preload/shell.ts'), universal: join(root, 'src/preload/universal.ts') } } },
  },
  renderer: {
    ...config.renderer,
    build: { ...config.renderer.build, outDir: join(output, 'renderer'), emptyOutDir: true,
      rollupOptions: { input: { shell: join(root, 'src/windows/shell/index.html'), 'agent-chat': join(root, 'src/windows/agent-chat/index.html') } } },
  },
};
