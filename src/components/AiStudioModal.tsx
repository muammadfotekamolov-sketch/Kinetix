import { useState } from 'react';
import {
  Check,
  ChevronDown,
  Film,
  Image as ImageIcon,
  Lock,
  Music,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { createClipFromMedia, createDefaultColorGrade } from '../data/templates.ts';
import { t } from '../data/i18n.ts';
import { apiFetch } from '../lib/api.ts';
import type {
  AspectRatio,
  LanguageCode,
  ProjectState,
  UserProfile,
} from '../types/editor.ts';

interface GeneratedScene {
  id: string;
  order: number;
  durationSec: number;
  title: string;
  narration: string;
  visualPrompt: string;
  transition: string;
  accentHex: string;
}

interface GeneratedScript {
  title: string;
  hook: string;
  musicMood: string;
  scenes: GeneratedScene[];
  hashtags: string[];
}

interface Props {
  user: UserProfile;
  lang: LanguageCode;
  onClose: () => void;
  onOpenPricing: () => void;
  onOpenProjectInEditor: (state: ProjectState, generatedMediaUrl?: string) => void;
}

const buildStrictVideoSystemPrompt = () =>
  [
    'Ты — точный ИИ-режиссёр видео Kinetix.',
    '1. Строго и буквально выполняй ВСЕ инструкции пользователя из основного запроса и поля «Уточнить запрос» (объекты, персонажи, сюжет, стиль, цвета, динамика/темп, ракурс камеры, свет и детали контента). Запрещено менять тему или придумывать посторонний сюжет.',
    '2. Параметры стиля, динамики и контента из поля «Уточнить запрос» имеют наивысший приоритет и должны отражаться в visualPrompt, narration, transition, accentHex и durationSec каждой сцены.',
    '3. ВСЕГДА строго сохраняй JSON-структуру видео: { "title": string, "hook": string, "musicMood": string, "hashtags": string[], "scenes": [{ "order": number, "durationSec": number, "title": string, "narration": string, "visualPrompt": string, "transition": "dissolve"|"slide"|"zoom"|"flash"|"glitch"|"spin", "accentHex": "#RRGGBB" }] }.',
  ].join('\n');

const REFINE_QUICK_CHIPS = [
  'Быстрая динамика и зум',
  'Плавный киношный темп',
  'Неоновый киберпанк',
  'Крупный план, драматичный свет',
  'Яркий 3D-стиль',
];

export function AiStudioModal({
  user,
  lang,
  onClose,
  onOpenPricing,
  onOpenProjectInEditor,
}: Props) {
  const dict = t(lang);
  const [mode, setMode] = useState<'video' | 'photo'>('video');
  const [showOtherMode, setShowOtherMode] = useState(true);

  const [idea, setIdea] = useState('');
  const [refinePrompt, setRefinePrompt] = useState('');
  const [systemPrompt, setSystemPrompt] = useState<string>(() => buildStrictVideoSystemPrompt());
  const [showSystemPrompt, setShowSystemPrompt] = useState(false);

  const [durationSec, setDurationSec] = useState<number>(15);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('9:16');
  const [style, setStyle] = useState('cinematic');
  const [includeMusic, setIncludeMusic] = useState(true);
  const [includeVoiceover, setIncludeVoiceover] = useState(true);

  const [script, setScript] = useState<GeneratedScript | null>(null);
  const [loadingScript, setLoadingScript] = useState(false);
  const [generatingMedia, setGeneratingMedia] = useState(false);
  const [generatedPhotoUrl, setGeneratedPhotoUrl] = useState<string | null>(null);
  const [statusNote, setStatusNote] = useState('');
  const [error, setError] = useState('');

  const appendRefineChip = (chip: string) => {
    setRefinePrompt((prev) => {
      const trimmed = prev.trim();
      if (!trimmed) return chip;
      if (trimmed.toLowerCase().includes(chip.toLowerCase())) return prev;
      return `${trimmed}, ${chip.toLowerCase()}`;
    });
  };

  const isDurationLocked = (sec: number) => {
    if (sec <= 15) return false;
    if (sec <= 30) return user.plan === 'free_15s';
    return user.plan !== 'studio_1m';
  };

  const handleSelectDuration = (sec: number) => {
    if (isDurationLocked(sec)) {
      onOpenPricing();
      return;
    }
    setDurationSec(sec);
  };

  const handleBuildScript = async () => {
    if (!idea.trim()) {
      setError('Напишите идею или тему будущего видео.');
      return;
    }
    setError('');
    setLoadingScript(true);
    try {
      const res = await apiFetch<{ script: GeneratedScript }>('/api/ai/script', {
        method: 'POST',
        body: JSON.stringify({
          idea,
          refinement: refinePrompt.trim(),
          systemPrompt,
          durationSec,
          aspectRatio,
          style,
          language: lang,
          includeVoiceover,
        }),
      });
      setScript(res.script);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка создания сценария');
    } finally {
      setLoadingScript(false);
    }
  };

  const updateSceneField = (
    idx: number,
    field: 'title' | 'narration' | 'visualPrompt',
    value: string,
  ) => {
    if (!script) return;
    const next = [...script.scenes];
    next[idx] = { ...next[idx], [field]: value };
    setScript({ ...script, scenes: next });
  };

  const handleGenerateVideo = async () => {
    if (!idea.trim() && !script) {
      setError('Напишите идею будущего видео перед генерацией.');
      return;
    }
    setError('');
    setStatusNote('');
    setGeneratingMedia(true);
    try {
      let activeScript = script;
      if (!activeScript && idea.trim()) {
        try {
          const scriptRes = await apiFetch<{ script: GeneratedScript }>('/api/ai/script', {
            method: 'POST',
            body: JSON.stringify({
              idea,
              refinement: refinePrompt.trim(),
              systemPrompt,
              durationSec,
              aspectRatio,
              style,
              language: lang,
              includeVoiceover,
            }),
          });
          activeScript = scriptRes.script;
          setScript(scriptRes.script);
        } catch {
          // continue directly with prompt
        }
      }

      const refinedTail = refinePrompt.trim() ? ` (${refinePrompt.trim()})` : '';
      const combinedPrompt = activeScript
        ? activeScript.scenes.map((s) => s.visualPrompt).join('. ')
        : `${idea.trim()}${refinedTail}`;

      const scenes = activeScript?.scenes || [
        {
          id: 'sc_1',
          order: 1,
          durationSec,
          title: idea.slice(0, 30) || 'AI Scene',
          narration: includeVoiceover ? idea : '',
          visualPrompt: combinedPrompt || 'Cinematic futuristic city skyline at sunset',
          transition: 'dissolve',
          accentHex: '#00E5FF',
        },
      ];

      const res = await apiFetch<{
        videoUrl: string;
        source: string;
        note?: string;
      }>('/api/ai/generate-video', {
        method: 'POST',
        body: JSON.stringify({
          prompt: combinedPrompt || 'Cinematic futuristic city skyline at sunset',
          refinement: refinePrompt.trim(),
          systemPrompt,
          aspectRatio,
          durationSec,
          style,
          scenes,
        }),
      });

      if (res.note) setStatusNote(res.note);

      const clip = createClipFromMedia({
        type: 'video',
        src: res.videoUrl,
        name: activeScript?.title || 'AI Video',
        startMs: 0,
        durationMs: durationSec * 1000,
      });

      const fullPromptLower = `${idea} ${refinePrompt}`.toLowerCase();
      let filterPreset = style === 'anime' ? 'vivid' : 'cinema';
      if (/ч[её]рно-?бел|чб|bw|black.*white|нуар/.test(fullPromptLower)) filterPreset = 'bw';
      else if (/винтаж|vhs|ретро|vintage/.test(fullPromptLower)) filterPreset = 'vintage';
      else if (/т[её]пл|закат|warm/.test(fullPromptLower)) filterPreset = 'warm';
      else if (/холод|л[её]д|синий|cool/.test(fullPromptLower)) filterPreset = 'cool';
      else if (/ярк|сочн|неон|vivid/.test(fullPromptLower)) filterPreset = 'vivid';

      const isFastPacing = /быстр|динамич|экшн|энергич|fast|dynamic|action|зум/.test(fullPromptLower);
      const isSlowPacing = /плавн|медлен|спокойн|smooth|slow/.test(fullPromptLower);

      clip.animIn = isFastPacing ? 'zoom-in' : isSlowPacing ? 'fade' : 'zoom-in';
      clip.animOut = 'fade';
      clip.animLoop = isFastPacing ? 'pulse' : 'none';
      clip.transitionIn = /глитч|glitch/.test(fullPromptLower)
        ? 'glitch'
        : isFastPacing
          ? 'zoom'
          : 'dissolve';
      clip.color = {
        ...createDefaultColorGrade(),
        filterPreset,
        contrast: /контраст|драмат/.test(fullPromptLower) ? 20 : 8,
        saturation: /ярк|сочн/.test(fullPromptLower) ? 22 : 0,
      };

      const detectedEffects: ProjectState['effects'] = [];
      if (/неон|киберпанк|cyber|neon/.test(fullPromptLower)) {
        detectedEffects.push({
          id: `ai_efx_${Date.now()}_neon`,
          name: 'Неоновый контур',
          effectKey: 'neon',
          category: 'video',
          startMs: 0,
          durationMs: durationSec * 1000,
          intensity: 75,
        });
      }
      if (/vhs|пл[её]нк|ретро/.test(fullPromptLower)) {
        detectedEffects.push({
          id: `ai_efx_${Date.now()}_vhs`,
          name: 'Ретро VHS лента',
          effectKey: 'vhs',
          category: 'video',
          startMs: 0,
          durationMs: durationSec * 1000,
          intensity: 65,
        });
      }
      if (/глитч|glitch/.test(fullPromptLower)) {
        detectedEffects.push({
          id: `ai_efx_${Date.now()}_gl`,
          name: 'Цифровой глитч',
          effectKey: 'glitch',
          category: 'video',
          startMs: 0,
          durationMs: durationSec * 1000,
          intensity: 70,
        });
      }
      if (/искр|звезд|блеск|маги|волшеб/.test(fullPromptLower)) {
        detectedEffects.push({
          id: `ai_efx_${Date.now()}_sp`,
          name: 'Искры и блики',
          effectKey: 'sparkle',
          category: 'video',
          startMs: 0,
          durationMs: durationSec * 1000,
          intensity: 75,
        });
      }

      let musicPreset = style === 'anime' ? 'lofi' : style === 'cartoon' ? 'pop_viral' : 'synthwave';
      if (/фонк|phonk|дрифт/.test(fullPromptLower)) musicPreset = 'phonk_drift';
      else if (/трэп|trap|рэп/.test(fullPromptLower)) musicPreset = 'trap';
      else if (/дрилл|drill/.test(fullPromptLower)) musicPreset = 'drill_uk';
      else if (/техно|techno/.test(fullPromptLower)) musicPreset = 'techno_rave';
      else if (/хаус|house|клуб/.test(fullPromptLower)) musicPreset = 'house_club';
      else if (/lofi|лоу-?фай|спокойн/.test(fullPromptLower)) musicPreset = 'lofi';
      else if (/пианин|грустн|piano/.test(fullPromptLower)) musicPreset = 'piano_sad';
      else if (/эпик|космос|дракон|epic/.test(fullPromptLower)) musicPreset = 'epic_trailer';
      else if (/поп|влог|весел/.test(fullPromptLower)) musicPreset = 'pop_viral';

      let cursorMs = 0;
      const textOverlays = scenes
        .map((sc, i) => {
          const durMs = Math.max(2000, Math.round((durationSec * 1000) / scenes.length));
          const txt = includeVoiceover ? sc.narration || sc.title : sc.narration;
          const start = cursorMs;
          cursorMs += durMs;
          if (!txt) return null;
          return {
            id: `ai_tx_${Date.now()}_${i}`,
            text: txt,
            startMs: start,
            durationMs: durMs,
            fontFamily: 'Plus Jakarta Sans',
            fontSize: 30,
            color: '#FFFFFF',
            strokeColor: '#000000',
            strokeWidth: 2,
            shadow: true,
            bgColor: 'rgba(0,0,0,0.45)',
            align: 'center' as const,
            lineHeight: 1.2,
            animIn: 'slide-up',
            animOut: 'fade',
            animLoop: 'none',
            templateId: 'minimal-cinema',
            isMarquee: false,
            marqueeSpeed: 80,
            isSubtitle: true,
            x: 50,
            y: 78,
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);

      const projectState: ProjectState = {
        title: activeScript?.title || idea.slice(0, 36) || 'ИИ-видео',
        aspectRatio,
        resolution: '1080p',
        fps: 30,
        background: {
          type: 'color',
          color: '#000000',
          gradient: 'linear-gradient(135deg, #09090b, #1e1b4b)',
          blurAmount: 16,
          imageUrl: '',
        },
        clips: [clip],
        texts: textOverlays,
        stickers: [],
        audioClips: includeMusic
          ? [
              {
                id: `ai_aud_${Date.now()}`,
                track: 'A1',
                name: activeScript?.musicMood || 'AI Soundtrack',
                src: '',
                synthPreset: musicPreset,
                startMs: 0,
                durationMs: durationSec * 1000,
                volume: 75,
                fadeInMs: 400,
                fadeOutMs: 800,
                voiceEffect: 'none',
                denoise: false,
                eq: [0, 0, 0, 0, 0],
                beatSynced: true,
              },
            ]
          : [],
        effects: detectedEffects,
        markers: [],
      };

      onOpenProjectInEditor(projectState, res.videoUrl);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Ошибка генерации';
      if (msg === 'PLAN_UPGRADE_REQUIRED') {
        onOpenPricing();
      } else if (msg === 'DAILY_FREE_LIMIT_REACHED') {
        setError('Дневной лимит бесплатного тарифа (3 ролика в день) исчерпан. Перейдите на платный тариф!');
      } else {
        setError(msg);
      }
    } finally {
      setGeneratingMedia(false);
    }
  };

  const handleGeneratePhoto = async () => {
    if (!idea.trim()) {
      setError('Опишите изображение, которое нужно сгенерировать.');
      return;
    }
    setError('');
    setGeneratingMedia(true);
    try {
      const res = await apiFetch<{ imageUrl: string }>('/api/ai/generate-image', {
        method: 'POST',
        body: JSON.stringify({
          prompt: idea,
          refinement: refinePrompt.trim(),
          systemPrompt,
          aspectRatio,
        }),
      });
      setGeneratedPhotoUrl(res.imageUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка генерации фото');
    } finally {
      setGeneratingMedia(false);
    }
  };

  const handleOpenPhotoInEditor = () => {
    if (!generatedPhotoUrl) return;
    const clip = createClipFromMedia({
      type: 'image',
      src: generatedPhotoUrl,
      name: idea.slice(0, 24) || 'AI Photo',
      startMs: 0,
      durationMs: 6000,
    });
    onOpenProjectInEditor({
      title: idea.slice(0, 32) || 'ИИ-фото проект',
      aspectRatio,
      resolution: '1080p',
      fps: 30,
      background: {
        type: 'color',
        color: '#000000',
        gradient: 'linear-gradient(135deg, #000, #18181b)',
        blurAmount: 16,
        imageUrl: '',
      },
      clips: [clip],
      texts: [],
      stickers: [],
      audioClips: [],
      effects: [],
      markers: [],
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full max-w-4xl bg-[#121212] border border-white/10 rounded-t-3xl sm:rounded-3xl max-h-[92vh] overflow-y-auto p-5 sm:p-7 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#FF2D6F]/15 border border-[#FF2D6F]/40 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-[#FF2D6F]" />
            </div>
            <div>
              <h2 className="font-display text-lg font-bold text-white">{dict.aiStudioTitle}</h2>
              <p className="text-xs text-zinc-400">
                От идеи к сценарию, сценам и готовому монтажу на таймлайне
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-xl bg-[#1C1C1E] flex items-center justify-center text-zinc-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Switcher: AI Video vs AI Photo + Other Mode Toggle */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1 p-1 rounded-xl bg-[#1C1C1E]">
            <button
              type="button"
              onClick={() => setMode('video')}
              className={`px-3.5 py-2 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors ${
                mode === 'video' ? 'bg-[#00E5FF] text-black' : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Film className="w-3.5 h-3.5" />
              <span>ИИ-видео</span>
            </button>
            <button
              type="button"
              onClick={() => setMode('photo')}
              className={`px-3.5 py-2 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors ${
                mode === 'photo' ? 'bg-[#00E5FF] text-black' : 'text-zinc-400 hover:text-white'
              }`}
            >
              <ImageIcon className="w-3.5 h-3.5" />
              <span>ИИ-фото</span>
            </button>
          </div>

          {mode === 'video' && (
            <button
              type="button"
              onClick={() => setShowOtherMode((v) => !v)}
              className={`px-3.5 py-2 rounded-xl border text-xs font-medium flex items-center gap-2 transition-colors ${
                showOtherMode
                  ? 'bg-[#FF2D6F]/15 border-[#FF2D6F]/50 text-[#FF7DA6]'
                  : 'bg-[#1C1C1E] border-white/10 text-zinc-300'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>{dict.otherMode}</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left: Prompt & Editable Script/Scenes */}
          <div className={`${showOtherMode && mode === 'video' ? 'lg:col-span-7' : 'lg:col-span-12'} space-y-4`}>
            <textarea
              rows={3}
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              placeholder={dict.ideaPlaceholder}
              className="w-full p-4 rounded-2xl bg-[#1C1C1E] border border-white/10 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#00E5FF] resize-none"
            />

            {/* Уточнить запрос (стиль, динамика и контент) */}
            <div className="bg-[#1C1C1E]/90 border border-white/10 rounded-2xl p-3.5 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="ai-refine-prompt"
                  className="text-xs font-semibold text-white flex items-center gap-1.5"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5 text-[#00E5FF]" />
                  <span>Уточнить запрос</span>
                </label>
                <span className="text-[11px] text-zinc-400">
                  Стиль · Динамика · Контент
                </span>
              </div>

              <textarea
                id="ai-refine-prompt"
                rows={2}
                value={refinePrompt}
                onChange={(e) => setRefinePrompt(e.target.value)}
                placeholder="Задайте детали перед генерацией: стиль (неон 3D, VHS, аниме), динамику (быстрый зум, плавный пролёт), цвета, ракурс и детали сцен..."
                className="w-full p-3 rounded-xl bg-black/50 border border-white/10 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#00E5FF] resize-none"
              />

              <div className="flex flex-wrap gap-1.5">
                {REFINE_QUICK_CHIPS.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => appendRefineChip(chip)}
                    className="px-2.5 py-1 rounded-lg bg-black/40 border border-white/10 text-[11px] text-zinc-300 hover:border-[#00E5FF]/50 hover:text-[#00E5FF] transition-colors"
                  >
                    + {chip}
                  </button>
                ))}
              </div>

              {mode === 'video' && (
                <div className="pt-1 border-t border-white/8">
                  <button
                    type="button"
                    onClick={() => setShowSystemPrompt((v) => !v)}
                    className="w-full flex items-center justify-between text-[11px] text-zinc-400 hover:text-zinc-200 py-1"
                  >
                    <span className="flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-[#00E5FF]" />
                      <span>Системный промпт: строгое выполнение + JSON видео</span>
                    </span>
                    <ChevronDown
                      className={`w-3.5 h-3.5 transition-transform ${showSystemPrompt ? 'rotate-180' : ''}`}
                    />
                  </button>

                  {showSystemPrompt && (
                    <div className="mt-2 space-y-2">
                      <textarea
                        rows={4}
                        value={systemPrompt}
                        onChange={(e) => setSystemPrompt(e.target.value)}
                        className="w-full p-2.5 rounded-xl bg-black/60 border border-white/10 text-[11px] font-mono-tabular text-zinc-300 focus:outline-none focus:border-[#00E5FF] resize-none"
                      />
                      <div className="flex items-center justify-between text-[10px] text-zinc-500">
                        <span>Передаётся в systemInstruction вместе со схемой JSON сцен</span>
                        <button
                          type="button"
                          onClick={() => setSystemPrompt(buildStrictVideoSystemPrompt())}
                          className="flex items-center gap-1 text-[#00E5FF] hover:underline"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Сбросить</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {mode === 'video' ? (
              <>
                <div className="flex flex-wrap gap-2.5">
                  <button
                    type="button"
                    disabled={loadingScript}
                    onClick={handleBuildScript}
                    className="px-4 py-3 rounded-xl bg-[#1C1C1E] border border-[#00E5FF]/40 text-xs font-semibold text-[#00E5FF] hover:bg-[#00E5FF]/10 flex items-center gap-2"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>{loadingScript ? 'Генерация сценария...' : dict.generateScript}</span>
                  </button>

                  <button
                    type="button"
                    disabled={generatingMedia}
                    onClick={handleGenerateVideo}
                    className="flex-1 min-w-[180px] px-5 py-3 rounded-xl bg-[#00E5FF] text-black text-xs font-bold hover:bg-[#33ECFF] disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <Film className="w-4 h-4" />
                    <span>{generatingMedia ? 'Создание видео...' : dict.generateVideo}</span>
                  </button>
                </div>

                {/* Editable Script & Scenes */}
                {script && (
                  <div className="bg-[#1C1C1E] border border-white/10 rounded-2xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-semibold text-[#00E5FF]">
                        Сценарий: {script.title}
                      </div>
                      <span className="text-[11px] text-zinc-400">
                        {script.scenes.length} сцен · {script.musicMood}
                      </span>
                    </div>

                    <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                      {script.scenes.map((sc, idx) => (
                        <div
                          key={sc.id}
                          className="p-3 rounded-xl bg-black/40 border border-white/8 space-y-2"
                        >
                          <div className="flex items-center justify-between text-[11px] text-zinc-400">
                            <span className="font-semibold text-white">
                              Сцена {sc.order} ({sc.durationSec}с · {sc.transition})
                            </span>
                            <Check className="w-3.5 h-3.5 text-[#00E5FF]" />
                          </div>
                          <input
                            type="text"
                            value={sc.narration}
                            onChange={(e) => updateSceneField(idx, 'narration', e.target.value)}
                            placeholder="Текст / субтитры сцены"
                            className="w-full px-2.5 py-1.5 rounded-lg bg-[#1C1C1E] border border-white/10 text-xs text-white"
                          />
                          <textarea
                            rows={2}
                            value={sc.visualPrompt}
                            onChange={(e) => updateSceneField(idx, 'visualPrompt', e.target.value)}
                            placeholder="Визуальный промпт..."
                            className="w-full px-2.5 py-1.5 rounded-lg bg-[#1C1C1E] border border-white/10 text-[11px] text-zinc-300 resize-none"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="space-y-4">
                <button
                  type="button"
                  disabled={generatingMedia}
                  onClick={handleGeneratePhoto}
                  className="w-full py-3.5 rounded-xl bg-[#00E5FF] text-black text-sm font-semibold hover:bg-[#33ECFF] disabled:opacity-50"
                >
                  {generatingMedia ? 'Генерация фото...' : dict.generatePhoto}
                </button>
                {generatedPhotoUrl && (
                  <div className="bg-[#1C1C1E] border border-white/10 rounded-2xl p-4 space-y-3">
                    <img
                      src={generatedPhotoUrl}
                      alt="Generated AI photo"
                      className="w-full max-h-64 object-contain rounded-xl bg-black"
                    />
                    <button
                      type="button"
                      onClick={handleOpenPhotoInEditor}
                      className="w-full py-3 rounded-xl bg-[#FF2D6F] text-white text-xs font-semibold"
                    >
                      {dict.openInEditor}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right: "Другой режим" (Custom Mode Parameters) */}
          {mode === 'video' && showOtherMode && (
            <div className="lg:col-span-5 bg-[#1C1C1E] border border-white/10 rounded-2xl p-4 space-y-4 h-fit">
              <div className="text-xs font-semibold text-white">{dict.otherMode}</div>

              {/* Duration with Locked Paid Tiers */}
              <div>
                <div className="text-[11px] text-zinc-400 mb-2">Длительность</div>
                <div className="grid grid-cols-3 gap-1.5">
                  {[5, 10, 15, 30, 60].map((sec) => {
                    const locked = isDurationLocked(sec);
                    const active = durationSec === sec;
                    return (
                      <button
                        key={sec}
                        type="button"
                        onClick={() => handleSelectDuration(sec)}
                        className={`py-2 px-2.5 rounded-xl border text-xs font-mono-tabular flex items-center justify-center gap-1 transition-all ${
                          active
                            ? 'bg-[#00E5FF] text-black border-[#00E5FF] font-bold'
                            : locked
                              ? 'bg-black/30 border-white/10 text-zinc-400 hover:border-[#FF2D6F]/50'
                              : 'bg-black/40 border-white/10 text-zinc-200 hover:border-white/30'
                        }`}
                      >
                        <span>{sec === 60 ? '1 мин' : `${sec}с`}</span>
                        {locked && <Lock className="w-3 h-3 text-[#FF2D6F]" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Format */}
              <div>
                <div className="text-[11px] text-zinc-400 mb-2">Формат экрана</div>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['9:16', '16:9', '1:1'] as AspectRatio[]).map((ratio) => (
                    <button
                      key={ratio}
                      type="button"
                      onClick={() => setAspectRatio(ratio)}
                      className={`py-2 rounded-xl border text-xs font-mono-tabular ${
                        aspectRatio === ratio
                          ? 'bg-[#00E5FF]/15 border-[#00E5FF] text-[#00E5FF]'
                          : 'bg-black/40 border-white/10 text-zinc-300'
                      }`}
                    >
                      {ratio}
                    </button>
                  ))}
                </div>
              </div>

              {/* Visual Style */}
              <div>
                <div className="text-[11px] text-zinc-400 mb-2">Визуальный стиль</div>
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { id: 'cinematic', label: 'Кинематограф' },
                    { id: 'anime', label: 'Аниме' },
                    { id: 'realistic', label: 'Реалистичный' },
                    { id: 'cartoon', label: 'Мультяшный' },
                    { id: '3d', label: '3D Графика' },
                  ].map((st) => (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => setStyle(st.id)}
                      className={`py-2 px-3 rounded-xl border text-xs text-left ${
                        style === st.id
                          ? 'bg-[#00E5FF]/15 border-[#00E5FF] text-white'
                          : 'bg-black/40 border-white/10 text-zinc-400'
                      }`}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Music & Voiceover Toggles */}
              <div className="space-y-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIncludeMusic((v) => !v)}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-black/40 border border-white/10 text-xs"
                >
                  <span className="flex items-center gap-2 text-zinc-200">
                    <Music className="w-4 h-4 text-[#00E5FF]" />
                    <span>Фоновая музыка</span>
                  </span>
                  <span className={includeMusic ? 'text-[#00E5FF] font-semibold' : 'text-zinc-500'}>
                    {includeMusic ? 'Вкл' : 'Выкл'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setIncludeVoiceover((v) => !v)}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-black/40 border border-white/10 text-xs"
                >
                  <span className="flex items-center gap-2 text-zinc-200">
                    {includeVoiceover ? (
                      <Volume2 className="w-4 h-4 text-[#FF2D6F]" />
                    ) : (
                      <VolumeX className="w-4 h-4 text-zinc-500" />
                    )}
                    <span>Озвучка сцен</span>
                  </span>
                  <span className={includeVoiceover ? 'text-[#FF2D6F] font-semibold' : 'text-zinc-500'}>
                    {includeVoiceover ? 'Вкл' : 'Выкл'}
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>

        {statusNote && (
          <div className="text-xs text-zinc-300 bg-[#1C1C1E] border border-white/10 rounded-xl px-4 py-2.5">
            {statusNote}
          </div>
        )}
        {error && (
          <div className="text-xs text-[#FF2D6F] bg-[#FF2D6F]/10 border border-[#FF2D6F]/30 rounded-xl px-4 py-2.5">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
