# Tetris branding

Tetris is the display name for this customized spatial coding-agent workspace.

## Assets

- `build/tetris-logo-source.png`: generated master, transparent exterior.
- `build/icon.png`: 1024 px packaged / Linux / runtime Dock icon.
- `build/icon.icns`: macOS icon with standard 16–1024 px representations.
- `build/icon.ico`: Windows icon with 16–256 px representations.
- `src/windows/shell/src/assets/tetris-icon.png`: shell favicon.

Generated with the built-in image generation tool. Only format/size conversion was performed locally, using `sips` and `iconutil`, plus ICO directory encoding.

## Compatibility

The display name, application bundle/executable, main window, menu, settings, agent client identity, notifications, permissions text, CLI help, and product documentation use Tetris.

The `tetris-canvas` command is primary. `collab-canvas` remains installed as an alias for existing agent instructions. Source packages use `@tetris/*` and the source directory is `tetris-electron`. Protocol names, environment variables, bundle identifier, socket names, `~/.collaborator`, and the existing Electron profile under `appData/@collaborator/electron` stay stable. These are compatibility addresses, not product labels. Dev profiles remain isolated by worktree. No existing data is moved or deleted.

Original license, CLA, and upstream attributions/links retain their source identity. No Tetris release feed has been configured: `build.publish` is null and the updater is disabled, preventing this app from installing upstream releases. Set up the intended release repository before enabling publishing/updating. The command-line installer requires `TETRIS_RELEASE_REPO` explicitly.

## Generation prompts

Initial prompt:

> Use case: logo-brand. Create one finished macOS desktop app icon for an app named Tetris, a spatial canvas coding-agent workspace. This is an original productivity app identity, not the classic video game logo. Square 1024 x 1024, front-on flat vector-like graphic. A very pale warm white rounded-square macOS icon tile with generous margins and transparent exterior. Inside, a sparse regular canvas dot grid in soft graphite gray. The central bold emblem is three or four charcoal rounded rectangular window tiles arranged into a clear geometric T silhouette, with small gaps. One partial group of tiles is enclosed by a deliberate medium-weight graphite dashed rounded rectangular selection frame, with a couple tiny square selection handles; the frame extends slightly beyond the T for a sense of spatial grouping. Calm monochrome palette matching a minimal coding canvas, extremely restrained tiny muted amber accent dot if useful. Make the central T/window form strong, large and readable at 32px; keep dots few and subordinate. Crisp edges, premium native utility app icon, balanced negative space, no words, no letters rendered as typography, no gradients, no 3D, no mockup, no multiple options, no watermark. Deliver a single production-ready icon.

Final refinement prompt (using the initial icon as the edit target):

> Refine this exact app icon for production. Preserve the existing composition, T-shaped dark window tiles, sparse dot grid, amber dot, dashed selection grouping frame, and pale rounded-square background. ONLY fix the outer silhouette: make the pale rounded-square tile border perfectly smooth, clean, symmetric and crisp, remove every stray white fleck/ragged pixel outside the silhouette. Outside the rounded-square must be perfectly transparent. Keep generous equal transparent margins around the icon. Clean flat fills, no texture or irregular edge. No additional objects or text. Export a square production macOS app icon.
