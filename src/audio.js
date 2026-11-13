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
    this.chantEnabled = false;
    this.chantTimer = null;
    this.chantGeneration = 0;
    this.onChantState = null;
  }

  async enable(enabled) {
    if (!enabled) {
      this.enabled = false;
      if (this.master) this.master.gain.setTargetAtTime(0, this.context.currentTime, 0.2);
      clearTimeout(this.birdTimer);
      this.stopChant();
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

  woodenFish() {
    if (!this.enabled || !this.context) return;
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.frequency.setValueAtTime(720, now);
    oscillator.frequency.exponentialRampToValueAtTime(290, now + 0.055);
    gain.gain.setValueAtTime(0.28, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
    oscillator.connect(gain).connect(this.master);
    oscillator.start(now);
    oscillator.stop(now + 0.24);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    this.tone(1250, 0.08, 0.05);
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

  async startChant() {
    if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) throw new Error('当前浏览器不支持经文轻读。');
    if (!this.enabled) throw new Error('请先开启声音。');
    const speech = window.speechSynthesis;
    const voice = speech.getVoices().find((item) => item.localService && /^zh(?:-|_)/i.test(item.lang));
    if (!voice) throw new Error('未找到本机中文语音，请在系统中安装中文语音后再试。');
    this.stopChant();
    this.chantEnabled = true;
    this.onChantState?.(true);
    const generation = this.chantGeneration;
    const passages = [
      '观自在菩萨，行深般若波罗蜜多时，照见五蕴皆空，度一切苦厄。',
      '舍利子。色不异空，空不异色。色即是空，空即是色。受想行识，亦复如是。',
      '舍利子。是诸法空相，不生不灭，不垢不净，不增不减。',
      '是故空中无色，无受想行识。无眼耳鼻舌身意，无色声香味触法。无眼界，乃至无意识界。',
      '无无明，亦无无明尽。乃至无老死，亦无老死尽。无苦集灭道，无智亦无得。',
      '以无所得故，菩提萨埵，依般若波罗蜜多故，心无挂碍。无挂碍故，无有恐怖。远离颠倒梦想，究竟涅槃。',
      '三世诸佛，依般若波罗蜜多故，得阿耨多罗三藐三菩提。',
      '故知般若波罗蜜多，是大神咒，是大明咒，是无上咒，是无等等咒。能除一切苦，真实不虚。',
      '故说般若波罗蜜多咒，即说咒曰。揭谛揭谛，波罗揭谛，波罗僧揭谛。菩提萨婆诃。',
    ];
    let index = 0;
    const read = () => {
      if (!this.chantEnabled || generation !== this.chantGeneration) return;
      const utterance = new SpeechSynthesisUtterance(passages[index]);
      utterance.voice = voice;
      utterance.lang = voice.lang;
      utterance.rate = 0.65;
      utterance.pitch = 0.78;
      utterance.volume = this.volume * 0.6;
      utterance.onend = () => {
        if (generation !== this.chantGeneration) return;
        index = (index + 1) % passages.length;
        this.chantTimer = setTimeout(read, index === 0 ? 9000 : 1800);
      };
      utterance.onerror = () => {
        if (generation === this.chantGeneration) this.stopChant();
      };
      speech.speak(utterance);
    };
    read();
  }

  stopChant() {
    this.chantGeneration++;
    clearTimeout(this.chantTimer);
    if (this.chantEnabled) window.speechSynthesis?.cancel();
    this.chantEnabled = false;
    this.onChantState?.(false);
  }

  dispose() {
    this.stopChant();
    clearTimeout(this.birdTimer);
    this.sources.forEach((source) => source.stop());
    this.context?.close();
  }
}
