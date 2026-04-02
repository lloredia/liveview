//
//  LiveViewWidget.swift
//  LiveViewWidget
//
//  Created by Lesley Oredia on 2/24/26.
//

import WidgetKit
import SwiftUI

// MARK: - Data Models

struct WidgetMatch: Identifiable {
    let id: String
    let homeTeam: String
    let homeShort: String
    let awayTeam: String
    let awayShort: String
    let homeScore: Int
    let awayScore: Int
    let phase: String
    let isLive: Bool
    let isFinished: Bool
    let startTime: String?
    let league: String
}

struct WidgetData {
    let matches: [WidgetMatch]
    let liveCount: Int
    let totalCount: Int
    let lastUpdated: Date

    static let empty = WidgetData(matches: [], liveCount: 0, totalCount: 0, lastUpdated: Date())

    static let placeholder = WidgetData(
        matches: [
            WidgetMatch(id: "1", homeTeam: "Atlanta Braves", homeShort: "ATL", awayTeam: "Oakland Athletics", awayShort: "OAK", homeScore: 5, awayScore: 1, phase: "finished", isLive: false, isFinished: true, startTime: nil, league: "MLB"),
            WidgetMatch(id: "2", homeTeam: "Los Angeles Lakers", homeShort: "LAL", awayTeam: "Boston Celtics", awayShort: "BOS", homeScore: 102, awayScore: 98, phase: "live", isLive: true, isFinished: false, startTime: nil, league: "NBA"),
            WidgetMatch(id: "3", homeTeam: "Manchester United", homeShort: "MUN", awayTeam: "Liverpool", awayShort: "LIV", homeScore: 2, awayScore: 2, phase: "live", isLive: true, isFinished: false, startTime: nil, league: "EPL"),
            WidgetMatch(id: "4", homeTeam: "New York Yankees", homeShort: "NYY", awayTeam: "Boston Red Sox", awayShort: "BOS", homeScore: 3, awayScore: 7, phase: "finished", isLive: false, isFinished: true, startTime: nil, league: "MLB"),
            WidgetMatch(id: "5", homeTeam: "Golden State Warriors", homeShort: "GSW", awayTeam: "Miami Heat", awayShort: "MIA", homeScore: 0, awayScore: 0, phase: "scheduled", isLive: false, isFinished: false, startTime: "7:30 PM", league: "NBA"),
            WidgetMatch(id: "6", homeTeam: "Arsenal", homeShort: "ARS", awayTeam: "Chelsea", awayShort: "CHE", homeScore: 1, awayScore: 0, phase: "live", isLive: true, isFinished: false, startTime: nil, league: "EPL"),
            WidgetMatch(id: "7", homeTeam: "Chicago Cubs", homeShort: "CHC", awayTeam: "St. Louis Cardinals", awayShort: "STL", homeScore: 0, awayScore: 0, phase: "scheduled", isLive: false, isFinished: false, startTime: "8:00 PM", league: "MLB"),
            WidgetMatch(id: "8", homeTeam: "Real Madrid", homeShort: "RMA", awayTeam: "Barcelona", awayShort: "BAR", homeScore: 3, awayScore: 2, phase: "finished", isLive: false, isFinished: true, startTime: nil, league: "La Liga"),
        ],
        liveCount: 3,
        totalCount: 8,
        lastUpdated: Date()
    )
}

// MARK: - Network

