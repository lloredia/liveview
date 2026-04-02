import ActivityKit
import WidgetKit
import SwiftUI

// Types duplicated here because widget extensions are separate compile targets
struct LiveGameItem: Codable, Hashable {
    let matchId: String
    let homeName: String
    let awayName: String
    let scoreHome: Int
    let scoreAway: Int
    let isLive: Bool
    let phaseLabel: String
}

struct LiveGameAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var games: [LiveGameItem]
        var updatedAt: Date
    }
    var fixedLabel: String = "LiveView"
}

// MARK: - Colors (shared with widget)

private extension Color {
    static let laGreen = Color(red: 0x00/255, green: 0xE6/255, blue: 0x76/255)
    static let laRed = Color(red: 0xFF/255, green: 0x17/255, blue: 0x44/255)
    static let laBg = Color(red: 0x11/255, green: 0x11/255, blue: 0x18/255)
    static let laSecondary = Color.white.opacity(0.5)
}

struct LiveViewWidgetLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: LiveGameAttributes.self) { context in
            LockScreenView(state: context.state)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    HStack(spacing: 4) {
                        Text("LIVEVIEW")
                            .font(.system(size: 9, weight: .bold, design: .monospaced))
                            .foregroundStyle(Color.laGreen)
                            .tracking(1)
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    HStack(spacing: 3) {
                        Circle()
                            .fill(Color.laRed)
                            .frame(width: 5, height: 5)
                        Text("\(context.state.games.filter { $0.isLive }.count) live")
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundStyle(Color.laRed)
                    }
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(alignment: .leading, spacing: 6) {
                        ForEach(Array(context.state.games.enumerated()), id: \.element.matchId) { _, game in
                            HStack(spacing: 0) {
                                // Home team (4 chars)
                                Text(shortName(game.homeName, length: 4))
                                    .font(.system(size: 12, weight: .semibold))
                                    .foregroundColor(.white)
                                    .frame(width: 44, alignment: .leading)
                                    .lineLimit(1)

                                Spacer()

                                // Score — larger and bolder
                                Text("\(game.scoreHome)")
                                    .font(.system(size: 16, weight: .bold, design: .monospaced))
                                    .foregroundColor(game.isLive ? Color.laGreen : .white)

                                Text(" - ")
                                    .font(.system(size: 12))
                                    .foregroundColor(Color.laSecondary)

                                Text("\(game.scoreAway)")
                                    .font(.system(size: 16, weight: .bold, design: .monospaced))
                                    .foregroundColor(game.isLive ? Color.laGreen : .white)

                                if game.isLive {
                                    Circle()
                                        .fill(Color.laRed)
                                        .frame(width: 5, height: 5)
                                        .padding(.leading, 4)
                                }

                                Spacer()

                                // Away team (4 chars)
                                Text(shortName(game.awayName, length: 4))
                                    .font(.system(size: 12, weight: .semibold))
                                    .foregroundColor(.white)
                                    .frame(width: 44, alignment: .trailing)
                                    .lineLimit(1)
                            }
                            .padding(.horizontal, 8)
                            .padding(.vertical, 6)
                            .background(Color.primary.opacity(0.06))
                            .clipShape(RoundedRectangle(cornerRadius: 6))
                        }
                    }
                    .padding(.top, 4)
                }
            } compactLeading: {
                if let first = context.state.games.first {
                    HStack(spacing: 2) {
                        Text(shortName(first.homeName, length: 3))
                            .font(.system(size: 11, weight: .semibold))
                        Text("\(first.scoreHome)-\(first.scoreAway)")
                            .font(.system(size: 11, weight: .bold, design: .monospaced))
                            .foregroundColor(first.isLive ? Color.laGreen : .primary)
                    }
                    .lineLimit(1)
                } else {
                    Text("LIVEVIEW")
                        .font(.system(size: 9, weight: .bold, design: .monospaced))
                        .foregroundColor(Color.laGreen)
                }
            } compactTrailing: {
                if let first = context.state.games.first {
                    HStack(spacing: 2) {
                        Text(shortName(first.awayName, length: 3))
                            .font(.system(size: 11, weight: .semibold))
                        if first.isLive {
                            Circle()
                                .fill(Color.laRed)
                                .frame(width: 4, height: 4)
                        }
                    }
                    .lineLimit(1)
                }
            } minimal: {
                if context.state.games.first?.isLive == true {
                    Image(systemName: "sportscourt.fill")
                        .font(.caption2)
                        .foregroundStyle(Color.laRed)
                } else {
                    Image(systemName: "sportscourt.fill")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
        }
    }
}

// MARK: - Lock Screen View

private struct LockScreenView: View {
    let state: LiveGameAttributes.ContentState

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Green accent line at top
            Rectangle()
                .fill(Color.laGreen)
                .frame(height: 2)

            VStack(alignment: .leading, spacing: 6) {
                // Branding header
                HStack {
                    Text("LIVEVIEW")
                        .font(.system(size: 9, weight: .bold, design: .monospaced))
                        .foregroundColor(Color.laGreen)
                        .tracking(1.5)
                    Spacer()
                    let liveCount = state.games.filter { $0.isLive }.count
                    if liveCount > 0 {
                        HStack(spacing: 3) {
                            Circle()
                                .fill(Color.laRed)
                                .frame(width: 5, height: 5)
                            Text("\(liveCount) live")
                                .font(.system(size: 9, weight: .semibold))
                                .foregroundColor(Color.laRed)
                        }
                    }
                }
                .padding(.top, 8)

                ForEach(state.games, id: \.matchId) { game in
                    HStack(spacing: 0) {
                        // Home team (4 chars)
                        Text(shortName(game.homeName, length: 4))
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundColor(.white)
                            .frame(width: 50, alignment: .leading)
                            .lineLimit(1)

                        Spacer()

                        // Score — prominent
                        Text("\(game.scoreHome)")
                            .font(.system(size: 18, weight: .bold, design: .monospaced))
                            .foregroundColor(game.isLive ? Color.laGreen : .white)

                        Text(" - ")
                            .font(.system(size: 14))
                            .foregroundColor(Color.laSecondary)

                        Text("\(game.scoreAway)")
                            .font(.system(size: 18, weight: .bold, design: .monospaced))
                            .foregroundColor(game.isLive ? Color.laGreen : .white)

                        if game.isLive {
                            Circle()
                                .fill(Color.laRed)
                                .frame(width: 6, height: 6)
                                .padding(.leading, 4)
                        }

                        Spacer()

                        // Away team (4 chars)
                        Text(shortName(game.awayName, length: 4))
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundColor(.white)
                            .frame(width: 50, alignment: .trailing)
                            .lineLimit(1)
                    }
                    .padding(.vertical, 5)

                    if !game.phaseLabel.isEmpty {
                        Text(game.phaseLabel)
                            .font(.system(size: 9, weight: .medium))
                            .foregroundColor(Color.laSecondary)
                            .padding(.top, -4)
                    }
                }
            }
            .padding(.horizontal, 14)
            .padding(.bottom, 10)
        }
    }
}

// MARK: - Helpers

private func shortName(_ name: String, length: Int = 4) -> String {
    let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return "--" }
    let parts = trimmed.split(separator: " ")
    if let last = parts.last, last.count >= 3 {
        return String(last.prefix(length)).uppercased()
    }
    return String(trimmed.prefix(length)).uppercased()
}
