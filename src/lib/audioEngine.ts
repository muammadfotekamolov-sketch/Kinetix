import type { AudioClip } from '../types/editor.ts';

interface GenreSpec {
  stepMs: number;
  wave: OscillatorType;
  bassWave: OscillatorType;
  notes: number[];
  bass: number[];
  kickEvery: number;
}

function getGenreSpec(preset: string): GenreSpec {
  switch (preset) {
    case 'phonk_drift':
    case 'phonk_tokyo':
    case 'phonk_aggressive':
    case 'phonk_night':
    case 'phonk_brazil':
      return {
        stepMs: preset === 'phonk_brazil' ? 190 : 210,
        wave: 'sawtooth',
        bassWave: 'triangle',
        notes: [220, 261.63, 246.94, 220, 293.66, 261.63, 246.94, 196],
        bass: [55, 55, 65.41, 55, 73.42, 65.41, 61.74, 49],
        kickEvery: 2,
      };
    case 'trap':
    case 'trap_urban':
    case 'trap_dark':
    case 'drill_uk':
    case 'hiphop_boom':
    case 'trap_luxury':
      return {
        stepMs: preset === 'hiphop_boom' ? 280 : 215,
        wave: 'triangle',
        bassWave: 'sine',
        notes: [146.83, 174.61, 220, 196, 174.61, 261.63, 220, 146.83],
        bass: [55, 55, 65.41, 55, 49, 55, 73.42, 55],
        kickEvery: 2,
      };
    case 'techno_rave':
    case 'house_club':
    case 'future_bass':
    case 'drum_n_bass':
    case 'synthwave':
      return {
        stepMs: preset === 'drum_n_bass' ? 145 : preset === 'techno_rave' ? 185 : 225,
        wave: 'sawtooth',
        bassWave: 'sawtooth',
        notes: [261.63, 329.63, 392.0, 493.88, 392.0, 329.63, 293.66, 329.63],
        bass: [65.41, 65.41, 82.41, 98.0, 82.41, 65.41, 73.42, 65.41],
        kickEvery: 2,
      };
    case 'pop_viral':
    case 'funk_upbeat':
    case 'afrobeat':
    case 'reggaeton_latino':
    case 'rock_energy':
      return {
        stepMs: preset === 'funk_upbeat' ? 235 : 250,
        wave: preset === 'rock_energy' ? 'sawtooth' : 'triangle',
        bassWave: 'triangle',
        notes: [293.66, 369.99, 440, 392, 329.63, 369.99, 293.66, 440],
        bass: [73.42, 73.42, 92.5, 98, 82.41, 92.5, 73.42, 110],
        kickEvery: 2,
      };
    case 'lofi':
    case 'ambient':
    case 'piano_sad':
    case 'epic_trailer':
    case 'chill_sunset':
    default:
      return {
        stepMs: preset === 'ambient' || preset === 'epic_trailer' ? 520 : 340,
        wave: preset === 'epic_trailer' ? 'sawtooth' : 'sine',
        bassWave: 'sine',
        notes: [196, 246.94, 293.66, 329.63, 293.66, 246.94, 220, 261.63],
        bass: [98, 98, 73.42, 82.41],
        kickEvery: preset === 'ambient' ? 4 : 2,
      };
  }
}

class KinetixAudioEngine {
  private ctx: AudioContext | null = null;
  private activeNodes: AudioNode[] = [];
  private timers: number[] = [];
  private activeMediaEls: HTMLAudioElement[] = [];

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  stopAll() {
    for (const id of this.timers) {
      window.clearInterval(id);
      window.clearTimeout(id);
    }
    this.timers = [];
    for (const el of this.activeMediaEls) {
      try {
        el.pause();
      } catch {
        // ignore
      }
    }
    this.activeMediaEls = [];
    for (const node of this.activeNodes) {
      try {
        if ('stop' in node && typeof (node as OscillatorNode).stop === 'function') {
          (node as OscillatorNode).stop();
        }
        node.disconnect();
      } catch {
        // ignore stopped nodes
      }
    }
    this.activeNodes = [];
  }