func fetchWidgetData() async -> WidgetData {
    guard let url = URL(string: "https://backend-api-production-8b9f.up.railway.app/v1/today") else {
        return .empty
    }

    do {
        let (data, _) = try await URLSession.shared.data(from: url)
        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return .empty
        }

        let liveCount = json["live"] as? Int ?? 0
        let totalCount = json["total_matches"] as? Int ?? 0
        var matches: [WidgetMatch] = []

        if let leagues = json["leagues"] as? [[String: Any]] {
            for league in leagues {
                let leagueName = league["league_name"] as? String ?? ""
                if let leagueMatches = league["matches"] as? [[String: Any]] {
                    for match in leagueMatches {
                        let id = match["id"] as? String ?? UUID().uuidString
                        let phase = match["phase"] as? String ?? "scheduled"
                        let score = match["score"] as? [String: Any]
                        let homeScore = score?["home"] as? Int ?? 0
                        let awayScore = score?["away"] as? Int ?? 0
                        let homeTeam = match["home_team"] as? [String: Any]
                        let awayTeam = match["away_team"] as? [String: Any]
                        let homeName = homeTeam?["name"] as? String ?? "Home"
                        let homeShort = homeTeam?["short_name"] as? String ?? String(homeName.prefix(3)).uppercased()
                        let awayName = awayTeam?["name"] as? String ?? "Away"
                        let awayShort = awayTeam?["short_name"] as? String ?? String(awayName.prefix(3)).uppercased()

                        let isLive = phase == "live" || phase == "inprogress" || phase == "in_progress"
                        let isFinished = phase == "finished" || phase == "ended" || phase == "completed"

                        let startTime = match["start_time"] as? String

                        matches.append(WidgetMatch(
                            id: id,
                            homeTeam: homeName,
                            homeShort: homeShort,
                            awayTeam: awayName,
                            awayShort: awayShort,
                            homeScore: homeScore,
                            awayScore: awayScore,
                            phase: phase,
                            isLive: isLive,
                            isFinished: isFinished,
                            startTime: startTime,
                            league: leagueName
                        ))
                    }
                }
            }
        }

        // Sort: live first, then finished, then scheduled
        matches.sort { a, b in
            let orderA = a.isLive ? 0 : (a.isFinished ? 1 : 2)
            let orderB = b.isLive ? 0 : (b.isFinished ? 1 : 2)
            return orderA < orderB
        }

        return WidgetData(matches: matches, liveCount: liveCount, totalCount: totalCount, lastUpdated: Date())
    } catch {
        return .empty
    }
}

// MARK: - Timeline Provider

struct ScoresProvider: TimelineProvider {
    func placeholder(in context: Context) -> ScoresEntry {
        ScoresEntry(date: Date(), data: .placeholder)
    }

    func getSnapshot(in context: Context, completion: @escaping (ScoresEntry) -> Void) {
        if context.isPreview {
            completion(ScoresEntry(date: Date(), data: .placeholder))
            return
        }
        Task {
            let data = await fetchWidgetData()
            completion(ScoresEntry(date: Date(), data: data.matches.isEmpty ? .placeholder : data))
        }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<ScoresEntry>) -> Void) {
        Task {
            let data = await fetchWidgetData()
            let entry = ScoresEntry(date: Date(), data: data)
            let refreshDate = Calendar.current.date(byAdding: .minute, value: 15, to: Date()) ?? Date()
            let timeline = Timeline(entries: [entry], policy: .after(refreshDate))
            completion(timeline)
        }
    }
}

// MARK: - Entry

struct ScoresEntry: TimelineEntry {
    let date: Date
    let data: WidgetData
}

// MARK: - Colors

extension Color {
    static let lvBackground = Color(red: 0x11/255, green: 0x11/255, blue: 0x18/255)
    static let lvGreen = Color(red: 0x00/255, green: 0xE6/255, blue: 0x76/255)
    static let lvRed = Color(red: 0xFF/255, green: 0x17/255, blue: 0x44/255)
    static let lvCardBg = Color.white.opacity(0.06)
    static let lvSecondary = Color.white.opacity(0.5)
}

// MARK: - Status Badge

struct StatusBadge: View {
    let match: WidgetMatch

