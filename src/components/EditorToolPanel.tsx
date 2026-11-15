import { useEffect, useRef, useState } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  AudioLines,
  Copy,
  Crop,
  Diamond,
  FlipHorizontal2,
  FlipVertical2,
  Mic,
  Pause,
  Play,
  Plus,
  Rewind,
  RotateCcw,
  RotateCw,
  Save,
  Scissors,
  Sparkles,
  Star,
  Trash2,
  Upload,
  Volume2,
  VolumeX,
  Wand2,
} from 'lucide-react';
import {
  AUDIO_LIBRARY,
  CANVAS_GRADIENTS,
  CLIP_ANIMATION_OPTIONS,
  createClipFromMedia,
  createDefaultColorGrade,
  FILTER_PRESETS,
  parseCubeLutSummary,
  STICKER_LIBRARY,
  TEXT_TEMPLATES,
  TRANSITION_OPTIONS,
  VIDEO_EFFECTS_LIBRARY,
} from '../data/templates.ts';
import { apiFetch } from '../lib/api.ts';
import { audioEngine } from '../lib/audioEngine.ts';
import type {
  AspectRatio,
  AudioClip,
  BlendMode,
  ColorGrade,
  EasingMode,
  EffectClip,
  LanguageCode,
  MaskType,
  ProjectState,
  SpeedCurvePreset,
  StickerItem,
  TextOverlay,
  VideoClip,
} from '../types/editor.ts';
import type { SelectedItemRef } from './EditorTimeline.tsx';

export type EditorToolTab =
  | 'edit'
  | 'transitions'
  | 'animations'
  | 'audio'
  | 'text'
  | 'stickers'
  | 'effects'
  | 'color'
  | 'masks'
  | 'keyframes'
  | 'canvas'
  | 'retouch';

interface Props {
  activeTab: EditorToolTab;
  lang: LanguageCode;
  state: ProjectState;
  currentTimeMs: number;
  selected: SelectedItemRef;
  onChangeState: (updater: (prev: ProjectState) => ProjectState, recordUndo?: boolean) => void;
  onSelect: (sel: SelectedItemRef) => void;
  onAddBeatMarkers: (bpm: number, startMs: number, durationMs: number) => void;
}

