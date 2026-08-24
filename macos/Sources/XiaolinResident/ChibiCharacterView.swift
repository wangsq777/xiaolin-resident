import MusicKit
import SwiftUI

/// 第一版的代码绘制占位角色。后续可以不改 MusicKit 逻辑，直接替换为正式序列帧或 Live2D 视图。
struct ChibiCharacterView: View {
    let playbackStatus: MusicPlayer.PlaybackStatus

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30.0)) { timeline in
            let time = timeline.date.timeIntervalSinceReferenceDate
            let motion = CharacterMotion(status: playbackStatus, time: time)

            ZStack {
                if motion.showsNotes {
                    FloatingMusicNotes(time: time)
                        .transition(.opacity)
                }

                ChibiMusician(blinkAmount: motion.blinkAmount, isListening: motion.isListening)
                    .scaleEffect(x: 1, y: motion.breathScale, anchor: .bottom)
                    .rotationEffect(.degrees(motion.rotation))
                    .offset(y: motion.verticalOffset)
            }
            .animation(.easeInOut(duration: 0.25), value: motion.isListening)
        }
        .accessibilityLabel(accessibilityLabel)
    }

    private var accessibilityLabel: String {
        if case .playing = playbackStatus {
            return "小林正在戴着耳机听歌"
        }
        if case .paused = playbackStatus {
            return "小林在等你继续播放"
        }
        return "小林安静地待在桌面上"
    }
}

private struct CharacterMotion {
    let breathScale: CGFloat
    let rotation: Double
    let verticalOffset: CGFloat
    let blinkAmount: CGFloat
    let isListening: Bool
    let showsNotes: Bool

    init(status: MusicPlayer.PlaybackStatus, time: TimeInterval) {
        let isPlaying: Bool
        if case .playing = status {
            isPlaying = true
        } else {
            isPlaying = false
        }

        let isPaused: Bool
        if case .paused = status {
            isPaused = true
        } else {
            isPaused = false
        }

        breathScale = 1 + CGFloat(sin(time * 2.1)) * 0.014
        rotation = isPlaying ? sin(time * 3.2) * 3.2 : sin(time * 0.9) * 0.7
        verticalOffset = isPlaying ? CGFloat(sin(time * 6.4)) * 2.0 : 0
        isListening = isPlaying || isPaused
        showsNotes = isPlaying

        let blinkCycle = time.truncatingRemainder(dividingBy: 4.6)
        blinkAmount = blinkCycle < 0.12 ? 1 : 0
    }
}

private struct ChibiMusician: View {
    let blinkAmount: CGFloat
    let isListening: Bool

    var body: some View {
        ZStack(alignment: .bottom) {
            legs
                .offset(y: 3)

            torso
                .offset(y: -17)

            head
                .offset(y: -78)
        }
        .frame(width: 150, height: 202)
    }

    private var legs: some View {
        HStack(spacing: 16) {
            Capsule()
                .fill(Color(red: 0.12, green: 0.13, blue: 0.17))
                .frame(width: 24, height: 50)
                .overlay(alignment: .bottom) {
                    Capsule()
                        .fill(Color(red: 0.04, green: 0.04, blue: 0.06))
                        .frame(width: 30, height: 14)
                        .offset(x: -3)
                }

            Capsule()
                .fill(Color(red: 0.12, green: 0.13, blue: 0.17))
                .frame(width: 24, height: 50)
                .overlay(alignment: .bottom) {
                    Capsule()
                        .fill(Color(red: 0.04, green: 0.04, blue: 0.06))
                        .frame(width: 30, height: 14)
                        .offset(x: 3)
                }
        }
    }

