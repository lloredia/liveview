import ActivityKit
import WidgetKit
import SwiftUI
import LiveViewLiveActivity

struct LiveViewLiveActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: LiveGameAttributes.self) { context in
            // Lock screen / banner UI
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
                            .padding(.horizontal, 8)
                            .padding(.vertical, 4)
                            .background(Color.primary.opacity(0.06))
                            .clipShape(RoundedRectangle(cornerRadius: 6))
                        }
                    }
                    .padding(.top, 4)
                }
            } compactLeading: {
                if let first = context.state.games.first {
                    Text("\(first.homeName) \(first.scoreHome)–\(first.scoreAway) \(first.awayName)")
                        .lineLimit(1)
                        .font(.caption2)
                } else {
                    Text("LiveView")
                        .font(.caption2)
                }
            } compactTrailing: {
                if context.state.games.first?.isLive == true {
                    Image(systemName: "sportscourt.fill")
                        .font(.caption2)
                        .foregroundStyle(.red)
                }
            } minimal: {
                Image(systemName: "sportscourt.fill")
                    .font(.caption2)
                    .foregroundStyle(.red)
            }
        }
    }
}

private struct LockScreenView: View {
    let state: LiveGameAttributes.ContentState

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(state.games, id: \.matchId) { game in
                HStack {
                    Text(game.homeName)
                        .lineLimit(1)
                        .font(.subheadline)
                    Spacer()
                    Text("\(game.scoreHome)–\(game.scoreAway)")
                        .font(.subheadline.monospacedDigit().bold())
                    if game.isLive {
                        Circle()
                            .fill(.red)
                            .frame(width: 6, height: 6)
                    }
                    Spacer()
                    Text(game.awayName)
                        .lineLimit(1)
                        .font(.subheadline)
                }
                .padding(.vertical, 4)
            }
        }
        .padding()
    }
}
