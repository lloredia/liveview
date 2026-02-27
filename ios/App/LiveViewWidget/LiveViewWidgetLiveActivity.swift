import ActivityKit
import WidgetKit
import SwiftUI
import LiveViewLiveActivity

struct LiveViewWidgetLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: LiveGameAttributes.self) { context in
            LockScreenView(state: context.state)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Text("Tracked")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text("\(context.state.games.count) live")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(alignment: .leading, spacing: 6) {
                        ForEach(Array(context.state.games.enumerated()), id: \.element.matchId) { _, game in
                            VStack(alignment: .leading, spacing: 2) {
                                HStack {
                                    Text(game.homeName)
                                        .lineLimit(1)
                                        .font(.caption)
                                    Spacer()
                                    Text("\(game.scoreHome)–\(game.scoreAway)")
                                        .font(.caption.monospacedDigit().bold())
                                    if game.isLive {
                                        Circle()
                                            .fill(.red)
                                            .frame(width: 5, height: 5)
                                    }
                                    Spacer()
                                    Text(game.awayName)
                                        .lineLimit(1)
                                        .font(.caption)
                                }

                                if !game.phaseLabel.isEmpty {
                                    Text(game.phaseLabel)
                                        .font(.caption2)
                                        .foregroundStyle(.secondary)
                                }
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
                    Text("\(shortName(first.homeName)) \(first.scoreHome)–\(first.scoreAway)")
                        .lineLimit(1)
                        .font(.caption2.monospacedDigit())
                } else {
                    Text("LiveView")
                        .font(.caption2)
                }
            } compactTrailing: {
                if let first = context.state.games.first {
                    Text(shortName(first.awayName))
                        .lineLimit(1)
                        .font(.caption2)
                }
            } minimal: {
                if context.state.games.first?.isLive == true {
                    Image(systemName: "sportscourt.fill")
                        .font(.caption2)
                        .foregroundStyle(.red)
                } else {
                    Image(systemName: "sportscourt.fill")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
        }
    }
}

private struct LockScreenView: View {
    let state: LiveGameAttributes.ContentState

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(state.games, id: \.matchId) { game in
                VStack(alignment: .leading, spacing: 2) {
                    HStack {
                        Text(shortName(game.homeName))
                            .lineLimit(1)
                            .font(.caption)
                        Spacer()
                        Text("\(game.scoreHome)–\(game.scoreAway)")
                            .font(.subheadline.monospacedDigit().bold())
                        if game.isLive {
                            Circle()
                                .fill(.red)
                                .frame(width: 6, height: 6)
                        }
                        Spacer()
                        Text(shortName(game.awayName))
                            .lineLimit(1)
                            .font(.caption)
                    }

                    if !game.phaseLabel.isEmpty {
                        Text(game.phaseLabel)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }
                .padding(.vertical, 4)
            }
        }
        .padding()
    }
}

private func shortName(_ name: String) -> String {
    let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return "—" }

    let parts = trimmed.split(separator: " ")
    if let last = parts.last, last.count >= 3 {
        return String(last.prefix(3)).uppercased()
    }

    return String(trimmed.prefix(3)).uppercased()
}
