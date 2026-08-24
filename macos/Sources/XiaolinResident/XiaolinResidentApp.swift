import AppKit
import SwiftUI

@main
struct XiaolinResidentApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var musicController = MusicController()

    var body: some Scene {
        WindowGroup("小林驻留中") {
            ContentView()
                .environmentObject(musicController)
                .frame(minWidth: 520, minHeight: 680)
        }
        .defaultSize(width: 560, height: 720)
        .windowResizability(.contentMinSize)
        .commands {
            CommandGroup(replacing: .newItem) { }
        }
    }
}

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)

        DispatchQueue.main.async {
            guard let window = NSApp.windows.first else { return }
            window.level = .floating
            window.titlebarAppearsTransparent = true
            window.isMovableByWindowBackground = true
            window.backgroundColor = .clear
            window.center()
        }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }
}
