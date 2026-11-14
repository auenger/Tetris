import SwiftUI
import WidgetKit
import ActivityKit

private func statusColor(_ status: String) -> Color {
    switch status {
    case "working": return .cyan
    case "attention": return .orange
    case "done": return .green
    default: return .secondary
    }
}
private func sessionLabel(_ row: AgentActivityAttributes.Session) -> String {
    switch row.status {
    case "working": return "工作中"
    case "attention": return "待处理"
    case "done": return row.unread ? "新完成" : "已完成"
    case "idle": return "空闲"
    default: return "未接入"
    }
}
private struct Status: View {
    let state: AgentActivityAttributes.ContentState
    var body: some View {
        Label(state.label, systemImage: state.symbol)
            .font(.caption.weight(.semibold))
            .foregroundStyle(statusColor(state.status))
            .accessibilityLabel(state.label)
    }
}
private struct Avatar: View {
    let state: AgentActivityAttributes.ContentState
    private let names = ["codex", "claude-code", "gpt", "claude", "glm", "deepseek"]
    var body: some View {
        let cell = state.status == "done" ? 2 : (state.status == "working" || state.status == "attention") ? 1 : 0
        Image("\(names[abs(state.avatar % names.count)])-\(cell)", bundle: .main)
            .resizable().frame(width: 22, height: 22)
            .accessibilityHidden(true)
    }
}
private func sessionURL(_ id: String) -> URL {
    var url = URLComponents()
    url.scheme = "tetris-agent"; url.host = "open"
    url.queryItems = [URLQueryItem(name: "session", value: id)]
    return url.url ?? URL(string: "tetris-agent://open")!
}
private struct Details: View {
    let state: AgentActivityAttributes.ContentState
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack { Text("Tetris Agents").font(.headline); Spacer(); Status(state: state) }
            Text("\(state.working) 工作中 · \(state.waiting) 待处理 · \(state.unread) 新完成")
                .font(.caption).foregroundStyle(.secondary)
            ForEach(state.sessions) { row in
                Link(destination: sessionURL(row.id)) { HStack {
                    VStack(alignment: .leading) {
                        Text(row.title).lineLimit(1)
                        Text(row.agent).font(.caption2).foregroundStyle(.secondary)
                    }
                    Spacer()
                    Text(sessionLabel(row)).font(.caption).foregroundStyle(statusColor(row.status))
                }}
            }
            if state.total == 0 { Text("暂无运行中的 Agent").font(.caption).foregroundStyle(.secondary) }
            Text("点击返回 IDE").font(.caption2).foregroundStyle(.secondary)
        }.padding(12)
    }
}
struct AgentActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: AgentActivityAttributes.self) { context in
            Details(state: context.state)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) { Avatar(state: context.state) }
                DynamicIslandExpandedRegion(.trailing) { Status(state: context.state) }
                DynamicIslandExpandedRegion(.bottom) { Details(state: context.state) }
            } compactLeading: {
                Avatar(state: context.state)
            } compactTrailing: {
                Status(state: context.state)
            } minimal: {
                Image(systemName: context.state.symbol)
                    .foregroundStyle(statusColor(context.state.status))
                    .accessibilityLabel(context.state.label)
            }
            .widgetURL(URL(string: "tetris-agent://open"))
        }
    }
}
@main struct AgentActivityWidgets: WidgetBundle {
    var body: some Widget { AgentActivityWidget() }
}
