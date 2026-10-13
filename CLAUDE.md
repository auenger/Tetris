# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Tetris is a native desktop app for agentic development — an infinite canvas where terminals, files, and agents live side by side. Built with Electron + React, licensed under FSL-1.1-ALv2.

## Development Setup

Prerequisites: Node.js 22+, Bun

```sh
cd tetris-electron
bun install
bun run dev          # Dev mode with hot reload (electron-vite)
bun run build        # Production build
bun test             # Run all tests
bun run package      # Create installers
bun run clean        # Clean build artifacts
bun run clean:deep   # Clean everything including node_modules
```

Tests use Bun's built-in test runner. Run a single test file:
```sh
bun test src/main/sidecar/ring-buffer.test.ts
```

## Architecture

### Monorepo Structure

```
tetris-electron/
├── packages/
│   ├── shared/        # Shared types and utilities (@tetris/shared)
│   ├── components/    # Reusable React components (@tetris/components)
│   └── theme/         # CSS/theme tokens (@tetris/theme)
├── src/
│   ├── main/          # Electron main process (Node.js)
│   ├── preload/       # Preload scripts (contextBridge APIs)
│   └── windows/       # Multiple BrowserWindow renderers (React)
└── scripts/           # Build, packaging, and CLI scripts
```

### Multi-Window Electron Architecture

The app uses one main BrowserWindow (shell) that hosts webviews for each panel:

- **Shell** (`src/windows/shell/`) — Main window containing the infinite canvas with tile management
- **Nav** (`src/windows/nav/`) — File tree and workspace navigation sidebar
- **Viewer** (`src/windows/viewer/`) — File content display (markdown/code/image)
- **Terminal** (`src/windows/terminal/`) — Terminal session manager
- **Terminal Tile** (`src/windows/terminal-tile/`) — Individual terminal on canvas (xterm.js)
- **Graph Tile** (`src/windows/graph-tile/`) — D3 force-directed graph visualization
- **Settings** (`src/windows/settings/`) — App preferences
- **Terminal List** (`src/windows/terminal-list/`) — Terminal session list

### IPC Communication

- **Domain-separated handlers**: `ipc-filesystem.ts`, `ipc-workspace.ts`, `ipc-canvas.ts`, `ipc-knowledge.ts`, `ipc-misc.ts`, `ipc-endpoint.ts`
- **Two preload scripts**: `universal.ts` (exposed as `window.api` for nav/viewer/terminal/graph/settings) and `shell.ts` (exposed as `window.shellApi` for the canvas shell)
- **Message forwarding**: The shell preload has `onForwardToWebview` to relay messages from main process to child webviews
- **Channel convention**: IPC channels use colon-namespaced format (e.g., `fs:readfile`, `pty:create`, `canvas:save-state`)

### Main Process Services

Key modules in `src/main/`:
- **PTY system** (`pty.ts`, `sidecar/`) — Terminal sessions via a persistent node-pty sidecar process
- **File watching** (`watcher.ts`, `watcher-worker.ts`) — Real-time FS events via @parcel/watcher
- **Canvas persistence** (`canvas-persistence.ts`, `canvas-rpc.ts`) — Tile state and viewport saved to `~/.collaborator/`
- **Workspace graph** (`workspace-graph.ts`) — File dependency graph for graph tiles
- **Git replay** (`git-replay.ts`, `git-replay-worker.ts`) — Git history replay visualization
- **Wikilink index** (`wikilink-index.ts`) — Wiki-style `[[link]]` resolution between markdown files
- **Image processing** (`image-service.ts`, `image-worker.ts`) — Thumbnails via sharp
- **Updater** (`updater/`) — Update infrastructure; disabled until a Tetris release feed is configured
- **JSON-RPC server** (`json-rpc-server.ts`) — External API for integrations

### Path Aliases

Configured in `electron.vite.config.ts`:
- `@tetris/shared` → `packages/shared/src`
- `@tetris/theme` → `packages/theme/src`
- `@tetris/components` → `packages/components/src`

### Build Outputs

- Main process + workers → `out/main/`
- Preload scripts → `out/preload/` (CJS format)
- Renderer windows → `out/renderer/`
- Packaged app → `dist/`

Main process builds multiple entry points: `index`, `pty-sidecar`, `watcher-worker`, `git-replay-worker`, `image-worker`.

## Conventions

- TypeScript throughout (`"type": "module"` in package.json)
- React 19 with functional components
- Tailwind CSS 4 for styling
- Config stored in `~/.collaborator/config.json`; canvas state in `canvas-state.json`
- PostHog analytics (anonymous, non-identifying)

## Contributing

Keep PRs focused on a single change. Preserve original legal documents. See [CONTRIBUTING.md](CONTRIBUTING.md).