    var body: some View {
        if match.isLive {
            HStack(spacing: 3) {
                Circle()
                    .fill(Color.lvRed)
                    .frame(width: 5, height: 5)
                Text("LIVE")
                    .font(.system(size: 8, weight: .bold))
                    .foregroundColor(Color.lvRed)
            }
        } else if match.isFinished {
            Text("FT")
                .font(.system(size: 8, weight: .semibold))
                .foregroundColor(Color.lvSecondary)
        } else {
            Text(match.startTime ?? "--:--")
                .font(.system(size: 8, weight: .medium))
                .foregroundColor(Color.lvSecondary)
        }
    }
}

// MARK: - Score Text

struct ScoreText: View {
    let home: Int
    let away: Int
    let isLive: Bool

    var body: some View {
        Text("\(home) - \(away)")
            .font(.system(size: 14, weight: .bold, design: .monospaced))
            .foregroundColor(isLive ? Color.lvGreen : .white)
    }
}

// MARK: - Branding

struct BrandingHeader: View {
    let liveCount: Int

    var body: some View {
        HStack {
            Text("LIVEVIEW")
                .font(.system(size: 9, weight: .bold, design: .monospaced))
                .foregroundColor(Color.lvGreen)
                .tracking(2)
            Spacer()
            if liveCount > 0 {
                HStack(spacing: 3) {
                    Circle()
                        .fill(Color.lvRed)
                        .frame(width: 5, height: 5)
                    Text("\(liveCount) live")
                        .font(.system(size: 9, weight: .medium))
                        .foregroundColor(Color.lvSecondary)
                }
            }
        }
    }
}

// MARK: - Small Widget View

struct SmallScoresView: View {
    let data: WidgetData

    var body: some View {
        let displayMatches = Array(data.matches.prefix(3))

        VStack(alignment: .leading, spacing: 0) {
            BrandingHeader(liveCount: data.liveCount)
                .padding(.bottom, 6)

            if displayMatches.isEmpty {
                Spacer()
                Text("No scores yet")
                    .font(.system(size: 11))
                    .foregroundColor(Color.lvSecondary)
                    .frame(maxWidth: .infinity)
                Spacer()
            } else {
                ForEach(displayMatches) { match in
                    VStack(spacing: 2) {
                        HStack(spacing: 0) {
                            Text(match.homeShort)
                                .font(.system(size: 11, weight: .semibold))
                                .foregroundColor(.white)
                                .frame(width: 36, alignment: .leading)

                            Spacer()

                            Text("\(match.homeScore)")
                                .font(.system(size: 13, weight: .bold, design: .monospaced))
                                .foregroundColor(match.isLive ? Color.lvGreen : .white)

                            Text(" - ")
                                .font(.system(size: 11))
                                .foregroundColor(Color.lvSecondary)

                            Text("\(match.awayScore)")
                                .font(.system(size: 13, weight: .bold, design: .monospaced))
                                .foregroundColor(match.isLive ? Color.lvGreen : .white)

                            Spacer()

                            Text(match.awayShort)
                                .font(.system(size: 11, weight: .semibold))
                                .foregroundColor(.white)
                                .frame(width: 36, alignment: .trailing)
                        }

                        HStack {
                            StatusBadge(match: match)
                            Spacer()
                            Text(match.league)
                                .font(.system(size: 7, weight: .medium))
                                .foregroundColor(Color.lvSecondary)
                        }
                    }
                    .padding(.vertical, 4)
                    .padding(.horizontal, 6)
                    .background(Color.lvCardBg)
                    .clipShape(RoundedRectangle(cornerRadius: 6))
                    .padding(.bottom, 3)
                }
            }

            Spacer(minLength: 0)
        }
        .padding(12)
    }
}

// MARK: - Medium Widget View

struct MediumScoresView: View {
    let data: WidgetData

