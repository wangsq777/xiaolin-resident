// swift-tools-version: 5.10

import PackageDescription

let package = Package(
    name: "XiaolinResident",
    platforms: [
        .macOS(.v14)
    ],
    products: [
        .executable(name: "XiaolinResident", targets: ["XiaolinResident"])
    ],
    targets: [
        .executableTarget(
            name: "XiaolinResident",
            path: "Sources/XiaolinResident"
        )
    ]
)
