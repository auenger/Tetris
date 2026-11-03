# Coding agent terminal notifications

## Upstream designs reviewed

- [cmux notifications](https://github.com/manaflow-ai/cmux/blob/main/docs/notifications.md): explicit agent events, workspace/surface routing, native banners separate from unread state, click-to-focus and duplicate suppression. This is the closest product model to Tetris's canvas terminals.
- [Ghostty OSC 9](https://ghostty.org/docs/vt/osc/9): a terminal escape sequence requests a desktop notification.
- [WezTerm escape sequences](https://github.com/wezterm/wezterm/blob/main/docs/escape-sequences.md): OSC 777 provides a title/body notification transport. Terminal protocol support alone does not determine when an agent has finished.
- [Claude hooks](https://code.claude.com/docs/en/hooks#stop): Stop signals the end of a response; Notification can indicate permission/input requests. Neither proves the user's entire task succeeded.
- [Codex configuration](https://developers.openai.com/codex/config-advanced): the external notify callback receives agent-turn-complete; TUI notification settings are a separate mechanism.

## Implementation

Each new Tetris PTY gets a random notification route. The route maps to its actual session ID and is saved with session metadata. Reconnection restores that mapping. The hook sends a small JSON-RPC message to the local app socket; it never examines terminal output, so scrollback replay cannot generate notifications.

On macOS/Linux, direct Claude/Codex terminal targets get per-launch hook arguments. New zsh terminals also define local `claude` and `codex` functions, unless the user's shell already has an alias or function of that name. No global agent or shell configuration is edited. Existing terminals must be recreated to inherit this integration. Bash/fish manual launches, Windows/WSL automatic setup, OpenCode adapters, and OSC 9/777 reception are not included in this version.

Claude emits completion and permission/elicitation attention notices, filtering periodic idle prompts and recursive stop-hook calls. Codex emits completion notices. The per-launch Codex `notify` value supersedes a global custom notify command for that invocation; users needing their existing callback must compose it with the Tetris helper or override the launch configuration. Agent policy can disable hooks.

Notifications retain the latest notice per terminal in memory, including its read state. Codex's `last-assistant-message`, Claude Stop's `last_assistant_message`, and Claude Notification's `message` supply a sanitized, whitespace-normalized preview capped at 300 characters. Missing or unsupported content falls back to the generic completion/attention text. The preview is used in both the app and native banners; no transcript parsing or model summarization is needed.

Completion hooks preserve a hashed event identity from Codex's thread/turn ID or Claude's session/prompt ID. Replaying an identified event never makes it unread again, even after another turn, a long delay, or a changed preview. Distinct turns with identical previews remain separate events. Claude attention identities additionally distinguish the notification type, tool request (when supplied), and message within a prompt. Identified prompt-start replays are also idempotent.

For older hooks without an identity, previously seen content stays suppressed until Claude's UserPromptSubmit hook signals a new user turn. This includes unread, superseded, and acknowledged notices, plus legacy replays of identified notices. Existing Claude processes need to be relaunched to load that new hook; without a turn boundary, an identical legacy notice remains suppressed. Distinct content is accepted immediately, so a completion arriving just after an attention event is not lost to a time-based throttle. The renderer retains a per-terminal read watermark and ignores stale initial snapshots. Acknowledgements include the displayed timestamp, preventing a delayed read request from clearing a newer message. Clicking a native banner acknowledges its event in the main process as well.

The canvas has a fixed top-right list, newest first, showing the terminal name, read status, and message preview. It can be collapsed. Clicking an item uses the same navigation function as the left Tiles sidebar, including fullscreen switching and expanding collapsed groups. Focusing a terminal removes its bell immediately; the group's bell remains only if another member has unread messages. The list shows unread messages only: opening an item or focusing its terminal removes it. “全部已读” acknowledges all currently listed terminals in one IPC batch, clears their bells and native banners, and empties the list without navigating. New messages appear normally afterward. Native banners appear while the app is in the background, independently of the in-app list. Receiving a notice while already focused does not immediately erase it. App restart clears notification history, while routes survive terminal reconnection.

The helper times out within 1.8 seconds and returns success on transport failure, so notifications cannot block an agent's task. No model calls, output scanning, or polling are added. Native banner delivery still depends on macOS notification settings.

## Validation

- State tests cover routing, versioned read/forget, delayed and mixed-version replays, prompt boundaries, distinct events and text bounds.
- Real Unix-socket tests run the hook helper with Claude and Codex event payloads, including final-response previews, attention messages, sanitization, truncation, fallback content, and ignored events.
- Browser interaction checks cover viewport initialization, hover badges, grouped notices, top-right list navigation/centering, fullscreen switching, read acknowledgement/bell removal, and collapsing the list.
- `node scripts/test-notification-ui.cjs` checks the actual renderer against delayed restore responses, stale broadcasts, clearing, click acknowledgement and subsequent identical-content events in an isolated Electron profile.
- No paid/live agent task is run by the tests; end-to-end completion delivery from each installed agent should be verified manually in a newly created Tetris terminal.
