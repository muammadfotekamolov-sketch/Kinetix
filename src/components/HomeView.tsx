import { useRef, useState } from 'react';
import {
  Crown,
  Film,
  FolderOpen,
  Home,
  Layers,
  Plus,
  Smartphone,
  Sparkles,
  Trash2,
  User,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { t } from '../data/i18n.ts';
import {
  createClipFromMedia,
  STUDIO_TEMPLATES,
  TEMPLATE_VIDEOS,
  type EditorTemplate,
} from '../data/templates.ts';
import { getAuthToken } from '../lib/api.ts';
import { audioEngine } from '../lib/audioEngine.ts';
import type {
  AudioClip,
  LanguageCode,
  ProjectRecord,
  ProjectState,
  UserProfile,
  VideoClip,
} from '../types/editor.ts';
import { KinetixLogo } from './KinetixLogo.tsx';
import { MediaLibraryModal, type ImportedMediaResult } from './MediaLibraryModal.tsx';
import { ProfileSettingsView } from './ProfileSettingsView.tsx';

interface Props {
  user: UserProfile;
  lang: LanguageCode;
  projects: ProjectRecord[];
  onLanguageChange: (l: LanguageCode) => void;
  onUserUpdated: (u: UserProfile) => void;
  onLoggedOut: () => void;
  onOpenEditor: (state: ProjectState, projectId?: number | null) => void;
  onDeleteProject: (id: number) => void;
  onOpenAiStudio: () => void;
  onOpenPricing: () => void;
}

export function HomeView({
  user,
  lang,
  projects,
  onLanguageChange,
  onUserUpdated,
  onLoggedOut,
  onOpenEditor,
  onDeleteProject,
  onOpenAiStudio,
  onOpenPricing,
}: Props) {
  const dict = t(lang);
  const [activeTab, setActiveTab] = useState<'home' | 'templates' | 'profile'>('home');
  const [previewingTplId, setPreviewingTplId] = useState<string | null>(null);
  const [mediaModalOpen, setMediaModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const toggleTemplateAudio = (tpl: EditorTemplate) => {
    if (previewingTplId === tpl.id) {
      audioEngine.stopAll();
      setPreviewingTplId(null);
      return;
    }
    const firstClip = tpl.state.audioClips[0];
    if (firstClip) {
      audioEngine.playClipPreview(firstClip);
      setPreviewingTplId(tpl.id);
    }
  };

  const openImportedMediaInEditor = (items: ImportedMediaResult[]) => {
    let cursorMs = 0;
    const clips: VideoClip[] = [];
    const audioClips: AudioClip[] = [];
    let chosenRatio: ProjectState['aspectRatio'] = '9:16';

    for (const item of items) {
      if (item.aspectRatio) chosenRatio = item.aspectRatio;
      if (item.kind === 'audio') {
        audioClips.push({
          id: `aud_home_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
          track: 'A1',
          name: item.name,
          src: item.src,
          synthPreset: item.synthPreset,
          startMs: 0,
          durationMs: item.durationMs,
          volume: 85,
          fadeInMs: 250,
          fadeOutMs: 500,
          voiceEffect: 'none',
          denoise: false,
          eq: [0, 0, 0, 0, 0],
          beatSynced: true,
        });
      } else {
        clips.push(
          createClipFromMedia({
            type: item.kind,
            src: item.src,
            name: item.name,
            startMs: cursorMs,
            durationMs: item.durationMs,
          }),
        );
        cursorMs += item.durationMs;
      }
    }

    if (clips.length === 0) {
      clips.push(
        createClipFromMedia({
          type: 'video',
          src: TEMPLATE_VIDEOS.tokyoNeon,
          name: 'Видео-сцена MP4',
          startMs: 0,
          durationMs: 6000,
        }),
      );
    }

    onOpenEditor(
      {
        title: clips[0]?.name.slice(0, 32) || 'Новый проект',
        aspectRatio: chosenRatio,
        resolution: '1080p',
        fps: 30,
        background: {
          type: 'color',
          color: '#000000',
          gradient: 'linear-gradient(135deg, #09090b, #1e1b4b)',
          blurAmount: 16,
          imageUrl: '',
        },
        clips,
        texts: [],
        stickers: [],
        audioClips,
        effects: [],
        markers: [],
      },
      null,
    );
  };

  const createBlankOrMediaProject = async (files?: FileList | null) => {
    const clips: VideoClip[] = [];
    let cursorMs = 0;
    if (files && files.length > 0) {
      const token = getAuthToken();
      for (const file of Array.from(files)) {
        const lower = file.name.toLowerCase();
        const isVideo =
          file.type.startsWith('video/') || /\.(mp4|mov|m4v|3gp|mkv|avi|webm)$/.test(lower);
        const needsTranscode = /\.(mov|3gp|mkv|avi|heic|heif|m4v)$/.test(lower);
        let url = URL.createObjectURL(file);
        let resolvedType: 'video' | 'image' = isVideo ? 'video' : 'image';
        if (needsTranscode && token) {
          try {
            const buf = await file.arrayBuffer();
            const resp = await fetch('/api/media/import', {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/octet-stream',
                'X-Media-Name': encodeURIComponent(file.name),
                'X-Media-Mime': file.type || 'application/octet-stream',
              },
              body: buf,
            });
            if (resp.ok) {
              const data = (await resp.json()) as { url?: string; mediaType?: 'video' | 'image' };
              if (data.url) url = data.url;
              if (data.mediaType === 'video' || data.mediaType === 'image') {
                resolvedType = data.mediaType;
              }
            }
          } catch {
            // keep blob URL
          }
        }
        const dur = resolvedType === 'video' ? 7000 : 5000;
        clips.push(
          createClipFromMedia({
            type: resolvedType,
            src: url,
            name: file.name,
            startMs: cursorMs,
            durationMs: dur,
          }),
        );
        cursorMs += dur;
      }
    } else {
      clips.push(
        createClipFromMedia({
          type: 'video',
          src: TEMPLATE_VIDEOS.tokyoNeon,
          name: 'Демо-сцена MP4',
          startMs: 0,
          durationMs: 6000,
        }),
      );
    }

    const state: ProjectState = {
      title: 'Новый проект',
      aspectRatio: '9:16',
      resolution: '1080p',
      fps: 30,
      background: {
        type: 'color',
        color: '#000000',
        gradient: 'linear-gradient(135deg, #09090b, #1e1b4b)',
        blurAmount: 16,
        imageUrl: '',
      },
      clips,
      texts: [],
      stickers: [],
      audioClips: [],
      effects: [],
      markers: [],
    };
    onOpenEditor(state, null);
  };

  const openTemplate = (tpl: EditorTemplate) => {
    audioEngine.stopAll();
    setPreviewingTplId(null);
    const clone = JSON.parse(JSON.stringify(tpl.state)) as ProjectState;
    onOpenEditor(clone, null);
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      {/* 3-Zone Top Bar */}
      <header className="sticky top-0 z-30 bg-black/85 backdrop-blur-md border-b border-white/8 px-4 sm:px-8 h-14 flex items-center justify-between gap-8">
        <KinetixLogo size={30} />

        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-zinc-400">
          <button
            type="button"
            onClick={() => setActiveTab('home')}
            className={`whitespace-nowrap shrink-0 transition-colors ${
              activeTab === 'home' ? 'text-white' : 'hover:text-white'
            }`}
          >
            {dict.home}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('templates')}
            className={`whitespace-nowrap shrink-0 transition-colors ${
              activeTab === 'templates' ? 'text-white' : 'hover:text-white'
            }`}
          >
            {dict.templates}
          </button>
          <button
            type="button"
            onClick={onOpenPricing}
            className="whitespace-nowrap shrink-0 hover:text-white transition-colors"
          >
            {dict.plans}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('profile')}
            className={`whitespace-nowrap shrink-0 transition-colors ${
              activeTab === 'profile' ? 'text-white' : 'hover:text-white'
            }`}
          >
            {dict.profile}
          </button>
        </nav>

        <button
          type="button"
          onClick={onOpenPricing}
          className="px-3.5 py-2 rounded-xl bg-[#1C1C1E] border border-white/10 text-xs font-medium text-[#00E5FF] flex items-center gap-1.5 whitespace-nowrap shrink-0 hover:border-[#00E5FF]/50"
        >
          <Crown className="w-3.5 h-3.5" />
          <span>
            {user.plan === 'studio_1m'
              ? '1 мин Studio'
              : user.plan === 'pro_30s'
                ? '30с Pro'
                : '15с Free'}
          </span>
        </button>
      </header>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="video/*,image/*,.mp4,.mov,.m4v,.3gp,.mkv,.avi,.webm,.heic,.heif,.jpg,.jpeg,.png,.webp"
        className="hidden"
        onChange={(e) => {
          void createBlankOrMediaProject(e.target.files);
          e.target.value = '';
        }}
      />

      <main className="flex-1 px-4 sm:px-8 py-6 max-w-6xl w-full mx-auto pb-24">
        {activeTab === 'home' && (
          <div className="space-y-8">
            {/* Primary Action Studio Deck */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="sm:col-span-7 group relative overflow-hidden rounded-3xl bg-[#00E5FF] text-black p-6 sm:p-8 flex items-center justify-between text-left active:scale-[0.99] transition-transform min-h-[132px]"
              >
                <div>
                  <div className="font-display text-2xl font-extrabold tracking-tight">
                    {dict.newProject}
                  </div>
                  <div className="text-xs sm:text-sm font-medium text-black/75 mt-1">
                    Загрузите видео или фото и откройте многодорожечный таймлайн
                  </div>
                </div>
                <div className="w-12 h-12 rounded-2xl bg-black/15 flex items-center justify-center shrink-0">
                  <Plus className="w-7 h-7 stroke-[2.5]" />
                </div>
              </button>

              <button
                type="button"
                onClick={onOpenAiStudio}
                className="sm:col-span-5 rounded-3xl bg-[#1C1C1E] border border-[#FF2D6F]/40 hover:border-[#FF2D6F] p-6 sm:p-8 flex items-center justify-between text-left active:scale-[0.99] transition-all min-h-[132px]"
              >
                <div>
                  <div className="font-display text-xl font-bold text-white flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-[#FF2D6F]" />
                    <span>{dict.aiVideo}</span>
                  </div>
                  <div className="text-xs text-zinc-400 mt-1">
                    Сценарий, сцены и генерация ролика или фото по идее
                  </div>
                </div>
                <div className="w-11 h-11 rounded-2xl bg-[#FF2D6F]/15 text-[#FF2D6F] flex items-center justify-center shrink-0">
                  <Sparkles className="w-5 h-5" />
                </div>
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => void createBlankOrMediaProject(null)}
                className="text-xs text-zinc-400 hover:text-[#00E5FF] flex items-center gap-1.5"
              >
                <Film className="w-3.5 h-3.5" />
                <span>Или создать пустой проект с демо-видео</span>
              </button>
              <button
                type="button"
                onClick={() => setMediaModalOpen(true)}
                className="px-3.5 py-2 rounded-xl bg-[#1C1C1E] border border-[#00E5FF]/35 text-xs font-medium text-[#00E5FF] hover:bg-[#00E5FF]/10 flex items-center gap-1.5"
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span>Медиатека для всех телефонов</span>
              </button>
            </div>

            {/* Recent Projects */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-lg font-bold text-white">
                  {dict.recentProjects}
                </h2>
                <span className="text-xs text-zinc-500 font-mono-tabular">
                  {projects.length}
                </span>
              </div>

              {projects.length === 0 ? (
                <div className="rounded-3xl bg-[#121212] border border-white/8 p-8 text-center space-y-2">
                  <FolderOpen className="w-8 h-8 text-zinc-600 mx-auto" />
                  <p className="text-sm text-zinc-400">{dict.noProjectsYet}</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {projects.map((p) => (
                    <div
                      key={p.id}
                      className="rounded-2xl bg-[#121212] border border-white/10 overflow-hidden flex flex-col justify-between hover:border-white/25 transition-colors"
                    >
                      <button
                        type="button"
                        onClick={() => onOpenEditor(p.stateJson, p.id)}
                        className="text-left flex-1"
                      >
                        <div className="aspect-video bg-[#1C1C1E] overflow-hidden">
                          {p.thumbnailUrl ? (
                            <img
                              src={p.thumbnailUrl}
                              alt={p.title}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-zinc-600">
                              <Film className="w-8 h-8" />
                            </div>
                          )}
                        </div>
                        <div className="p-4">
                          <div className="font-medium text-sm text-white truncate">{p.title}</div>
                          <div className="text-xs text-zinc-500 mt-1 flex items-center gap-1.5 font-mono-tabular">
                            <span>{p.aspectRatio}</span>
                            <span aria-hidden="true">·</span>
                            <span>{p.resolution}</span>
                            <span aria-hidden="true">·</span>
                            <span>{(p.durationMs / 1000).toFixed(1)}s</span>
                          </div>
                        </div>
                      </button>
                      <div className="px-4 pb-3 flex justify-end">
                        <button
                          type="button"
                          onClick={() => onDeleteProject(p.id)}
                          aria-label="Удалить проект"
                          className="p-2 rounded-lg text-zinc-500 hover:text-[#FF2D6F] hover:bg-white/5"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Quick Templates Strip */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-lg font-bold text-white">{dict.templates}</h2>
                <button
                  type="button"
                  onClick={() => setActiveTab('templates')}
                  className="text-xs text-[#00E5FF] hover:underline"
                >
                  Все шаблоны
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {STUDIO_TEMPLATES.slice(0, 3).map((tpl) => (
                  <div
                    key={tpl.id}
                    className="group rounded-2xl bg-[#121212] border border-white/10 overflow-hidden hover:border-[#00E5FF]/60 transition-all flex flex-col"
                  >
                    <button
                      type="button"
                      onClick={() => openTemplate(tpl)}
                      className="text-left flex-1"
                    >
                      <div className="aspect-[16/10] bg-[#1C1C1E] overflow-hidden relative">
                        <video
                          src={tpl.videoSrc}
                          poster={tpl.thumbnail}
                          autoPlay
                          muted
                          loop
                          playsInline
                          preload="metadata"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                        <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-black/75 border border-white/15 text-[9px] font-mono-tabular text-[#00E5FF]">
                          MP4 · ВИДЕО
                        </span>
                      </div>
                      <div className="p-3.5 space-y-1">
                        <div className="text-xs font-semibold text-white truncate">{tpl.title}</div>
                        <div className="text-[11px] text-zinc-400 font-mono-tabular truncate">
                          {tpl.category} · {tpl.aspectRatio} · {tpl.durationLabel}
                        </div>
                        <div className="text-[11px] text-[#00E5FF] truncate">
                          {tpl.transitionSummary} · {tpl.animationSummary}
                        </div>
                      </div>
                    </button>
                    <div className="px-3.5 pb-3 flex items-center justify-between gap-2">
                      <span className="text-[11px] text-zinc-400 truncate">
                        {tpl.audioLabel}
                      </span>
                      <button
                        type="button"
                        onClick={() => toggleTemplateAudio(tpl)}
                        className="px-2.5 py-1.5 rounded-lg bg-[#1C1C1E] border border-white/10 text-[11px] text-zinc-200 hover:text-[#00E5FF] flex items-center gap-1 shrink-0"
                      >
                        {previewingTplId === tpl.id ? (
                          <VolumeX className="w-3.5 h-3.5 text-[#FF2D6F]" />
                        ) : (
                          <Volume2 className="w-3.5 h-3.5 text-[#00E5FF]" />
                        )}
                        <span>{previewingTplId === tpl.id ? 'Стоп' : 'Звук'}</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {activeTab === 'templates' && (
          <div className="space-y-5">
            <div>
              <h1 className="font-display text-2xl font-bold text-white">{dict.templates}</h1>
              <p className="text-sm text-zinc-400 mt-1">
                Готовые видеошаблоны MP4 со звуком, звуковыми эффектами, анимациями и переходами
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {STUDIO_TEMPLATES.map((tpl) => (
                <div
                  key={tpl.id}
                  className="rounded-2xl bg-[#121212] border border-white/10 overflow-hidden flex flex-col justify-between"
                >
                  <div className="aspect-[4/3] bg-[#1C1C1E] overflow-hidden relative">
                    <video
                      src={tpl.videoSrc}
                      poster={tpl.thumbnail}
                      autoPlay
                      muted
                      loop
                      playsInline
                      preload="metadata"
                      className="w-full h-full object-cover"
                    />
                    <span className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded bg-black/75 border border-white/15 text-[10px] font-mono-tabular text-[#00E5FF]">
                      MP4 · {tpl.aspectRatio}
                    </span>
                  </div>
                  <div className="p-4 space-y-3">
                    <div className="space-y-1">
                      <div className="font-semibold text-sm text-white">{tpl.title}</div>
                      <div className="text-xs text-zinc-400 font-mono-tabular">
                        {tpl.category} · {tpl.aspectRatio} · {tpl.durationLabel}
                      </div>
                      <div className="text-xs text-zinc-300">
                        Звук: {tpl.audioLabel}
                      </div>
                      <div className="text-[11px] text-[#00E5FF]">
                        Переходы: {tpl.transitionSummary} · Анимации: {tpl.animationSummary}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggleTemplateAudio(tpl)}
                        className="px-3 py-2.5 rounded-xl bg-[#1C1C1E] border border-white/10 text-xs text-zinc-200 hover:border-[#00E5FF] flex items-center gap-1.5 shrink-0"
                      >
                        {previewingTplId === tpl.id ? (
                          <VolumeX className="w-4 h-4 text-[#FF2D6F]" />
                        ) : (
                          <Volume2 className="w-4 h-4 text-[#00E5FF]" />
                        )}
                        <span>{previewingTplId === tpl.id ? 'Стоп' : 'Слушать'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => openTemplate(tpl)}
                        className="flex-1 py-2.5 rounded-xl bg-[#00E5FF] text-black text-xs font-semibold hover:bg-[#33ECFF]"
                      >
                        Использовать шаблон
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'profile' && (
          <ProfileSettingsView
            user={user}
            lang={lang}
            onLanguageChange={onLanguageChange}
            onUserUpdated={onUserUpdated}
            onOpenPricing={onOpenPricing}
            onLoggedOut={onLoggedOut}
          />
        )}
      </main>

      {/* Mobile Fixed Bottom Navigation Bar (<= 15% viewport height) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#121212]/95 backdrop-blur-md border-t border-white/10 h-16 pb-safe grid grid-cols-4 items-center">
        <button
          type="button"
          onClick={() => setActiveTab('home')}
          className={`flex flex-col items-center justify-center gap-1 min-h-[44px] ${
            activeTab === 'home' ? 'text-[#00E5FF]' : 'text-zinc-400'
          }`}
        >
          <Home className="w-5 h-5" />
          <span className="text-[10px] font-medium">{dict.home}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('templates')}
          className={`flex flex-col items-center justify-center gap-1 min-h-[44px] ${
            activeTab === 'templates' ? 'text-[#00E5FF]' : 'text-zinc-400'
          }`}
        >
          <Layers className="w-5 h-5" />
          <span className="text-[10px] font-medium">{dict.templates}</span>
        </button>

        <button
          type="button"
          onClick={onOpenAiStudio}
          className="flex flex-col items-center justify-center gap-1 min-h-[44px] text-[#FF2D6F]"
        >
          <Sparkles className="w-5 h-5" />
          <span className="text-[10px] font-medium">{dict.aiVideo}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('profile')}
          className={`flex flex-col items-center justify-center gap-1 min-h-[44px] ${
            activeTab === 'profile' ? 'text-[#00E5FF]' : 'text-zinc-400'
          }`}
        >
          <User className="w-5 h-5" />
          <span className="text-[10px] font-medium">{dict.profile}</span>
        </button>
      </nav>

      {mediaModalOpen && (
        <MediaLibraryModal
          onClose={() => setMediaModalOpen(false)}
          onSelectMedia={openImportedMediaInEditor}
        />
      )}
    </div>
  );
}
