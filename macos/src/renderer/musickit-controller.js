(function exposeMusicKitController() {
  class AppleMusicWebController {
    constructor({ tokenProvider, onStateChange, onNowPlayingChange }) {
      this.tokenProvider = tokenProvider;
      this.onStateChange = onStateChange;
      this.onNowPlayingChange = onNowPlayingChange;
      this.music = null;
      this.configurePromise = null;
      this.boundStateChange = () => this.emitState();
      this.boundNowPlayingChange = (event) => this.emitNowPlaying(event?.item);
    }

    async configure() {
      if (this.music) return this.music;
      if (this.configurePromise) return this.configurePromise;

      this.configurePromise = this.performConfiguration();
      try {
        this.music = await this.configurePromise;
        return this.music;
      } finally {
        this.configurePromise = null;
      }
    }

    async performConfiguration() {
      await waitForMusicKit();
      const { developerToken } = await this.tokenProvider();

      await window.MusicKit.configure({
        developerToken,
        app: {
          name: '小林驻留中',
          build: '0.2.0'
        }
      });

      const music = window.MusicKit.getInstance();
      music.addEventListener('playbackStateDidChange', this.boundStateChange);
      music.addEventListener('nowPlayingItemDidChange', this.boundNowPlayingChange);
      music.addEventListener('authorizationStatusDidChange', this.boundStateChange);
      this.emitState(music);
      this.emitNowPlaying(music.nowPlayingItem, music);
      return music;
    }

    async authorize() {
      const music = await this.configure();
      await music.authorize();
      this.emitState(music);
      return music.isAuthorized;
    }

    async unauthorize() {
      const music = await this.configure();
      await music.unauthorize();
      this.emitState(music);
    }

    async search(term) {
      const music = await this.configure();
      if (!music.isAuthorized) await music.authorize();

      const response = await music.api.music(
        '/v1/catalog/{{storefrontId}}/search',
        {
          term,
          types: ['songs'],
          limit: 12,
          l: 'zh-Hans-CN'
        }
      );

      return response?.data?.results?.songs?.data || [];
    }

    async playSong(songId) {
      const music = await this.configure();
      if (!music.isAuthorized) await music.authorize();
      await music.setQueue({ song: songId });
      await music.play();
      this.emitState(music);
      this.emitNowPlaying(music.nowPlayingItem, music);
    }

    async togglePlayback() {
      const music = await this.configure();
      if (music.isPlaying) {
        music.pause();
      } else {
        await music.play();
      }
      this.emitState(music);
    }

    async next() {
      const music = await this.configure();
      await music.skipToNextItem();
    }

    async previous() {
      const music = await this.configure();
      await music.skipToPreviousItem();
    }

    emitState(instance = this.music) {
      if (!instance) return;
      this.onStateChange?.({
        isAuthorized: Boolean(instance.isAuthorized),
        isPlaying: Boolean(instance.isPlaying),
        playbackState: instance.playbackState,
        hasNowPlayingItem: Boolean(instance.nowPlayingItem)
      });
    }

    emitNowPlaying(item = this.music?.nowPlayingItem, instance = this.music) {
      if (!item) {
        this.onNowPlayingChange?.(null);
        return;
      }

      const attributes = item.attributes || {};
      this.onNowPlayingChange?.({
        title: attributes.name || item.title || '未知歌曲',
        artist: attributes.artistName || item.artistName || 'Apple Music',
        artworkUrl: formatArtworkUrl(attributes.artwork?.url || item.artworkURL, 420),
        isPlaying: Boolean(instance?.isPlaying)
      });
    }
  }

  function formatArtworkUrl(template, size) {
    if (!template) return '';
    return template
      .replace('{w}', String(size))
      .replace('{h}', String(size))
      .replace('{f}', 'jpg');
  }

  function waitForMusicKit() {
    if (window.MusicKit) return Promise.resolve();

    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        document.removeEventListener('musickitloaded', handleLoaded);
        reject(new Error('MusicKit Web 加载超时，请检查网络。'));
      }, 15000);

      function handleLoaded() {
        window.clearTimeout(timeout);
        resolve();
      }

      document.addEventListener('musickitloaded', handleLoaded, { once: true });
    });
  }

  window.AppleMusicWebController = AppleMusicWebController;
  window.formatAppleArtworkUrl = formatArtworkUrl;
})();
