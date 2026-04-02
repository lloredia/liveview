import UIKit
import Capacitor
import WebKit

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    /// Shared WKProcessPool so the web view reuses a pre-warmed WebKit process.
    static let sharedProcessPool = WKProcessPool()

    /// A lightweight "warm-up" web view created early to prime WebKit.
    /// This is discarded once the Capacitor bridge loads the real content.
    private var warmupWebView: WKWebView?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Pre-warm WebKit by creating a throwaway WKWebView early.
        // This forces the WebKit process to launch before the Capacitor bridge
        // creates its own web view, reducing perceived load time.
        let config = WKWebViewConfiguration()
        config.processPool = AppDelegate.sharedProcessPool
        let wv = WKWebView(frame: .zero, configuration: config)
        wv.loadHTMLString("<html></html>", baseURL: nil)
        warmupWebView = wv

        // Dismiss after a short delay — the process pool is already warm.
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) { [weak self] in
            self?.warmupWebView = nil
        }

        return true
    }

    func application(_ application: UIApplication, configurationForConnecting connectingSceneSession: UISceneSession, options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        return UISceneConfiguration(name: "Default Configuration", sessionRole: connectingSceneSession.role)
    }

    func application(_ application: UIApplication, didDiscardSceneSessions sceneSessions: Set<UISceneSession>) {}

    func applicationWillResignActive(_ application: UIApplication) {}

    func applicationDidEnterBackground(_ application: UIApplication) {}

    func applicationWillEnterForeground(_ application: UIApplication) {}

    func applicationDidBecomeActive(_ application: UIApplication) {}

    func applicationWillTerminate(_ application: UIApplication) {}

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}
