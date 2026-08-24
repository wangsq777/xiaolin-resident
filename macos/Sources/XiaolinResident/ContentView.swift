import MusicKit
import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var music: MusicController
    @State private var searchTerm = "林家谦"

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [
                    Color(red: 0.08, green: 0.10, blue: 0.16),
                    Color(red: 0.14, green: 0.17, blue: 0.25),
                    Color(red: 0.18, green: 0.15, blue: 0.22)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            Circle()
                .fill(Color.purple.opacity(0.18))
                .frame(width: 360, height: 360)
                .blur(radius: 70)
                .offset(x: 190, y: -280)

            VStack(spacing: 18) {
                header

                HStack(alignment: .center, spacing: 22) {
                    ChibiCharacterView(playbackStatus: music.playbackStatus)
                        .frame(width: 190, height: 220)

                    nowPlayingCard
                }

                if music.isAuthorized {
                    searchArea
                } else {
                    authorizationCard
                }

                if let errorMessage = music.errorMessage {
                    errorBanner(errorMessage)
                }

                Spacer(minLength: 0)
            }
            .padding(24)
        }
        .task {
            await music.bootstrap()
        }
    }

    private var header: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text("小林驻留中")
                    .font(.system(size: 25, weight: .semibold, design: .rounded))
                    .foregroundStyle(.white)
                Text("Apple Music 原型 · 只先把歌放起来")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(.white.opacity(0.55))
            }

            Spacer()

            HStack(spacing: 7) {
                Circle()
                    .fill(music.canPlayCatalogContent ? Color.green : Color.orange)
                    .frame(width: 8, height: 8)
                Text(music.canPlayCatalogContent ? "MusicKit 已连接" : "等待连接")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.white.opacity(0.72))
            }
            .padding(.horizontal, 11)
            .padding(.vertical, 7)
            .background(.white.opacity(0.07), in: Capsule())
        }
    }

    private var nowPlayingCard: some View {
        VStack(alignment: .leading, spacing: 13) {
            Text(statusText)
                .font(.caption.weight(.bold))
                .foregroundStyle(Color(red: 0.81, green: 0.69, blue: 1.0))
                .textCase(.uppercase)

            HStack(spacing: 12) {
                artwork

                VStack(alignment: .leading, spacing: 4) {
                    Text(music.currentTitle)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(.white)
                        .lineLimit(2)
                    Text(music.currentArtist)
                        .font(.caption)
                        .foregroundStyle(.white.opacity(0.55))
                        .lineLimit(1)
                }
            }

            HStack(spacing: 18) {
                playerButton(systemName: "backward.fill") {
                    Task { await music.skipToPrevious() }
                }

                Button {
                    Task { await music.togglePlayback() }
                } label: {
                    Image(systemName: music.isPlaying ? "pause.fill" : "play.fill")
                        .font(.system(size: 18, weight: .bold))
                        .frame(width: 46, height: 46)
                        .foregroundStyle(Color(red: 0.12, green: 0.12, blue: 0.18))
                        .background(.white, in: Circle())
                }
                .buttonStyle(.plain)
                .disabled(!music.canPlayCatalogContent)

                playerButton(systemName: "forward.fill") {
                    Task { await music.skipToNext() }
                }
            }
            .frame(maxWidth: .infinity)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.white.opacity(0.075), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .stroke(.white.opacity(0.08), lineWidth: 1)
        }
    }

    @ViewBuilder
    private var artwork: some View {
        if let url = music.currentArtworkURL {
            AsyncImage(url: url) { phase in
                if let image = phase.image {
                    image.resizable().scaledToFill()
                } else {
                    artworkPlaceholder
                }
            }
            .frame(width: 64, height: 64)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        } else {
            artworkPlaceholder
        }
    }

    private var artworkPlaceholder: some View {
        RoundedRectangle(cornerRadius: 12, style: .continuous)
            .fill(
                LinearGradient(
                    colors: [Color.purple.opacity(0.8), Color.indigo.opacity(0.8)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
            .frame(width: 64, height: 64)
            .overlay {
                Image(systemName: "music.note")
                    .font(.system(size: 24, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.8))
            }
    }

    private var authorizationCard: some View {
        VStack(spacing: 14) {
            Image(systemName: "apple.logo")
                .font(.system(size: 28, weight: .semibold))
                .foregroundStyle(.white)

            Text("连接 Apple Music")
                .font(.headline)
                .foregroundStyle(.white)

            Text("只请求搜索和播放音乐所需的系统权限。你的账号资料不会保存到别处。")
                .font(.subheadline)
                .foregroundStyle(.white.opacity(0.6))
                .multilineTextAlignment(.center)
                .frame(maxWidth: 360)

            Button("允许访问 Apple Music") {
                Task { await music.requestAuthorization() }
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
        }
        .frame(maxWidth: .infinity)
        .padding(28)
        .background(.white.opacity(0.07), in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    }

    private var searchArea: some View {
        VStack(spacing: 12) {
            HStack(spacing: 10) {
                Image(systemName: "magnifyingglass")
                    .foregroundStyle(.white.opacity(0.45))

                TextField("搜索歌曲或歌手", text: $searchTerm)
                    .textFieldStyle(.plain)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(.white)
                    .onSubmit {
                        Task { await music.search(searchTerm) }
                    }

                if music.isSearching {
                    ProgressView()
                        .controlSize(.small)
                } else {
                    Button("搜索") {
                        Task { await music.search(searchTerm) }
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(Color.purple.opacity(0.75))
                }
            }
            .padding(.horizontal, 15)
            .padding(.vertical, 12)
            .background(.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 14, style: .continuous))

            if music.searchResults.isEmpty {
                VStack(spacing: 8) {
                    Image(systemName: "music.quarternote.3")
                        .font(.title2)
                    Text("搜索一首歌，小林才有节拍可打。")
                        .font(.subheadline)
                }
                .foregroundStyle(.white.opacity(0.38))
                .frame(maxWidth: .infinity, minHeight: 130)
            } else {
                ScrollView {
                    LazyVStack(spacing: 8) {
                        ForEach(music.searchResults, id: \.id) { song in
                            SongRow(song: song) {
                                Task { await music.play(song) }
                            }
                        }
                    }
                }
                .frame(maxHeight: 245)
            }
        }
    }

    private func errorBanner(_ message: String) -> some View {
        HStack(spacing: 10) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(.orange)
            Text(message)
                .font(.caption)
                .foregroundStyle(.white.opacity(0.78))
            Spacer()
            Button {
                music.dismissError()
            } label: {
                Image(systemName: "xmark")
            }
            .buttonStyle(.plain)
            .foregroundStyle(.white.opacity(0.5))
        }
        .padding(12)
        .background(Color.orange.opacity(0.12), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private func playerButton(systemName: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(.white.opacity(0.75))
                .frame(width: 34, height: 34)
        }
        .buttonStyle(.plain)
        .disabled(!music.canPlayCatalogContent)
    }

    private var statusText: String {
        switch music.playbackStatus {
        case .playing:
            return "正在播放"
        case .paused:
            return "暂停中"
        case .interrupted:
            return "播放被打断"
        case .seekingForward, .seekingBackward:
            return "寻找节拍"
        case .stopped:
            return "等待播放"
        @unknown default:
            return "Apple Music"
        }
    }
}

private struct SongRow: View {
    let song: Song
    let play: () -> Void

    var body: some View {
        Button(action: play) {
            HStack(spacing: 12) {
                AsyncImage(url: song.artwork?.url(width: 112, height: 112)) { phase in
                    if let image = phase.image {
                        image.resizable().scaledToFill()
                    } else {
                        RoundedRectangle(cornerRadius: 9)
                            .fill(.white.opacity(0.08))
                            .overlay {
                                Image(systemName: "music.note")
                                    .foregroundStyle(.white.opacity(0.4))
                            }
                    }
                }
                .frame(width: 46, height: 46)
                .clipShape(RoundedRectangle(cornerRadius: 9, style: .continuous))

                VStack(alignment: .leading, spacing: 3) {
                    Text(song.title)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(.white)
                        .lineLimit(1)
                    Text(song.artistName)
                        .font(.caption)
                        .foregroundStyle(.white.opacity(0.5))
                        .lineLimit(1)
                }

                Spacer()

                Image(systemName: "play.fill")
                    .font(.caption)
                    .foregroundStyle(.white.opacity(0.65))
                    .frame(width: 30, height: 30)
                    .background(.white.opacity(0.08), in: Circle())
            }
            .padding(9)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .background(.white.opacity(0.045), in: RoundedRectangle(cornerRadius: 13, style: .continuous))
    }
}
