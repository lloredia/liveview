import ActivityKit
import Foundation

/// One tracked game summary for the Live Activity.
public struct LiveGameItem: Codable, Hashable {
    public let matchId: String
    public let homeName: String
    public let awayName: String
    public let scoreHome: Int
    public let scoreAway: Int
    public let isLive: Bool
    public let phaseLabel: String

    public init(matchId: String, homeName: String, awayName: String, scoreHome: Int, scoreAway: Int, isLive: Bool, phaseLabel: String) {
        self.matchId = matchId
        self.homeName = homeName
        self.awayName = awayName
        self.scoreHome = scoreHome
        self.scoreAway = scoreAway
        self.isLive = isLive
        self.phaseLabel = phaseLabel
    }
}

/// Attributes for the tracked games Live Activity (static + dynamic state).
public struct LiveGameAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        public var games: [LiveGameItem]
        public var updatedAt: Date

        public init(games: [LiveGameItem], updatedAt: Date = Date()) {
            self.games = games
            self.updatedAt = updatedAt
        }
    }

    public var fixedLabel: String = "LiveView"

    public init(fixedLabel: String = "LiveView") {
        self.fixedLabel = fixedLabel
    }
}
