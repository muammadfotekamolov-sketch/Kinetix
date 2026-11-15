import type {
  AspectRatio,
  ColorGrade,
  Keyframe,
  ProjectState,
  VideoClip,
} from '../types/editor.ts';

export function getCanvasDimensions(aspect: AspectRatio): { w: number; h: number } {
  switch (aspect) {
    case '9:16':
      return { w: 540, h: 960 };
    case '16:9':
      return { w: 960, h: 540 };
    case '1:1':
      return { w: 720, h: 720 };
    case '4:5':
      return { w: 640, h: 800 };
    case '4:3':
      return { w: 800, h: 600 };
    case '21:9':
      return { w: 1050, h: 450 };
    default:
      return { w: 540, h: 960 };
  }
}

export function getProjectDurationMs(state: ProjectState): number {
  let max = 3000;
  for (const c of state.clips) max = Math.max(max, c.startMs + c.durationMs);
  for (const t of state.texts) max = Math.max(max, t.startMs + t.durationMs);
  for (const s of state.stickers) max = Math.max(max, s.startMs + s.durationMs);
  for (const a of state.audioClips) max = Math.max(max, a.startMs + a.durationMs);
  return max;
}

function easeProgress(p: number, mode: Keyframe['easing']): number {
  const clamped = Math.max(0, Math.min(1, p));
  if (mode === 'ease') {
    return clamped < 0.5
      ? 2 * clamped * clamped
      : 1 - Math.pow(-2 * clamped + 2, 2) / 2;
  }
  if (mode === 'fast-start') {
    return 1 - Math.pow(1 - clamped, 3);
  }
  return clamped;
}

export function interpolateClipProps(clip: VideoClip, localMs: number) {
  const base = {
    x: clip.x,
    y: clip.y,
    scale: clip.scale,
    rotation: clip.rotation,
    opacity: clip.opacity,
    brightness: clip.color.brightness,
    contrast: clip.color.contrast,
    saturation: clip.color.saturation,
  };
  if (!clip.keyframes || clip.keyframes.length === 0) return base;

  const sorted = [...clip.keyframes].sort((a, b) => a.timeMs - b.timeMs);
  if (localMs <= sorted[0].timeMs) {
    const k = sorted[0];
    return {
      x: k.x,
      y: k.y,
      scale: k.scale,
      rotation: k.rotation,
      opacity: k.opacity,
      brightness: k.brightness,
      contrast: k.contrast,
      saturation: k.saturation,
    };
  }
  if (localMs >= sorted[sorted.length - 1].timeMs) {
    const k = sorted[sorted.length - 1];
    return {
      x: k.x,
      y: k.y,
      scale: k.scale,
      rotation: k.rotation,
      opacity: k.opacity,
      brightness: k.brightness,
      contrast: k.contrast,
      saturation: k.saturation,
    };
  }

  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (localMs >= a.timeMs && localMs <= b.timeMs) {
      const span = Math.max(1, b.timeMs - a.timeMs);
      const t = easeProgress((localMs - a.timeMs) / span, b.easing);
      const lerp = (v1: number, v2: number) => v1 + (v2 - v1) * t;
      return {
        x: lerp(a.x, b.x),
        y: lerp(a.y, b.y),
        scale: lerp(a.scale, b.scale),
        rotation: lerp(a.rotation, b.rotation),
        opacity: lerp(a.opacity, b.opacity),
        brightness: lerp(a.brightness, b.brightness),
        contrast: lerp(a.contrast, b.contrast),
        saturation: lerp(a.saturation, b.saturation),
      };
    }
  }
  return base;
}

