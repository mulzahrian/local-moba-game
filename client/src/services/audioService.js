import menuMusicUrl from '../music/main-menu.mp3';
import loadingMusicUrl from '../music/loading.mp3';
import buttonClickUrl from '../music/button-click.mp3';

const UNLOCK_EVENTS = ['pointerdown', 'pointerup', 'click', 'keydown', 'touchend'];

// Browsers block autoplay until the user interacts, so playback is attempted
// immediately on load and retried on the first gesture if it was blocked.
class AudioService {
  constructor() {
    this.tracks = {
      menu: this.createTrack(menuMusicUrl, 0.5),
      loading: this.createTrack(loadingMusicUrl, 0.6),
    };
    this.clickAudio = new Audio(buttonClickUrl);
    this.clickAudio.volume = 0.7;
    this.enabled = true;
    this.sfxCache = new Map();
    this.loops = new Map();
    this.current = null; // 'menu' | 'loading' | null
    this.unlockBound = false;
    this.unlock = this.unlock.bind(this);
  }

  createTrack(url, volume) {
    const audio = new Audio(url);
    audio.loop = true;
    audio.volume = volume;
    audio.preload = 'auto';
    return audio;
  }

  bindUnlock() {
    if (this.unlockBound) return;
    this.unlockBound = true;
    UNLOCK_EVENTS.forEach((e) => window.addEventListener(e, this.unlock, true));
  }

  unbindUnlock() {
    if (!this.unlockBound) return;
    this.unlockBound = false;
    UNLOCK_EVENTS.forEach((e) => window.removeEventListener(e, this.unlock, true));
  }

  // Stays bound until playback actually succeeds (some events are not activation gestures).
  unlock() {
    this.sync();
  }

  sync() {
    Object.entries(this.tracks).forEach(([name, audio]) => {
      if (this.enabled && this.current === name) {
        audio
          .play()
          .then(() => this.unbindUnlock())
          .catch(() => this.bindUnlock());
      } else {
        audio.pause();
        if (name !== this.current) audio.currentTime = 0;
      }
    });
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled) [...this.loops.keys()].forEach((key) => this.stopLoop(key));
    this.sync();
  }

  // 'menu' on menu screens, 'loading' while waiting for the opponent, null during a match.
  setTrack(name) {
    if (this.current === name) return;
    this.current = name;
    this.sync();
  }

  playClick() {
    if (!this.enabled) return;
    const sfx = this.clickAudio.cloneNode();
    sfx.volume = this.clickAudio.volume;
    sfx.play().catch(() => {});
  }

  // One-shot sound effect; `volume` is 0-1 on top of the effect's own base level.
  playSfx(url, volume = 1) {
    if (!this.enabled || !url || volume <= 0.01) return;
    let base = this.sfxCache.get(url);
    if (!base) {
      base = new Audio(url);
      base.preload = 'auto';
      this.sfxCache.set(url, base);
    }
    const sfx = base.cloneNode();
    sfx.volume = Math.min(1, volume);
    sfx.play().catch(() => {});
  }

  // Looping effect (e.g. footsteps) identified by `key`; no-op if it is already running.
  startLoop(key, url, volume = 1) {
    if (!this.enabled || this.loops.has(key)) return;
    const audio = new Audio(url);
    audio.loop = true;
    audio.volume = Math.min(1, volume);
    audio.play().catch(() => {});
    this.loops.set(key, audio);
  }

  stopLoop(key) {
    const audio = this.loops.get(key);
    if (!audio) return;
    audio.pause();
    this.loops.delete(key);
  }
}

export const audioService = new AudioService();
