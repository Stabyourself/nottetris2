// All sound is synthesised with WebAudio: no audio files are shipped.

export type Sfx =
  | 'move'
  | 'select'
  | 'back'
  | 'land'
  | 'clear'
  | 'clear4'
  | 'levelup'
  | 'topout'
  | 'fallout'
  | 'pause'
  | 'beep'
  | 'go'
  | 'highscore';

type Note = [midi: number | null, steps: number];

interface Track {
  name: string;
  bpm: number;
  roots: number[]; // bass root per bar (8 eighth-note steps per bar)
  lead: Note[][]; // one array of notes per bar
}

// Original compositions written for this port.
export const TRACKS: Track[] = [
  {
    name: 'Drift',
    bpm: 132,
    roots: [45, 41, 48, 43, 45, 41, 48, 43],
    lead: [
      [[76, 2], [69, 2], [72, 1], [74, 1], [76, 2]],
      [[77, 2], [76, 1], [74, 1], [72, 2], [69, 2]],
      [[79, 2], [76, 2], [72, 1], [74, 1], [76, 1], [79, 1]],
      [[74, 4], [71, 2], [67, 2]],
      [[81, 2], [79, 1], [76, 3], [72, 1], [74, 1]],
      [[72, 2], [69, 2], [77, 2], [76, 1], [74, 1]],
      [[76, 2], [74, 1], [72, 1], [67, 2], [72, 2]],
      [[71, 4], [null, 4]],
    ],
  },
  {
    name: 'Lift',
    bpm: 152,
    roots: [38, 34, 36, 33, 38, 34, 36, 33],
    lead: [
      [[74, 1], [77, 1], [81, 1], [77, 1], [74, 1], [77, 1], [81, 2]],
      [[70, 1], [74, 1], [77, 1], [74, 1], [79, 1], [77, 1], [74, 2]],
      [[72, 1], [76, 1], [79, 1], [76, 1], [81, 1], [79, 1], [76, 1], [72, 1]],
      [[73, 2], [76, 2], [81, 4]],
      [[81, 2], [77, 2], [74, 2], [77, 2]],
      [[79, 2], [77, 2], [74, 2], [70, 2]],
      [[72, 1], [76, 1], [79, 1], [84, 1], [79, 2], [76, 2]],
      [[73, 4], [69, 2], [null, 2]],
    ],
  },
];

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private sfxVol = 0.8;
  private musicVol = 0.5;
  private muted = false;

  private track: Track | null = null;
  private timer: number | null = null;
  private step = 0;
  private nextTime = 0;
  private events: { lead: Map<number, [number, number]>; total: number } | null = null;

  /** Must be called from a user gesture before anything is audible. */
  unlock() {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.sfxGain = this.ctx.createGain();
      this.musicGain = this.ctx.createGain();
      this.sfxGain.connect(this.ctx.destination);
      this.musicGain.connect(this.ctx.destination);
      this.applyVolumes();
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      // A track asked for before the first gesture (the title menu) starts now.
      if (this.track) this.startScheduler();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setVolumes(sfx: number, music: number) {
    this.sfxVol = sfx;
    this.musicVol = music;
    this.applyVolumes();
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    this.applyVolumes();
  }

  private applyVolumes() {
    if (!this.ctx || !this.sfxGain || !this.musicGain) return;
    const on = this.muted ? 0 : 1;
    this.sfxGain.gain.value = on * this.sfxVol * 0.5;
    this.musicGain.gain.value = on * this.musicVol * 0.22;
  }

  private tone(
    out: AudioNode,
    freq: number,
    start: number,
    dur: number,
    type: OscillatorType = 'square',
    gain = 0.3,
    endFreq?: number,
  ) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, start + dur);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(gain, start + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(g).connect(out);
    osc.start(start);
    osc.stop(start + dur + 0.02);
  }

  private noise(out: AudioNode, start: number, dur: number, gain: number, cutoff: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, start);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    src.connect(f).connect(g).connect(out);
    src.start(start, Math.random() * 0.5);
    src.stop(start + dur + 0.02);
  }

  play(name: Sfx) {
    if (!this.ctx || !this.sfxGain || this.sfxVol <= 0 || this.muted) return;
    const out = this.sfxGain;
    const t = this.ctx.currentTime + 0.005;
    const arp = (notes: number[], gap: number, dur: number, type: OscillatorType = 'square', gain = 0.22) =>
      notes.forEach((m, i) => this.tone(out, mtof(m), t + i * gap, dur, type, gain));
    switch (name) {
      case 'move':
        this.tone(out, 700, t, 0.045, 'square', 0.12);
        break;
      case 'select':
        arp([76, 83], 0.055, 0.09, 'square', 0.16);
        break;
      case 'back':
        arp([71, 64], 0.055, 0.09, 'square', 0.14);
        break;
      case 'land':
        this.noise(out, t, 0.09, 0.5, 1100);
        this.tone(out, 150, t, 0.13, 'sine', 0.5, 55);
        break;
      case 'clear':
        arp([72, 76, 79, 84], 0.06, 0.16, 'square', 0.18);
        break;
      case 'clear4':
        arp([72, 76, 79, 84, 88, 91], 0.05, 0.18, 'square', 0.18);
        [84, 88, 91, 96].forEach((m) => this.tone(out, mtof(m), t + 0.32, 0.6, 'triangle', 0.16));
        break;
      case 'levelup':
        arp([79, 84, 88, 91], 0.08, 0.22, 'triangle', 0.28);
        break;
      case 'topout':
        this.tone(out, 520, t, 0.9, 'sawtooth', 0.14, 70);
        this.tone(out, 390, t + 0.05, 0.9, 'square', 0.08, 52);
        break;
      case 'fallout':
        this.noise(out, t, 1.2, 0.35, 380);
        break;
      case 'pause':
        arp([84, 79], 0.07, 0.07, 'square', 0.14);
        break;
      case 'beep':
        this.tone(out, 880, t, 0.14, 'square', 0.16);
        break;
      case 'go':
        this.tone(out, 1320, t, 0.32, 'square', 0.16);
        break;
      case 'highscore':
        arp([72, 76, 79, 84, 79, 84, 88], 0.09, 0.16, 'square', 0.16);
        break;
    }
  }

  // ---------------------------------------------------------------- music

  /**
   * Plays a track from the start. A track that is already playing keeps going unless `restart`
   * is set. Before `unlock()` the track is only remembered, and starts once audio is unlocked.
   */
  playTrack(index: number, restart = false) {
    const track = TRACKS[index];
    if (!restart && track && track === this.track && this.timer !== null) return;
    this.stopMusic();
    if (!track) return;
    this.track = track;
    const lead = new Map<number, [number, number]>();
    let s = 0;
    for (const bar of track.lead) {
      for (const [m, len] of bar) {
        if (m !== null) lead.set(s, [m, len]);
        s += len;
      }
    }
    this.events = { lead, total: track.roots.length * 8 };
    this.step = 0;
    if (this.ctx) this.startScheduler();
  }

  stopMusic() {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    this.track = null;
  }

  pauseMusic() {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
  }

  resumeMusic() {
    if (!this.track || !this.ctx || this.timer !== null) return;
    this.startScheduler();
  }

  private startScheduler() {
    if (!this.ctx) return;
    this.nextTime = this.ctx.currentTime + 0.1;
    this.timer = window.setInterval(() => this.schedule(), 25);
  }

  private schedule() {
    if (!this.ctx || !this.track || !this.events || !this.musicGain) return;
    const stepDur = 60 / this.track.bpm / 2;
    const out = this.musicGain;
    while (this.nextTime < this.ctx.currentTime + 0.12) {
      const s = this.step % this.events.total;
      const t = this.nextTime;
      const lead = this.events.lead.get(s);
      if (lead) this.tone(out, mtof(lead[0]), t, lead[1] * stepDur * 0.92, 'square', 0.32);
      const root = this.track.roots[Math.floor(s / 8)];
      this.tone(out, mtof(root + (s % 2 ? 12 : 0)), t, stepDur * 0.85, 'triangle', 0.55);
      if (this.noiseBuf) this.noise(out, t, 0.03, s % 2 ? 0.18 : 0.08, 7000);
      this.nextTime += stepDur;
      this.step++;
    }
  }
}

export const audio = new AudioEngine();