  private playSfx(ctx: AudioContext, destination: AudioNode, preset: string) {
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    const now = ctx.currentTime;

    if (preset === 'boom_impact') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(160, now);
      osc.frequency.exponentialRampToValueAtTime(38, now + 0.7);
      env.gain.setValueAtTime(0.85, now);
      env.gain.exponentialRampToValueAtTime(0.001, now + 0.75);
      osc.connect(env);
      env.connect(destination);
      osc.start(now);
      osc.stop(now + 0.8);
    } else if (preset === 'camera_shutter' || preset === 'pop') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(preset === 'camera_shutter' ? 1100 : 560, now);
      osc.frequency.exponentialRampToValueAtTime(140, now + 0.14);
      env.gain.setValueAtTime(0.65, now);
      env.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      osc.connect(env);
      env.connect(destination);
      osc.start(now);
      osc.stop(now + 0.18);
    } else if (preset === 'glitch_sfx') {
      osc.type = 'square';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.setValueAtTime(220, now + 0.06);
      osc.frequency.setValueAtTime(640, now + 0.12);
      osc.frequency.exponentialRampToValueAtTime(95, now + 0.35);
      env.gain.setValueAtTime(0.45, now);
      env.gain.exponentialRampToValueAtTime(0.001, now + 0.36);
      osc.connect(env);
      env.connect(destination);
      osc.start(now);
      osc.stop(now + 0.4);
    } else {
      // whoosh / riser
      osc.type = 'sawtooth';
      const dur = preset === 'riser' ? 1.5 : 0.85;
      const startF = preset === 'whoosh' ? 540 : 110;
      const endF = preset === 'whoosh' ? 85 : 940;
      osc.frequency.setValueAtTime(startF, now);
      osc.frequency.exponentialRampToValueAtTime(endF, now + dur);
      env.gain.setValueAtTime(0.05, now);
      env.gain.linearRampToValueAtTime(0.45, now + dur * 0.65);
      env.gain.exponentialRampToValueAtTime(0.001, now + dur);
      osc.connect(env);
      env.connect(destination);
      osc.start(now);
      osc.stop(now + dur + 0.05);
    }
    this.activeNodes.push(osc, env);
  }

  private scheduleSynthClip(ctx: AudioContext, clip: AudioClip, delayMs: number, maxPlayMs: number) {
    const vol = Math.max(0.02, Math.min(1, clip.volume / 100));
    const preset = clip.synthPreset || 'synthwave';

    const startFn = () => {
      if (!this.ctx) return;
      const gain = ctx.createGain();
      gain.gain.value = vol * 0.24;
      const processed = this.applyEffectsChain(ctx, gain, clip);
      processed.connect(ctx.destination);

      if (
        preset === 'whoosh' ||
        preset === 'riser' ||
        preset === 'pop' ||
        preset === 'boom_impact' ||
        preset === 'camera_shutter' ||
        preset === 'glitch_sfx'
      ) {
        this.playSfx(ctx, gain, preset);
        this.activeNodes.push(gain);
        return;
      }

      const spec = getGenreSpec(preset);
      let step = 0;

      const triggerNote = () => {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const env = this.ctx.createGain();
        osc.type = spec.wave;
        osc.frequency.value = spec.notes[step % spec.notes.length];
        env.gain.setValueAtTime(0.001, now);
        env.gain.linearRampToValueAtTime(0.35, now + 0.025);
        env.gain.exponentialRampToValueAtTime(0.001, now + spec.stepMs / 1000);
        osc.connect(env);
        env.connect(gain);
        osc.start(now);
        osc.stop(now + spec.stepMs / 1000 + 0.03);
        this.activeNodes.push(osc, env);

        if (step % spec.kickEvery === 0) {
          const bassOsc = this.ctx.createOscillator();
          const bassEnv = this.ctx.createGain();
          bassOsc.type = spec.bassWave;
          bassOsc.frequency.setValueAtTime(spec.bass[step % spec.bass.length] * 1.4, now);
          bassOsc.frequency.exponentialRampToValueAtTime(
            spec.bass[step % spec.bass.length],
            now + 0.09,
          );
          bassEnv.gain.setValueAtTime(0.45, now);
          bassEnv.gain.exponentialRampToValueAtTime(0.001, now + Math.min(0.42, spec.stepMs / 900));
          bassOsc.connect(bassEnv);
          bassEnv.connect(gain);
          bassOsc.start(now);
          bassOsc.stop(now + 0.45);
          this.activeNodes.push(bassOsc, bassEnv);
        }

        step++;
      };

      triggerNote();
      const interval = window.setInterval(triggerNote, spec.stepMs);
      this.timers.push(interval);
      const stopT = window.setTimeout(() => {
        window.clearInterval(interval);
      }, Math.max(200, maxPlayMs));
      this.timers.push(stopT);
      this.activeNodes.push(gain);
    };

    if (delayMs <= 20) {
      startFn();
    } else {
      const t = window.setTimeout(startFn, delayMs);
      this.timers.push(t);
    }
  }

  playTimelineTracks(audioClips: AudioClip[], playheadMs: number) {
    this.stopAll();
    if (!audioClips || audioClips.length === 0) return;
    const ctx = this.ensureContext();

    for (const clip of audioClips) {
      const clipEnd = clip.startMs + clip.durationMs;
      if (clipEnd <= playheadMs) continue;
      const delayMs = Math.max(0, clip.startMs - playheadMs);
      const remainingMs = clipEnd - Math.max(playheadMs, clip.startMs);

      if (clip.src) {
        const startMedia = () => {
          const audio = new Audio(clip.src);
          audio.volume = Math.max(0, Math.min(1, clip.volume / 100));
          audio.currentTime = Math.max(0, (playheadMs - clip.startMs) / 1000);
          try {
            const source = ctx.createMediaElementSource(audio);
            const dest = this.applyEffectsChain(ctx, source, clip);
            dest.connect(ctx.destination);
          } catch {
            // fallback to plain HTMLAudioElement playback
          }
          void audio.play().catch(() => {});
          this.activeMediaEls.push(audio);
          const stopTimer = window.setTimeout(() => {
            audio.pause();
          }, remainingMs);
          this.timers.push(stopTimer);
        };
        if (delayMs <= 20) startMedia();
        else this.timers.push(window.setTimeout(startMedia, delayMs));
      } else {
        this.scheduleSynthClip(ctx, clip, delayMs, remainingMs);
      }
    }
  }

  playClipPreview(clip: AudioClip) {
    this.stopAll();
    const ctx = this.ensureContext();
    const vol = Math.max(0.02, Math.min(1, clip.volume / 100));

    if (clip.src) {
      const audio = new Audio(clip.src);
      audio.volume = Math.min(1, vol);
      try {
        const source = ctx.createMediaElementSource(audio);
        const dest = this.applyEffectsChain(ctx, source, clip);
        dest.connect(ctx.destination);
      } catch {
        // fallback to plain HTMLAudioElement
      }
      void audio.play().catch(() => {});
      this.activeMediaEls.push(audio);
      const stopTimer = window.setTimeout(() => {
        audio.pause();
      }, Math.min(clip.durationMs, 8000));
      this.timers.push(stopTimer);
      return;
    }

    this.scheduleSynthClip(ctx, clip, 0, Math.min(clip.durationMs || 6000, 6000));
  }

  private applyEffectsChain(
    ctx: AudioContext,
    input: AudioNode,
    clip: AudioClip,
  ): AudioNode {
    let tail: AudioNode = input;

    const freqs = [80, 320, 1000, 3500, 10000];
    clip.eq.forEach((db, idx) => {
      if (db !== 0) {
        const eq = ctx.createBiquadFilter();
        eq.type = idx === 0 ? 'lowshelf' : idx === 4 ? 'highshelf' : 'peaking';
        eq.frequency.value = freqs[idx];
        eq.gain.value = db;
        tail.connect(eq);
        tail = eq;
      }
    });

    if (clip.voiceEffect === 'radio') {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1400;
      bp.Q.value = 1.6;
      tail.connect(bp);
      tail = bp;
    } else if (clip.voiceEffect === 'deep') {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 480;
      tail.connect(lp);
      tail = lp;
    } else if (clip.voiceEffect === 'child') {
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 520;
      tail.connect(hp);
      tail = hp;
    } else if (clip.voiceEffect === 'robot') {
      const shaper = ctx.createWaveShaper();
      const curve = new Float32Array(256);
      for (let i = 0; i < 256; i++) {
        const x = (i * 2) / 256 - 1;
        curve[i] = Math.round(x * 4) / 4;
      }
      shaper.curve = curve;
      tail.connect(shaper);
      tail = shaper;
    }

    if (clip.denoise) {
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 110;
      tail.connect(hp);
      tail = hp;
    }

    return tail;
  }

  speakBrowserTts(text: string, lang: string, voiceMode: string) {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang =
      lang === 'ru'
        ? 'ru-RU'
        : lang === 'uz'
          ? 'uz-UZ'
          : lang === 'tr'
            ? 'tr-TR'
            : lang === 'ar'
              ? 'ar-SA'
              : 'en-US';
    utter.pitch = voiceMode === 'child' ? 1.45 : voiceMode === 'deep' ? 0.65 : 1.0;
    utter.rate = voiceMode === 'robot' ? 0.92 : 1.0;
    window.speechSynthesis.speak(utter);
  }
}

export const audioEngine = new KinetixAudioEngine();
