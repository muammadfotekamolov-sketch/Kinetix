export type AspectRatio = '9:16' | '16:9' | '1:1' | '4:5' | '4:3' | '21:9';
export type Resolution = '720p' | '1080p' | '2k' | '4k';
export type FpsOption = 24 | 30 | 60;
export type SubscriptionPlan = 'free_15s' | 'pro_30s' | 'studio_1m';

export type LanguageCode =
  | 'ru'
  | 'en'
  | 'uz'
  | 'kk'
  | 'tr'
  | 'ar'
  | 'es'
  | 'zh'
  | 'fr'
  | 'de'
  | 'ko'
  | 'ja'
  | 'pt'
  | 'hi';

export interface UserProfile {
  id: number;
  uid: string;
  email: string;
  phone: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  gender: 'male' | 'female' | 'unspecified';
  language: LanguageCode;
  parentalConsent: boolean;
  plan: SubscriptionPlan;
  planExpiresAt: string | null;
  planAutoRenew: boolean;
  dailyAiCount: number;
  dailyAiDate: string;
}

export interface CanvasBackground {
  type: 'color' | 'blur' | 'image' | 'gradient';
  color: string;
  gradient: string;
  blurAmount: number;
  imageUrl: string;
}

export type EasingMode = 'linear' | 'ease' | 'fast-start';

export interface Keyframe {
  id: string;
  timeMs: number; // relative to clip start
  easing: EasingMode;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
  volume: number;
  brightness: number;
  contrast: number;
  saturation: number;
}

export interface ColorGrade {
  brightness: number; // -100..100
  contrast: number; // -100..100
  saturation: number; // -100..100
  exposure: number; // -100..100
  temperature: number; // -100..100
  tint: number; // -100..100
  highlights: number; // -100..100
  shadows: number; // -100..100
  vignette: number; // 0..100
  sharpness: number; // 0..100
  grain: number; // 0..100
  fade: number; // 0..100
  filterPreset: string;
  lutName: string;
  curvesLift: number; // -50..50
  curvesGamma: number; // -50..50
  curvesGain: number; // -50..50
  hslHueShift: number; // -180..180
  hslSatShift: number; // -100..100
  hslLumShift: number; // -100..100
}

export type MaskType = 'none' | 'circle' | 'rect' | 'heart' | 'star' | 'linear' | 'mirror';

export interface MaskConfig {
  type: MaskType;
  feather: number; // 0..50
  invert: boolean;
  scale: number; // 0.2..2.0
  x: number;
  y: number;
}

export type BlendMode =
  | 'source-over'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'soft-light'
  | 'hard-light'
  | 'difference';

export type SpeedCurvePreset = 'uniform' | 'montage' | 'hero' | 'bullet' | 'jumpcut';

export interface RetouchConfig {
  smooth: number; // 0..100
  brighten: number; // 0..100
  jawline: number; // 0..100
  eyes: number; // 0..100
  bodySlim: number; // 0..100
}

export interface ChromaKeyConfig {
  enabled: boolean;
  color: string;
  tolerance: number; // 5..100
}

export interface VideoClip {
  id: string;
  track: 'V1' | 'V2';
  type: 'video' | 'image' | 'freeze';
  src: string;
  name: string;
  startMs: number;
  durationMs: number;
  trimStartMs: number;
  speed: number; // 0.1..100
  speedCurve: SpeedCurvePreset;
  smoothSlowMo: boolean;
  reverse: boolean;
  volume: number; // 0..200
  muted: boolean;
  flipH: boolean;
  flipV: boolean;
  rotation: number; // degrees
  scale: number; // 0.1..4
  x: number; // -100..100 (% offset)
  y: number; // -100..100 (% offset)
  crop: { top: number; right: number; bottom: number; left: number };
  stabilize: boolean;
  denoise: boolean;
  enhance: boolean;
  autoReframe: boolean;
  bgRemove: boolean;
  chromaKey: ChromaKeyConfig;
  retouch: RetouchConfig;
  transitionIn: string;
  transitionDurationMs: number;
  animIn: string;
  animOut: string;
  animLoop: string;
  animCombo: string;
  mask: MaskConfig;
  blendMode: BlendMode;
  opacity: number; // 0..100
  borderWidth: number; // 0..20
  borderColor: string;
  shadowBlur: number; // 0..40
  color: ColorGrade;
  keyframes: Keyframe[];
}

export interface TextOverlay {
  id: string;
  text: string;
  startMs: number;
  durationMs: number;
  fontFamily: string;
  fontSize: number;
  color: string;
  strokeColor: string;
  strokeWidth: number;
  shadow: boolean;
  bgColor: string;
  align: 'left' | 'center' | 'right';
  lineHeight: number;
  animIn: string;
  animOut: string;
  animLoop: string;
  templateId: string;
  isMarquee: boolean;
  marqueeSpeed: number;
  isSubtitle: boolean;
  x: number;
  y: number;
}

export interface StickerItem {
  id: string;
  kind: 'emoji' | 'sticker' | 'gif' | 'custom';
  content: string;
  label: string;
  startMs: number;
  durationMs: number;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  animLoop: string;
}

export interface AudioClip {
  id: string;
  track: 'A1' | 'A2';
  name: string;
  src: string;
  synthPreset?: string;
  startMs: number;
  durationMs: number;
  volume: number; // 0..200
  fadeInMs: number;
  fadeOutMs: number;
  voiceEffect: 'none' | 'robot' | 'child' | 'deep' | 'radio';
  denoise: boolean;
  eq: [number, number, number, number, number];
  beatSynced: boolean;
  isRecorded?: boolean;
}

export interface EffectClip {
  id: string;
  name: string;
  effectKey: string;
  category: 'video' | 'face' | 'body';
  startMs: number;
  durationMs: number;
  intensity: number; // 0..100
}

export interface TimelineMarker {
  id: string;
  timeMs: number;
  label: string;
  color: string;
}

export interface ProjectState {
  title: string;
  aspectRatio: AspectRatio;
  resolution: Resolution;
  fps: FpsOption;
  background: CanvasBackground;
  clips: VideoClip[];
  texts: TextOverlay[];
  stickers: StickerItem[];
  audioClips: AudioClip[];
  effects: EffectClip[];
  markers: TimelineMarker[];
}

export interface ProjectRecord {
  id: number;
  title: string;
  aspectRatio: AspectRatio;
  resolution: Resolution;
  fps: FpsOption;
  durationMs: number;
  thumbnailUrl: string;
  stateJson: ProjectState;
  updatedAt: string;
}
