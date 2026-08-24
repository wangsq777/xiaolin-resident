(function exposeLocalBgmController() {
  class LocalBgmController {
    constructor({ onStateChange, onNowPlayingChange, onError }) {
      this.onStateChange = onStateChange;
      this.onNowPlayingChange = onNowPlayingChange;
      this.onError = onError;
      this.tracks = [];
      this.currentIndex = -1;
      this.audio = new Audio();
      this.audio.preload = 'metadata';
      this.audio.volume = 0.55;

      this.audio.addEventListener('play', () => this.emitState());
      this.audio.addEventListener('pause', () => this.emitState());
      this.audio.addEventListener('ended', () => this.next());
      this.audio.addEventListener('error', () => {
        const code = this.audio.error?.code;
        this.onError?.(new Error(`呢首 BGM 播放唔到${code ? `（錯誤 ${code}）` : ''}。`));
        this.emitState();
      });
    }

    setPlaylist(tracks) {
      const currentId = this.currentTrack()?.id;
      this.tracks = Array.isArray(tracks) ? tracks.slice() : [];

      if (currentId) {
        const nextIndex = this.tracks.findIndex((track) => track.id === currentId);
        if (nextIndex >= 0) {
          this.currentIndex = nextIndex;
        } else {
          this.stopAndReset();
        }
      } else if (this.tracks.length === 0) {
        this.stopAndReset();
      }

      this.emitState();
    }

    async playIndex(index) {
      if (this.tracks.length === 0) return;
      const normalizedIndex = ((Number(index) % this.tracks.length) + this.tracks.length) % this.tracks.length;
      const changingTrack = normalizedIndex !== this.currentIndex;
      this.currentIndex = normalizedIndex;

      if (changingTrack || !this.audio.src) {
        this.audio.src = this.tracks[this.currentIndex].url;
        this.audio.load();
        this.emitNowPlaying();
      }

      await this.audio.play();
      this.emitState();
    }

    async togglePlayback() {
      if (this.tracks.length === 0) return;
      if (this.currentIndex < 0) {
        await this.playIndex(0);
      } else if (this.audio.paused) {
        await this.audio.play();
      } else {
        this.audio.pause();
      }
      this.emitState();
    }

    async next() {
      if (this.tracks.length === 0) return;
      const nextIndex = this.currentIndex < 0 ? 0 : this.currentIndex + 1;
      await this.playIndex(nextIndex);
    }

    async previous() {
      if (this.tracks.length === 0) return;
      const previousIndex = this.currentIndex < 0 ? 0 : this.currentIndex - 1;
      await this.playIndex(previousIndex);
    }

    currentTrack() {
      return this.currentIndex >= 0 ? this.tracks[this.currentIndex] : null;
    }

    stopAndReset() {
      this.audio.pause();
      this.audio.removeAttribute('src');
      this.audio.load();
      this.currentIndex = -1;
      this.emitNowPlaying();
    }

    emitState() {
      this.onStateChange?.({
        hasTracks: this.tracks.length > 0,
        hasNowPlayingItem: Boolean(this.currentTrack()),
        isPlaying: Boolean(this.currentTrack()) && !this.audio.paused
      });
    }

    emitNowPlaying() {
      this.onNowPlayingChange?.(this.currentTrack());
    }
  }

  window.LocalBgmController = LocalBgmController;
})();
