import { useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  Check,
  Cloud,
  Download,
  Eye,
  EyeOff,
  Instagram,
  KeyRound,
  LogOut,
  Music2,
  Share2,
  Sparkles,
  UserCheck,
  X,
} from 'lucide-react';
import { t } from '../data/i18n.ts';
import { apiFetch } from '../lib/api.ts';
import {
  getProjectDurationMs,
  renderProjectToWebmBlob,
  type MediaCacheEntry,
} from '../lib/canvasCompositor.ts';
import type {
  FpsOption,
  LanguageCode,
  ProjectState,
  Resolution,
  UserProfile,
} from '../types/editor.ts';

interface Props {
  user: UserProfile;
  lang: LanguageCode;
  projectId: number | null;
  state: ProjectState;
  mediaCache: Map<string, MediaCacheEntry>;
  initialTab?: 'export' | 'publish';
  onClose: () => void;
  onSaveCloud: () => Promise<number | null>;
  onUserUpdated: (u: UserProfile) => void;
}

type PlatformId = 'instagram' | 'tiktok';

interface PlatformCredentials {
  handle: string;
  password: string;
  showPass: boolean;
}

export function ExportPublishModal({
  user,
  lang,
  projectId,
  state,
  mediaCache,
  initialTab = 'export',
  onClose,
  onSaveCloud,
  onUserUpdated,
}: Props) {
  const dict = t(lang);
  const [tab, setTab] = useState<'export' | 'publish'>(initialTab);

  const [resolution, setResolution] = useState<Resolution>(state.resolution || '1080p');
  const [fps, setFps] = useState<FpsOption>(state.fps || 30);
  const [quality, setQuality] = useState<'low' | 'medium' | 'high' | 'ultra'>('high');
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [exportedUrl, setExportedUrl] = useState<string>('');
  const [exportSizeMb, setExportSizeMb] = useState<string>('');
  const [cloudSaved, setCloudSaved] = useState(false);

  // Publish & Account Login State (Instagram & TikTok)
  const [platforms, setPlatforms] = useState<PlatformId[]>(['tiktok']);
  const [connections, setConnections] = useState<Array<{ platform: string; handle: string }>>([]);
  const [editingLoginFor, setEditingLoginFor] = useState<PlatformId | null>('tiktok');
  const [creds, setCreds] = useState<Record<PlatformId, PlatformCredentials>>({
    instagram: { handle: '', password: '', showPass: false },
    tiktok: { handle: '', password: '', showPass: false },
  });
  const [connectingPlatform, setConnectingPlatform] = useState<PlatformId | null>(null);

  const [caption, setCaption] = useState(state.title || '');
  const [hashtags, setHashtags] = useState<string[]>(['#kinetix', '#reels', '#tiktok']);
  const [scheduleMode, setScheduleMode] = useState<'now' | 'later'>('now');
  const [scheduledDateTime, setScheduledDateTime] = useState('');
  const [parentalConfirm, setParentalConfirm] = useState(user.parentalConsent);
  const [aiSuggesting, setAiSuggesting] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState('');
  const [error, setError] = useState('');

  const userAge = useMemo(() => {
    const d = new Date(user.birthDate);
    if (Number.isNaN(d.getTime())) return 25;
    return new Date().getFullYear() - d.getFullYear();
  }, [user.birthDate]);

  useEffect(() => {
    void apiFetch<{ connections: Array<{ platform: string; handle: string }> }>(
      '/api/social/connections',
    )
      .then((res) => {
        const list = res.connections || [];
        setConnections(list);
        const firstUnconnected = platforms.find(
          (p) => !list.some((c) => c.platform === p),
        );
        setEditingLoginFor(firstUnconnected || null);
      })
      .catch(() => {});
  }, []);

  const handleStartExport = async () => {
    setError('');
    setExporting(true);
    setProgress(5);
    try {
      const savedId = await onSaveCloud();
      if (savedId) setCloudSaved(true);

      const webmBlob = await renderProjectToWebmBlob({
        state,
        mediaCache,
        showWatermark: user.plan === 'free_15s',
        onProgress: (p) => setProgress(Math.min(70, p)),
      });

      setProgress(78);
      const buf = await webmBlob.arrayBuffer();
      const res = await apiFetch<{
        downloadUrl: string;
        sizeBytes: number;
        fileName: string;
      }>('/api/export/transcode', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'x-export-resolution': resolution,
          'x-export-fps': String(fps),
          'x-export-quality': quality,
          'x-export-aspect': state.aspectRatio,
        },
        body: buf,
      });

      setProgress(100);
      setExportedUrl(res.downloadUrl);
      setExportSizeMb((res.sizeBytes / (1024 * 1024)).toFixed(2));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка экспорта');
    } finally {
      setExporting(false);
    }
  };

  const handleSubmitPlatformLogin = async (platform: PlatformId): Promise<boolean> => {
    const entry = creds[platform];
    const cleanHandle = entry.handle.trim();
    const cleanPassword = entry.password.trim();
    const platName = platform === 'tiktok' ? 'TikTok' : 'Instagram';

    if (!cleanHandle) {
      setError(`Введите логин, @ник или телефон для ${platName}.`);
      setEditingLoginFor(platform);
      return false;
    }
    if (cleanPassword.length < 4) {
      setError(`Введите пароль от вашего аккаунта ${platName} (минимум 4 символа).`);
      setEditingLoginFor(platform);
      return false;
    }

    setError('');
    setConnectingPlatform(platform);
    try {
      const connected = await apiFetch<{ connection: { platform: string; handle: string } }>(
        '/api/social/connect-account',
        {
          method: 'POST',
          body: JSON.stringify({
            platform,
            handle: cleanHandle,
            password: cleanPassword,
          }),
        },
      );
      setConnections((prev) => [
        ...prev.filter((c) => c.platform !== platform),
        connected.connection,
      ]);
      setCreds((prev) => ({
        ...prev,
        [platform]: { ...prev[platform], password: '' },
      }));
      setEditingLoginFor(null);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : `Не удалось войти в ${platName}`);
      return false;
    } finally {
      setConnectingPlatform(null);
    }
  };

  const handleDisconnectPlatform = async (platform: PlatformId) => {
    setError('');
    try {
      await apiFetch(`/api/social/connections/${platform}`, { method: 'DELETE' });
      setConnections((prev) => prev.filter((c) => c.platform !== platform));
      setEditingLoginFor(platform);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось отключить аккаунт');
    }
  };

  const togglePlatform = (p: PlatformId) => {
    setPlatforms((prev) => {
      const next = prev.includes(p)
        ? prev.length > 1
          ? prev.filter((x) => x !== p)
          : prev
        : [...prev, p];
      if (!prev.includes(p) && !connections.some((c) => c.platform === p)) {
        setEditingLoginFor(p);
      }
      return next;
    });
  };

  const handleSuggestHashtags = async () => {
    setAiSuggesting(true);
    try {
      const res = await apiFetch<{ caption: string; hashtags: string[] }>(
        '/api/ai/hashtags',
        {
          method: 'POST',
          body: JSON.stringify({
            topic: caption || state.title || 'Creative video edit',
            platforms,
            language: lang,
          }),
        },
      );
      if (res.caption) setCaption(res.caption);
      if (res.hashtags?.length) setHashtags(res.hashtags);
    } finally {
      setAiSuggesting(false);
    }
  };

  const handlePublishNow = async () => {
    setError('');
    if (userAge < 18 && !parentalConfirm) {
      setError('До 18 лет публикация возможна только с подтверждённого согласия родителя.');
      return;
    }

    // Ensure every selected platform has an authenticated user-entered account + password
    for (const plat of platforms) {
      const hasConn = connections.some((c) => c.platform === plat);
      if (!hasConn) {
        const entry = creds[plat];
        if (entry.handle.trim() && entry.password.trim().length >= 4) {
          const ok = await handleSubmitPlatformLogin(plat);
          if (!ok) return;
        } else {
          const platName = plat === 'tiktok' ? 'TikTok' : 'Instagram';
          setEditingLoginFor(plat);
          setError(`Сначала введите свой аккаунт и пароль для ${platName}.`);
          return;
        }
      }
    }

    setPublishing(true);
    try {
      const savedId = projectId || (await onSaveCloud());
      const res = await apiFetch<{ post: { status: string; scheduledAt: string } }>(
        '/api/social/publish',
        {
          method: 'POST',
          body: JSON.stringify({
            projectId: savedId,
            platforms,
            caption,
            hashtags,
            scheduledAt: scheduleMode === 'later' && scheduledDateTime ? scheduledDateTime : null,
            mediaUrl: exportedUrl || state.clips[0]?.src || '',
            parentalConsentConfirmed: parentalConfirm,
          }),
        },
      );
      if (parentalConfirm && !user.parentalConsent) {
        onUserUpdated({ ...user, parentalConsent: true });
      }
      const targets = platforms
        .map((p) => {
          const h = connections.find((c) => c.platform === p)?.handle;
          const label = p === 'tiktok' ? 'TikTok' : 'Instagram';
          return h ? `${label} (${h})` : label;
        })
        .join(' и ');
      setPublishResult(
        res.post.status === 'scheduled'
          ? `Публикация запланирована в ${targets} на ${new Date(res.post.scheduledAt).toLocaleString('ru-RU')}`
          : `Опубликовано в ${targets}`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка публикации');
    } finally {
      setPublishing(false);
    }
  };

  const durationSec = (getProjectDurationMs(state) / 1000).toFixed(1);
  const previewHandle =
    connections.find((c) => platforms.includes(c.platform as PlatformId))?.handle ||
    (creds.tiktok.handle.trim() || creds.instagram.handle.trim()) ||
    `@${user.firstName?.toLowerCase() || 'kinetix_creator'}`;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full max-w-3xl bg-[#121212] border border-white/10 rounded-t-3xl sm:rounded-3xl max-h-[92vh] overflow-y-auto p-5 sm:p-7 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 p-1 rounded-xl bg-[#1C1C1E]">
            <button
              type="button"
              onClick={() => setTab('export')}
              className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
                tab === 'export' ? 'bg-[#00E5FF] text-black' : 'text-zinc-400 hover:text-white'
              }`}
            >
              {dict.exportBtn} · MP4
            </button>
            <button
              type="button"
              onClick={() => setTab('publish')}
              className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
                tab === 'publish' ? 'bg-[#FF2D6F] text-white' : 'text-zinc-400 hover:text-white'
              }`}
            >
              {dict.publishBtn}
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-xl bg-[#1C1C1E] flex items-center justify-center text-zinc-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {tab === 'export' ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[#1C1C1E] p-4 rounded-2xl border border-white/8">
              <div>
                <div className="text-[11px] text-zinc-400 mb-1.5">Разрешение</div>
                <div className="grid grid-cols-2 gap-1.5">
                  {(['720p', '1080p', '2k', '4k'] as Resolution[]).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setResolution(r)}
                      className={`py-2 rounded-lg text-xs font-mono-tabular uppercase ${
                        resolution === r
                          ? 'bg-[#00E5FF] text-black font-bold'
                          : 'bg-black/40 text-zinc-300'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-[11px] text-zinc-400 mb-1.5">Кадров/с (FPS)</div>
                <div className="grid grid-cols-3 gap-1">
                  {([24, 30, 60] as FpsOption[]).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setFps(f)}
                      className={`py-2 rounded-lg text-xs font-mono-tabular ${
                        fps === f
                          ? 'bg-[#00E5FF] text-black font-bold'
                          : 'bg-black/40 text-zinc-300'
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              <div className="col-span-2">
                <div className="text-[11px] text-zinc-400 mb-1.5">Качество и битрейт (MP4)</div>
                <div className="grid grid-cols-4 gap-1.5">
                  {[
                    { id: 'low', label: 'Эконом' },
                    { id: 'medium', label: 'Среднее' },
                    { id: 'high', label: 'Высокое' },
                    { id: 'ultra', label: 'Ультра' },
                  ].map((q) => (
                    <button
                      key={q.id}
                      type="button"
                      onClick={() => setQuality(q.id as 'low' | 'medium' | 'high' | 'ultra')}
                      className={`py-2 rounded-lg text-xs ${
                        quality === q.id
                          ? 'bg-[#00E5FF] text-black font-bold'
                          : 'bg-black/40 text-zinc-300'
                      }`}
                    >
                      {q.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-zinc-400 px-1">
              <span>
                Формат: <strong className="text-white">MP4 (H.264)</strong> · {state.aspectRatio} ·{' '}
                {durationSec}с
              </span>
              {cloudSaved && (
                <span className="flex items-center gap-1 text-[#00E5FF]">
                  <Cloud className="w-3.5 h-3.5" />
                  <span>Проект сохранён в облаке</span>
                </span>
              )}
            </div>

            {exporting && (
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-300">Рендеринг и кодирование FFmpeg MP4...</span>
                  <span className="font-mono-tabular text-[#00E5FF]">{progress}%</span>
                </div>
                <div className="h-2 bg-[#1C1C1E] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#00E5FF] transition-all duration-200"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}

            {exportedUrl && (
              <div className="bg-[#1C1C1E] border border-[#00E5FF]/40 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-semibold text-white">
                    <Check className="w-4 h-4 text-[#00E5FF]" />
                    <span>MP4 готов ({exportSizeMb} МБ)</span>
                  </div>
                  <a
                    href={exportedUrl}
                    download={`${state.title || 'kinetix'}.mp4`}
                    className="px-4 py-2 rounded-xl bg-[#00E5FF] text-black text-xs font-semibold flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Сохранить в галерею</span>
                  </a>
                </div>
                <button
                  type="button"
                  onClick={() => setTab('publish')}
                  className="w-full py-3 rounded-xl bg-[#FF2D6F] text-white text-xs font-semibold flex items-center justify-center gap-2"
                >
                  <Share2 className="w-4 h-4" />
                  <span>{dict.publishBtn} в TikTok / Instagram</span>
                </button>
              </div>
            )}

            {!exportedUrl && (
              <button
                type="button"
                disabled={exporting}
                onClick={handleStartExport}
                className="w-full py-3.5 rounded-2xl bg-[#00E5FF] text-black font-semibold text-sm hover:bg-[#33ECFF] disabled:opacity-50"
              >
                {exporting ? 'Экспорт...' : 'Начать экспорт MP4'}
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
            <div className="md:col-span-7 space-y-4">
              {/* Platforms & User Account + Password Entry */}
              <div className="space-y-2.5">
                <div className="text-xs text-zinc-400">
                  Платформы и вход в ваш аккаунт
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  {(['tiktok', 'instagram'] as const).map((plat) => {
                    const selected = platforms.includes(plat);
                    const conn = connections.find((c) => c.platform === plat);
                    const isEditing = editingLoginFor === plat;
                    return (
                      <div
                        key={plat}
                        className={`p-3 rounded-2xl border space-y-2 transition-colors ${
                          selected
                            ? 'bg-[#1C1C1E] border-[#00E5FF]'
                            : 'bg-[#1C1C1E] border-white/10'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => togglePlatform(plat)}
                          className="w-full flex items-center justify-between text-xs font-semibold text-white"
                        >
                          <span className="flex items-center gap-2">
                            {plat === 'instagram' ? (
                              <Instagram className="w-4 h-4 text-[#FF2D6F]" />
                            ) : (
                              <Music2 className="w-4 h-4 text-[#00E5FF]" />
                            )}
                            <span>{plat === 'tiktok' ? 'TikTok' : 'Instagram'}</span>
                          </span>
                          {selected && <Check className="w-4 h-4 text-[#00E5FF]" />}
                        </button>

                        {conn ? (
                          <div className="flex items-center justify-between gap-1.5 pt-0.5">
                            <span className="text-[11px] text-[#00E5FF] font-medium truncate flex items-center gap-1">
                              <UserCheck className="w-3 h-3 shrink-0" />
                              <span className="truncate">{conn.handle}</span>
                            </span>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => setEditingLoginFor(isEditing ? null : plat)}
                                className="text-[10px] text-zinc-400 hover:text-white underline"
                              >
                                Сменить
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleDisconnectPlatform(plat)}
                                className="p-1 text-zinc-500 hover:text-[#FF2D6F]"
                                title="Выйти из аккаунта"
                              >
                                <LogOut className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              if (!selected) togglePlatform(plat);
                              setEditingLoginFor(isEditing ? null : plat);
                            }}
                            className={`w-full py-1.5 rounded-lg text-[11px] font-medium transition-colors ${
                              isEditing
                                ? 'bg-[#00E5FF]/20 text-[#00E5FF] border border-[#00E5FF]/40'
                                : 'bg-white/10 text-white hover:bg-white/15'
                            }`}
                          >
                            Ввести аккаунт и пароль
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Manual Account & Password Card for Selected Platform */}
                {editingLoginFor && (
                  <div className="bg-[#1C1C1E] border border-[#00E5FF]/35 rounded-2xl p-3.5 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                        <KeyRound className="w-3.5 h-3.5 text-[#00E5FF]" />
                        <span>
                          Вход в {editingLoginFor === 'tiktok' ? 'TikTok' : 'Instagram'}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setEditingLoginFor(null)}
                        className="text-[11px] text-zinc-400 hover:text-white"
                      >
                        Скрыть
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={creds[editingLoginFor].handle}
                        onChange={(e) =>
                          setCreds((prev) => ({
                            ...prev,
                            [editingLoginFor]: {
                              ...prev[editingLoginFor],
                              handle: e.target.value,
                            },
                          }))
                        }
                        placeholder={
                          editingLoginFor === 'tiktok'
                            ? '@ник, телефон или почта TikTok'
                            : '@ник или почта Instagram'
                        }
                        className="h-10 px-3 rounded-xl bg-black/50 border border-white/10 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#00E5FF]"
                      />

                      <div className="relative">
                        <input
                          type={creds[editingLoginFor].showPass ? 'text' : 'password'}
                          value={creds[editingLoginFor].password}
                          onChange={(e) =>
                            setCreds((prev) => ({
                              ...prev,
                              [editingLoginFor]: {
                                ...prev[editingLoginFor],
                                password: e.target.value,
                              },
                            }))
                          }
                          placeholder="Пароль от аккаунта"
                          className="w-full h-10 pl-3 pr-9 rounded-xl bg-black/50 border border-white/10 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#00E5FF]"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setCreds((prev) => ({
                              ...prev,
                              [editingLoginFor]: {
                                ...prev[editingLoginFor],
                                showPass: !prev[editingLoginFor].showPass,
                              },
                            }))
                          }
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white"
                          aria-label="Показать пароль"
                        >
                          {creds[editingLoginFor].showPass ? (
                            <EyeOff className="w-3.5 h-3.5" />
                          ) : (
                            <Eye className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={connectingPlatform === editingLoginFor}
                      onClick={() => void handleSubmitPlatformLogin(editingLoginFor)}
                      className="w-full h-9 rounded-xl bg-[#00E5FF] text-black text-xs font-bold hover:bg-[#33ECFF] disabled:opacity-50"
                    >
                      {connectingPlatform === editingLoginFor
                        ? 'Подключение...'
                        : `Войти в ${editingLoginFor === 'tiktok' ? 'TikTok' : 'Instagram'}`}
                    </button>
                  </div>
                )}
              </div>

              {/* Caption & AI Hashtags */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-400">Описание публикации</span>
                  <button
                    type="button"
                    disabled={aiSuggesting}
                    onClick={handleSuggestHashtags}
                    className="text-xs text-[#00E5FF] flex items-center gap-1 hover:underline"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>{aiSuggesting ? 'Подбор...' : 'ИИ-хештеги и текст'}</span>
                  </button>
                </div>
                <textarea
                  rows={3}
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="Напишите описание к ролику..."
                  className="w-full p-3 rounded-xl bg-[#1C1C1E] border border-white/10 text-xs text-white resize-none"
                />
                <input
                  type="text"
                  value={hashtags.join(' ')}
                  onChange={(e) =>
                    setHashtags(
                      e.target.value
                        .split(/\s+/)
                        .filter(Boolean)
                        .map((h) => (h.startsWith('#') ? h : `#${h}`)),
                    )
                  }
                  placeholder="#kinetix #reels #tiktok"
                  className="w-full px-3 py-2.5 rounded-xl bg-[#1C1C1E] border border-white/10 text-xs text-[#00E5FF]"
                />
              </div>

              {/* Timing */}
              <div className="space-y-2">
                <div className="text-xs text-zinc-400">Время публикации</div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setScheduleMode('now')}
                    className={`flex-1 py-2.5 rounded-xl text-xs font-medium border ${
                      scheduleMode === 'now'
                        ? 'bg-[#00E5FF]/15 border-[#00E5FF] text-white'
                        : 'bg-[#1C1C1E] border-white/10 text-zinc-400'
                    }`}
                  >
                    Сразу
                  </button>
                  <button
                    type="button"
                    onClick={() => setScheduleMode('later')}
                    className={`flex-1 py-2.5 rounded-xl text-xs font-medium border flex items-center justify-center gap-1.5 ${
                      scheduleMode === 'later'
                        ? 'bg-[#00E5FF]/15 border-[#00E5FF] text-white'
                        : 'bg-[#1C1C1E] border-white/10 text-zinc-400'
                    }`}
                  >
                    <Calendar className="w-3.5 h-3.5" />
                    <span>По расписанию</span>
                  </button>
                </div>
                {scheduleMode === 'later' && (
                  <input
                    type="datetime-local"
                    value={scheduledDateTime}
                    onChange={(e) => setScheduledDateTime(e.target.value)}
                    className="w-full h-11 px-3 rounded-xl bg-[#1C1C1E] border border-white/10 text-xs text-white"
                  />
                )}
              </div>

              {userAge < 18 && (
                <label className="flex items-center gap-2.5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={parentalConfirm}
                    onChange={(e) => setParentalConfirm(e.target.checked)}
                    className="w-4 h-4 accent-[#00E5FF]"
                  />
                  <span>{dict.parentalConsentLabel}</span>
                </label>
              )}

              {publishResult ? (
                <div className="p-4 rounded-2xl bg-[#00E5FF]/15 border border-[#00E5FF]/40 text-xs text-white flex items-center gap-2">
                  <Check className="w-4 h-4 text-[#00E5FF]" />
                  <span>{publishResult}</span>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={publishing}
                  onClick={handlePublishNow}
                  className="w-full py-3.5 rounded-2xl bg-[#FF2D6F] text-white font-semibold text-sm hover:bg-[#FF4983] disabled:opacity-50"
                >
                  {publishing ? 'Публикация...' : dict.publishNow}
                </button>
              )}
            </div>

            {/* Live Social Feed Preview */}
            <div className="md:col-span-5 bg-[#1C1C1E] border border-white/10 rounded-2xl p-4 flex flex-col justify-between">
              <div className="text-xs text-zinc-400 mb-3">Предпросмотр публикации</div>
              <div className="relative aspect-[9/16] max-h-80 mx-auto w-full max-w-[200px] rounded-2xl overflow-hidden bg-black border border-white/10">
                {state.clips[0]?.src && state.clips[0].type === 'image' ? (
                  <img
                    src={state.clips[0].src}
                    alt="Preview"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-[#09121e] to-[#1e1022] flex items-center justify-center text-xs text-zinc-500">
                    {state.aspectRatio} · {durationSec}с
                  </div>
                )}
                <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/90 via-black/50 to-transparent text-left">
                  <div className="text-[11px] font-semibold text-white truncate">
                    {previewHandle.startsWith('@') ? previewHandle : `@${previewHandle}`}
                  </div>
                  <p className="text-[11px] text-zinc-200 line-clamp-2 mt-0.5">{caption}</p>
                  <p className="text-[10px] text-[#00E5FF] truncate mt-0.5">
                    {hashtags.join(' ')}
                  </p>
                </div>
              </div>
            </div>
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