function buildCssFilter(color: ColorGrade, extraBrightness = 0, extraContrast = 0, extraSat = 0): string {
  const b = 1 + (color.brightness + extraBrightness + color.exposure * 0.6 + color.curvesGamma * 0.5) / 100;
  const c = 1 + (color.contrast + extraContrast + color.curvesGain * 0.5) / 100;
  const s = 1 + (color.saturation + extraSat + color.hslSatShift * 0.6) / 100;
  const hue = color.hslHueShift + color.tint * 0.4;
  const sepia = color.filterPreset === 'vintage' ? 0.35 : color.temperature > 0 ? color.temperature / 200 : 0;
  const gray = color.filterPreset === 'bw' ? 1 : 0;
  return `brightness(${Math.max(0.1, b).toFixed(2)}) contrast(${Math.max(0.1, c).toFixed(2)}) saturate(${Math.max(0, s).toFixed(2)}) hue-rotate(${hue.toFixed(0)}deg) sepia(${sepia.toFixed(2)}) grayscale(${gray})`;
}

function applyClipMask(ctx: CanvasRenderingContext2D, clip: VideoClip, w: number, h: number) {
  const m = clip.mask;
  if (!m || m.type === 'none') return;
  const cx = w / 2 + (m.x / 100) * w;
  const cy = h / 2 + (m.y / 100) * h;
  const r = (Math.min(w, h) * 0.42) * m.scale;

  ctx.beginPath();
  if (m.type === 'circle') {
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
  } else if (m.type === 'rect') {
    const rw = w * 0.72 * m.scale;
    const rh = h * 0.56 * m.scale;
    ctx.roundRect(cx - rw / 2, cy - rh / 2, rw, rh, 24);
  } else if (m.type === 'heart') {
    const hs = r * 0.9;
    ctx.moveTo(cx, cy + hs * 0.35);
    ctx.bezierCurveTo(cx + hs * 0.9, cy - hs * 0.35, cx + hs * 0.65, cy - hs * 0.95, cx, cy - hs * 0.35);
    ctx.bezierCurveTo(cx - hs * 0.65, cy - hs * 0.95, cx - hs * 0.9, cy - hs * 0.35, cx, cy + hs * 0.35);
  } else if (m.type === 'star') {
    const spikes = 5;
    const outer = r;
    const inner = r * 0.46;
    for (let i = 0; i < spikes * 2; i++) {
      const rad = i % 2 === 0 ? outer : inner;
      const angle = (i * Math.PI) / spikes - Math.PI / 2;
      const px = cx + Math.cos(angle) * rad;
      const py = cy + Math.sin(angle) * rad;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  } else if (m.type === 'linear') {
    ctx.rect(0, 0, w, cy);
  } else if (m.type === 'mirror') {
    const rw = w * 0.62 * m.scale;
    ctx.rect(cx - rw / 2, 0, rw, h);
  }
  ctx.clip();
}

export interface MediaCacheEntry {
  kind: 'image' | 'video';
  el: HTMLImageElement | HTMLVideoElement;
  ready: boolean;
}

export function renderFrameToCanvas(params: {
  ctx: CanvasRenderingContext2D;
  state: ProjectState;
  timeMs: number;
  mediaCache: Map<string, MediaCacheEntry>;
  showGuides: boolean;
  showWatermark: boolean;
}) {
  const { ctx, state, timeMs, mediaCache, showGuides, showWatermark } = params;
  const { w, h } = getCanvasDimensions(state.aspectRatio);

  if (ctx.canvas.width !== w || ctx.canvas.height !== h) {
    ctx.canvas.width = w;
    ctx.canvas.height = h;
  }

  // 1. Background Layer (Color, Gradient, Blur, Image)
  ctx.save();
  if (state.background.type === 'gradient') {
    const grad = ctx.createLinearGradient(0, 0, w, h);
    if (state.background.gradient.includes('3b0764')) {
      grad.addColorStop(0, '#06283d');
      grad.addColorStop(1, '#3b0764');
    } else if (state.background.gradient.includes('4c0519')) {
      grad.addColorStop(0, '#4c0519');
      grad.addColorStop(1, '#7c2d12');
    } else if (state.background.gradient.includes('022c22')) {
      grad.addColorStop(0, '#022c22');
      grad.addColorStop(1, '#0f172a');
    } else {
      grad.addColorStop(0, '#09121e');
      grad.addColorStop(0.5, '#131320');
      grad.addColorStop(1, '#1b0b18');
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  } else if (state.background.type === 'image' && state.background.imageUrl) {
    const bgEntry = mediaCache.get(state.background.imageUrl);
    if (bgEntry && bgEntry.ready) {
      ctx.drawImage(bgEntry.el, 0, 0, w, h);
    } else {
      ctx.fillStyle = '#09090b';
      ctx.fillRect(0, 0, w, h);
    }
  } else if (state.background.type === 'blur') {
    ctx.fillStyle = '#09090b';
    ctx.fillRect(0, 0, w, h);
    const v1Active = state.clips.find(
      (c) => c.track === 'V1' && timeMs >= c.startMs && timeMs <= c.startMs + c.durationMs,
    );
    const bgEntry = v1Active ? mediaCache.get(v1Active.src) : undefined;
    if (bgEntry && bgEntry.ready) {
      ctx.filter = `blur(${Math.max(8, state.background.blurAmount || 20)}px) brightness(0.7)`;
      ctx.drawImage(bgEntry.el, -30, -30, w + 60, h + 60);
      ctx.filter = 'none';
    }
  } else {
    ctx.fillStyle = state.background.color || '#000000';
    ctx.fillRect(0, 0, w, h);
  }
  ctx.restore();

  // 2. Video / Image Layers (V1 then V2 overlays)
  const activeClips = state.clips
    .filter((c) => timeMs >= c.startMs && timeMs <= c.startMs + c.durationMs)
    .sort((a, b) => (a.track === b.track ? 0 : a.track === 'V1' ? -1 : 1));

  const activeFx = state.effects.filter(
    (fx) => timeMs >= fx.startMs && timeMs <= fx.startMs + fx.durationMs,
  );
  const shakeFx = activeFx.find((fx) => fx.effectKey === 'shake');
  const blurFx = activeFx.find((fx) => fx.effectKey === 'blur');

  for (const clip of activeClips) {
    const localMs = timeMs - clip.startMs;
    const remMs = clip.durationMs - localMs;
    const props = interpolateClipProps(clip, localMs);

    ctx.save();
    ctx.globalCompositeOperation = clip.blendMode || 'source-over';

    // Animation & Transition math
    let animAlpha = props.opacity / 100;
    let animScale = props.scale;
    let animOffsetX = 0;
    let animOffsetY = 0;
    let animRotate = props.rotation;
    let flashOverlayColor: string | null = null;

    if (shakeFx) {
      const amp = (shakeFx.intensity / 100) * 18;
      animOffsetX += Math.sin(timeMs * 0.09) * amp;
      animOffsetY += Math.cos(timeMs * 0.11) * amp * 0.7;
    }

    const transDur = clip.transitionDurationMs || 500;
    if (clip.transitionIn !== 'none' && localMs < transDur) {
      const p = localMs / transDur;
      if (clip.transitionIn === 'dissolve') animAlpha *= p;
      else if (clip.transitionIn === 'slide') animOffsetX += (1 - p) * w;
      else if (clip.transitionIn === 'zoom') animScale *= 0.65 + 0.35 * p;
      else if (clip.transitionIn === 'spin') animRotate += (1 - p) * 180;
      else if (clip.transitionIn === 'flash' || clip.transitionIn === 'white-fade') {
        flashOverlayColor = `rgba(255,255,255,${((1 - p) * 0.85).toFixed(2)})`;
      } else if (clip.transitionIn === 'black-fade') {
        flashOverlayColor = `rgba(0,0,0,${((1 - p) * 0.92).toFixed(2)})`;
      } else if (clip.transitionIn === 'wipe') {
        ctx.beginPath();
        ctx.rect(0, 0, w * p, h);
        ctx.clip();
      } else if (clip.transitionIn === 'glitch') {
        animOffsetX += Math.sin(localMs * 0.08) * 18 * (1 - p);
      }
    }

    if (clip.animIn === 'zoom-in' && localMs < 900) {
      animScale *= 0.86 + 0.14 * (localMs / 900);
    } else if (clip.animIn === 'zoom-out' && localMs < 900) {
      animScale *= 1.18 - 0.18 * (localMs / 900);
    } else if (clip.animIn === 'fade' && localMs < 700) {
      animAlpha *= localMs / 700;
    } else if (clip.animIn === 'slide-up' && localMs < 650) {
      animOffsetY += (1 - localMs / 650) * h * 0.35;
    } else if (clip.animIn === 'slide-left' && localMs < 650) {
      animOffsetX += (1 - localMs / 650) * w * 0.45;
    } else if (clip.animIn === 'shake' && localMs < 700) {
      animOffsetX += Math.sin(localMs * 0.09) * 14 * (1 - localMs / 700);
    } else if (clip.animIn === 'spin-in' && localMs < 700) {
      const p = localMs / 700;
      animRotate += (1 - p) * -120;
      animScale *= 0.7 + 0.3 * p;
    }

    if (clip.animOut === 'fade' && remMs < 600) {
      animAlpha *= Math.max(0, remMs / 600);
    } else if (clip.animOut === 'zoom-out' && remMs < 600) {
      animScale *= 0.78 + 0.22 * Math.max(0, remMs / 600);
    } else if (clip.animOut === 'slide-down' && remMs < 600) {
      animOffsetY += (1 - Math.max(0, remMs / 600)) * h * 0.35;
    }

    if (clip.animLoop === 'pulse') {
      animScale *= 1 + Math.sin(timeMs * 0.005) * 0.04;
    } else if (clip.animLoop === 'float') {
      animOffsetY += Math.sin(timeMs * 0.004) * 12;
    } else if (clip.animLoop === 'pendulum') {
      animRotate += Math.sin(timeMs * 0.0035) * 3.5;
    } else if (clip.animLoop === 'bounce') {
      animOffsetY -= Math.abs(Math.sin(timeMs * 0.006)) * 16;
    }

    ctx.globalAlpha = Math.max(0, Math.min(1, animAlpha));

    applyClipMask(ctx, clip, w, h);

    ctx.translate(
      w / 2 + (props.x / 100) * w + animOffsetX,
      h / 2 + (props.y / 100) * h + animOffsetY,
    );
    ctx.rotate((animRotate * Math.PI) / 180);
    ctx.scale(
      animScale * (clip.flipH ? -1 : 1),
      animScale * (clip.flipV ? -1 : 1),
    );

    const blurStr = blurFx ? ` blur(${Math.round((blurFx.intensity / 100) * 12)}px)` : '';
    ctx.filter =
      buildCssFilter(
        clip.color,
        props.brightness - clip.color.brightness,
        props.contrast - clip.color.contrast,
        props.saturation - clip.color.saturation,
      ) + blurStr;

    if (clip.shadowBlur > 0) {
      ctx.shadowColor = 'rgba(0,0,0,0.65)';
      ctx.shadowBlur = clip.shadowBlur;
    }

    const entry = mediaCache.get(clip.src);
    if (entry && entry.ready) {
      let mediaW = w;
      let mediaH = h;
      if (entry.kind === 'image') {
        const img = entry.el as HTMLImageElement;
        mediaW = img.naturalWidth || w;
        mediaH = img.naturalHeight || h;
      } else {
        const vid = entry.el as HTMLVideoElement;
        mediaW = vid.videoWidth || w;
        mediaH = vid.videoHeight || h;
        const targetSec =
          ((clip.reverse ? clip.durationMs - localMs : localMs) * clip.speed +
            clip.trimStartMs) /
          1000;
        if (Number.isFinite(targetSec) && vid.readyState >= 2 && !vid.seeking) {
          const maxDur =
            vid.duration && Number.isFinite(vid.duration) ? vid.duration : targetSec + 1;
          const clampedSec = Math.max(0, Math.min(maxDur - 0.02, targetSec % maxDur));
          if (Math.abs(vid.currentTime - clampedSec) > 0.35) {
            vid.currentTime = clampedSec;
          }
        }
      }

      const cropL = Math.max(0, Math.min(0.45, (clip.crop?.left || 0) / 100));
      const cropR = Math.max(0, Math.min(0.45, (clip.crop?.right || 0) / 100));
      const cropT = Math.max(0, Math.min(0.45, (clip.crop?.top || 0) / 100));
      const cropB = Math.max(0, Math.min(0.45, (clip.crop?.bottom || 0) / 100));
      const sx = mediaW * cropL;
      const sy = mediaH * cropT;
      const sw = Math.max(10, mediaW * (1 - cropL - cropR));
      const sh = Math.max(10, mediaH * (1 - cropT - cropB));

      const fitScale =
        clip.track === 'V2'
          ? Math.min((w * 0.55) / sw, (h * 0.55) / sh)
          : Math.max(w / sw, h / sh);
      const drawW = sw * fitScale;
      const drawH = sh * fitScale;
      ctx.drawImage(entry.el, sx, sy, sw, sh, -drawW / 2, -drawH / 2, drawW, drawH);

      if (clip.borderWidth > 0) {
        ctx.strokeStyle = clip.borderColor || '#00E5FF';
        ctx.lineWidth = clip.borderWidth;
        ctx.strokeRect(-drawW / 2, -drawH / 2, drawW, drawH);
      }
    } else {
      // Clean placeholder plate while image/video decodes
      ctx.fillStyle = '#18181b';
      ctx.fillRect(-w / 2, -h / 2, w, h);
    }

    // Retouch bright glow simulation
    if (clip.retouch.smooth > 0 || clip.retouch.brighten > 0) {
      ctx.filter = 'none';
      ctx.fillStyle = `rgba(255, 240, 235, ${(clip.retouch.brighten / 100) * 0.12})`;
      ctx.fillRect(-w / 2, -h / 2, w, h);
    }

    // Vignette & Fade overlays
    if (clip.color.vignette > 0) {
      ctx.filter = 'none';
      const vGrad = ctx.createRadialGradient(
        0,
        0,
        Math.min(w, h) * 0.25,
        0,
        0,
        Math.max(w, h) * 0.72,
      );
      vGrad.addColorStop(0, 'rgba(0,0,0,0)');
      vGrad.addColorStop(1, `rgba(0,0,0,${(clip.color.vignette / 100) * 0.85})`);
      ctx.fillStyle = vGrad;
      ctx.fillRect(-w / 2, -h / 2, w, h);
    }

    if (clip.color.fade > 0) {
      ctx.filter = 'none';
      ctx.fillStyle = `rgba(38, 38, 45, ${(clip.color.fade / 100) * 0.32})`;
      ctx.fillRect(-w / 2, -h / 2, w, h);
    }

    ctx.restore();

    if (flashOverlayColor) {
      ctx.save();
      ctx.fillStyle = flashOverlayColor;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
  }

  // 3. Active Timeline Effects
  for (const fx of activeFx) {
    ctx.save();
    const alpha = Math.max(0.15, fx.intensity / 100);
    if (fx.effectKey === 'chromatic' || fx.effectKey === 'glitch') {
      ctx.strokeStyle = `rgba(0, 229, 255, ${alpha * 0.5})`;
      ctx.lineWidth = 4;
      ctx.strokeRect(4, 4, w - 8, h - 8);
      ctx.strokeStyle = `rgba(255, 45, 111, ${alpha * 0.5})`;
      ctx.strokeRect(10, 8, w - 20, h - 16);
    } else if (fx.effectKey === 'vhs') {
      ctx.fillStyle = `rgba(255,255,255,${alpha * 0.08})`;
      for (let y = timeMs % 24; y < h; y += 14) {
        ctx.fillRect(0, y, w, 2);
      }
    } else if (fx.effectKey === 'film_burn') {
      const grad = ctx.createRadialGradient(
        w * 0.15,
        h * 0.15,
        10,
        w * 0.15,
        h * 0.15,
        w * 0.65,
      );
      grad.addColorStop(0, `rgba(255, 100, 30, ${alpha * 0.55})`);
      grad.addColorStop(1, 'rgba(255, 100, 30, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    } else if (fx.effectKey === 'sparkle') {
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.85})`;
      for (let i = 0; i < 12; i++) {
        const sx = ((Math.sin(i * 77 + timeMs * 0.002) + 1) / 2) * w;
        const sy = ((Math.cos(i * 43 + timeMs * 0.0015) + 1) / 2) * h;
        ctx.beginPath();
        ctx.arc(sx, sy, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (fx.effectKey === 'neon') {
      ctx.strokeStyle = `rgba(0, 229, 255, ${alpha * 0.75})`;
      ctx.lineWidth = 6;
      ctx.strokeRect(14, 14, w - 28, h - 28);
    } else if (fx.effectKey === 'soft_glow' || fx.effectKey === 'beauty_aura') {
      const grad = ctx.createRadialGradient(w * 0.5, h * 0.42, 20, w * 0.5, h * 0.42, w * 0.7);
      grad.addColorStop(
        0,
        fx.effectKey === 'soft_glow'
          ? `rgba(255, 225, 210, ${alpha * 0.16})`
          : `rgba(0, 229, 255, ${alpha * 0.18})`,
      );
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.restore();
  }

  // 4. Text & Subtitle Overlays
  const activeTexts = state.texts.filter(
    (tx) => timeMs >= tx.startMs && timeMs <= tx.startMs + tx.durationMs,
  );
  for (const tx of activeTexts) {
    ctx.save();
    const localMs = timeMs - tx.startMs;
    let alpha = 1;
    let yOffset = 0;
    let scale = 1;
    if (tx.animIn === 'fade' && localMs < 450) alpha = localMs / 450;
    if (tx.animIn === 'slide-up' && localMs < 450) yOffset = (1 - localMs / 450) * 32;
    if (tx.animIn === 'pop' && localMs < 350) scale = 0.6 + 0.4 * (localMs / 350);

    ctx.globalAlpha = alpha;
    ctx.font = `700 ${tx.fontSize}px "${tx.fontFamily || 'Plus Jakarta Sans'}", sans-serif`;
    ctx.textAlign = tx.align;
    ctx.textBaseline = 'middle';

    let posX = (tx.x / 100) * w;
    const posY = (tx.y / 100) * h + yOffset;
    if (tx.isMarquee) {
      const span = w + 300;
      posX = w - (((localMs / 1000) * tx.marqueeSpeed) % span);
    }

    ctx.translate(posX, posY);
    ctx.scale(scale, scale);

    const metrics = ctx.measureText(tx.text);
    const padX = 16;
    const padY = 10;
    if (tx.bgColor && tx.bgColor !== 'transparent') {
      ctx.fillStyle = tx.bgColor;
      const boxW = metrics.width + padX * 2;
      const boxH = tx.fontSize * tx.lineHeight + padY * 2;
      ctx.beginPath();
      ctx.roundRect(-boxW / 2, -boxH / 2, boxW, boxH, 10);
      ctx.fill();
    }

    if (tx.shadow) {
      ctx.shadowColor = 'rgba(0,0,0,0.8)';
      ctx.shadowBlur = 12;
      ctx.shadowOffsetY = 3;
    }

    if (tx.strokeWidth > 0) {
      ctx.strokeStyle = tx.strokeColor || '#000000';
      ctx.lineWidth = tx.strokeWidth * 2;
      ctx.strokeText(tx.text, 0, 0);
    }

    ctx.fillStyle = tx.color || '#FFFFFF';
    ctx.fillText(tx.text, 0, 0);
    ctx.restore();
  }

  // 5. Stickers & GIF Items
  const activeStickers = state.stickers.filter(
    (st) => timeMs >= st.startMs && timeMs <= st.startMs + st.durationMs,
  );
  for (const st of activeStickers) {
    ctx.save();
    ctx.translate((st.x / 100) * w, (st.y / 100) * h);
    const bounce = st.animLoop === 'bounce' ? 1 + Math.sin(timeMs * 0.008) * 0.08 : 1;
    ctx.rotate((st.rotation * Math.PI) / 180);
    ctx.scale(st.scale * bounce, st.scale * bounce);

    if (st.kind === 'custom') {
      const entry = mediaCache.get(st.content);
      if (entry && entry.ready && entry.kind === 'image') {
        ctx.drawImage(entry.el, -48, -48, 96, 96);
      }
    } else if (st.kind === 'sticker') {
      ctx.fillStyle = 'rgba(28, 28, 30, 0.88)';
      ctx.strokeStyle = '#00E5FF';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(-64, -22, 128, 44, 12);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '700 18px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(st.content, 0, 0);
    } else {
      ctx.font = '48px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(st.content, 0, 0);
    }
    ctx.restore();
  }

  // 6. Safe-Zone & Rule-of-Thirds Guides
  if (showGuides) {
    ctx.save();
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.28)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(w / 3, 0);
    ctx.lineTo(w / 3, h);
    ctx.moveTo((w * 2) / 3, 0);
    ctx.lineTo((w * 2) / 3, h);
    ctx.moveTo(0, h / 3);
    ctx.lineTo(w, h / 3);
    ctx.moveTo(0, (h * 2) / 3);
    ctx.lineTo(w, (h * 2) / 3);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(255, 45, 111, 0.3)';
    ctx.strokeRect(w * 0.08, h * 0.1, w * 0.84, h * 0.8);
    ctx.restore();
  }

  // 7. Subtle Free-Tier Watermark
  if (showWatermark) {
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font = '600 14px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('KINETIX', w - 18, h - 18);
    ctx.restore();
  }
}

export async function renderProjectToWebmBlob(params: {
  state: ProjectState;
  mediaCache: Map<string, MediaCacheEntry>;
  showWatermark: boolean;
  onProgress: (pct: number) => void;
}): Promise<Blob> {
  const { state, mediaCache, showWatermark, onProgress } = params;
  const offscreen = document.createElement('canvas');
  const { w, h } = getCanvasDimensions(state.aspectRatio);
  offscreen.width = w;
  offscreen.height = h;
  const ctx = offscreen.getContext('2d')!;

  const totalMs = Math.min(getProjectDurationMs(state), 60000);
  const fps = Math.min(30, state.fps || 30);
  const stream = offscreen.captureStream(fps);
  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
    ? 'video/webm;codecs=vp9'
    : 'video/webm';
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 6_000_000,
  });

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  return new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => {
      resolve(new Blob(chunks, { type: mimeType }));
    };
    recorder.onerror = (e) => reject(e);

    recorder.start();
    const startTime = performance.now();
    const step = () => {
      const elapsed = performance.now() - startTime;
      const clamped = Math.min(elapsed, totalMs);
      renderFrameToCanvas({
        ctx,
        state,
        timeMs: clamped,
        mediaCache,
        showGuides: false,
        showWatermark,
      });
      onProgress(Math.min(95, Math.round((clamped / totalMs) * 95)));
      if (elapsed < totalMs) {
        requestAnimationFrame(step);
      } else {
        recorder.stop();
      }
    };
    requestAnimationFrame(step);
  });
}
