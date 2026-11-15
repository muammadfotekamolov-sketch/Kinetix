import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowLeftRight,
  Check,
  Cloud,
  Diamond,
  Film,
  Grid,
  Layers,
  Maximize2,
  Minimize2,
  Music,
  Palette,
  Pause,
  Play,
  Plus,
  Redo2,
  Scissors,
  Send,
  Share2,
  SkipBack,
  SkipForward,
  Sliders,
  Smile,
  Sparkles,
  Type as TypeIcon,
  Undo2,
  UserCheck,
  Zap,
} from 'lucide-react';
import { createClipFromMedia } from '../data/templates.ts';
import { t } from '../data/i18n.ts';
import { apiFetch } from '../lib/api.ts';
import { audioEngine } from '../lib/audioEngine.ts';
import {
  getProjectDurationMs,
  renderFrameToCanvas,
  type MediaCacheEntry,
} from '../lib/canvasCompositor.ts';
import type {
  AspectRatio,
  AudioClip,
  LanguageCode,
  ProjectState,
  Resolution,
  UserProfile,
  VideoClip,
} from '../types/editor.ts';
import { EditorTimeline, type SelectedItemRef } from './EditorTimeline.tsx';
import { EditorToolPanel, type EditorToolTab } from './EditorToolPanel.tsx';
import { ExportPublishModal } from './ExportPublishModal.tsx';

interface Props {
  user: UserProfile;
  lang: LanguageCode;
  projectId: number | null;
  initialState: ProjectState;
  initialPublishOpen?: boolean;
  autoPlay?: boolean;
  onBack: () => void;
  onSaveProject: (state: ProjectState, existingId: number | null) => Promise<number | null>;
  onUserUpdated: (u: UserProfile) => void;
}

