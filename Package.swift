// swift-tools-version: 6.1
import PackageDescription

let package = Package(
    name: "xHarbor",
    platforms: [
        .macOS(.v14),
        .iOS(.v17)
    ],
    products: [
        .library(
            name: "XTalkDomain",
            targets: ["XTalkDomain"]
        ),
        .executable(
            name: "xtalk-macos",
            targets: ["XTalkMacOSApp"]
        )
    ],
    targets: [
        .target(
            name: "XTalkDomain",
            dependencies: []
        ),
        .executableTarget(
            name: "XTalkMacOSApp",
            dependencies: ["XTalkDomain"]
        ),
        .testTarget(
            name: "XTalkDomainTests",
            dependencies: ["XTalkDomain"]
        )
    ]
)
