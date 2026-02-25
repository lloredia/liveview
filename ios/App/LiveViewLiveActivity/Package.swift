// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "LiveViewLiveActivity",
    platforms: [.iOS(.v16)],
    products: [
        .library(name: "LiveViewLiveActivity", targets: ["LiveViewLiveActivity"]),
    ],
    targets: [
        .target(
            name: "LiveViewLiveActivity",
            dependencies: []
        ),
    ]
)
