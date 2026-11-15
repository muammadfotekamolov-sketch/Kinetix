import type { AudioClip } from '../types/editor.ts';

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

  private scheduleSynthClip(ctx: AudioContext, clip: AudioClip, delayMs: number, maxPlayMs: number) {
    const vol = Math.max(0.02, Math.min(1, clip.volume / 100));
    const preset = clip.synthPreset || 'synthwave';

    const startFn = () => {
      if (!this.ctx) return;
      const gain = ctx.createGain();
      gain.gain.value = vol * 0.22;
      const processed = this.applyEffectsChain(ctx, gain, clip);
      processed.connect(ctx.destination);

      if (preset === 'whoosh' || preset === 'riser' || preset === 'pop') {
        const osc = ctx.createOscillator();
        osc.type = preset === 'pop' ? 'sine' : 'sawtooth';
        const durSec = preset === 'pop' ? 0.25 : 1.1;
        const startFreq = preset === 'whoosh' ? 460 : preset === 'pop' ? 520 : 120;
        const endFreq = preset === 'whoosh' ? 95 : preset === 'pop' ? 180 : 880;
        osc.frequency.setValueAtTime(startFreq, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(endFreq, ctx.currentTime + durSec);
        osc.connect(gain);
        osc.start();
        osc.stop(ctx.currentTime + durSec + 0.05);
        this.activeNodes.push(osc, gain);
        return;
      }

      const scale =
        preset === 'trap'
          ? [110, 110, 146.83, 130.81, 110, 164.81, 146.83, 110]
          : preset === 'ambient'
            ? [220, 277.18, 329.63, 440]
            : preset === 'lofi'
              ? [196, 246.94, 293.66, 329.63, 293.66, 246.94]
              : [130.81, 164.81, 196, 261.63, 196, 164.81];
      let step = 0;
      const stepMs = preset === 'trap' ? 215 : preset === 'ambient' ? 650 : preset === 'lofi' ? 330 : 240;

      const triggerNote = () => {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const env = this.ctx.createGain();
        osc.type = preset === 'ambient' ? 'sine' : preset === 'lofi' ? 'triangle' : 'sawtooth';
        osc.frequency.value = scale[step % scale.length];
        env.gain.setValueAtTime(0.001, this.ctx.currentTime);
        env.gain.linearRampToValueAtTime(0.38, this.ctx.currentTime + 0.03);
        env.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + stepMs / 1000);
        osc.connect(env);
        env.connect(gain);
        osc.start();
        osc.stop(this.ctx.currentTime + stepMs / 1000 + 0.02);
        this.activeNodes.push(osc, env);
        step++;
      };

      triggerNote();
      const interval = window.setInterval(triggerNote, stepMs);
      this.timers.push(interval);
      const stopT = window.setTimeout(() => {
        window.clearInterval(interval);
      }, Math.max(200, maxPlayMs));
      this.timers.push(stopT);
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
      const source = ctx.createMediaElementSource(audio);
      const dest = this.applyEffectsChain(ctx, source, clip);
      dest.connect(ctx.destination);
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

    // 5-band Equalizer
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

    // Voice changer filters
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