    private var torso: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 29, style: .continuous)
                .fill(
                    LinearGradient(
                        colors: [
                            Color(red: 0.28, green: 0.36, blue: 0.58),
                            Color(red: 0.17, green: 0.22, blue: 0.39)
                        ],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                )
                .frame(width: 94, height: 86)
                .overlay(alignment: .top) {
                    Capsule()
                        .fill(.white.opacity(0.12))
                        .frame(width: 34, height: 5)
                        .offset(y: 14)
                }

            HStack(spacing: 72) {
                Capsule()
                    .fill(Color(red: 0.22, green: 0.29, blue: 0.49))
                    .frame(width: 23, height: 72)
                    .rotationEffect(.degrees(13))
                Capsule()
                    .fill(Color(red: 0.22, green: 0.29, blue: 0.49))
                    .frame(width: 23, height: 72)
                    .rotationEffect(.degrees(-13))
            }
            .offset(y: 2)
        }
    }

    private var head: some View {
        ZStack {
            Ellipse()
                .fill(Color(red: 0.94, green: 0.78, blue: 0.66))
                .frame(width: 112, height: 101)
                .shadow(color: .black.opacity(0.22), radius: 16, y: 8)

            hair

            eyes
                .offset(y: 10)

            Capsule()
                .fill(Color(red: 0.45, green: 0.20, blue: 0.20).opacity(0.65))
                .frame(width: isListening ? 12 : 15, height: isListening ? 7 : 4)
                .offset(y: 31)

            if isListening {
                headphones
            }
        }
    }

    private var hair: some View {
        ZStack {
            Ellipse()
                .fill(Color(red: 0.055, green: 0.06, blue: 0.075))
                .frame(width: 115, height: 75)
                .offset(y: -25)

            HStack(spacing: -5) {
                ForEach(0..<5, id: \.self) { index in
                    Capsule()
                        .fill(Color(red: 0.055, green: 0.06, blue: 0.075))
                        .frame(width: 25, height: CGFloat(44 - abs(2 - index) * 4))
                        .rotationEffect(.degrees(Double(index - 2) * 7))
                }
            }
            .offset(y: -7)
        }
    }

    private var eyes: some View {
        HStack(spacing: 27) {
            Capsule()
                .fill(Color(red: 0.08, green: 0.07, blue: 0.08))
                .frame(width: 10, height: blinkAmount > 0 ? 2 : 10)
            Capsule()
                .fill(Color(red: 0.08, green: 0.07, blue: 0.08))
                .frame(width: 10, height: blinkAmount > 0 ? 2 : 10)
        }
    }

    private var headphones: some View {
        ZStack {
            Circle()
                .trim(from: 0.58, to: 0.92)
                .stroke(
                    Color(red: 0.77, green: 0.67, blue: 0.98),
                    style: StrokeStyle(lineWidth: 8, lineCap: .round)
                )
                .frame(width: 126, height: 126)
                .rotationEffect(.degrees(82))
                .offset(y: -4)

            HStack(spacing: 95) {
                RoundedRectangle(cornerRadius: 8)
                    .fill(Color(red: 0.48, green: 0.37, blue: 0.72))
                    .frame(width: 17, height: 35)
                RoundedRectangle(cornerRadius: 8)
                    .fill(Color(red: 0.48, green: 0.37, blue: 0.72))
                    .frame(width: 17, height: 35)
            }
            .offset(y: 3)
        }
    }
}

private struct FloatingMusicNotes: View {
    let time: TimeInterval

    var body: some View {
        ZStack {
            note("music.note", x: -68, phase: 0.0)
            note("music.note.quarter", x: 65, phase: 1.2)
            note("music.quarternote.3", x: 82, phase: 2.1)
        }
    }

    private func note(_ symbol: String, x: CGFloat, phase: Double) -> some View {
        let wave = sin(time * 1.8 + phase)
        let rise = (time * 22 + phase * 30).truncatingRemainder(dividingBy: 115)

        return Image(systemName: symbol)
            .font(.system(size: 17, weight: .bold))
            .foregroundStyle(Color(red: 0.82, green: 0.72, blue: 1.0))
            .opacity(0.35 + (1 - rise / 115) * 0.65)
            .offset(x: x + CGFloat(wave * 7), y: CGFloat(58 - rise))
    }
}