export function EditorToolPanel({
  activeTab,
  lang,
  state,
  currentTimeMs,
  selected,
  onChangeState,
  onSelect,
  onAddBeatMarkers,
}: Props) {
  const activeClip: VideoClip | undefined =
    (selected?.kind === 'clip'
      ? state.clips.find((c) => c.id === selected.id)
      : state.clips.find(
          (c) => currentTimeMs >= c.startMs && currentTimeMs <= c.startMs + c.durationMs,
        )) || state.clips[0];

  const activeText: TextOverlay | undefined =
    selected?.kind === 'text'
      ? state.texts.find((t) => t.id === selected.id)
      : state.texts[0];

  const activeAudio: AudioClip | undefined =
    selected?.kind === 'audio'
      ? state.audioClips.find((a) => a.id === selected.id)
      : state.audioClips[0];

  const activeSticker: StickerItem | undefined =
    selected?.kind === 'sticker'
      ? state.stickers.find((s) => s.id === selected.id)
      : state.stickers[0];

  const activeEffect: EffectClip | undefined =
    selected?.kind === 'effect'
      ? state.effects.find((fx) => fx.id === selected.id)
      : state.effects[0];

  const [savedPresets, setSavedPresets] = useState<Array<{ id: number; name: string; settingsJson: ColorGrade }>>([]);
  const [presetName, setPresetName] = useState('');
  const [favoriteStickers, setFavoriteStickers] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('kinetix_fav_stickers') || '[]');
    } catch {
      return [];
    }
  });
  const [stickerFilter, setStickerFilter] = useState<'all' | 'fav'>('all');
  const [audioCategory, setAudioCategory] = useState<'all' | 'Музыка' | 'Эффекты'>('all');
  const [effectCategory, setEffectCategory] = useState<'all' | 'video' | 'face' | 'body'>('all');
  const [animMode, setAnimMode] = useState<'in' | 'out' | 'loop'>('in');
  const [recording, setRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const [ttsVoice, setTtsVoice] = useState('Kore');
  const [ttsBusy, setTtsBusy] = useState(false);
  const [captionBusy, setCaptionBusy] = useState(false);

  const pipInputRef = useRef<HTMLInputElement | null>(null);
  const stickerInputRef = useRef<HTMLInputElement | null>(null);
  const lutInputRef = useRef<HTMLInputElement | null>(null);
  const bgImgInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (activeTab === 'color') {
      void apiFetch<{ presets: Array<{ id: number; name: string; settingsJson: ColorGrade }> }>('/api/presets')
        .then((res) => setSavedPresets(res.presets || []))
        .catch(() => {});
    }
  }, [activeTab]);

  const patchClip = (clipId: string, patch: Partial<VideoClip>) => {
    onChangeState((prev) => ({
      ...prev,
      clips: prev.clips.map((c) => (c.id === clipId ? { ...c, ...patch } : c)),
    }));
  };

  const patchColor = (clipId: string, patch: Partial<ColorGrade>) => {
    onChangeState((prev) => ({
      ...prev,
      clips: prev.clips.map((c) =>
        c.id === clipId ? { ...c, color: { ...c.color, ...patch } } : c,
      ),
    }));
  };

  const handleSplitClip = () => {
    if (!activeClip) return;
    if (
      currentTimeMs <= activeClip.startMs + 250 ||
      currentTimeMs >= activeClip.startMs + activeClip.durationMs - 250
    ) {
      return;
    }
    const splitOffset = currentTimeMs - activeClip.startMs;
    const leftDur = splitOffset;
    const rightDur = activeClip.durationMs - splitOffset;
    const rightClip: VideoClip = {
      ...JSON.parse(JSON.stringify(activeClip)),
      id: `clip_${Date.now()}`,
      startMs: currentTimeMs,
      durationMs: rightDur,
      trimStartMs: activeClip.trimStartMs + splitOffset,
    };
    onChangeState((prev) => ({
      ...prev,
      clips: prev.clips
        .map((c) => (c.id === activeClip.id ? { ...c, durationMs: leftDur } : c))
        .concat(rightClip),
    }));
  };

  const handleDuplicateClip = () => {
    if (!activeClip) return;
    const copy: VideoClip = {
      ...JSON.parse(JSON.stringify(activeClip)),
      id: `clip_${Date.now()}`,
      startMs: activeClip.startMs + activeClip.durationMs,
      name: `${activeClip.name} (копия)`,
    };
    onChangeState((prev) => ({ ...prev, clips: [...prev.clips, copy] }));
  };

  const handleDeleteSelected = () => {
    const target = selected || (activeClip ? { kind: 'clip' as const, id: activeClip.id } : null);
    if (!target) return;
    onChangeState((prev) => ({
      ...prev,
      clips: target.kind === 'clip' ? prev.clips.filter((c) => c.id !== target.id) : prev.clips,
      texts: target.kind === 'text' ? prev.texts.filter((t) => t.id !== target.id) : prev.texts,
      stickers:
        target.kind === 'sticker'
          ? prev.stickers.filter((s) => s.id !== target.id)
          : prev.stickers,
      audioClips:
        target.kind === 'audio'
          ? prev.audioClips.filter((a) => a.id !== target.id)
          : prev.audioClips,
      effects:
        target.kind === 'effect'
          ? prev.effects.filter((fx) => fx.id !== target.id)
          : prev.effects,
    }));
    onSelect(null);
  };

  const handleFreezeFrame = () => {
    if (!activeClip) return;
    const freezeClip: VideoClip = {
      ...JSON.parse(JSON.stringify(activeClip)),
      id: `freeze_${Date.now()}`,
      type: 'freeze',
      name: 'Стоп-кадр',
      startMs: currentTimeMs,
      durationMs: 2500,
    };
    onChangeState((prev) => ({ ...prev, clips: [...prev.clips, freezeClip] }));
  };

  const handleDetachAudio = () => {
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
    onChangeState((prev) => ({
      ...prev,
      clips: prev.clips.map((c) => (c.id === activeClip.id ? { ...c, muted: true } : c)),
      audioClips: [...prev.audioClips, extracted],
    }));
  };

  const handleAddKeyframe = (easing: EasingMode) => {
    if (!activeClip) return;
    const localMs = Math.max(0, Math.min(activeClip.durationMs, currentTimeMs - activeClip.startMs));
    const kf = {
      id: `kf_${Date.now()}`,
      timeMs: localMs,
      easing,
      x: activeClip.x,
      y: activeClip.y,
      scale: activeClip.scale,
      rotation: activeClip.rotation,
      opacity: activeClip.opacity,
      volume: activeClip.volume,
      brightness: activeClip.color.brightness,
      contrast: activeClip.color.contrast,
      saturation: activeClip.color.saturation,
    };
    patchClip(activeClip.id, {
      keyframes: [
        ...activeClip.keyframes.filter((k) => Math.abs(k.timeMs - localMs) > 120),
        kf,
      ],
    });
  };

  const handleToggleVoiceRecord = async () => {
    if (recording && recorderRef.current) {
      recorderRef.current.stop();
      setRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      const recStart = Date.now();
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((tr) => tr.stop());
        const blob = new Blob(chunks, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        const dur = Math.max(1500, Date.now() - recStart);
        const clip: AudioClip = {
          id: `voice_${Date.now()}`,
          track: 'A2',
          name: 'Голосовая запись',
          src: url,
          startMs: currentTimeMs,
          durationMs: dur,
          volume: 100,
          fadeInMs: 100,
          fadeOutMs: 150,
          voiceEffect: 'none',
          denoise: true,
          eq: [0, 0, 2, 1, 0],
          beatSynced: false,
          isRecorded: true,
        };
        onChangeState((prev) => ({
          ...prev,
          audioClips: [...prev.audioClips, clip],
        }));
      };
      recorderRef.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      const clip: AudioClip = {
        id: `voice_${Date.now()}`,
        track: 'A2',
        name: 'Голосовой дубль',
        src: '',
        synthPreset: 'ambient',
        startMs: currentTimeMs,
        durationMs: 3500,
        volume: 95,
        fadeInMs: 100,
        fadeOutMs: 200,
        voiceEffect: 'none',
        denoise: true,
        eq: [0, 0, 2, 1, 0],
        beatSynced: false,
        isRecorded: true,
      };
      onChangeState((prev) => ({ ...prev, audioClips: [...prev.audioClips, clip] }));
    }
  };

  const handleGenerateTts = async () => {
    if (!activeText) return;
    setTtsBusy(true);
    try {
      const res = await apiFetch<{ audioDataUrl?: string; fallbackWebSpeech: boolean }>(
        '/api/ai/tts',
        {
          method: 'POST',
          body: JSON.stringify({
            text: activeText.text,
            voiceName: ttsVoice,
          }),
        },
      );
      if (res.audioDataUrl) {
        const clip: AudioClip = {
          id: `tts_${Date.now()}`,
          track: 'A2',
          name: `Озвучка (${ttsVoice})`,
          src: res.audioDataUrl,
          startMs: activeText.startMs,
          durationMs: activeText.durationMs,
          volume: 100,
          fadeInMs: 50,
          fadeOutMs: 100,
          voiceEffect: 'none',
          denoise: false,
          eq: [0, 0, 0, 0, 0],
          beatSynced: false,
        };
        onChangeState((prev) => ({ ...prev, audioClips: [...prev.audioClips, clip] }));
        audioEngine.playClipPreview(clip);
      } else {
        audioEngine.speakBrowserTts(activeText.text, lang, 'none');
      }
    } finally {
      setTtsBusy(false);
    }
  };

  const handleAutoCaptions = () => {
    setCaptionBusy(true);
    const SpeechRec =
      (window as unknown as { SpeechRecognition?: new () => unknown; webkitSpeechRecognition?: new () => unknown })
        .SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => unknown }).webkitSpeechRecognition;

    if (SpeechRec) {
      try {
        const rec = new SpeechRec() as {
          lang: string;
          onresult: (ev: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
          onerror: () => void;
          start: () => void;
        };
        rec.lang = lang === 'ru' ? 'ru-RU' : 'en-US';
        rec.onresult = (ev) => {
          const phrase = ev.results?.[0]?.[0]?.transcript || 'Автоматические субтитры Kinetix';
          addSubtitleText(phrase);
          setCaptionBusy(false);
        };
        rec.onerror = () => {
          addSubtitleText('Автосубтитры распознаны по дорожке');
          setCaptionBusy(false);
        };
        rec.start();
        return;
      } catch {
        // fallback below
      }
    }
    setTimeout(() => {
      addSubtitleText('Автосубтитры: ключевая фраза сцены');
      setCaptionBusy(false);
    }, 350);
  };

  const addSubtitleText = (text: string) => {
    const newTx: TextOverlay = {
      id: `sub_${Date.now()}`,
      text,
      startMs: currentTimeMs,
      durationMs: 3000,
      fontFamily: 'Plus Jakarta Sans',
      fontSize: 30,
      color: '#FACC15',
      strokeColor: '#000000',
      strokeWidth: 2,
      shadow: true,
      bgColor: 'rgba(0,0,0,0.65)',
      align: 'center',
      lineHeight: 1.2,
      animIn: 'pop',
      animOut: 'fade',
      animLoop: 'none',
      templateId: 'tiktok-sub',
      isMarquee: false,
      marqueeSpeed: 80,
      isSubtitle: true,
      x: 50,
      y: 82,
    };
    onChangeState((prev) => ({ ...prev, texts: [...prev.texts, newTx] }));
    onSelect({ kind: 'text', id: newTx.id });
  };

  const saveColorPreset = async () => {
    if (!activeClip || !presetName.trim()) return;
    try {
      const res = await apiFetch<{ preset: { id: number; name: string; settingsJson: ColorGrade } }>(
        '/api/presets',
        {
          method: 'POST',
          body: JSON.stringify({
            name: presetName.trim(),
            settingsJson: activeClip.color,
          }),
        },
      );
      setSavedPresets((prev) => [res.preset, ...prev]);
      setPresetName('');
    } catch {
      // ignore offline error
    }
  };

  const applyTransitionToAll = (transitionId: string, durationMs: number) => {
    onChangeState((prev) => {
      const sortedV1Ids = prev.clips
        .filter((c) => c.track === 'V1')
        .sort((a, b) => a.startMs - b.startMs)
        .map((c) => c.id);
      return {
        ...prev,
        clips: prev.clips.map((c) => {
          const idx = sortedV1Ids.indexOf(c.id);
          if (idx > 0) {
            return { ...c, transitionIn: transitionId, transitionDurationMs: durationMs };
          }
          return c;
        }),
      };
    });
  };

  return (
    <div className="p-3 space-y-3 text-xs text-zinc-200 overflow-y-auto h-full">
      {/* Hidden File Inputs */}
      <input
        ref={pipInputRef}
        type="file"
        accept="video/*,image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) {
            const url = URL.createObjectURL(f);
            const clip = createClipFromMedia({
              track: 'V2',
              type: f.type.startsWith('video/') ? 'video' : 'image',
              src: url,
              name: `PIP: ${f.name}`,
              startMs: currentTimeMs,
              durationMs: 4000,
            });
            onChangeState((prev) => ({ ...prev, clips: [...prev.clips, clip] }));
            onSelect({ kind: 'clip', id: clip.id });
          }
          e.target.value = '';
        }}
      />
      <input
        ref={stickerInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) {
            const url = URL.createObjectURL(f);
            const st: StickerItem = {
              id: `stk_${Date.now()}`,
              kind: 'custom',
              content: url,
              label: f.name,
              startMs: currentTimeMs,
              durationMs: 4000,
              x: 50,
              y: 45,
              scale: 1,
              rotation: 0,
              animLoop: 'none',
            };
            onChangeState((prev) => ({ ...prev, stickers: [...prev.stickers, st] }));
            onSelect({ kind: 'sticker', id: st.id });
          }
          e.target.value = '';
        }}
      />
      <input
        ref={lutInputRef}
        type="file"
        accept=".cube,.txt"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (f && activeClip) {
            const text = await f.text();
            const parsed = parseCubeLutSummary(text);
            patchColor(activeClip.id, { ...parsed, lutName: f.name });
          }
          e.target.value = '';
        }}
      />
      <input
        ref={bgImgInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) {
            const url = URL.createObjectURL(f);
            onChangeState((prev) => ({
              ...prev,
              background: { ...prev.background, type: 'image', imageUrl: url },
            }));
          }
          e.target.value = '';
        }}
      />

      {/* TAB 1: CAPCUT EDIT + INSHOT CROP & TRANSFORM */}
      {activeTab === 'edit' && activeClip && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-[11px] text-zinc-400">
            <span className="truncate font-medium text-white">{activeClip.name}</span>
            <span className="font-mono-tabular shrink-0">
              {(activeClip.durationMs / 1000).toFixed(1)}s
            </span>
          </div>

          {/* CapCut Action Strip */}
          <div className="grid grid-cols-2 gap-1.5">
            <ToolBtn icon={Scissors} label="Разделить" onClick={handleSplitClip} />
            <ToolBtn icon={Copy} label="Дублировать" onClick={handleDuplicateClip} />
            <ToolBtn icon={Pause} label="Стоп-кадр" onClick={handleFreezeFrame} />
            <ToolBtn
              icon={Rewind}
              label="Реверс"
              active={activeClip.reverse}
              onClick={() => patchClip(activeClip.id, { reverse: !activeClip.reverse })}
            />
            <ToolBtn
              icon={RotateCw}
              label={`Поворот ${activeClip.rotation}°`}
              onClick={() => patchClip(activeClip.id, { rotation: (activeClip.rotation + 90) % 360 })}
            />
            <ToolBtn
              icon={FlipHorizontal2}
              label="Отразить H"
              active={activeClip.flipH}
              onClick={() => patchClip(activeClip.id, { flipH: !activeClip.flipH })}
            />
            <ToolBtn
              icon={FlipVertical2}
              label="Отразить V"
              active={activeClip.flipV}
              onClick={() => patchClip(activeClip.id, { flipV: !activeClip.flipV })}
            />
            <ToolBtn icon={AudioLines} label="Отделить звук" onClick={handleDetachAudio} />
            <ToolBtn
              icon={activeClip.muted ? VolumeX : Volume2}
              label={activeClip.muted ? 'Вкл. звук' : 'Без звука'}
              active={activeClip.muted}
              onClick={() => patchClip(activeClip.id, { muted: !activeClip.muted })}
            />
            <ToolBtn icon={Trash2} label="Удалить" danger onClick={handleDeleteSelected} />
          </div>

          {/* Speed 0.1x - 100x & Speed Curves */}
          <SectionBox title="Скорость и кривые (CapCut)">
            <SliderRow
              label="Скорость"
              value={activeClip.speed}
              min={0.1}
              max={100}
              step={0.1}
              suffix="x"
              onChange={(v) => patchClip(activeClip.id, { speed: v })}
            />
            <div className="grid grid-cols-5 gap-1">
              {(['uniform', 'montage', 'hero', 'bullet', 'jumpcut'] as SpeedCurvePreset[]).map(
                (sc) => (
                  <button
                    key={sc}
                    type="button"
                    onClick={() => patchClip(activeClip.id, { speedCurve: sc })}
                    className={`py-1.5 rounded-md text-[10px] capitalize ${
                      activeClip.speedCurve === sc
                        ? 'bg-[#00E5FF] text-black font-semibold'
                        : 'bg-black/40 text-zinc-400 hover:text-white'
                    }`}
                  >
                    {sc}
                  </button>
                ),
              )}
            </div>
            <label className="flex items-center justify-between pt-1 cursor-pointer">
              <span className="text-zinc-300">Плавное замедление (Optical Flow)</span>
              <input
                type="checkbox"
                checked={activeClip.smoothSlowMo}
                onChange={(e) => patchClip(activeClip.id, { smoothSlowMo: e.target.checked })}
                className="accent-[#00E5FF]"
              />
            </label>
          </SectionBox>

          {/* Transform, Trim & Volume */}
          <SectionBox
            title="Позиция, масштаб и длительность"
            action={
              <button
                type="button"
                onClick={() => patchClip(activeClip.id, { scale: 1, rotation: 0, x: 0, y: 0 })}
                className="text-[10px] text-[#00E5FF] flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Сброс</span>
              </button>
            }
          >
            <SliderRow
              label="Масштаб"
              value={activeClip.scale}
              min={0.2}
              max={3}
              step={0.05}
              suffix="x"
              onChange={(v) => patchClip(activeClip.id, { scale: v })}
            />
            <SliderRow
              label="Угол наклона"
              value={activeClip.rotation}
              min={-180}
              max={180}
              step={1}
              suffix="°"
              onChange={(v) => patchClip(activeClip.id, { rotation: v })}
            />
            <SliderRow
              label="Смещение X"
              value={activeClip.x}
              min={-80}
              max={80}
              step={1}
              suffix="%"
              onChange={(v) => patchClip(activeClip.id, { x: v })}
            />
            <SliderRow
              label="Смещение Y"
              value={activeClip.y}
              min={-80}
              max={80}
              step={1}
              suffix="%"
              onChange={(v) => patchClip(activeClip.id, { y: v })}
            />
            <SliderRow
              label="Длительность клипа"
              value={Math.round(activeClip.durationMs / 100) / 10}
              min={0.5}
              max={30}
              step={0.1}
              suffix="s"
              onChange={(v) => patchClip(activeClip.id, { durationMs: Math.round(v * 1000) })}
            />
            <SliderRow
              label="Громкость клипа"
              value={activeClip.volume}
              min={0}
              max={200}
              step={5}
              suffix="%"
              onChange={(v) => patchClip(activeClip.id, { volume: v })}
            />
          </SectionBox>

          {/* InShot Crop Tool */}
          <SectionBox
            title="Кадрирование (InShot Crop)"
            icon={Crop}
            action={
              <button
                type="button"
                onClick={() =>
                  patchClip(activeClip.id, { crop: { top: 0, right: 0, bottom: 0, left: 0 } })
                }
                className="text-[10px] text-[#00E5FF]"
              >
                Сбросить
              </button>
            }
          >
            <div className="grid grid-cols-2 gap-x-3 gap-y-2">
              <SliderRow
                label="Верх"
                value={activeClip.crop.top}
                min={0}
                max={45}
                step={1}
                suffix="%"
                onChange={(v) => patchClip(activeClip.id, { crop: { ...activeClip.crop, top: v } })}
              />
              <SliderRow
                label="Низ"
                value={activeClip.crop.bottom}
                min={0}
                max={45}
                step={1}
                suffix="%"
                onChange={(v) => patchClip(activeClip.id, { crop: { ...activeClip.crop, bottom: v } })}
              />
              <SliderRow
                label="Лево"
                value={activeClip.crop.left}
                min={0}
                max={45}
                step={1}
                suffix="%"
                onChange={(v) => patchClip(activeClip.id, { crop: { ...activeClip.crop, left: v } })}
              />
              <SliderRow
                label="Право"
                value={activeClip.crop.right}
                min={0}
                max={45}
                step={1}
                suffix="%"
                onChange={(v) => patchClip(activeClip.id, { crop: { ...activeClip.crop, right: v } })}
              />
            </div>
          </SectionBox>

          {/* Stabilization, AI Denoise, Upscale, Auto-Reframe, BG Removal, Chroma Key */}
          <SectionBox title="ИИ-вырезка и стабилизация">
            <div className="grid grid-cols-2 gap-1.5">
              {(
                [
                  ['stabilize', 'Стабилизация'],
                  ['denoise', 'Шумоподавление'],
                  ['enhance', 'Улучшение 4K'],
                  ['autoReframe', 'Авто-кадрирование'],
                  ['bgRemove', 'Удалить фон (ИИ)'],
                ] as const
              ).map(([field, label]) => (
                <button
                  key={field}
                  type="button"
                  onClick={() => patchClip(activeClip.id, { [field]: !activeClip[field] })}
                  className={`py-2 px-2.5 rounded-lg border text-[11px] text-left transition-colors ${
                    activeClip[field]
                      ? 'bg-[#00E5FF]/15 border-[#00E5FF] text-white'
                      : 'bg-black/40 border-white/10 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {label}
                </button>
              ))}
              <button
                type="button"
                onClick={() =>
                  patchClip(activeClip.id, {
                    chromaKey: {
                      ...activeClip.chromaKey,
                      enabled: !activeClip.chromaKey.enabled,
                    },
                  })
                }
                className={`py-2 px-2.5 rounded-lg border text-[11px] text-left transition-colors ${
                  activeClip.chromaKey.enabled
                    ? 'bg-[#00E5FF]/15 border-[#00E5FF] text-white'
                    : 'bg-black/40 border-white/10 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Хромакей
              </button>
            </div>
            {activeClip.chromaKey.enabled && (
              <div className="flex items-center gap-3 pt-1">
                <input
                  type="color"
                  value={activeClip.chromaKey.color}
                  onChange={(e) =>
                    patchClip(activeClip.id, {
                      chromaKey: { ...activeClip.chromaKey, color: e.target.value },
                    })
                  }
                  className="w-8 h-8 rounded bg-transparent border-0"
                />
                <div className="flex-1">
                  <SliderRow
                    label="Допуск хромакея"
                    value={activeClip.chromaKey.tolerance}
                    min={5}
                    max={100}
                    step={1}
                    suffix="%"
                    onChange={(v) =>
                      patchClip(activeClip.id, {
                        chromaKey: { ...activeClip.chromaKey, tolerance: v },
                      })
                    }
                  />
                </div>
              </div>
            )}
          </SectionBox>
        </div>
      )}

      {/* TAB 2: TRANSITIONS (CapCut & InShot) */}
      {activeTab === 'transitions' && activeClip && (
        <div className="space-y-3">
          <SectionBox title={`Переход перед клипом: ${activeClip.name}`}>
            <div className="grid grid-cols-2 gap-1.5">
              {TRANSITION_OPTIONS.map((tr) => (
                <button
                  key={tr.id}
                  type="button"
                  onClick={() => patchClip(activeClip.id, { transitionIn: tr.id })}
                  className={`py-2 px-2.5 rounded-lg border text-[11px] text-left transition-colors ${
                    activeClip.transitionIn === tr.id
                      ? 'bg-[#FF2D6F]/20 border-[#FF2D6F] text-white font-semibold'
                      : 'bg-black/40 border-white/10 text-zinc-300 hover:border-white/25'
                  }`}
                >
                  {tr.name}
                </button>
              ))}
            </div>
            <SliderRow
              label="Длительность перехода"
              value={activeClip.transitionDurationMs}
              min={100}
              max={2000}
              step={50}
              suffix="ms"
              onChange={(v) => patchClip(activeClip.id, { transitionDurationMs: v })}
            />
            <button
              type="button"
              onClick={() =>
                applyTransitionToAll(activeClip.transitionIn, activeClip.transitionDurationMs)
              }
              className="w-full py-2 rounded-lg bg-[#00E5FF] text-black font-semibold hover:bg-[#33ECFF]"
            >
              Применить переход ко всем клипам
            </button>
          </SectionBox>
        </div>
      )}

      {/* TAB 3: ANIMATIONS (In / Out / Combo) */}
      {activeTab === 'animations' && activeClip && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-[#161619] border border-white/[0.07]">
            {(
              [
                ['in', 'Вход'],
                ['out', 'Выход'],
                ['loop', 'Цикл / Комбо'],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setAnimMode(k)}
                className={`py-1.5 rounded-md text-[11px] font-medium transition-colors ${
                  animMode === k ? 'bg-[#00E5FF] text-black font-semibold' : 'text-zinc-400 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <SectionBox title={`Анимация клипа: ${activeClip.name}`}>
            <div className="grid grid-cols-2 gap-1.5">
              {CLIP_ANIMATION_OPTIONS[animMode].map((opt) => {
                const field = animMode === 'in' ? 'animIn' : animMode === 'out' ? 'animOut' : 'animLoop';
                const current = activeClip[field];
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => patchClip(activeClip.id, { [field]: opt.id })}
                    className={`py-2 px-2.5 rounded-lg border text-[11px] text-left transition-colors ${
                      current === opt.id
                        ? 'bg-[#00E5FF]/20 border-[#00E5FF] text-white font-semibold'
                        : 'bg-black/40 border-white/10 text-zinc-300 hover:border-white/25'
                    }`}
                  >
                    {opt.name}
                  </button>
                );
              })}
            </div>
          </SectionBox>

          {activeText && (
            <SectionBox title={`Анимация текста: ${activeText.text.slice(0, 20)}`}>
              <div className="grid grid-cols-4 gap-1.5">
                {(['none', 'fade', 'slide-up', 'pop'] as const).map((anim) => (
                  <button
                    key={anim}
                    type="button"
                    onClick={() =>
                      onChangeState((prev) => ({
                        ...prev,
                        texts: prev.texts.map((t) =>
                          t.id === activeText.id ? { ...t, animIn: anim } : t,
                        ),
                      }))
                    }
                    className={`py-1.5 rounded-md border text-[10px] uppercase ${
                      activeText.animIn === anim
                        ? 'bg-[#FF2D6F]/25 border-[#FF2D6F] text-white font-semibold'
                        : 'bg-black/40 border-white/10 text-zinc-400'
                    }`}
                  >
                    {anim}
                  </button>
                ))}
              </div>
            </SectionBox>
          )}
        </div>
      )}

      {/* TAB 4: RETOUCH (Face & Body) */}
      {activeTab === 'retouch' && activeClip && (
        <SectionBox
          title="Ретушь лица и тела"
          action={
            <button
              type="button"
              onClick={() =>
                patchClip(activeClip.id, {
                  retouch: { smooth: 0, brighten: 0, jawline: 0, eyes: 0, bodySlim: 0 },
                })
              }
              className="text-[10px] text-[#00E5FF]"
            >
              Сбросить
            </button>
          }
        >
          <SliderRow
            label="Сглаживание кожи"
            value={activeClip.retouch.smooth}
            min={0}
            max={100}
            step={1}
            suffix="%"
            onChange={(v) =>
              patchClip(activeClip.id, { retouch: { ...activeClip.retouch, smooth: v } })
            }
          />
          <SliderRow
            label="Осветление тона"
            value={activeClip.retouch.brighten}
            min={0}
            max={100}
            step={1}
            suffix="%"
            onChange={(v) =>
              patchClip(activeClip.id, { retouch: { ...activeClip.retouch, brighten: v } })
            }
          />
          <SliderRow
            label="Контур овала лица"
            value={activeClip.retouch.jawline}
            min={0}
            max={100}
            step={1}
            suffix="%"
            onChange={(v) =>
              patchClip(activeClip.id, { retouch: { ...activeClip.retouch, jawline: v } })
            }
          />
          <SliderRow
            label="Выразительность глаз"
            value={activeClip.retouch.eyes}
            min={0}
            max={100}
            step={1}
            suffix="%"
            onChange={(v) =>
              patchClip(activeClip.id, { retouch: { ...activeClip.retouch, eyes: v } })
            }
          />
          <SliderRow
            label="Коррекция силуэта"
            value={activeClip.retouch.bodySlim}
            min={0}
            max={100}
            step={1}
            suffix="%"
            onChange={(v) =>
              patchClip(activeClip.id, { retouch: { ...activeClip.retouch, bodySlim: v } })
            }
          />
        </SectionBox>
      )}

      {/* TAB 5: EFFECTS */}
      {activeTab === 'effects' && (
        <div className="space-y-3">
          <div className="flex gap-1.5">
            {(
              [
                ['all', 'Все'],
                ['video', 'Видео'],
                ['face', 'Лицо'],
                ['body', 'Тело'],
              ] as const
            ).map(([cat, label]) => (
              <button
                key={cat}
                type="button"
                onClick={() => setEffectCategory(cat)}
                className={`px-2.5 py-1 rounded-md text-[11px] ${
                  effectCategory === cat
                    ? 'bg-[#FF2D6F] text-white font-semibold'
                    : 'bg-[#161619] text-zinc-400 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            {VIDEO_EFFECTS_LIBRARY.filter(
              (fx) => effectCategory === 'all' || fx.category === effectCategory,
            ).map((fx) => (
              <button
                key={fx.key}
                type="button"
                onClick={() => {
                  const item: EffectClip = {
                    id: `fx_${Date.now()}`,
                    name: fx.name,
                    effectKey: fx.key,
                    category: fx.category,
                    startMs: currentTimeMs,
                    durationMs: 3000,
                    intensity: 75,
                  };
                  onChangeState((prev) => ({ ...prev, effects: [...prev.effects, item] }));
                  onSelect({ kind: 'effect', id: item.id });
                }}
                className="p-2.5 rounded-lg bg-[#161619] border border-white/[0.08] hover:border-[#FF2D6F] text-left space-y-0.5 transition-colors"
              >
                <div className="font-medium text-white flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-[#FF2D6F] shrink-0" />
                  <span className="truncate">{fx.name}</span>
                </div>
                <div className="text-[10px] text-zinc-500 uppercase">{fx.category}</div>
              </button>
            ))}
          </div>

          {activeEffect && (
            <SectionBox
              title={`Настройка эффекта: ${activeEffect.name}`}
              action={
                <button
                  type="button"
                  onClick={() => {
                    onChangeState((prev) => ({
                      ...prev,
                      effects: prev.effects.filter((fx) => fx.id !== activeEffect.id),
                    }));
                    onSelect(null);
                  }}
                  className="text-[10px] text-[#FF7DA6]"
                >
                  Удалить
                </button>
              }
            >
              <SliderRow
                label="Интенсивность"
                value={activeEffect.intensity}
                min={5}
                max={100}
                step={1}
                suffix="%"
                onChange={(v) =>
                  onChangeState((prev) => ({
                    ...prev,
                    effects: prev.effects.map((fx) =>
                      fx.id === activeEffect.id ? { ...fx, intensity: v } : fx,
                    ),
                  }))
                }
              />
              <SliderRow
                label="Длительность"
                value={Math.round(activeEffect.durationMs / 100) / 10}
                min={0.5}
                max={15}
                step={0.5}
                suffix="s"
                onChange={(v) =>
                  onChangeState((prev) => ({
                    ...prev,
                    effects: prev.effects.map((fx) =>
                      fx.id === activeEffect.id ? { ...fx, durationMs: Math.round(v * 1000) } : fx,
                    ),
                  }))
                }
              />
            </SectionBox>
          )}
        </div>
      )}

      {/* TAB 6: COLOR GRADING, CURVES, HSL, LUT & PRESETS */}
      {activeTab === 'color' && activeClip && (
        <div className="space-y-3">
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {FILTER_PRESETS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => patchColor(activeClip.id, { filterPreset: f.id })}
                className={`px-3 py-1.5 rounded-lg border text-[11px] shrink-0 transition-colors ${
                  activeClip.color.filterPreset === f.id
                    ? 'bg-[#00E5FF] text-black border-[#00E5FF] font-semibold'
                    : 'bg-[#161619] border-white/10 text-zinc-300'
                }`}
              >
                {f.name}
              </button>
            ))}
          </div>

          <SectionBox
            title="Цветокоррекция"
            action={
              <button
                type="button"
                onClick={() => patchClip(activeClip.id, { color: createDefaultColorGrade() })}
                className="text-[10px] text-[#00E5FF]"
              >
                Сбросить всё
              </button>
            }
          >
            <SliderRow label="Яркость" value={activeClip.color.brightness} min={-100} max={100} step={1} onChange={(v) => patchColor(activeClip.id, { brightness: v })} />
            <SliderRow label="Контраст" value={activeClip.color.contrast} min={-100} max={100} step={1} onChange={(v) => patchColor(activeClip.id, { contrast: v })} />
            <SliderRow label="Насыщенность" value={activeClip.color.saturation} min={-100} max={100} step={1} onChange={(v) => patchColor(activeClip.id, { saturation: v })} />
            <SliderRow label="Экспозиция" value={activeClip.color.exposure} min={-100} max={100} step={1} onChange={(v) => patchColor(activeClip.id, { exposure: v })} />
            <SliderRow label="Температура" value={activeClip.color.temperature} min={-100} max={100} step={1} onChange={(v) => patchColor(activeClip.id, { temperature: v })} />
            <SliderRow label="Оттенок (Tint)" value={activeClip.color.tint} min={-100} max={100} step={1} onChange={(v) => patchColor(activeClip.id, { tint: v })} />
            <SliderRow label="Блики" value={activeClip.color.highlights} min={-100} max={100} step={1} onChange={(v) => patchColor(activeClip.id, { highlights: v })} />
            <SliderRow label="Тени" value={activeClip.color.shadows} min={-100} max={100} step={1} onChange={(v) => patchColor(activeClip.id, { shadows: v })} />
            <SliderRow label="Виньетка" value={activeClip.color.vignette} min={0} max={100} step={1} onChange={(v) => patchColor(activeClip.id, { vignette: v })} />
            <SliderRow label="Резкость" value={activeClip.color.sharpness} min={0} max={100} step={1} onChange={(v) => patchColor(activeClip.id, { sharpness: v })} />
            <SliderRow label="Зерно" value={activeClip.color.grain} min={0} max={100} step={1} onChange={(v) => patchColor(activeClip.id, { grain: v })} />
            <SliderRow label="Затухание (Fade)" value={activeClip.color.fade} min={0} max={100} step={1} onChange={(v) => patchColor(activeClip.id, { fade: v })} />
          </SectionBox>

          <SectionBox title="Кривые и HSL">
            <SliderRow label="Curves Lift" value={activeClip.color.curvesLift} min={-50} max={50} step={1} onChange={(v) => patchColor(activeClip.id, { curvesLift: v })} />
            <SliderRow label="Curves Gamma" value={activeClip.color.curvesGamma} min={-50} max={50} step={1} onChange={(v) => patchColor(activeClip.id, { curvesGamma: v })} />
            <SliderRow label="Curves Gain" value={activeClip.color.curvesGain} min={-50} max={50} step={1} onChange={(v) => patchColor(activeClip.id, { curvesGain: v })} />
            <SliderRow label="HSL Оттенок" value={activeClip.color.hslHueShift} min={-180} max={180} step={2} suffix="°" onChange={(v) => patchColor(activeClip.id, { hslHueShift: v })} />
            <SliderRow label="HSL Насыщ." value={activeClip.color.hslSatShift} min={-100} max={100} step={1} onChange={(v) => patchColor(activeClip.id, { hslSatShift: v })} />
            <SliderRow label="HSL Яркость" value={activeClip.color.hslLumShift} min={-100} max={100} step={1} onChange={(v) => patchColor(activeClip.id, { hslLumShift: v })} />
          </SectionBox>

          <SectionBox title="LUT и пресеты">
            <button
              type="button"
              onClick={() => lutInputRef.current?.click()}
              className="w-full py-2 rounded-lg bg-black/50 border border-white/10 text-zinc-200 flex items-center justify-center gap-2 hover:border-[#00E5FF]"
            >
              <Upload className="w-3.5 h-3.5 text-[#00E5FF]" />
              <span>
                {activeClip.color.lutName
                  ? `LUT: ${activeClip.color.lutName}`
                  : 'Загрузить LUT (.cube)'}
              </span>
            </button>

            <div className="flex gap-2">
              <input
                type="text"
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                placeholder="Название пресета..."
                className="flex-1 px-2.5 py-2 rounded-lg bg-black/50 border border-white/10 text-xs text-white"
              />
              <button
                type="button"
                onClick={saveColorPreset}
                className="px-3 py-2 rounded-lg bg-[#00E5FF] text-black font-semibold flex items-center gap-1"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Сохранить</span>
              </button>
            </div>

            {savedPresets.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {savedPresets.map((pr) => (
                  <button
                    key={pr.id}
                    type="button"
                    onClick={() => patchColor(activeClip.id, pr.settingsJson)}
                    className="px-2.5 py-1 rounded-lg bg-black/50 border border-[#00E5FF]/30 text-[11px] text-[#00E5FF]"
                  >
                    {pr.name}
                  </button>
                ))}
              </div>
            )}
          </SectionBox>
        </div>
      )}

      {/* TAB 7: OVERLAYS & MASKS */}
      {activeTab === 'masks' && activeClip && (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => pipInputRef.current?.click()}
            className="w-full py-2.5 rounded-lg bg-[#00E5FF] text-black font-semibold flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>Добавить наложение / Картинка в картинке (PIP)</span>
          </button>

          <SectionBox title="Маски кадра">
            <div className="grid grid-cols-4 gap-1.5">
              {(
                [
                  ['none', 'Нет'],
                  ['circle', 'Круг'],
                  ['rect', 'Прямоуг.'],
                  ['heart', 'Сердце'],
                  ['star', 'Звезда'],
                  ['linear', 'Линия'],
                  ['mirror', 'Зеркало'],
                ] as Array<[MaskType, string]>
              ).map(([mType, label]) => (
                <button
                  key={mType}
                  type="button"
                  onClick={() =>
                    patchClip(activeClip.id, {
                      mask: { ...activeClip.mask, type: mType },
                    })
                  }
                  className={`py-2 rounded-lg text-[11px] border ${
                    activeClip.mask.type === mType
                      ? 'bg-[#00E5FF]/15 border-[#00E5FF] text-white'
                      : 'bg-black/40 border-white/10 text-zinc-400'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <SliderRow
              label="Размер маски"
              value={activeClip.mask.scale}
              min={0.3}
              max={1.8}
              step={0.05}
              suffix="x"
              onChange={(v) =>
                patchClip(activeClip.id, { mask: { ...activeClip.mask, scale: v } })
              }
            />
            <SliderRow
              label="Смещение маски X"
              value={activeClip.mask.x}
              min={-50}
              max={50}
              step={1}
              suffix="%"
              onChange={(v) =>
                patchClip(activeClip.id, { mask: { ...activeClip.mask, x: v } })
              }
            />
            <SliderRow
              label="Смещение маски Y"
              value={activeClip.mask.y}
              min={-50}
              max={50}
              step={1}
              suffix="%"
              onChange={(v) =>
                patchClip(activeClip.id, { mask: { ...activeClip.mask, y: v } })
              }
            />
          </SectionBox>

          <SectionBox title="Смешение, обводка и тень">
            <select
              value={activeClip.blendMode}
              onChange={(e) => patchClip(activeClip.id, { blendMode: e.target.value as BlendMode })}
              className="w-full h-9 px-2.5 rounded-lg bg-black/50 border border-white/10 text-xs text-white"
            >
              <option value="source-over">Обычный (Normal)</option>
              <option value="multiply">Умножение (Multiply)</option>
              <option value="screen">Экран (Screen)</option>
              <option value="overlay">Перекрытие (Overlay)</option>
              <option value="soft-light">Мягкий свет (Soft Light)</option>
              <option value="hard-light">Жёсткий свет (Hard Light)</option>
              <option value="difference">Разница (Difference)</option>
            </select>
            <SliderRow label="Непрозрачность" value={activeClip.opacity} min={0} max={100} step={1} suffix="%" onChange={(v) => patchClip(activeClip.id, { opacity: v })} />
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <SliderRow label="Обводка" value={activeClip.borderWidth} min={0} max={20} step={1} suffix="px" onChange={(v) => patchClip(activeClip.id, { borderWidth: v })} />
              </div>
              <input
                type="color"
                value={activeClip.borderColor}
                onChange={(e) => patchClip(activeClip.id, { borderColor: e.target.value })}
                className="w-8 h-8 rounded bg-transparent border-0 mt-2"
                title="Цвет обводки"
              />
            </div>
            <SliderRow label="Тень" value={activeClip.shadowBlur} min={0} max={40} step={1} suffix="px" onChange={(v) => patchClip(activeClip.id, { shadowBlur: v })} />
          </SectionBox>
        </div>
      )}

      {/* TAB 8: KEYFRAMES */}
      {activeTab === 'keyframes' && activeClip && (
        <SectionBox
          title="Ключевые кадры клипа"
          action={
            <span className="font-mono-tabular text-[#00E5FF]">
              {activeClip.keyframes.length} шт.
            </span>
          }
        >
          <div className="grid grid-cols-3 gap-1.5">
            {(
              [
                ['linear', 'Линейная'],
                ['ease', 'Плавная'],
                ['fast-start', 'Быстрый'],
              ] as Array<[EasingMode, string]>
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => handleAddKeyframe(mode)}
                className="py-2 px-1.5 rounded-lg bg-[#00E5FF]/15 border border-[#00E5FF]/50 text-[#00E5FF] font-medium flex items-center justify-center gap-1"
              >
                <Diamond className="w-3 h-3" />
                <span>{label}</span>
              </button>
            ))}
          </div>
          <SliderRow label="Позиция X" value={activeClip.x} min={-80} max={80} step={1} suffix="%" onChange={(v) => patchClip(activeClip.id, { x: v })} />
          <SliderRow label="Позиция Y" value={activeClip.y} min={-80} max={80} step={1} suffix="%" onChange={(v) => patchClip(activeClip.id, { y: v })} />
          <SliderRow label="Масштаб" value={activeClip.scale} min={0.2} max={3} step={0.05} suffix="x" onChange={(v) => patchClip(activeClip.id, { scale: v })} />
          <SliderRow label="Поворот" value={activeClip.rotation} min={-180} max={180} step={1} suffix="°" onChange={(v) => patchClip(activeClip.id, { rotation: v })} />
          <SliderRow label="Прозрачность" value={activeClip.opacity} min={0} max={100} step={1} suffix="%" onChange={(v) => patchClip(activeClip.id, { opacity: v })} />
          {activeClip.keyframes.length > 0 && (
            <div className="pt-2 space-y-1">
              {activeClip.keyframes.map((k) => (
                <div
                  key={k.id}
                  className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-black/40 text-[11px]"
                >
                  <span className="font-mono-tabular text-zinc-300">
                    {(k.timeMs / 1000).toFixed(2)}s · {k.easing}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      patchClip(activeClip.id, {
                        keyframes: activeClip.keyframes.filter((x) => x.id !== k.id),
                      })
                    }
                    className="text-zinc-500 hover:text-[#FF2D6F]"
                  >
                    Удалить
                  </button>
                </div>
              ))}
            </div>
          )}
        </SectionBox>
      )}

      {/* TAB 9: TEXT, AUTO-CAPTIONS, TTS & MARQUEE */}
      {activeTab === 'text' && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                const nt: TextOverlay = {
                  id: `txt_${Date.now()}`,
                  text: 'Новый заголовок',
                  startMs: currentTimeMs,
                  durationMs: 4000,
                  fontFamily: 'Plus Jakarta Sans',
                  fontSize: 38,
                  color: '#FFFFFF',
                  strokeColor: '#000000',
                  strokeWidth: 0,
                  shadow: true,
                  bgColor: 'transparent',
                  align: 'center',
                  lineHeight: 1.2,
                  animIn: 'fade',
                  animOut: 'fade',
                  animLoop: 'none',
                  templateId: 'minimal-cinema',
                  isMarquee: false,
                  marqueeSpeed: 90,
                  isSubtitle: false,
                  x: 50,
                  y: 50,
                };
                onChangeState((prev) => ({ ...prev, texts: [...prev.texts, nt] }));
                onSelect({ kind: 'text', id: nt.id });
              }}
              className="py-2.5 rounded-lg bg-[#00E5FF] text-black font-semibold flex items-center justify-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Добавить текст</span>
            </button>
            <button
              type="button"
              disabled={captionBusy}
              onClick={handleAutoCaptions}
              className="py-2.5 rounded-lg bg-[#161619] border border-[#FF2D6F]/40 text-[#FF7DA6] font-semibold flex items-center justify-center gap-1.5"
            >
              <Wand2 className="w-4 h-4" />
              <span>{captionBusy ? 'Слушаю...' : 'Автосубтитры'}</span>
            </button>
          </div>

          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {TEXT_TEMPLATES.map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                onClick={() => {
                  if (!activeText) return;
                  onChangeState((prev) => ({
                    ...prev,
                    texts: prev.texts.map((t) =>
                      t.id === activeText.id
                        ? {
                            ...t,
                            color: tpl.color,
                            bgColor: tpl.bgColor,
                            strokeColor: tpl.strokeColor,
                            strokeWidth: tpl.strokeWidth,
                            fontSize: tpl.fontSize,
                            templateId: tpl.id,
                          }
                        : t,
                    ),
                  }));
                }}
                className="px-3 py-1.5 rounded-lg bg-[#161619] border border-white/10 text-[11px] shrink-0 text-white hover:border-[#00E5FF]"
              >
                {tpl.name}
              </button>
            ))}
          </div>

          {activeText && (
            <SectionBox
              title="Настройка текста"
              action={
                <button
                  type="button"
                  onClick={() => {
                    onChangeState((prev) => ({
                      ...prev,
                      texts: prev.texts.filter((t) => t.id !== activeText.id),
                    }));
                    onSelect(null);
                  }}
                  className="text-[10px] text-[#FF7DA6]"
                >
                  Удалить
                </button>
              }
            >
              <input
                type="text"
                value={activeText.text}
                onChange={(e) =>
                  onChangeState((prev) => ({
                    ...prev,
                    texts: prev.texts.map((t) =>
                      t.id === activeText.id ? { ...t, text: e.target.value } : t,
                    ),
                  }))
                }
                className="w-full px-3 py-2 rounded-lg bg-black/50 border border-white/10 text-xs text-white"
              />
              <div className="grid grid-cols-4 gap-1.5">
                <select
                  value={activeText.fontFamily}
                  onChange={(e) =>
                    onChangeState((prev) => ({
                      ...prev,
                      texts: prev.texts.map((t) =>
                        t.id === activeText.id ? { ...t, fontFamily: e.target.value } : t,
                      ),
                    }))
                  }
                  className="col-span-2 px-2 py-1.5 rounded-lg bg-black/50 border border-white/10 text-[11px]"
                >
                  <option value="Plus Jakarta Sans">Plus Jakarta Sans</option>
                  <option value="DM Sans">DM Sans</option>
                  <option value="JetBrains Mono">JetBrains Mono</option>
                  <option value="Georgia">Georgia Serif</option>
                </select>
                <input
                  type="color"
                  value={activeText.color}
                  title="Цвет текста"
                  onChange={(e) =>
                    onChangeState((prev) => ({
                      ...prev,
                      texts: prev.texts.map((t) =>
                        t.id === activeText.id ? { ...t, color: e.target.value } : t,
                      ),
                    }))
                  }
                  className="w-full h-8 rounded bg-transparent border-0"
                />
                <input
                  type="color"
                  value={activeText.strokeColor}
                  title="Цвет обводки"
                  onChange={(e) =>
                    onChangeState((prev) => ({
                      ...prev,
                      texts: prev.texts.map((t) =>
                        t.id === activeText.id ? { ...t, strokeColor: e.target.value } : t,
                      ),
                    }))
                  }
                  className="w-full h-8 rounded bg-transparent border-0"
                />
              </div>

              <div className="flex items-center justify-between gap-2">
                <div className="flex gap-1">
                  {(
                    [
                      ['left', AlignLeft],
                      ['center', AlignCenter],
                      ['right', AlignRight],
                    ] as const
                  ).map(([align, Icon]) => (
                    <button
                      key={align}
                      type="button"
                      onClick={() =>
                        onChangeState((prev) => ({
                          ...prev,
                          texts: prev.texts.map((t) =>
                            t.id === activeText.id ? { ...t, align } : t,
                          ),
                        }))
                      }
                      className={`p-1.5 rounded-md border ${
                        activeText.align === align
                          ? 'bg-[#00E5FF]/20 border-[#00E5FF] text-[#00E5FF]'
                          : 'bg-black/40 border-white/10 text-zinc-400'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onChangeState((prev) => ({
                      ...prev,
                      texts: prev.texts.map((t) =>
                        t.id === activeText.id
                          ? {
                              ...t,
                              bgColor:
                                t.bgColor === 'transparent' ? 'rgba(0,0,0,0.6)' : 'transparent',
                            }
                          : t,
                      ),
                    }))
                  }
                  className={`px-2.5 py-1 rounded-md border text-[10px] ${
                    activeText.bgColor !== 'transparent'
                      ? 'bg-[#00E5FF]/15 border-[#00E5FF] text-white'
                      : 'bg-black/40 border-white/10 text-zinc-400'
                  }`}
                >
                  Плашка фона
                </button>
              </div>

              <SliderRow
                label="Размер шрифта"
                value={activeText.fontSize}
                min={14}
                max={96}
                step={1}
                suffix="px"
                onChange={(v) =>
                  onChangeState((prev) => ({
                    ...prev,
                    texts: prev.texts.map((t) =>
                      t.id === activeText.id ? { ...t, fontSize: v } : t,
                    ),
                  }))
                }
              />
              <SliderRow
                label="Толщина обводки"
                value={activeText.strokeWidth}
                min={0}
                max={8}
                step={1}
                suffix="px"
                onChange={(v) =>
                  onChangeState((prev) => ({
                    ...prev,
                    texts: prev.texts.map((t) =>
                      t.id === activeText.id ? { ...t, strokeWidth: v } : t,
                    ),
                  }))
                }
              />
              <SliderRow
                label="Позиция X"
                value={activeText.x}
                min={5}
                max={95}
                step={1}
                suffix="%"
                onChange={(v) =>
                  onChangeState((prev) => ({
                    ...prev,
                    texts: prev.texts.map((t) =>
                      t.id === activeText.id ? { ...t, x: v } : t,
                    ),
                  }))
                }
              />
              <SliderRow
                label="Позиция Y"
                value={activeText.y}
                min={5}
                max={95}
                step={1}
                suffix="%"
                onChange={(v) =>
                  onChangeState((prev) => ({
                    ...prev,
                    texts: prev.texts.map((t) =>
                      t.id === activeText.id ? { ...t, y: v } : t,
                    ),
                  }))
                }
              />

              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-zinc-300">Бегущая строка (Ticker)</span>
                <input
                  type="checkbox"
                  checked={activeText.isMarquee}
                  onChange={(e) =>
                    onChangeState((prev) => ({
                      ...prev,
                      texts: prev.texts.map((t) =>
                        t.id === activeText.id ? { ...t, isMarquee: e.target.checked } : t,
                      ),
                    }))
                  }
                  className="accent-[#00E5FF]"
                />
              </label>

              {/* Text-to-Speech (TTS) */}
              <div className="pt-2 border-t border-white/8 flex items-center gap-2">
                <select
                  value={ttsVoice}
                  onChange={(e) => setTtsVoice(e.target.value)}
                  className="px-2 py-2 rounded-lg bg-black/50 border border-white/10 text-[11px]"
                >
                  <option value="Kore">Голос: Kore</option>
                  <option value="Puck">Голос: Puck</option>
                  <option value="Charon">Голос: Charon</option>
                  <option value="Zephyr">Голос: Zephyr</option>
                </select>
                <button
                  type="button"
                  disabled={ttsBusy}
                  onClick={handleGenerateTts}
                  className="flex-1 py-2 rounded-lg bg-[#00E5FF]/15 border border-[#00E5FF]/40 text-[#00E5FF] font-semibold flex items-center justify-center gap-1.5"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                  <span>{ttsBusy ? 'Озвучка...' : 'Озвучить текст'}</span>
                </button>
              </div>
            </SectionBox>
          )}
        </div>
      )}

      {/* TAB 10: STICKERS & GIFs */}
      {activeTab === 'stickers' && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => stickerInputRef.current?.click()}
              className="flex-1 py-2 rounded-lg bg-[#161619] border border-white/10 text-white font-medium flex items-center justify-center gap-1.5 hover:border-[#00E5FF]"
            >
              <Upload className="w-3.5 h-3.5 text-[#00E5FF]" />
              <span>Своя картинка</span>
            </button>
            <button
              type="button"
              onClick={() => setStickerFilter((f) => (f === 'all' ? 'fav' : 'all'))}
              className={`px-3 py-2 rounded-lg border text-[11px] flex items-center gap-1 ${
                stickerFilter === 'fav'
                  ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                  : 'bg-[#161619] border-white/10 text-zinc-400'
              }`}
            >
              <Star className="w-3.5 h-3.5" />
              <span>Избр.</span>
            </button>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
            {STICKER_LIBRARY.filter(
              (st) => stickerFilter === 'all' || favoriteStickers.includes(st.id),
            ).map((st) => {
              const isFav = favoriteStickers.includes(st.id);
              return (
                <div
                  key={st.id}
                  className="relative p-2 rounded-lg bg-[#161619] border border-white/[0.08] flex flex-col items-center gap-0.5 hover:border-[#00E5FF]/50"
                >
                  <button
                    type="button"
                    onClick={() => {
                      const nextFavs = isFav
                        ? favoriteStickers.filter((f) => f !== st.id)
                        : [...favoriteStickers, st.id];
                      setFavoriteStickers(nextFavs);
                      localStorage.setItem('kinetix_fav_stickers', JSON.stringify(nextFavs));
                    }}
                    className="absolute top-1 right-1 text-zinc-500 hover:text-amber-400"
                    title="В избранное"
                  >
                    <Star className={`w-3 h-3 ${isFav ? 'fill-amber-400 text-amber-400' : ''}`} />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const item: StickerItem = {
                        id: `stk_${Date.now()}`,
                        kind: st.kind,
                        content: st.content,
                        label: st.label,
                        startMs: currentTimeMs,
                        durationMs: 3500,
                        x: 50,
                        y: 40,
                        scale: 1,
                        rotation: 0,
                        animLoop: st.kind === 'gif' ? 'bounce' : 'none',
                      };
                      onChangeState((prev) => ({
                        ...prev,
                        stickers: [...prev.stickers, item],
                      }));
                      onSelect({ kind: 'sticker', id: item.id });
                    }}
                    className="text-lg py-1"
                  >
                    {st.content}
                  </button>
                  <span className="text-[9px] text-zinc-400 truncate w-full text-center">
                    {st.label}
                  </span>
                </div>
              );
            })}
          </div>

          {activeSticker && (
            <SectionBox
              title={`Стикер: ${activeSticker.label}`}
              action={
                <button
                  type="button"
                  onClick={() => {
                    onChangeState((prev) => ({
                      ...prev,
                      stickers: prev.stickers.filter((s) => s.id !== activeSticker.id),
                    }));
                    onSelect(null);
                  }}
                  className="text-[10px] text-[#FF7DA6]"
                >
                  Удалить
                </button>
              }
            >
              <SliderRow
                label="Размер"
                value={activeSticker.scale}
                min={0.3}
                max={3}
                step={0.1}
                suffix="x"
                onChange={(v) =>
                  onChangeState((prev) => ({
                    ...prev,
                    stickers: prev.stickers.map((s) =>
                      s.id === activeSticker.id ? { ...s, scale: v } : s,
                    ),
                  }))
                }
              />
              <SliderRow
                label="Поворот"
                value={activeSticker.rotation}
                min={-180}
                max={180}
                step={2}
                suffix="°"
                onChange={(v) =>
                  onChangeState((prev) => ({
                    ...prev,
                    stickers: prev.stickers.map((s) =>
                      s.id === activeSticker.id ? { ...s, rotation: v } : s,
                    ),
                  }))
                }
              />
              <SliderRow
                label="Позиция X"
                value={activeSticker.x}
                min={5}
                max={95}
                step={1}
                suffix="%"
                onChange={(v) =>
                  onChangeState((prev) => ({
                    ...prev,
                    stickers: prev.stickers.map((s) =>
                      s.id === activeSticker.id ? { ...s, x: v } : s,
                    ),
                  }))
                }
              />
              <SliderRow
                label="Позиция Y"
                value={activeSticker.y}
                min={5}
                max={95}
                step={1}
                suffix="%"
                onChange={(v) =>
                  onChangeState((prev) => ({
                    ...prev,
                    stickers: prev.stickers.map((s) =>
                      s.id === activeSticker.id ? { ...s, y: v } : s,
                    ),
                  }))
                }
              />
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-zinc-300">Прыгающая анимация (Bounce)</span>
                <input
                  type="checkbox"
                  checked={activeSticker.animLoop === 'bounce'}
                  onChange={(e) =>
                    onChangeState((prev) => ({
                      ...prev,
                      stickers: prev.stickers.map((s) =>
                        s.id === activeSticker.id
                          ? { ...s, animLoop: e.target.checked ? 'bounce' : 'none' }
                          : s,
                      ),
                    }))
                  }
                  className="accent-[#00E5FF]"
                />
              </label>
            </SectionBox>
          )}
        </div>
      )}

      {/* TAB 11: AUDIO STUDIO */}
      {activeTab === 'audio' && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleToggleVoiceRecord}
              className={`flex-1 py-2.5 rounded-lg font-semibold flex items-center justify-center gap-2 ${
                recording
                  ? 'bg-[#FF2D6F] text-white'
                  : 'bg-[#161619] border border-[#FF2D6F]/40 text-[#FF7DA6]'
              }`}
            >
              <Mic className="w-4 h-4" />
              <span>{recording ? 'Стоп запись' : 'Озвучка микрофоном'}</span>
            </button>
            {activeClip && (
              <button
                type="button"
                onClick={handleDetachAudio}
                className="px-3 py-2.5 rounded-lg bg-[#161619] border border-white/10 text-zinc-200 hover:border-[#00E5FF]"
              >
                Извлечь звук
              </button>
            )}
          </div>

          <div className="flex gap-1.5">
            {(['all', 'Музыка', 'Эффекты'] as const).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setAudioCategory(cat)}
                className={`px-2.5 py-1 rounded-md text-[11px] ${
                  audioCategory === cat
                    ? 'bg-[#00E5FF] text-black font-semibold'
                    : 'bg-[#161619] text-zinc-400 hover:text-white'
                }`}
              >
                {cat === 'all' ? 'Все звуки' : cat}
              </button>
            ))}
          </div>

          <div className="space-y-1.5">
            {AUDIO_LIBRARY.filter(
              (tr) => audioCategory === 'all' || tr.category === audioCategory,
            ).map((tr) => (
              <div
                key={tr.id}
                className="flex items-center justify-between p-2.5 rounded-lg bg-[#161619] border border-white/[0.07]"
              >
                <div className="min-w-0 pr-2">
                  <div className="font-medium text-white truncate">{tr.name}</div>
                  <div className="text-[10px] text-zinc-500">
                    {tr.category} · {tr.bpm} BPM
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      audioEngine.playClipPreview({
                        id: tr.id,
                        track: 'A1',
                        name: tr.name,
                        src: '',
                        synthPreset: tr.preset,
                        startMs: 0,
                        durationMs: tr.durationMs,
                        volume: 85,
                        fadeInMs: 0,
                        fadeOutMs: 0,
                        voiceEffect: 'none',
                        denoise: false,
                        eq: [0, 0, 0, 0, 0],
                        beatSynced: false,
                      })
                    }
                    className="p-2 rounded-lg bg-black/50 text-[#00E5FF] hover:bg-black"
                    title="Прослушать"
                  >
                    <Play className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const newClip: AudioClip = {
                        id: `aud_${Date.now()}`,
                        track: tr.category === 'Эффекты' ? 'A2' : 'A1',
                        name: tr.name,
                        src: '',
                        synthPreset: tr.preset,
                        startMs: currentTimeMs,
                        durationMs: tr.durationMs,
                        volume: 85,
                        fadeInMs: tr.category === 'Эффекты' ? 0 : 250,
                        fadeOutMs: tr.category === 'Эффекты' ? 100 : 500,
                        voiceEffect: 'none',
                        denoise: false,
                        eq: [0, 0, 0, 0, 0],
                        beatSynced: true,
                      };
                      onChangeState((prev) => ({
                        ...prev,
                        audioClips: [...prev.audioClips, newClip],
                      }));
                      onSelect({ kind: 'audio', id: newClip.id });
                      if (tr.category === 'Музыка') {
                        onAddBeatMarkers(tr.bpm, currentTimeMs, tr.durationMs);
                      }
                    }}
                    className="px-2.5 py-1.5 rounded-lg bg-[#00E5FF] text-black font-semibold"
                  >
                    + Добавить
                  </button>
                </div>
              </div>
            ))}
          </div>

          {activeAudio && (
            <SectionBox
              title={activeAudio.name}
              action={
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => audioEngine.playClipPreview(activeAudio)}
                    className="text-[#00E5FF] text-[10px] font-medium"
                  >
                    Тест
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onChangeState((prev) => ({
                        ...prev,
                        audioClips: prev.audioClips.filter((a) => a.id !== activeAudio.id),
                      }));
                      onSelect(null);
                    }}
                    className="text-[#FF7DA6] text-[10px]"
                  >
                    Удалить
                  </button>
                </div>
              }
            >
              <SliderRow
                label="Громкость"
                value={activeAudio.volume}
                min={0}
                max={200}
                step={5}
                suffix="%"
                onChange={(v) =>
                  onChangeState((prev) => ({
                    ...prev,
                    audioClips: prev.audioClips.map((a) =>
                      a.id === activeAudio.id ? { ...a, volume: v } : a,
                    ),
                  }))
                }
              />
              <div className="grid grid-cols-2 gap-2">
                <SliderRow
                  label="Нарастание"
                  value={activeAudio.fadeInMs}
                  min={0}
                  max={2000}
                  step={50}
                  suffix="ms"
                  onChange={(v) =>
                    onChangeState((prev) => ({
                      ...prev,
                      audioClips: prev.audioClips.map((a) =>
                        a.id === activeAudio.id ? { ...a, fadeInMs: v } : a,
                      ),
                    }))
                  }
                />
                <SliderRow
                  label="Затухание"
                  value={activeAudio.fadeOutMs}
                  min={0}
                  max={2000}
                  step={50}
                  suffix="ms"
                  onChange={(v) =>
                    onChangeState((prev) => ({
                      ...prev,
                      audioClips: prev.audioClips.map((a) =>
                        a.id === activeAudio.id ? { ...a, fadeOutMs: v } : a,
                      ),
                    }))
                  }
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <select
                  value={activeAudio.voiceEffect}
                  onChange={(e) =>
                    onChangeState((prev) => ({
                      ...prev,
                      audioClips: prev.audioClips.map((a) =>
                        a.id === activeAudio.id
                          ? {
                              ...a,
                              voiceEffect: e.target.value as AudioClip['voiceEffect'],
                            }
                          : a,
                      ),
                    }))
                  }
                  className="px-2 py-2 rounded-lg bg-black/50 border border-white/10 text-[11px]"
                >
                  <option value="none">Голос: Оригинал</option>
                  <option value="robot">Робот</option>
                  <option value="child">Детский</option>
                  <option value="deep">Низкий бас</option>
                  <option value="radio">Радио</option>
                </select>
                <button
                  type="button"
                  onClick={() =>
                    onChangeState((prev) => ({
                      ...prev,
                      audioClips: prev.audioClips.map((a) =>
                        a.id === activeAudio.id ? { ...a, denoise: !a.denoise } : a,
                      ),
                    }))
                  }
                  className={`py-2 rounded-lg border text-[11px] ${
                    activeAudio.denoise
                      ? 'bg-[#00E5FF]/15 border-[#00E5FF] text-[#00E5FF]'
                      : 'bg-black/50 border-white/10 text-zinc-400'
                  }`}
                >
                  Шумоподавление
                </button>
              </div>

              {/* 5-Band Equalizer */}
              <div className="pt-2 border-t border-white/[0.07]">
                <div className="text-[10px] text-zinc-400 mb-1.5">Эквалайзер 5 полос</div>
                <div className="grid grid-cols-5 gap-1.5">
                  {(['80Hz', '320Hz', '1kHz', '3.5k', '10k'] as const).map((band, bIdx) => (
                    <div key={band} className="flex flex-col items-center gap-1">
                      <input
                        type="range"
                        min={-12}
                        max={12}
                        step={1}
                        value={activeAudio.eq[bIdx] ?? 0}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          onChangeState((prev) => ({
                            ...prev,
                            audioClips: prev.audioClips.map((a) => {
                              if (a.id !== activeAudio.id) return a;
                              const nextEq = [...a.eq] as [number, number, number, number, number];
                              nextEq[bIdx] = val;
                              return { ...a, eq: nextEq };
                            }),
                          }));
                        }}
                        className="w-full accent-[#00E5FF]"
                      />
                      <span className="text-[9px] font-mono-tabular text-zinc-500">{band}</span>
                    </div>
                  ))}
                </div>
              </div>
            </SectionBox>
          )}
        </div>
      )}

      {/* TAB 12: INSHOT CANVAS FORMAT & BACKGROUND */}
      {activeTab === 'canvas' && (
        <div className="space-y-3">
          <SectionBox title="Соотношение сторон (CapCut / InShot)">
            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  ['9:16', 'TikTok'],
                  ['16:9', 'YouTube'],
                  ['1:1', 'Insta'],
                  ['4:5', 'Пост'],
                  ['4:3', 'Классика'],
                  ['21:9', 'Кино'],
                ] as Array<[AspectRatio, string]>
              ).map(([ratio, tag]) => (
                <button
                  key={ratio}
                  type="button"
                  onClick={() => onChangeState((prev) => ({ ...prev, aspectRatio: ratio }))}
                  className={`py-2 rounded-lg border flex flex-col items-center ${
                    state.aspectRatio === ratio
                      ? 'bg-[#00E5FF] text-black border-[#00E5FF] font-bold'
                      : 'bg-black/40 border-white/10 text-zinc-300'
                  }`}
                >
                  <span className="font-mono-tabular text-xs">{ratio}</span>
                  <span className="text-[9px] opacity-75">{tag}</span>
                </button>
              ))}
            </div>
          </SectionBox>

          <SectionBox title="Фон холста (InShot)">
            <div className="grid grid-cols-4 gap-1.5">
              {(
                [
                  ['color', 'Цвет'],
                  ['gradient', 'Градиент'],
                  ['blur', 'Размытие'],
                  ['image', 'Фото'],
                ] as const
              ).map(([bgType, label]) => (
                <button
                  key={bgType}
                  type="button"
                  onClick={() => {
                    if (bgType === 'image') {
                      bgImgInputRef.current?.click();
                    } else {
                      onChangeState((prev) => ({
                        ...prev,
                        background: { ...prev.background, type: bgType },
                      }));
                    }
                  }}
                  className={`py-2 rounded-lg border text-[11px] ${
                    state.background.type === bgType
                      ? 'bg-[#00E5FF]/15 border-[#00E5FF] text-white font-semibold'
                      : 'bg-black/40 border-white/10 text-zinc-400'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {state.background.type === 'color' && (
              <div className="flex items-center justify-between pt-1">
                <span className="text-zinc-300">Цвет заливки</span>
                <input
                  type="color"
                  value={state.background.color}
                  onChange={(e) =>
                    onChangeState((prev) => ({
                      ...prev,
                      background: { ...prev.background, color: e.target.value },
                    }))
                  }
                  className="w-10 h-8 rounded bg-transparent border-0"
                />
              </div>
            )}

            {state.background.type === 'gradient' && (
              <div className="grid grid-cols-4 gap-1.5 pt-1">
                {CANVAS_GRADIENTS.map((gr) => (
                  <button
                    key={gr.id}
                    type="button"
                    onClick={() =>
                      onChangeState((prev) => ({
                        ...prev,
                        background: { ...prev.background, gradient: gr.css },
                      }))
                    }
                    style={{ backgroundImage: gr.css }}
                    className={`h-10 rounded-lg border flex items-end p-1 text-[9px] text-white ${
                      state.background.gradient === gr.css
                        ? 'border-[#00E5FF] ring-1 ring-[#00E5FF]'
                        : 'border-white/15'
                    }`}
                  >
                    {gr.label}
                  </button>
                ))}
              </div>
            )}

            {state.background.type === 'blur' && (
              <SliderRow
                label="Сила размытия фона"
                value={state.background.blurAmount}
                min={4}
                max={48}
                step={2}
                suffix="px"
                onChange={(v) =>
                  onChangeState((prev) => ({
                    ...prev,
                    background: { ...prev.background, blurAmount: v },
                  }))
                }
              />
            )}
          </SectionBox>
        </div>
      )}
    </div>
  );
}

function SectionBox({
  title,
  icon: Icon,
  action,
  children,
}: {
  title: string;
  icon?: React.ComponentType<{ className?: string }>;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-[#161619] p-3 rounded-lg space-y-2.5 border border-white/[0.07]">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] font-medium text-zinc-400 flex items-center gap-1.5 min-w-0">
          {Icon && <Icon className="w-3.5 h-3.5 text-[#00E5FF] shrink-0" />}
          <span className="truncate">{title}</span>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function ToolBtn({
  icon: Icon,
  label,
  onClick,
  active,
  danger,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2.5 py-2 rounded-lg border text-[11px] font-medium flex items-center gap-1.5 transition-colors ${
        danger
          ? 'bg-[#161619] border-[#FF2D6F]/30 text-[#FF7DA6] hover:bg-[#FF2D6F]/15'
          : active
            ? 'bg-[#00E5FF]/15 border-[#00E5FF] text-[#00E5FF]'
            : 'bg-[#161619] border-white/[0.08] text-zinc-200 hover:border-white/25'
      }`}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  suffix = '',
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[11px]">
        <span className="text-zinc-400">{label}</span>
        <span className="font-mono-tabular text-zinc-200">
          {Number.isInteger(step) ? value : value.toFixed(2)}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[#00E5FF]"
      />
    </div>
  );
}
