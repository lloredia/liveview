import ActivityKit
import Foundation
import LiveViewLiveActivity

/// Starts, updates, or ends the Live Activity for tracked games.
enum LiveActivityManager {
    private static let maxGames = 5

    static func update(with games: [LiveGameItem]) async {
        let liveGames = games.filter { $0.isLive }
        let toShow = Array(liveGames.prefix(maxGames))

        let att = LiveGameAttributes()
        let state = LiveGameAttributes.ContentState(games: toShow)

        if toShow.isEmpty {
            await endActivity()
            return
        }

        if #available(iOS 16.2, *) {
            if let current = Activity<LiveGameAttributes>.activities.first {
                await current.update(ActivityContent(state: state, staleDate: nil))
            } else {
                _ = try? Activity.request(
                    attributes: att,
                    content: ActivityContent(state: state, staleDate: nil),
                    pushType: nil
                )
            }
        }
    }

    static func endActivity() async {
        if #available(iOS 16.2, *) {
            for activity in Activity<LiveGameAttributes>.activities {
                await activity.end(nil, dismissalPolicy: .immediate)
            }
        }
    }
}
