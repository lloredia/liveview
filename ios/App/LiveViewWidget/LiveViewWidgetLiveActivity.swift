//
//  LiveViewWidgetLiveActivity.swift
//  LiveViewWidget
//
//  Created by Lesley Oredia on 2/24/26.
//

import ActivityKit
import WidgetKit
import SwiftUI

struct LiveViewWidgetAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        // Dynamic stateful properties about your activity go here!
        var emoji: String
    }

    // Fixed non-changing properties about your activity go here!
    var name: String
}

struct LiveViewWidgetLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: LiveViewWidgetAttributes.self) { context in
            // Lock screen/banner UI goes here
            VStack {
                Text("Hello \(context.state.emoji)")
            }
            .activityBackgroundTint(Color.cyan)
            .activitySystemActionForegroundColor(Color.black)

        } dynamicIsland: { context in
            DynamicIsland {
                // Expanded UI goes here.  Compose the expanded UI through
                // various regions, like leading/trailing/center/bottom
                DynamicIslandExpandedRegion(.leading) {
                    Text("Leading")
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text("Trailing")
                }
                DynamicIslandExpandedRegion(.bottom) {
                    Text("Bottom \(context.state.emoji)")
                    // more content
                }
            } compactLeading: {
                Text("L")
            } compactTrailing: {
                Text("T \(context.state.emoji)")
            } minimal: {
                Text(context.state.emoji)
            }
            .widgetURL(URL(string: "http://www.apple.com"))
            .keylineTint(Color.red)
        }
    }
}

extension LiveViewWidgetAttributes {
    fileprivate static var preview: LiveViewWidgetAttributes {
        LiveViewWidgetAttributes(name: "World")
    }
}

extension LiveViewWidgetAttributes.ContentState {
    fileprivate static var smiley: LiveViewWidgetAttributes.ContentState {
        LiveViewWidgetAttributes.ContentState(emoji: "😀")
     }
     
     fileprivate static var starEyes: LiveViewWidgetAttributes.ContentState {
         LiveViewWidgetAttributes.ContentState(emoji: "🤩")
     }
}

#Preview("Notification", as: .content, using: LiveViewWidgetAttributes.preview) {
   LiveViewWidgetLiveActivity()
} contentStates: {
    LiveViewWidgetAttributes.ContentState.smiley
    LiveViewWidgetAttributes.ContentState.starEyes
}