    var body: some View {
        let displayMatches = Array(data.matches.prefix(4))

        VStack(alignment: .leading, spacing: 0) {
            BrandingHeader(liveCount: data.liveCount)
                .padding(.bottom, 6)

            if displayMatches.isEmpty {
                Spacer()
                Text("No scores available")
                    .font(.system(size: 12))
                    .foregroundColor(Color.lvSecondary)
                    .frame(maxWidth: .infinity)
                Spacer()
            } else {
                ForEach(displayMatches) { match in
                    HStack(spacing: 0) {
                        // Home team
                        VStack(alignment: .leading, spacing: 1) {
                            Text(match.homeShort)
                                .font(.system(size: 12, weight: .bold))
                                .foregroundColor(.white)
                            Text(shortenTeamName(match.homeTeam))
                                .font(.system(size: 8))
                                .foregroundColor(Color.lvSecondary)
                                .lineLimit(1)
                        }
                        .frame(width: 70, alignment: .leading)

                        Spacer()

                        // Score
                        VStack(spacing: 1) {
                            Text("\(match.homeScore) - \(match.awayScore)")
                                .font(.system(size: 15, weight: .bold, design: .monospaced))
                                .foregroundColor(match.isLive ? Color.lvGreen : .white)
                            StatusBadge(match: match)
                        }

                        Spacer()

                        // Away team
                        VStack(alignment: .trailing, spacing: 1) {
                            Text(match.awayShort)
                                .font(.system(size: 12, weight: .bold))
                                .foregroundColor(.white)
                            Text(shortenTeamName(match.awayTeam))
                                .font(.system(size: 8))
                                .foregroundColor(Color.lvSecondary)
                                .lineLimit(1)
                        }
                        .frame(width: 70, alignment: .trailing)

                        // League badge
                        Text(match.league)
                            .font(.system(size: 7, weight: .medium))
                            .foregroundColor(Color.lvGreen)
                            .padding(.horizontal, 4)
                            .padding(.vertical, 2)
                            .background(Color.lvGreen.opacity(0.12))
                            .clipShape(RoundedRectangle(cornerRadius: 3))
                            .frame(width: 40)
                    }
                    .padding(.vertical, 5)
                    .padding(.horizontal, 8)
                    .background(Color.lvCardBg)
                    .clipShape(RoundedRectangle(cornerRadius: 6))
                    .padding(.bottom, 3)
                }
            }

            Spacer(minLength: 0)
        }
        .padding(12)
    }
}

// MARK: - Large Widget View

struct LargeScoresView: View {
    let data: WidgetData

    var body: some View {
        let displayMatches = Array(data.matches.prefix(8))

        VStack(alignment: .leading, spacing: 0) {
            // Header
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("LIVEVIEW")
                        .font(.system(size: 10, weight: .bold, design: .monospaced))
                        .foregroundColor(Color.lvGreen)
                        .tracking(2)
                    Text("Live Scores")
                        .font(.system(size: 11))
                        .foregroundColor(Color.lvSecondary)
                }

                Spacer()

                VStack(alignment: .trailing, spacing: 2) {
                    if data.liveCount > 0 {
                        HStack(spacing: 3) {
                            Circle()
                                .fill(Color.lvRed)
                                .frame(width: 6, height: 6)
                            Text("\(data.liveCount) live")
                                .font(.system(size: 10, weight: .semibold))
                                .foregroundColor(Color.lvRed)
                        }
                    }
                    Text("\(data.totalCount) matches today")
                        .font(.system(size: 9))
                        .foregroundColor(Color.lvSecondary)
                }
            }
            .padding(.bottom, 8)

            // Green accent line
            Rectangle()
                .fill(Color.lvGreen)
                .frame(height: 1)
                .padding(.bottom, 8)

