import Combine
import Foundation
import MusicKit

@MainActor
final class MusicController: ObservableObject {
    @Published private(set) var authorizationStatus = MusicAuthorization.currentStatus
    @Published private(set) var canPlayCatalogContent = false
    @Published private(set) var searchResults: [Song] = []
    @Published private(set) var isSearching = false
    @Published private(set) var playbackStatus: MusicPlayer.PlaybackStatus = .stopped
    @Published private(set) var currentTitle = "还没有播放歌曲"
    @Published private(set) var currentArtist = "连接 Apple Music 后，选一首歌吧"
    @Published private(set) var currentArtworkURL: URL?
    @Published var errorMessage: String?

    private let player = ApplicationMusicPlayer.shared
    private var cancellables = Set<AnyCancellable>()

    var isAuthorized: Bool {
        if case .authorized = authorizationStatus { return true }
        return false
    }

    var isPlaying: Bool {
        if case .playing = playbackStatus { return true }
        return false
    }

    init() {
        player.state.objectWillChange
            .receive(on: RunLoop.main)
            .sink { [weak self] _ in
                Task { @MainActor in
                    self?.refreshPlaybackState()
                }
            }
            .store(in: &cancellables)

        player.queue.objectWillChange
            .receive(on: RunLoop.main)
            .sink { [weak self] _ in
                Task { @MainActor in
                    self?.refreshPlaybackState()
                }
            }
            .store(in: &cancellables)

        refreshPlaybackState()
    }

    func bootstrap() async {
        authorizationStatus = MusicAuthorization.currentStatus
        guard isAuthorized else { return }
        await loadSubscriptionState()
    }

    func requestAuthorization() async {
        errorMessage = nil
        authorizationStatus = await MusicAuthorization.request()

        guard isAuthorized else {
            errorMessage = "没有获得 Apple Music 权限。可以稍后在系统设置中重新授权。"
            return
        }

        await loadSubscriptionState()
    }

    func search(_ rawTerm: String) async {
        let term = rawTerm.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !term.isEmpty else {
            searchResults = []
            return
        }

        guard isAuthorized else {
            errorMessage = "请先允许访问 Apple Music。"
            return
        }

        guard canPlayCatalogContent else {
            errorMessage = "当前 Apple Music 账户没有可用的曲库播放权限。"
            return
        }

        isSearching = true
        errorMessage = nil
        defer { isSearching = false }

        do {
            var request = MusicCatalogSearchRequest(term: term, types: [Song.self])
            request.limit = 12
            let response = try await request.response()
            searchResults = Array(response.songs)

            if searchResults.isEmpty {
                errorMessage = "没有找到相关歌曲。换一个关键词试试。"
            }
        } catch {
            errorMessage = "搜索失败：\(error.localizedDescription)"
        }
    }

    func play(_ song: Song) async {
        guard canPlayCatalogContent else {
            errorMessage = "当前账户暂时无法播放 Apple Music 曲库。"
            return
        }

        errorMessage = nil
        do {
            player.queue = ApplicationMusicPlayer.Queue(for: [song], startingAt: song)
            try await player.prepareToPlay()
            try await player.play()
            refreshPlaybackState(fallbackSong: song)
        } catch {
            errorMessage = "播放失败：\(error.localizedDescription)"
        }
    }

    func togglePlayback() async {
        errorMessage = nil

        if isPlaying {
            player.pause()
            refreshPlaybackState()
            return
        }

        do {
            try await player.play()
            refreshPlaybackState()
        } catch {
            errorMessage = "无法继续播放：\(error.localizedDescription)"
        }
    }

    func skipToNext() async {
        do {
            try await player.skipToNextEntry()
            refreshPlaybackState()
        } catch {
            errorMessage = "已经没有下一首了。"
        }
    }

    func skipToPrevious() async {
        do {
            try await player.skipToPreviousEntry()
            refreshPlaybackState()
        } catch {
            errorMessage = "已经回到队列开头了。"
        }
    }

    func dismissError() {
        errorMessage = nil
    }

    private func loadSubscriptionState() async {
        do {
            let subscription = try await MusicSubscription.current
            canPlayCatalogContent = subscription.canPlayCatalogContent
            if !canPlayCatalogContent {
                errorMessage = "这个 Apple Music 账户目前不能播放曲库内容，请确认订阅状态。"
            }
        } catch {
            canPlayCatalogContent = false
            errorMessage = "无法确认 Apple Music 订阅：\(error.localizedDescription)"
        }
    }

    private func refreshPlaybackState(fallbackSong: Song? = nil) {
        playbackStatus = player.state.playbackStatus

        if let entry = player.queue.currentEntry {
            currentTitle = entry.title
            currentArtist = entry.subtitle ?? "Apple Music"
            currentArtworkURL = entry.artwork?.url(width: 400, height: 400)
        } else if let fallbackSong {
            currentTitle = fallbackSong.title
            currentArtist = fallbackSong.artistName
            currentArtworkURL = fallbackSong.artwork?.url(width: 400, height: 400)
        }
    }
}
