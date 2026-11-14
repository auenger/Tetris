import { resolve } from 'node:path';
const fixture = resolve('scripts/tests/fixtures/agent-fault-boundary.ts');
const cancellation = process.env.TETRIS_CANCEL_ONLY === '1';
const result = await Bun.build({ entrypoints: [cancellation ? 'scripts/tests/tetris-agent-cancel.ts' : 'scripts/tests/tetris-agent-faults.ts'], outdir: 'out/tests', naming: cancellation ? 'tetris-agent-cancel.mjs' : 'tetris-agent-faults.mjs', target: 'node',
  external: ['electron', 'node-pty', '@parcel/watcher', 'typescript', 'sharp'],
  plugins: [{ name: 'test-only-provider-boundaries', setup(build) {
    build.onResolve({ filter: /^(\.\/supervisor-runtime|@agentclientprotocol\/sdk)$/ }, () => ({ path: fixture }));
  } }],
});
if (!result.success) { console.error(result.logs); process.exit(1); }
