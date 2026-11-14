import ActivityKit
import Foundation

struct AgentActivityAttributes: ActivityAttributes {
    let instance: String
    struct Session: Codable, Hashable, Identifiable {
        var id: String
        var title: String
        var agent: String
        var status: String
        var unread: Bool
    }
    struct ContentState: Codable, Hashable {
        var status: String
        var label: String
        var symbol: String
        var working: Int
        var waiting: Int
        var unread: Int
        var total: Int
        var avatar: Int
        var sessions: [Session]
    }
}
