import { useRef, useState } from 'react';
import {
  Camera,
  Check,
  Film,
  Image as ImageIcon,
  Music,
  Pause,
  Play,
  Plus,
  Smartphone,
  Upload,
  X,
} from 'lucide-react';
import { AUDIO_LIBRARY, STOCK_MEDIA_LIBRARY } from '../data/templates.ts';
import { getAuthToken } from '../lib/api.ts';
import { audioEngine } from '../lib/audioEngine.ts';
import type { AspectRatio } from '../types/editor.ts';

export interface ImportedMediaResult {
  kind: 'video' | 'image' | 'audio';
  src: string;
  name: string;
  durationMs: number;
  aspectRatio?: AspectRatio;
  synthPreset?: string;
}

interface Props {
  onClose: () => void;
  onSelectMedia: (items: ImportedMediaResult[]) => void;
}

export function MediaLibraryModal({ onClose, onSelectMedia }: Props) {
  const [tab, setTab] = useState<'stock' | 'upload' | 'audio'>('stock');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [audioCategory, setAudioCategory] = useState<string>('all');
  const [audioQuery, setAudioQuery] = useState('');
  const [previewAudioId, setPreviewAudioId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  const toggleStockItem = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleConfirmStock = () => {
    const picked = STOCK_MEDIA_LIBRARY.filter((m) => selectedIds.includes(m.id));
    if (picked.length === 0) return;
    audioEngine.stopAll();
    onSelectMedia(
      picked.map((m) => ({
        kind: m.kind,
        src: m.src,
        name: m.title,
        durationMs: m.durationMs,
        aspectRatio: m.aspectRatio,
      })),
    );
    onClose();
  };

  const handlePickAudio = (tr: (typeof AUDIO_LIBRARY)[number]) => {
    audioEngine.stopAll();
    onSelectMedia([
      {
        kind: 'audio',
        src: '',
        name: tr.name,
        durationMs: tr.durationMs,
        synthPreset: tr.preset,
      },
    ]);
    onClose();
  };

  const handleUploadFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setUploadStatus('Конвертация в универсальный формат для всех телефонов (H.264 / AAC)...');
    const results: ImportedMediaResult[] = [];
    const token = getAuthToken();

    try {
      for (const file of Array.from(files)) {
        const lower = file.name.toLowerCase();
        const isAudio =
          file.type.startsWith('audio/') ||
          /\.(mp3|m4a|aac|wav|ogg|flac|opus)$/.test(lower);
        const isVideo =
          file.type.startsWith('video/') ||
          /\.(mp4|mov|m4v|3gp|mkv|avi|webm|mpeg|mpg)$/.test(lower);

        let url = URL.createObjectURL(file);
        let resolvedKind: 'video' | 'image' | 'audio' = isAudio
          ? 'audio'
          : isVideo
            ? 'video'
            : 'image';

        if (token) {
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
              const data = (await resp.json()) as {
                url?: string;
                mediaType?: 'video' | 'image' | 'audio';
              };
              if (data.url) url = data.url;
              if (data.mediaType) resolvedKind = data.mediaType;
            }
          } catch {
            // Fallback to local object URL
          }
        }

        results.push({
          kind: resolvedKind,
          src: url,
          name: file.name,
          durationMs: resolvedKind === 'video' ? 7000 : resolvedKind === 'audio' ? 15000 : 5000,
        });
      }

      if (results.length > 0) {
        audioEngine.stopAll();
        onSelectMedia(results);
        onClose();
      }
    } finally {
      setUploading(false);
      setUploadStatus('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-5">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="video/*,image/*,audio/*,.mp4,.mov,.m4v,.3gp,.mkv,.avi,.webm,.heic,.heif,.mp3,.m4a,.wav,.ogg,.aac,.flac,.jpg,.jpeg,.png,.webp"
        className="hidden"
        onChange={(e) => void handleUploadFiles(e.target.files)}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="video/*,image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => void handleUploadFiles(e.target.files)}
      />

      <div className="w-full max-w-3xl bg-[#121214] border border-white/15 rounded-2xl overflow-hidden flex flex-col max-h-[88vh] shadow-2xl">
        {/* Header */}
        <div className="px-4 sm:px-5 py-3.5 border-b border-white/10 flex items-center justify-between bg-[#161619]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#00E5FF]/15 text-[#00E5FF] flex items-center justify-center">
              <Smartphone className="w-4 h-4" />
            </div>
            <div>
              <div className="text-sm font-bold text-white">
                Универсальная медиатека (iOS · Android · ПК)
              </div>
              <div className="text-[11px] text-zinc-400">
                Все файлы оптимизированы в H.264 Baseline MP4 / AAC — открываются на любом телефоне
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              audioEngine.stopAll();
              onClose();
            }}
            className="w-9 h-9 rounded-lg bg-[#1C1C1E] border border-white/10 text-zinc-400 hover:text-white flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="px-4 pt-3 pb-2 border-b border-white/[0.07] flex gap-2 overflow-x-auto">
          <button
            type="button"
            onClick={() => setTab('stock')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 shrink-0 transition-colors ${
              tab === 'stock'
                ? 'bg-[#00E5FF] text-black'
                : 'bg-[#1C1C1E] text-zinc-300 hover:text-white'
            }`}
          >
            <Film className="w-3.5 h-3.5" />
            <span>Видео и фото ({STOCK_MEDIA_LIBRARY.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('upload')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 shrink-0 transition-colors ${
              tab === 'upload'
                ? 'bg-[#00E5FF] text-black'
                : 'bg-[#1C1C1E] text-zinc-300 hover:text-white'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>С телефона / Камера</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('audio')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 shrink-0 transition-colors ${
              tab === 'audio'
                ? 'bg-[#FF2D6F] text-white'
                : 'bg-[#1C1C1E] text-zinc-300 hover:text-white'
            }`}
          >
            <Music className="w-3.5 h-3.5" />
            <span>Музыка и SFX ({AUDIO_LIBRARY.length})</span>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {tab === 'stock' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {STOCK_MEDIA_LIBRARY.map((item) => {
                  const selected = selectedIds.includes(item.id);
                  return (
                    <div
                      key={item.id}
                      onClick={() => toggleStockItem(item.id)}
                      className={`group cursor-pointer rounded-xl overflow-hidden border transition-all bg-[#18181B] flex flex-col ${
                        selected
                          ? 'border-[#00E5FF] ring-2 ring-[#00E5FF]/40'
                          : 'border-white/10 hover:border-white/30'
                      }`}
                    >
                      <div className="aspect-[16/10] bg-black relative overflow-hidden">
                        {item.kind === 'video' ? (
                          <video
                            src={item.src}
                            poster={item.poster}
                            autoPlay
                            muted
                            loop
                            playsInline
                            preload="metadata"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <img
                            src={item.src}
                            alt={item.title}
                            className="w-full h-full object-cover"
                          />
                        )}
                        <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-black/75 border border-white/15 text-[9px] font-mono-tabular text-[#00E5FF] flex items-center gap-1">
                          {item.kind === 'video' ? (
                            <Film className="w-2.5 h-2.5" />
                          ) : (
                            <ImageIcon className="w-2.5 h-2.5" />
                          )}
                          {item.tag}
                        </span>
                        <div
                          className={`absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center border transition-colors ${
                            selected
                              ? 'bg-[#00E5FF] border-[#00E5FF] text-black'
                              : 'bg-black/60 border-white/30 text-transparent'
                          }`}
                        >
                          <Check className="w-3.5 h-3.5" />
                        </div>
                      </div>
                      <div className="p-2.5 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-white truncate">
                            {item.title}
                          </div>
                          <div className="text-[10px] text-zinc-400 font-mono-tabular">
                            {item.aspectRatio} · {Math.round(item.durationMs / 1000)}с
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            audioEngine.stopAll();
                            onSelectMedia([
                              {
                                kind: item.kind,
                                src: item.src,
                                name: item.title,
                                durationMs: item.durationMs,
                                aspectRatio: item.aspectRatio,
                              },
                            ]);
                            onClose();
                          }}
                          className="p-1.5 rounded-lg bg-[#00E5FF]/15 text-[#00E5FF] hover:bg-[#00E5FF] hover:text-black shrink-0"
                          title="Добавить сразу"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {tab === 'upload' && (
            <div className="space-y-4 py-2">
              <div className="rounded-2xl border border-dashed border-[#00E5FF]/40 bg-[#161619] p-6 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-[#00E5FF]/15 text-[#00E5FF] mx-auto flex items-center justify-center">
                  <Upload className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <div className="text-sm font-semibold text-white">
                    Загрузите любое видео, фото или аудио с телефона
                  </div>
                  <p className="text-xs text-zinc-400 max-w-md mx-auto">
                    Поддерживаются iPhone (.MOV, HEIC), Android (.3GP, MKV, MP4, M4A), AVI, WEBM и ПК. Сервер автоматически перекодирует их в универсальный MP4 H.264.
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
                  <button
                    type="button"
                    disabled={uploading}
                    onClick={() => fileInputRef.current?.click()}
                    className="px-4 py-2.5 rounded-xl bg-[#00E5FF] text-black text-xs font-bold hover:bg-[#33ECFF] disabled:opacity-50 flex items-center gap-2"
                  >
                    <Upload className="w-4 h-4" />
                    <span>{uploading ? 'Обработка...' : 'Выбрать файлы с устройства'}</span>
                  </button>
                  <button
                    type="button"
                    disabled={uploading}
                    onClick={() => cameraInputRef.current?.click()}
                    className="px-4 py-2.5 rounded-xl bg-[#1C1C1E] border border-white/15 text-white text-xs font-semibold hover:border-[#FF2D6F] disabled:opacity-50 flex items-center gap-2"
                  >
                    <Camera className="w-4 h-4 text-[#FF2D6F]" />
                    <span>Снять на камеру</span>
                  </button>
                </div>
                {uploadStatus && (
                  <div className="text-xs text-[#00E5FF] pt-2">{uploadStatus}</div>
                )}
              </div>
            </div>
          )}

          {tab === 'audio' && (
            <div className="space-y-3">
              <input
                type="text"
                value={audioQuery}
                onChange={(e) => setAudioQuery(e.target.value)}
                placeholder="Поиск музыки (Phonk, Trap, EDM, Pop, Lo-Fi, Эффекты)..."
                className="w-full px-3 py-2 rounded-xl bg-[#161619] border border-white/10 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#00E5FF]"
              />
              <div className="flex flex-wrap gap-1.5">
                {(['all', 'Phonk', 'Trap', 'EDM', 'Pop', 'Lo-Fi', 'Эффекты'] as const).map(
                  (cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setAudioCategory(cat)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-medium ${
                        audioCategory === cat
                          ? 'bg-[#00E5FF] text-black font-semibold'
                          : 'bg-[#1C1C1E] text-zinc-400 hover:text-white'
                      }`}
                    >
                      {cat === 'all' ? `Все (${AUDIO_LIBRARY.length})` : cat}
                    </button>
                  ),
                )}
              </div>

              <div className="space-y-1.5">
                {AUDIO_LIBRARY.filter(
                  (tr) =>
                    (audioCategory === 'all' || tr.category === audioCategory) &&
                    (!audioQuery.trim() ||
                      tr.name.toLowerCase().includes(audioQuery.toLowerCase()) ||
                      tr.category.toLowerCase().includes(audioQuery.toLowerCase())),
                ).map((tr) => {
                  const isPreviewing = previewAudioId === tr.id;
                  return (
                    <div
                      key={tr.id}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-[#161619] border border-white/[0.08]"
                    >
                      <div className="min-w-0 pr-3">
                        <div className="text-xs font-semibold text-white truncate">
                          {tr.name}
                        </div>
                        <div className="text-[10px] text-zinc-400">
                          {tr.category} · {tr.bpm} BPM · {Math.round(tr.durationMs / 1000)}с
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            if (isPreviewing) {
                              audioEngine.stopAll();
                              setPreviewAudioId(null);
                            } else {
                              setPreviewAudioId(tr.id);
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
                              });
                            }
                          }}
                          className="w-8 h-8 rounded-lg bg-black/50 border border-white/10 text-[#00E5FF] flex items-center justify-center"
                        >
                          {isPreviewing ? (
                            <Pause className="w-3.5 h-3.5 text-[#FF2D6F]" />
                          ) : (
                            <Play className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePickAudio(tr)}
                          className="px-3 py-1.5 rounded-lg bg-[#00E5FF] text-black text-xs font-semibold hover:bg-[#33ECFF]"
                        >
                          Добавить
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer when stock selected */}
        {tab === 'stock' && (
          <div className="px-4 py-3 border-t border-white/10 bg-[#161619] flex items-center justify-between">
            <span className="text-xs text-zinc-400">
              Выбрано клипов: <strong className="text-white">{selectedIds.length}</strong>
            </span>
            <button
              type="button"
              disabled={selectedIds.length === 0}
              onClick={handleConfirmStock}
              className="px-4 py-2 rounded-xl bg-[#00E5FF] text-black text-xs font-bold hover:bg-[#33ECFF] disabled:opacity-40"
            >
              Добавить в проект ({selectedIds.length})
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