function formatTimecode(ms: number): string {
  const totalSec = Math.max(0, ms / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = Math.floor(totalSec % 60);
  const centi = Math.floor((ms % 1000) / 10);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(centi).padStart(2, '0')}`;
}

const ASPECT_CYCLE: AspectRatio[] = ['9:16', '16:9', '1:1', '4:5', '4:3', '21:9'];

export function VideoEditor({
  user,
  lang,
  projectId: initialProjectId,
  initialState,
  initialPublishOpen = false,
  autoPlay = false,
  onBack,
  onSaveProject,
  onUserUpdated,
}: Props) {
  const dict = t(lang);
  const [projectId, setProjectId] = useState<number | null>(initialProjectId);
  const [state, setState] = useState<ProjectState>(initialState);
  const [undoStack, setUndoStack] = useState<ProjectState[]>([]);
  const [redoStack, setRedoStack] = useState<ProjectState[]>([]);

  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const currentTimeMsRef = useRef(0);
  currentTimeMsRef.current = currentTimeMs;

  const [playing, setPlaying] = useState(autoPlay);
  const playingRef = useRef(autoPlay);
  playingRef.current = playing;
  const [showGuides, setShowGuides] = useState(false);
  const [fullscreenPreview, setFullscreenPreview] = useState(false);

  const [activeTab, setActiveTab] = useState<EditorToolTab>('edit');
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<SelectedItemRef>(
    initialState.clips[0] ? { kind: 'clip', id: initialState.clips[0].id } : null,
  );

  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [exportModalMode, setExportModalMode] = useState<'export' | 'publish' | null>(
    initialPublishOpen ? 'publish' : null,
  );
  const [aiWishOpen, setAiWishOpen] = useState(false);
  const [aiWishInput, setAiWishInput] = useState('');
  const [aiWishBusy, setAiWishBusy] = useState(false);
  const [aiWishStatus, setAiWishStatus] = useState('');

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mediaCacheRef = useRef<Map<string, MediaCacheEntry>>(new Map());
  const addMediaInputRef = useRef<HTMLInputElement | null>(null);
  const totalDurationMs = useMemo(() => getProjectDurationMs(state), [state]);

  // Preload all clip & custom sticker media URLs into HTMLImageElement / HTMLVideoElement cache
  useEffect(() => {
    const cache = mediaCacheRef.current;
    for (const clip of state.clips) {
      if (!clip.src || cache.has(clip.src)) continue;
      if (clip.type === 'video') {
        const video = document.createElement('video');
        video.src = clip.src;
        video.crossOrigin = 'anonymous';
        video.muted = true;
        video.loop = true;
        video.playsInline = true;
        video.preload = 'auto';
        const entry: MediaCacheEntry = { kind: 'video', el: video, ready: false };
        const markReady = () => {
          entry.ready = true;
          if (playingRef.current) {
            void video.play().catch(() => {});
          }
        };
        video.onloadeddata = markReady;
        video.oncanplay = markReady;
        video.load();
        cache.set(clip.src, entry);
      } else {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = clip.src;
        const entry: MediaCacheEntry = { kind: 'image', el: img, ready: false };
        img.onload = () => {
          entry.ready = true;
        };
        cache.set(clip.src, entry);
      }
    }
    for (const st of state.stickers) {
      if (st.kind === 'custom' && st.content && !cache.has(st.content)) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = st.content;
        const entry: MediaCacheEntry = { kind: 'image', el: img, ready: false };
        img.onload = () => {
          entry.ready = true;
        };
        cache.set(st.content, entry);
      }
    }
  }, [state.clips, state.stickers]);

  const handleStateChange = useCallback(
    (updater: (prev: ProjectState) => ProjectState, recordUndo = true) => {
      setState((prev) => {
        const next = updater(prev);
        if (recordUndo) {
          setUndoStack((u) => [...u.slice(-24), prev]);
          setRedoStack([]);
        }
        return next;
      });
    },
    [],
  );

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setUndoStack((u) => u.slice(0, -1));
    setRedoStack((r) => [...r, state]);
    setState(prev);
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack((r) => r.slice(0, -1));
    setUndoStack((u) => [...u, state]);
    setState(next);
  };

  // Sync <video> & audio engine with editor playback state
  useEffect(() => {
    for (const entry of mediaCacheRef.current.values()) {
      if (entry.kind === 'video') {
        const vid = entry.el as HTMLVideoElement;
        if (playing) {
          void vid.play().catch(() => {});
        } else {
          vid.pause();
        }
      }
    }
    if (playing) {
      audioEngine.playTimelineTracks(state.audioClips, currentTimeMsRef.current);
    } else {
      audioEngine.stopAll();
    }
    return () => {
      audioEngine.stopAll();
    };
  }, [playing, state.audioClips]);

  // Playback & Canvas Render Loop
  useEffect(() => {
    let rafId = 0;
    let lastTick = performance.now();

    const tick = (now: number) => {
      const dt = now - lastTick;
      lastTick = now;

      if (playing) {
        setCurrentTimeMs((tMs) => {
          const next = tMs + dt;
          if (next >= totalDurationMs) {
            setPlaying(false);
            return 0;
          }
          return next;
        });
      }

      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          renderFrameToCanvas({
            ctx,
            state,
            timeMs: currentTimeMs,
            mediaCache: mediaCacheRef.current,
            showGuides,
            showWatermark: user.plan === 'free_15s',
          });
        }
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [playing, currentTimeMs, totalDurationMs, state, showGuides, user.plan]);

  const handleSaveCloud = async () => {
    setSaving(true);
    try {
      const savedId = await onSaveProject(state, projectId);
      if (savedId) setProjectId(savedId);
      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 2000);
      return savedId;
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateTiming = (
    kind: 'clip' | 'text' | 'sticker' | 'audio' | 'effect',
    id: string,
    startMs: number,
    durationMs: number,
  ) => {
    handleStateChange(
      (prev) => ({
        ...prev,
        clips:
          kind === 'clip'
            ? prev.clips.map((c) => (c.id === id ? { ...c, startMs, durationMs } : c))
            : prev.clips,
        texts:
          kind === 'text'
            ? prev.texts.map((tx) => (tx.id === id ? { ...tx, startMs, durationMs } : tx))
            : prev.texts,
        stickers:
          kind === 'sticker'
            ? prev.stickers.map((s) => (s.id === id ? { ...s, startMs, durationMs } : s))
            : prev.stickers,
        audioClips:
          kind === 'audio'
            ? prev.audioClips.map((a) => (a.id === id ? { ...a, startMs, durationMs } : a))
            : prev.audioClips,
        effects:
          kind === 'effect'
            ? prev.effects.map((fx) => (fx.id === id ? { ...fx, startMs, durationMs } : fx))
            : prev.effects,
      }),
      false,
    );
  };

  const activeClip =
    (selected?.kind === 'clip'
      ? state.clips.find((c) => c.id === selected.id)
      : state.clips.find(
          (c) => currentTimeMs >= c.startMs && currentTimeMs <= c.startMs + c.durationMs,
        )) || state.clips[0];

  // Quick Timeline Toolbar Actions (CapCut-style)
  const handleQuickSplit = () => {
    if (!activeClip) return;
    if (
      currentTimeMs <= activeClip.startMs + 250 ||
      currentTimeMs >= activeClip.startMs + activeClip.durationMs - 250
    ) {
      return;
    }
    const splitOffset = currentTimeMs - activeClip.startMs;
    const rightClip: VideoClip = {
      ...JSON.parse(JSON.stringify(activeClip)),
      id: `clip_${Date.now()}`,
      startMs: currentTimeMs,
      durationMs: activeClip.durationMs - splitOffset,
      trimStartMs: activeClip.trimStartMs + splitOffset,
    };
    handleStateChange((prev) => ({
      ...prev,
      clips: prev.clips
        .map((c) => (c.id === activeClip.id ? { ...c, durationMs: splitOffset } : c))
        .concat(rightClip),
    }));
  };

  const handleQuickDuplicate = () => {
    if (!activeClip) return;
    const copy: VideoClip = {
      ...JSON.parse(JSON.stringify(activeClip)),
      id: `clip_${Date.now()}`,
      startMs: activeClip.startMs + activeClip.durationMs,
      name: `${activeClip.name} (копия)`,
    };
    handleStateChange((prev) => ({ ...prev, clips: [...prev.clips, copy] }));
  };

  const handleQuickFreeze = () => {
    if (!activeClip) return;
    const freezeClip: VideoClip = {
      ...JSON.parse(JSON.stringify(activeClip)),
      id: `freeze_${Date.now()}`,
      type: 'freeze',
      name: 'Стоп-кадр',
      startMs: currentTimeMs,
      durationMs: 2500,
    };
    handleStateChange((prev) => ({ ...prev, clips: [...prev.clips, freezeClip] }));
  };

  const handleQuickReverse = () => {
    if (!activeClip) return;
    handleStateChange((prev) => ({
      ...prev,
      clips: prev.clips.map((c) =>
        c.id === activeClip.id ? { ...c, reverse: !c.reverse } : c,
      ),
    }));
  };

  const handleQuickDetachAudio = () => {
    if (!activeClip) return;
    const extracted: AudioClip = {
      id: `aud_ext_${Date.now()}`,
      track: 'A1',
      name: `Звук: ${activeClip.name}`,
      src: activeClip.type === 'video' ? activeClip.src : '',
      synthPreset: activeClip.type === 'video' ? undefined : 'ambient',
      startMs: activeClip.startMs,
      durationMs: activeClip.durationMs,
      volume: activeClip.volume,
      fadeInMs: 0,
      fadeOutMs: 0,
      voiceEffect: 'none',
      denoise: false,
      eq: [0, 0, 0, 0, 0],
      beatSynced: false,
    };
    handleStateChange((prev) => ({
      ...prev,
      clips: prev.clips.map((c) => (c.id === activeClip.id ? { ...c, muted: true } : c)),
      audioClips: [...prev.audioClips, extracted],
    }));
  };

  const handleQuickDelete = () => {
    if (!selected) return;
    handleStateChange((prev) => ({
      ...prev,
      clips: selected.kind === 'clip' ? prev.clips.filter((c) => c.id !== selected.id) : prev.clips,
      texts: selected.kind === 'text' ? prev.texts.filter((t) => t.id !== selected.id) : prev.texts,
      stickers:
        selected.kind === 'sticker'
          ? prev.stickers.filter((s) => s.id !== selected.id)
          : prev.stickers,
      audioClips:
        selected.kind === 'audio'
          ? prev.audioClips.filter((a) => a.id !== selected.id)
          : prev.audioClips,
      effects:
        selected.kind === 'effect'
          ? prev.effects.filter((fx) => fx.id !== selected.id)
          : prev.effects,
    }));
    setSelected(null);
  };

  const handleAddMarker = () => {
    handleStateChange((prev) => ({
      ...prev,
      markers: [
        ...prev.markers,
        {
          id: `mk_${Date.now()}`,
          timeMs: Math.round(currentTimeMs),
          label: `Метка ${prev.markers.length + 1}`,
          color: '#FF2D6F',
        },
      ],
    }));
  };

  const handleAddBeatMarkers = (bpm: number, startMs: number, durationMs: number) => {
    const beatStepMs = Math.round((60 / Math.max(40, bpm)) * 1000) * 2;
    const newMarkers: Array<{ id: string; timeMs: number; label: string; color: string }> = [];
    for (let tMs = startMs; tMs < startMs + durationMs; tMs += beatStepMs) {
      newMarkers.push({
        id: `beat_${tMs}_${Math.random().toString(36).slice(2, 5)}`,
        timeMs: tMs,
        label: 'Beat',
        color: '#00E5FF',
      });
    }
    handleStateChange((prev) => ({
      ...prev,
      markers: [...prev.markers, ...newMarkers.slice(0, 16)],
    }));
  };

  const handleRunAiWish = async () => {
    const prompt = aiWishInput.trim();
    if (!prompt || aiWishBusy) return;
    setAiWishBusy(true);
    setAiWishStatus('');
    try {
      const res = await apiFetch<{
        plan: {
          reply: string;
          aspectRatio?: AspectRatio;
          resolution?: Resolution;
          speed?: number;
          reverse?: boolean;
          rotation?: number;
          flipH?: boolean;
          volume?: number;
          filterPreset?: string;
          brightness?: number;
          contrast?: number;
          saturation?: number;
          vignette?: number;
          transitionIn?: string;
          addText?: {
            text: string;
            color?: string;
            isMarquee?: boolean;
            position?: 'top' | 'center' | 'bottom';
          };
          addEffect?: 'chromatic' | 'vhs' | 'film_burn' | 'sparkle' | 'neon';
          addAudio?: 'synthwave' | 'lofi' | 'trap' | 'ambient';
          addSticker?: string;
          bgRemove?: boolean;
          retouchSmooth?: number;
        };
      }>('/api/ai/edit-command', {
        method: 'POST',
        body: JSON.stringify({
          prompt,
          aspectRatio: state.aspectRatio,
          resolution: state.resolution,
          language: lang,
        }),
      });

      const p = res.plan;
      const targetClipId =
        (selected?.kind === 'clip' ? selected.id : undefined) || state.clips[0]?.id;

      handleStateChange((prev) => {
        const nextClips = prev.clips.map((c) => {
          if (c.id !== targetClipId) return c;
          return {
            ...c,
            speed: typeof p.speed === 'number' ? Math.max(0.1, Math.min(100, p.speed)) : c.speed,
            reverse: typeof p.reverse === 'boolean' ? p.reverse : c.reverse,
            rotation:
              typeof p.rotation === 'number' ? (c.rotation + p.rotation) % 360 : c.rotation,
            flipH: typeof p.flipH === 'boolean' ? p.flipH : c.flipH,
            volume: typeof p.volume === 'number' ? p.volume : c.volume,
            transitionIn: p.transitionIn ?? c.transitionIn,
            bgRemove: typeof p.bgRemove === 'boolean' ? p.bgRemove : c.bgRemove,
            retouch:
              typeof p.retouchSmooth === 'number'
                ? { ...c.retouch, smooth: p.retouchSmooth }
                : c.retouch,
            color: {
              ...c.color,
              filterPreset: p.filterPreset ?? c.color.filterPreset,
              brightness:
                typeof p.brightness === 'number' ? p.brightness : c.color.brightness,
              contrast: typeof p.contrast === 'number' ? p.contrast : c.color.contrast,
              saturation:
                typeof p.saturation === 'number' ? p.saturation : c.color.saturation,
              vignette: typeof p.vignette === 'number' ? p.vignette : c.color.vignette,
            },
          };
        });

        const nextTexts = [...prev.texts];
        if (p.addText?.text) {
          const yPos =
            p.addText.position === 'top' ? 20 : p.addText.position === 'bottom' ? 82 : 50;
          nextTexts.push({
            id: `ai_txt_${Date.now()}`,
            text: p.addText.text,
            startMs: currentTimeMs,
            durationMs: 4000,
            fontFamily: 'Plus Jakarta Sans',
            fontSize: 36,
            color: p.addText.color || '#FFFFFF',
            strokeColor: '#000000',
            strokeWidth: 2,
            shadow: true,
            bgColor: 'rgba(0,0,0,0.4)',
            align: 'center',
            lineHeight: 1.2,
            animIn: 'pop',
            animOut: 'fade',
            animLoop: 'none',
            templateId: 'minimal-cinema',
            isMarquee: Boolean(p.addText.isMarquee),
            marqueeSpeed: 90,
            isSubtitle: false,
            x: 50,
            y: yPos,
          });
        }

        const nextEffects = [...prev.effects];
        if (p.addEffect) {
          nextEffects.push({
            id: `ai_fx_${Date.now()}`,
            name: p.addEffect.toUpperCase(),
            effectKey: p.addEffect,
            category: 'video',
            startMs: currentTimeMs,
            durationMs: 4000,
            intensity: 80,
          });
        }

        const nextAudio = [...prev.audioClips];
        if (p.addAudio) {
          nextAudio.push({
            id: `ai_aud_${Date.now()}`,
            track: 'A1',
            name: `AI ${p.addAudio}`,
            src: '',
            synthPreset: p.addAudio,
            startMs: 0,
            durationMs: Math.max(5000, totalDurationMs),
            volume: 80,
            fadeInMs: 300,
            fadeOutMs: 600,
            voiceEffect: 'none',
            denoise: false,
            eq: [0, 0, 0, 0, 0],
            beatSynced: true,
          });
        }

        const nextStickers = [...prev.stickers];
        if (p.addSticker) {
          nextStickers.push({
            id: `ai_stk_${Date.now()}`,
            kind: 'emoji',
            content: p.addSticker,
            label: p.addSticker,
            startMs: currentTimeMs,
            durationMs: 3500,
            x: 50,
            y: 35,
            scale: 1.2,
            rotation: 0,
            animLoop: 'bounce',
          });
        }

        return {
          ...prev,
          aspectRatio: p.aspectRatio ?? prev.aspectRatio,
          resolution: p.resolution ?? prev.resolution,
          clips: nextClips,
          texts: nextTexts,
          effects: nextEffects,
          audioClips: nextAudio,
          stickers: nextStickers,
        };
      });

      setAiWishStatus(p.reply);
      setAiWishInput('');
    } catch (err) {
      setAiWishStatus(err instanceof Error ? err.message : 'Ошибка ИИ-команды');
    } finally {
      setAiWishBusy(false);
    }
  };

  const cycleAspectRatio = () => {
    const idx = ASPECT_CYCLE.indexOf(state.aspectRatio);
    const next = ASPECT_CYCLE[(idx + 1) % ASPECT_CYCLE.length];
    handleStateChange((prev) => ({ ...prev, aspectRatio: next }));
  };

  const toolItems: Array<{
    id: EditorToolTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { id: 'edit', label: 'Правка', icon: Scissors },
    { id: 'transitions', label: 'Переходы', icon: ArrowLeftRight },
    { id: 'animations', label: 'Анимация', icon: Zap },
    { id: 'audio', label: dict.audio, icon: Music },
    { id: 'text', label: dict.text, icon: TypeIcon },
    { id: 'stickers', label: dict.stickers, icon: Smile },
    { id: 'effects', label: dict.effects, icon: Sparkles },
    { id: 'color', label: dict.color, icon: Palette },
    { id: 'masks', label: dict.masks, icon: Layers },
    { id: 'keyframes', label: dict.keyframes, icon: Diamond },
    { id: 'retouch', label: dict.retouch, icon: UserCheck },
    { id: 'canvas', label: dict.canvas, icon: Sliders },
  ];

  return (
    <div className="h-screen w-screen bg-[#09090B] text-white flex flex-col overflow-hidden">
      <input
        ref={addMediaInputRef}
        type="file"
        multiple
        accept="video/*,image/*"
        className="hidden"
        onChange={(e) => {
          const files = e.target.files;
          if (files && files.length > 0) {
            let cursor = totalDurationMs;
            const added = Array.from(files).map((f) => {
              const dur = f.type.startsWith('video/') ? 7000 : 5000;
              const c = createClipFromMedia({
                type: f.type.startsWith('video/') ? 'video' : 'image',
                src: URL.createObjectURL(f),
                name: f.name,
                startMs: cursor,
                durationMs: dur,
              });
              cursor += dur;
              return c;
            });
            handleStateChange((prev) => ({ ...prev, clips: [...prev.clips, ...added] }));
          }
          e.target.value = '';
        }}
      />

      {/* TOP CAPCUT STUDIO HEADER */}
      <header className="h-12 shrink-0 bg-[#141416] border-b border-white/[0.08] px-2.5 sm:px-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="w-8 h-8 rounded-lg bg-[#1E1E22] hover:bg-[#27272C] flex items-center justify-center text-zinc-300 hover:text-white shrink-0"
            title={dict.back}
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <input
            type="text"
            value={state.title}
            onChange={(e) =>
              handleStateChange((prev) => ({ ...prev, title: e.target.value }), false)
            }
            className="bg-transparent text-xs sm:text-sm font-semibold text-white truncate max-w-[125px] sm:max-w-[220px] px-2 py-1 rounded-md hover:bg-white/5 focus:bg-[#1E1E22] focus:outline-none"
          />
          <span className="hidden md:inline text-[11px] font-mono-tabular text-zinc-500">
            {state.aspectRatio} · {state.fps}fps · {formatTimecode(totalDurationMs)}
          </span>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            type="button"
            disabled={undoStack.length === 0}
            onClick={handleUndo}
            className="w-8 h-8 rounded-lg bg-[#1E1E22] flex items-center justify-center text-zinc-300 disabled:opacity-30 hover:text-white"
            title={dict.undo}
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            disabled={redoStack.length === 0}
            onClick={handleRedo}
            className="w-8 h-8 rounded-lg bg-[#1E1E22] flex items-center justify-center text-zinc-300 disabled:opacity-30 hover:text-white"
            title={dict.redo}
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>

          <select
            value={state.resolution}
            onChange={(e) =>
              handleStateChange((prev) => ({
                ...prev,
                resolution: e.target.value as Resolution,
              }))
            }
            className="h-8 px-2 rounded-lg bg-[#1E1E22] border border-white/10 text-[11px] font-mono-tabular text-zinc-200 uppercase"
          >
            <option value="720p">720p</option>
            <option value="1080p">1080p</option>
            <option value="2k">2K</option>
            <option value="4k">4K</option>
          </select>

          <button
            type="button"
            disabled={saving}
            onClick={handleSaveCloud}
            className="h-8 px-2.5 rounded-lg bg-[#1E1E22] border border-white/10 text-[11px] text-zinc-200 hover:text-white flex items-center gap-1"
            title="Сохранить в облако"
          >
            {savedNotice ? (
              <Check className="w-3.5 h-3.5 text-[#00E5FF]" />
            ) : (
              <Cloud className="w-3.5 h-3.5 text-[#00E5FF]" />
            )}
            <span className="hidden lg:inline">{savedNotice ? 'Сохранено' : 'Облако'}</span>
          </button>

          <button
            type="button"
            onClick={() => setExportModalMode('publish')}
            className="h-8 px-2.5 rounded-lg bg-[#1E1E22] border border-[#FF2D6F]/45 text-[11px] font-medium text-[#FF7DA6] flex items-center gap-1 hover:bg-[#FF2D6F]/15"
            title="Опубликовать в TikTok / Instagram"
          >
            <Share2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{dict.publishBtn}</span>
          </button>

          <button
            type="button"
            onClick={() => setExportModalMode('export')}
            className="h-8 px-3.5 rounded-lg bg-[#00E5FF] text-black text-xs font-bold hover:bg-[#33ECFF] whitespace-nowrap"
          >
            {dict.exportBtn}
          </button>
        </div>
      </header>

      {/* MAIN CAPCUT WORKSPACE: Top Split (Left Asset/Tool Dock + Right Player), Bottom Full-Width Timeline */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* DESKTOP CAPCUT LEFT DOCK (Vertical Tool Rail + Tool Browser) */}
          <aside className="hidden lg:flex w-[390px] xl:w-[420px] shrink-0 bg-[#141416] border-r border-white/[0.08] overflow-hidden">
            {/* Vertical Tool Category Rail */}
            <nav className="w-[68px] bg-[#101012] border-r border-white/[0.07] flex flex-col items-center py-2 gap-1 overflow-y-auto shrink-0">
              {toolItems.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveTab(item.id)}
                    className={`w-[58px] py-2 rounded-lg flex flex-col items-center justify-center gap-1 transition-colors ${
                      active
                        ? 'bg-[#00E5FF]/15 text-[#00E5FF]'
                        : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="text-[9px] font-medium truncate max-w-full px-0.5">
                      {item.label}
                    </span>
                  </button>
                );
              })}
            </nav>

            {/* Left Inspector Panel */}
            <div className="flex-1 min-w-0 bg-[#141416] overflow-hidden">
              <EditorToolPanel
                activeTab={activeTab}
                lang={lang}
                state={state}
                currentTimeMs={currentTimeMs}
                selected={selected}
                onChangeState={handleStateChange}
                onSelect={setSelected}
                onAddBeatMarkers={handleAddBeatMarkers}
              />
            </div>
          </aside>

          {/* CENTER / RIGHT PLAYER VIEWPORT */}
          <div className="flex-1 flex flex-col min-w-0 bg-[#09090B]">
            <div
              className={`flex-1 flex items-center justify-center p-2.5 sm:p-5 min-h-0 relative ${
                fullscreenPreview ? 'fixed inset-0 z-50 bg-black p-4' : ''
              }`}
            >
              <canvas
                ref={canvasRef}
                className="max-h-full max-w-full rounded-lg border border-white/10 shadow-2xl object-contain bg-[#050507]"
              />
              {fullscreenPreview && (
                <button
                  type="button"
                  onClick={() => setFullscreenPreview(false)}
                  className="absolute top-4 right-4 w-10 h-10 rounded-lg bg-[#161619] border border-white/15 flex items-center justify-center text-white"
                >
                  <Minimize2 className="w-5 h-5" />
                </button>
              )}
            </div>

            {/* CapCut Player Transport Bar */}
            <div className="h-11 px-3 sm:px-4 border-t border-white/[0.07] bg-[#101012] flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => addMediaInputRef.current?.click()}
                  className="h-8 px-2.5 rounded-lg bg-[#1B1B1F] hover:bg-[#25252B] text-xs text-zinc-200 flex items-center gap-1.5 hover:text-[#00E5FF]"
                  title="Добавить видео или фото"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <Film className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Клип</span>
                </button>
                <button
                  type="button"
                  onClick={cycleAspectRatio}
                  className="h-8 px-2 rounded-lg bg-[#1B1B1F] hover:bg-[#25252B] text-[11px] font-mono-tabular text-zinc-300"
                  title="Сменить формат кадра (9:16 / 16:9 / 1:1)"
                >
                  {state.aspectRatio}
                </button>
              </div>

              <div className="flex items-center gap-2 sm:gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setPlaying(false);
                    setCurrentTimeMs(0);
                  }}
                  className="w-7 h-7 rounded-md text-zinc-400 hover:text-white flex items-center justify-center"
                  title="В начало"
                >
                  <SkipBack className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setPlaying((p) => !p)}
                  className="w-8 h-8 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 transition-transform"
                  aria-label={playing ? 'Пауза' : 'Воспроизвести'}
                >
                  {playing ? (
                    <Pause className="w-3.5 h-3.5 fill-current" />
                  ) : (
                    <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPlaying(false);
                    setCurrentTimeMs(Math.max(0, totalDurationMs - 50));
                  }}
                  className="w-7 h-7 rounded-md text-zinc-400 hover:text-white flex items-center justify-center"
                  title="В конец"
                >
                  <SkipForward className="w-3.5 h-3.5" />
                </button>
                <div className="font-mono-tabular text-[11px] text-zinc-400">
                  <span className="text-white">{formatTimecode(currentTimeMs)}</span>
                  <span className="text-zinc-600"> / </span>
                  <span>{formatTimecode(totalDurationMs)}</span>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setAiWishOpen((v) => !v)}
                  className={`h-8 px-2.5 rounded-lg text-[11px] font-medium flex items-center gap-1 border transition-colors ${
                    aiWishOpen
                      ? 'bg-[#FF2D6F]/20 border-[#FF2D6F]/50 text-[#FF7DA6]'
                      : 'bg-[#1B1B1F] border-white/10 text-zinc-200 hover:border-[#00E5FF]'
                  }`}
                  title="Дать задание ИИ-редактору"
                >
                  <Sparkles className="w-3.5 h-3.5 text-[#FF2D6F]" />
                  <span className="hidden sm:inline">ИИ</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowGuides((v) => !v)}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    showGuides
                      ? 'bg-[#00E5FF]/20 text-[#00E5FF]'
                      : 'bg-[#1B1B1F] text-zinc-400 hover:text-white'
                  }`}
                  title="Сетка и направляющие"
                >
                  <Grid className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setFullscreenPreview(true)}
                  className="w-8 h-8 rounded-lg bg-[#1B1B1F] flex items-center justify-center text-zinc-300 hover:text-white"
                  title="Полный экран"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {aiWishOpen && (
              <div className="px-3 sm:px-4 py-2 bg-[#141416] border-t border-white/[0.08] flex flex-wrap items-center gap-2 shrink-0">
                <Sparkles className="w-4 h-4 text-[#00E5FF] shrink-0" />
                <input
                  type="text"
                  value={aiWishInput}
                  onChange={(e) => setAiWishInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleRunAiWish();
                  }}
                  placeholder="Скажите ИИ: «сделай чб», «ускорь 2x», «добавь неон и текст 'Хиты'»..."
                  className="flex-1 min-w-[200px] h-8 px-3 rounded-lg bg-[#1B1B1F] border border-white/10 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#00E5FF]"
                />
                <button
                  type="button"
                  disabled={aiWishBusy || !aiWishInput.trim()}
                  onClick={() => void handleRunAiWish()}
                  className="h-8 px-3.5 rounded-lg bg-[#00E5FF] text-black text-xs font-bold disabled:opacity-40 flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{aiWishBusy ? '...' : 'Выполнить'}</span>
                </button>
                {aiWishStatus && (
                  <span className="text-[11px] text-[#00E5FF] truncate max-w-xs">
                    {aiWishStatus}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* FULL-WIDTH CAPCUT MULTI-TRACK TIMELINE */}
        <EditorTimeline
          state={state}
          currentTimeMs={currentTimeMs}
          totalDurationMs={totalDurationMs}
          selected={selected}
          onSelect={setSelected}
          onSeek={(ms) => {
            setPlaying(false);
            setCurrentTimeMs(ms);
          }}
          onUpdateItemTiming={handleUpdateTiming}
          onAddMarker={handleAddMarker}
          onSplitClip={handleQuickSplit}
          onDuplicateClip={handleQuickDuplicate}
          onFreezeClip={handleQuickFreeze}
          onReverseClip={handleQuickReverse}
          onDetachAudio={handleQuickDetachAudio}
          onDeleteSelected={handleQuickDelete}
          onSelectTransition={(clipId) => {
            setSelected({ kind: 'clip', id: clipId });
            setActiveTab('transitions');
            setMobileDrawerOpen(true);
          }}
        />
      </div>

      {/* MOBILE BOTTOM TOOL DRAWER */}
      {mobileDrawerOpen && (
        <div className="lg:hidden fixed inset-x-0 bottom-14 z-30 bg-[#141416] border-t border-white/15 rounded-t-2xl max-h-[48vh] flex flex-col shadow-2xl">
          <div className="flex items-center justify-between px-4 py-2 border-b border-white/[0.08]">
            <span className="text-xs font-semibold text-white">
              {toolItems.find((i) => i.id === activeTab)?.label}
            </span>
            <button
              type="button"
              onClick={() => setMobileDrawerOpen(false)}
              className="text-xs text-[#00E5FF] font-semibold px-2 py-1"
            >
              Готово
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            <EditorToolPanel
              activeTab={activeTab}
              lang={lang}
              state={state}
              currentTimeMs={currentTimeMs}
              selected={selected}
              onChangeState={handleStateChange}
              onSelect={setSelected}
              onAddBeatMarkers={handleAddBeatMarkers}
            />
          </div>
        </div>
      )}

      {/* MOBILE CAPCUT BOTTOM TOOLBAR */}
      <nav className="lg:hidden h-14 shrink-0 bg-[#101012] border-t border-white/10 flex items-center gap-1 px-2 overflow-x-auto pb-safe">
        {toolItems.map((item) => {
          const Icon = item.icon;
          const active = mobileDrawerOpen && activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                if (activeTab === item.id && mobileDrawerOpen) {
                  setMobileDrawerOpen(false);
                } else {
                  setActiveTab(item.id);
                  setMobileDrawerOpen(true);
                }
              }}
              className={`min-w-[60px] h-11 rounded-lg flex flex-col items-center justify-center gap-0.5 shrink-0 transition-colors ${
                active ? 'bg-[#00E5FF]/15 text-[#00E5FF]' : 'text-zinc-400'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="text-[10px] whitespace-nowrap">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Export & Publish Modal */}
      {exportModalMode && (
        <ExportPublishModal
          user={user}
          lang={lang}
          projectId={projectId}
          state={state}
          mediaCache={mediaCacheRef.current}
          initialTab={exportModalMode}
          onClose={() => setExportModalMode(null)}
          onSaveCloud={handleSaveCloud}
          onUserUpdated={onUserUpdated}
        />
      )}
    </div>
  );
}
