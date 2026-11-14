import AppKit
import ActivityKit
import Foundation

private func emit(_ value: [String: String]) {
    guard let data = try? JSONSerialization.data(withJSONObject: value),
          let text = String(data: data, encoding: .utf8) else { return }
    print(text); fflush(stdout)
}
@MainActor final class Delegate: NSObject, NSApplicationDelegate {
    private var activity: Activity<AgentActivityAttributes>?
    private var stopping = false
    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
        // Starting an Activity is a foreground, user-initiated operation.
        NSApp.activate(ignoringOtherApps: true)
        emit(["event": "ready"])
        DispatchQueue.global(qos: .utility).async {
            while let line = readLine() {
                let semaphore = DispatchSemaphore(value: 0)
                Task { @MainActor in
                    await self.consume(line)
                    semaphore.signal()
                }
                semaphore.wait()
            }
            Task { @MainActor in await self.stop() }
        }
    }
    private func consume(_ line: String) async {
        guard !stopping else { return }
        if line == "stop" { await stop(); return }
        do {
            let state = try JSONDecoder().decode(AgentActivityAttributes.ContentState.self, from: Data(line.utf8))
            guard ActivityAuthorizationInfo().areActivitiesEnabled else {
                emit(["event": "error", "message": "系统未允许 Tetris Live Activities，请在系统设置中开启。"])
                return
            }
            let content = ActivityContent(state: state, staleDate: Date().addingTimeInterval(90))
            if activity == nil {
                activity = Activity<AgentActivityAttributes>.activities.first
            }
            if let current = activity {
                await current.update(content)
            } else {
                activity = try Activity.request(attributes: AgentActivityAttributes(instance: "tetris-agents"), content: content, pushType: nil)
            }
            emit(["event": "updated", "id": activity?.id ?? ""])
        } catch {
            emit(["event": "error", "message": error.localizedDescription])
        }
    }
    private func stop() async {
        guard !stopping else { return }; stopping = true
        if let current = activity { await current.end(nil, dismissalPolicy: .immediate) }
        NSApp.terminate(nil)
    }
}
@main struct AgentActivityHost {
    @MainActor static func main() {
        let app = NSApplication.shared
        let delegate = Delegate()
        app.delegate = delegate
        app.run()
    }
}
