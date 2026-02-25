# LiveView Widget Extension (Dynamic Island / Live Activity)

This folder contains the **Widget Extension** source for the Live Activity that shows tracked live games in the **Dynamic Island** (iPhone 14 Pro and later) and on the **Lock Screen**.

## Add the Widget Extension target in Xcode

1. Open **App.xcodeproj** in Xcode.
2. **File → New → Target…**
3. Choose **Widget Extension**, click **Next**.
4. **Product Name:** `LiveViewWidget`
5. **Include Live Activity:** ✓ checked  
6. **Include Configuration App Intent:** unchecked  
7. Click **Finish**. When asked “Activate LiveViewWidget scheme?”, choose **Cancel** (keep the App scheme).
8. **Delete** the files Xcode generated in the new LiveViewWidget group (e.g. `LiveViewWidget.swift`, `LiveViewWidgetLiveActivity.swift`, etc.).
9. **Add** the files from this folder to the LiveViewWidget target:
   - `LiveViewWidgetBundle.swift` (replace the default)
   - `LiveViewLiveActivityWidget.swift` (replace the default Live Activity file)
   - Set the Widget’s **Info.plist** to the one in this folder (or copy its `NSExtension` / `NSExtensionPointIdentifier` into the target’s Info.plist).
10. **Add the LiveViewLiveActivity package** to the Widget Extension target:
    - Select the **LiveViewWidget** target → **General** → **Frameworks, Libraries, and Embedded Content** → **+** → under **Package Dependencies** choose **LiveViewLiveActivity** → **Add**.
11. Set the Widget Extension’s **iOS Deployment Target** to **16.2** or later (Live Activities require 16.2+).
12. Ensure the **App** target **embeds** the Widget Extension: **App** target → **General** → **Frameworks, Libraries, and Embedded Content** → the `LiveViewWidgetExtension.appex` should be listed (Xcode usually adds it when you create the target).

## Behavior

- The **main app** starts/updates the Live Activity via `LiveActivityManager` when the web app calls the `LiveActivityPlugin` with the list of tracked games.
- This **Widget Extension** only provides the **UI**: compact and expanded Dynamic Island views and the Lock Screen view.
- When there are no live tracked games, the app ends the activity so the island clears.

## Testing

- **Use the App scheme, not LiveViewWidgetExtension.** Widget extensions don’t run on their own—they’re loaded by the system when the main app starts a Live Activity. If you run the “LiveViewWidgetExtension” scheme, you may see “Failed to show Widget” or “SendProcessControlEvent… Code=8”; that’s normal. Always run the **App** scheme.
- Run the **App** on a **real device** with Dynamic Island (e.g. iPhone 14 Pro or later) or on a **simulator** that supports Live Activities (e.g. iPhone 15 Pro, iPhone 16/17 Pro).
- Track one or more **live** games from the app; the Live Activity should appear in the Dynamic Island and on the Lock Screen and update as scores change.
- When debugging, you may see “Connection invalidated” or SIGTERM for the `LiveViewWidget` process. This is normal: widget extensions are short-lived and the system terminates them after rendering. If the Dynamic Island is updating with scores, the feature is working.
