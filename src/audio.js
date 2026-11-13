// Quiet, locally synthesized audio. Nothing is downloaded or played before a gesture.
export class TempleAudio {
  constructor() {
    this.context = null;
    this.master = null;
    this.ambience = null;
    this.enabled = false;
    this.rain = false;
    this.volume = 0.35;
    this.sources = [];
    this.birdTimer = null;
  }

  async enable(enabled) {
    if (!enabled) {
      this.enabled = false;
      if (this.master) this.master.gain.setTargetAtTime(0, this.context.currentTime, 0.2);
      clearTimeout(this.birdTimer);
      return false;
    }
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) throw new Error('当前浏览器不支持 Web Audio');
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = 0;
      this.master.connect(this.context.destination);
      this.createAmbience();
    }
    await this.context.resume();
    this.enabled = true;
    this.master.gain.setTargetAtTime(this.volume, this.context.currentTime, 0.4);
    this.scheduleBird();
    return true;
  }

  createAmbience() {
    const { context } = this;
    const buffer = context.createBuffer(1, context.sampleRate * 6, context.sampleRate);
    const channel = buffer.getChannelData(0);
    let brown = 0;
    for (let i = 0; i < channel.length; i++) {
      brown = (brown + (Math.random() * 2 - 1) * 0.02) / 1.02;
      channel[i] = brown * 3.5;
    }
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = this.rain ? 3200 : 650;
    const gain = context.createGain();
    gain.gain.value = this.rain ? 0.38 : 0.14;
    source.connect(filter).connect(gain).connect(this.master);
    source.start();
    this.ambience = { filter, gain };
    this.sources.push(source);
  }

  setRain(rain) {
    this.rain = rain;
    if (!this.ambience) return;
    const now = this.context.currentTime;
    this.ambience.filter.frequency.setTargetAtTime(rain ? 3200 : 650, now, 1);
    this.ambience.gain.gain.setTargetAtTime(rain ? 0.38 : 0.14, now, 1);
  }

  setVolume(value) {
    this.volume = Math.min(1, Math.max(0, value));
    if (this.master && this.enabled) this.master.gain.setTargetAtTime(this.volume, this.context.currentTime, 0.1);
  }

  tone(frequency, duration, volume, delay = 0, type = 'sine') {
    if (!this.enabled || !this.context) return;
    const now = this.context.currentTime + delay;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain).connect(this.master);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  }

  bell() {
    [174, 352, 461, 704, 1053, 1410].forEach((frequency, i) => {
      this.tone(frequency, 7 - i * 0.65, 0.28 / (i + 1));
    });
  }

  incense() {
    this.tone(880, 1.8, 0.055);
    this.tone(1320, 2.1, 0.025, 0.15);
  }

  wish() {
    [523.25, 659.25, 783.99].forEach((frequency, i) => this.tone(frequency, 1.5, 0.035, i * 0.16));
  }

  scheduleBird() {
    clearTimeout(this.birdTimer);
    if (!this.enabled) return;
    this.birdTimer = setTimeout(() => {
      if (this.enabled && !this.rain && !document.hidden) {
        for (let i = 0; i < 3; i++) this.tone(1800 + Math.random() * 700, 0.13, 0.013, i * 0.15);
      }
      this.scheduleBird();
    }, 9000 + Math.random() * 11000);
  }

  dispose() {
    clearTimeout(this.birdTimer);
    this.sources.forEach((source) => source.stop());
    this.context?.close();
  }
}
