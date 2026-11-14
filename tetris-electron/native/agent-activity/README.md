# Native Mac Agent Live Activity — prepared, not yet verified

Environment checkpoint: 2026-11-14. The overlay appearance has since been accepted by the user; this does not validate the native component.

The user chose native system integration, then chose to keep macOS 27.2 and wait for a stable OS/SDK rather than install a beta. Xcode was upgraded from 26.2 to 27.2 and initialized. The 27.2 SDK still declares `ActivityAttributes`, `Activity`, `ActivityConfiguration`, and `DynamicIsland` unavailable on macOS. Apple’s current [ActivityKit metadata](https://developer.apple.com/documentation/activitykit.md) specifies macOS **27.3+** (beta at implementation time). Do not claim native integration works until the checks below pass.

The prepared implementation follows [Bring Live Activities to Mac](https://developer.apple.com/videos/play/tech-talks/111467/): an AppKit host starts/updates/ends an Activity; a WidgetKit extension provides compact leading/trailing, minimal, and expanded SwiftUI views. The system owns hover, presentation size, animation and arbitration with other activities. No global hover listener, system-window injection or private API is used.

`island-presentation.ts` produces a bounded summary from the IDE’s shared session store: attention > working > unread completion > unknown > idle. Working remains visible even when another session has an unread completion. No terminal contents, provider keys or working-directory paths are sent to the widget. Model tests are passing; Swift components and system integration are unverified.

## Enable after a supported stable SDK/system is available

1. Confirm macOS and the selected macOS SDK are 27.3+ and that the public APIs are available. Do not bypass SDK availability checks.
2. `bun run build:agent-activity` builds an arm64 native host and embedded widget under `resources/native/TetrisActivityHost.app`. It rejects SDK 27.2 explicitly.
3. `node scripts/test-native-agent-activity.mjs --preview` registers the local test extension and cycles five labeled demo states, then dismisses the activity. Verify the **system** island visually, including hover, idle, attention, unknown, and coexistence with other system activities. An Activity request succeeding does not prove the widget rendered.
4. `TETRIS_NATIVE_ACTIVITY=1 bun ./scripts/package.mjs --no-sign --arch arm64 --dir` includes the component. Without this opt-in, ordinary builds retain the status-visible Electron fallback.
5. Validate the packaged app, deep-link routing and nested widget signatures/entitlements. Signed distribution may require changes to the packaging signer to preserve the widget’s sandbox entitlements; this has not been validated.

The Node bridge sends changes and a 30-second freshness update through stdin; the host gives updates a 90-second stale date. EOF/disable/quit ends the activity. Errors are surfaced during enable. The native host is never started on macOS 27.2. Older supported configurations keep the existing overlay and never claim native hover integration.
