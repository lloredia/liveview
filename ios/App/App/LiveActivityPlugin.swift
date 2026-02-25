import Capacitor
import LiveViewLiveActivity

@objc(LiveActivityPlugin)
public class LiveActivityPlugin: CAPPlugin, CAPBridgedPlugin {

    public let identifier = "LiveActivityPlugin"
    public let jsName = "LiveActivityPlugin"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "updateTrackedGames", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "endLiveActivity", returnType: CAPPluginReturnPromise),
    ]

    @objc func updateTrackedGames(_ call: CAPPluginCall) {
        guard let games = call.getArray("games") else {
            call.reject("Missing 'games' array")
            return
        }

        var items: [LiveGameItem] = []
        for g in games {
            guard let obj = g as? [String: Any],
                  let matchId = obj["matchId"] as? String,
                  let homeName = obj["homeName"] as? String,
                  let awayName = obj["awayName"] as? String else { continue }
            let scoreHome = (obj["scoreHome"] as? NSNumber)?.intValue ?? 0
            let scoreAway = (obj["scoreAway"] as? NSNumber)?.intValue ?? 0
            let isLive = (obj["isLive"] as? NSNumber)?.boolValue ?? false
            let phaseLabel = obj["phaseLabel"] as? String ?? ""
            items.append(LiveGameItem(
                matchId: matchId,
                homeName: homeName,
                awayName: awayName,
                scoreHome: scoreHome,
                scoreAway: scoreAway,
                isLive: isLive,
                phaseLabel: phaseLabel
            ))
        }

        Task {
            await LiveActivityManager.update(with: items)
            call.resolve()
        }
    }

    @objc func endLiveActivity(_ call: CAPPluginCall) {
        Task {
            await LiveActivityManager.endActivity()
            call.resolve()
        }
    }
}
