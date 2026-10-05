import menuMusicUrl from '../music/main-menu.mp3';

// Browsers block autoplay until the user interacts, so playback is retried on the first gesture.
class AudioService {
  constructor() {
    this.audio = null;
    this.enabled = true;
    this.wanted = false; // whether menu music should currently be playing
    this.unlockBound = false;
  }

  ensureAudio() {
    if (!this.audio) {
      this.audio = new Audio(menuMusicUrl);
      this.audio.loop = true;
      this.audio.volume = 0.5;
    }
    return this.audio;
  }

  bindUnlock() {
    if (this.unlockBound) return;
    this.unlockBound = true;
    const unlock = () => {
      this.sync();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      this.unlockBound = false;
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  sync() {
    const audio = this.ensureAudio();
    if (this.enabled && this.wanted) {
      audio.play().catch(() => this.bindUnlock());
    } else {
      audio.pause();
    }
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    this.sync();
  }

  // `wanted` is true on menu screens and false while in a match.
  setWanted(wanted) {
    this.wanted = wanted;
    this.sync();
  }
}

export const audioService = new AudioService();