            if displayMatches.isEmpty {
                Spacer()
                VStack(spacing: 4) {
                    Image(systemName: "sportscourt")
                        .font(.title2)
                        .foregroundColor(Color.lvSecondary)
                    Text("No scores available")
                        .font(.system(size: 12))
                        .foregroundColor(Color.lvSecondary)
                }
                .frame(maxWidth: .infinity)
                Spacer()
            } else {
                ForEach(displayMatches) { match in
                    HStack(spacing: 0) {
                        // Home team with logo placeholder
                        HStack(spacing: 6) {
                            Circle()
                                .fill(Color.lvGreen.opacity(0.15))
                                .frame(width: 20, height: 20)
                                .overlay(
                                    Text(String(match.homeShort.prefix(1)))
                                        .font(.system(size: 9, weight: .bold))
                                        .foregroundColor(Color.lvGreen)
                                )

                            VStack(alignment: .leading, spacing: 1) {
                                Text(match.homeShort)
                                    .font(.system(size: 12, weight: .bold))
                                    .foregroundColor(.white)
                                Text(match.homeTeam)
                                    .font(.system(size: 8))
                                    .foregroundColor(Color.lvSecondary)
                                    .lineLimit(1)
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)

                        // Score & Status
                        VStack(spacing: 2) {
                            Text("\(match.homeScore) - \(match.awayScore)")
                                .font(.system(size: 16, weight: .bold, design: .monospaced))
                                .foregroundColor(match.isLive ? Color.lvGreen : .white)
                            StatusBadge(match: match)
                        }
                        .frame(width: 70)

                        // Away team with logo placeholder
                        HStack(spacing: 6) {
                            VStack(alignment: .trailing, spacing: 1) {
                                Text(match.awayShort)
                                    .font(.system(size: 12, weight: .bold))
                                    .foregroundColor(.white)
                                Text(match.awayTeam)
                                    .font(.system(size: 8))
                                    .foregroundColor(Color.lvSecondary)
                                    .lineLimit(1)
                            }

                            Circle()
                                .fill(Color.lvGreen.opacity(0.15))
                                .frame(width: 20, height: 20)
                                .overlay(
                                    Text(String(match.awayShort.prefix(1)))
                                        .font(.system(size: 9, weight: .bold))
                                        .foregroundColor(Color.lvGreen)
                                )
                        }
                        .frame(maxWidth: .infinity, alignment: .trailing)
                    }
                    .padding(.vertical, 5)
                    .padding(.horizontal, 8)
                    .background(Color.lvCardBg)
                    .clipShape(RoundedRectangle(cornerRadius: 6))
                    .padding(.bottom, 3)
                }
            }

            Spacer(minLength: 0)

            // Footer
            HStack {
                Spacer()
                Text("Updated \(data.lastUpdated, style: .time)")
                    .font(.system(size: 8))
                    .foregroundColor(Color.lvSecondary)
            }
        }
        .padding(14)
    }
}

// MARK: - Helpers

private func shortenTeamName(_ name: String) -> String {
    let parts = name.split(separator: " ")
    if let last = parts.last {
        return String(last)
    }
    return name
}

// MARK: - Widget Entry View (routes to correct size)

struct LiveViewWidgetEntryView: View {
    @Environment(\.widgetFamily) var widgetFamily
    let entry: ScoresEntry

    var body: some View {
        switch widgetFamily {
        case .systemSmall:
            SmallScoresView(data: entry.data)
        case .systemMedium:
            MediumScoresView(data: entry.data)
        case .systemLarge:
            LargeScoresView(data: entry.data)
        default:
            MediumScoresView(data: entry.data)
        }
    }
}

// MARK: - Widget

struct LiveViewWidget: Widget {
    let kind: String = "LiveViewScores"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: ScoresProvider()) { entry in
            LiveViewWidgetEntryView(entry: entry)
                .containerBackground(Color.lvBackground, for: .widget)
        }
        .configurationDisplayName("Live Scores")
        .description("See live and recent sports scores from LiveView")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

// MARK: - Previews

#Preview(as: .systemSmall) {
    LiveViewWidget()
} timeline: {
    ScoresEntry(date: .now, data: .placeholder)
}

#Preview(as: .systemMedium) {
    LiveViewWidget()
} timeline: {
    ScoresEntry(date: .now, data: .placeholder)
}

#Preview(as: .systemLarge) {
    LiveViewWidget()
} timeline: {
    ScoresEntry(date: .now, data: .placeholder)
}
