import { useMemo, useRef, useState } from 'react';
import {
  AudioLines,
  Copy,
  Flag,
  Magnet,
  Maximize,
  Pause,
  Rewind,
  Scissors,
  Sparkles,
  Trash2,
  VolumeX,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { ProjectState } from '../types/editor.ts';

export type SelectedItemRef =
  | { kind: 'clip'; id: string }
  | { kind: 'text'; id: string }
  | { kind: 'sticker'; id: string }
  | { kind: 'audio'; id: string }
  | { kind: 'effect'; id: string }
  | null;

interface Props {
  state: ProjectState;
  currentTimeMs: number;
  totalDurationMs: number;
  selected: SelectedItemRef;
  onSelect: (sel: SelectedItemRef) => void;
  onSeek: (ms: number) => void;
  onUpdateItemTiming: (
    kind: 'clip' | 'text' | 'sticker' | 'audio' | 'effect',
    id: string,
    startMs: number,
    durationMs: number,
  ) => void;
  onAddMarker: () => void;
  onSplitClip?: () => void;
  onDuplicateClip?: () => void;
  onFreezeClip?: () => void;
  onReverseClip?: () => void;
  onDetachAudio?: () => void;
  onDeleteSelected?: () => void;
  onSelectTransition?: (clipId: string) => void;
}

function buildWaveformBars(seedId: string, count: number): number[] {
  let seed = 0;
  for (let i = 0; i < seedId.length; i++) {
    seed = (seed * 31 + seedId.charCodeAt(i)) % 997;
  }
  const bars: number[] = [];
  for (let i = 0; i < count; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const h = 25 + (seed % 70);
    bars.push(h);
  }
  return bars;
}

export function EditorTimeline({
  state,
  currentTimeMs,
  totalDurationMs,
  selected,
  onSelect,
  onSeek,
  onUpdateItemTiming,
  onAddMarker,
  onSplitClip,
  onDuplicateClip,
  onFreezeClip,
  onReverseClip,
  onDetachAudio,
  onDeleteSelected,
  onSelectTransition,
}: Props) {
  const [pxPerSec, setPxPerSec] = useState(64);
  const [magnetSnap, setMagnetSnap] = useState(true);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const pinchDistRef = useRef<number | null>(null);

  const GUTTER_W = 52;
  const timelineWidth = Math.max(640, ((totalDurationMs + 4000) / 1000) * pxPerSec);
  const playheadX = (currentTimeMs / 1000) * pxPerSec;

  const snapTime = (rawMs: number, ignoreId?: string): number => {
    const clamped = Math.max(0, Math.round(rawMs));
    if (!magnetSnap) return clamped;
    const snapPoints: number[] = [0, currentTimeMs];
    state.clips.forEach((c) => {
      if (c.id !== ignoreId) {
        snapPoints.push(c.startMs, c.startMs + c.durationMs);
      }
    });
    state.markers.forEach((m) => snapPoints.push(m.timeMs));

    const thresholdMs = (12 / pxPerSec) * 1000;
    for (const pt of snapPoints) {
      if (Math.abs(clamped - pt) <= thresholdMs) return pt;
    }
    return clamped;
  };

  const handleRulerPointer = (clientX: number) => {
    const el = scrollRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = clientX - rect.left + el.scrollLeft - GUTTER_W;
    const ms = Math.max(0, Math.min(totalDurationMs, (x / pxPerSec) * 1000));
    onSeek(ms);
  };

  const startScrubPlayhead = (e: React.PointerEvent) => {
    e.stopPropagation();
    handleRulerPointer(e.clientX);
    const onMove = (ev: PointerEvent) => handleRulerPointer(ev.clientX);
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const startDragClip = (
    e: React.PointerEvent,
    kind: 'clip' | 'text' | 'sticker' | 'audio' | 'effect',
    id: string,
    origStartMs: number,
    origDurationMs: number,
    mode: 'move' | 'trim-right' | 'trim-left',
  ) => {
    e.stopPropagation();
    onSelect({ kind, id });
    const startX = e.clientX;

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const dMs = (dx / pxPerSec) * 1000;
      if (mode === 'move') {
        const nextStart = snapTime(origStartMs + dMs, id);
        onUpdateItemTiming(kind, id, nextStart, origDurationMs);
      } else if (mode === 'trim-right') {
        const nextDur = Math.max(350, Math.round(origDurationMs + dMs));
        onUpdateItemTiming(kind, id, origStartMs, nextDur);
      } else {
        const maxShift = origDurationMs - 350;
        const shift = Math.min(maxShift, Math.max(-origStartMs, dMs));
        onUpdateItemTiming(
          kind,
          id,
          Math.max(0, Math.round(origStartMs + shift)),
          Math.max(350, Math.round(origDurationMs - shift)),
        );
      }
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      if (pinchDistRef.current !== null) {
        const delta = dist - pinchDistRef.current;
        setPxPerSec((prev) => Math.max(24, Math.min(180, prev + delta * 0.25)));
      }
      pinchDistRef.current = dist;
    }
  };

  const handleTouchEnd = () => {
    pinchDistRef.current = null;
  };

  const handleFitZoom = () => {
    const containerW = scrollRef.current?.clientWidth || 720;
    const usable = Math.max(300, containerW - GUTTER_W - 40);
    const sec = Math.max(4, totalDurationMs / 1000);
    setPxPerSec(Math.max(24, Math.min(160, Math.round(usable / sec))));
  };

  const secMarks = [];
  const totalSec = Math.ceil((totalDurationMs + 4000) / 1000);
  for (let s = 0; s <= totalSec; s++) {
    secMarks.push(s);
  }

  const v1Clips = useMemo(
    () => state.clips.filter((c) => c.track === 'V1').slice().sort((a, b) => a.startMs - b.startMs),
    [state.clips],
  );
  const v2Clips = state.clips.filter((c) => c.track === 'V2');
  const a1Clips = state.audioClips.filter((a) => a.track === 'A1');
  const a2Clips = state.audioClips.filter((a) => a.track === 'A2');

  const selectedClip =
    selected?.kind === 'clip'
      ? state.clips.find((c) => c.id === selected.id)
      : state.clips.find(
          (c) => currentTimeMs >= c.startMs && currentTimeMs <= c.startMs + c.durationMs,
        );

  return (
    <div
      className="bg-[#0B0B0D] border-t border-white/10 flex flex-col select-none shrink-0"
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* CapCut Quick Action Toolbar above tracks */}
      <div className="h-10 px-2.5 sm:px-4 border-b border-white/[0.07] bg-[#121215] flex items-center justify-between gap-2 text-[11px]">
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
          {onSplitClip && (
            <button
              type="button"
              onClick={onSplitClip}
              disabled={!selectedClip}
              className="h-7 px-2 rounded-md bg-[#1C1C20] hover:bg-[#26262C] text-zinc-200 disabled:opacity-35 flex items-center gap-1 shrink-0 transition-colors"
              title="Разделить клип в позиции ползунка"
            >
              <Scissors className="w-3.5 h-3.5 text-[#00E5FF]" />
              <span className="hidden sm:inline">Разделить</span>
            </button>
          )}
          {onDuplicateClip && (
            <button
              type="button"
              onClick={onDuplicateClip}
              disabled={!selectedClip}
              className="h-7 px-2 rounded-md bg-[#1C1C20] hover:bg-[#26262C] text-zinc-300 disabled:opacity-35 flex items-center gap-1 shrink-0 transition-colors"
              title="Дублировать клип"
            >
              <Copy className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Копия</span>
            </button>
          )}
          {onFreezeClip && (
            <button
              type="button"
              onClick={onFreezeClip}
              disabled={!selectedClip}
              className="h-7 px-2 rounded-md bg-[#1C1C20] hover:bg-[#26262C] text-zinc-300 disabled:opacity-35 flex items-center gap-1 shrink-0 transition-colors"
              title="Стоп-кадр"
            >
              <Pause className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Стоп-кадр</span>
            </button>
          )}
          {onReverseClip && (
            <button
              type="button"
              onClick={onReverseClip}
              disabled={!selectedClip}
              className={`h-7 px-2 rounded-md flex items-center gap-1 shrink-0 transition-colors ${
                selectedClip?.reverse
                  ? 'bg-[#00E5FF]/20 text-[#00E5FF]'
                  : 'bg-[#1C1C20] hover:bg-[#26262C] text-zinc-300 disabled:opacity-35'
              }`}
              title="Реверс клипа"
            >
              <Rewind className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">Реверс</span>
            </button>
          )}
          {onDetachAudio && (
            <button
              type="button"
              onClick={onDetachAudio}
              disabled={!selectedClip}
              className="h-7 px-2 rounded-md bg-[#1C1C20] hover:bg-[#26262C] text-zinc-300 disabled:opacity-35 flex items-center gap-1 shrink-0 transition-colors"
              title="Отделить звук"
            >
              <AudioLines className="w-3.5 h-3.5" />
              <span className="hidden xl:inline">Отд. звук</span>
            </button>
          )}
          {onDeleteSelected && (
            <button
              type="button"
              onClick={onDeleteSelected}
              disabled={!selected}
              className="h-7 px-2 rounded-md bg-[#1C1C20] hover:bg-[#FF2D6F]/20 text-zinc-300 hover:text-[#FF7DA6] disabled:opacity-30 flex items-center gap-1 shrink-0 transition-colors"
              title="Удалить выбранный элемент"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setMagnetSnap((v) => !v)}
            className={`h-7 px-2 rounded-md flex items-center gap-1 transition-colors ${
              magnetSnap
                ? 'bg-[#00E5FF]/15 text-[#00E5FF]'
                : 'bg-[#1C1C20] text-zinc-400'
            }`}
            title="Магнитная привязка к краям"
          >
            <Magnet className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Магнит</span>
          </button>

          <button
            type="button"
            onClick={onAddMarker}
            className="h-7 px-2 rounded-md bg-[#1C1C20] hover:bg-[#26262C] text-zinc-300 hover:text-white flex items-center gap-1"
            title="Добавить маркер ритма"
          >
            <Flag className="w-3.5 h-3.5 text-[#FF2D6F]" />
            <span className="hidden md:inline">Маркер</span>
          </button>

          <button
            type="button"
            onClick={handleFitZoom}
            className="h-7 w-7 rounded-md bg-[#1C1C20] hover:bg-[#26262C] text-zinc-400 hover:text-white flex items-center justify-center"
            title="Подогнать таймлайн по ширине"
          >
            <Maximize className="w-3 h-3" />
          </button>

          <div className="hidden sm:flex items-center gap-1 pl-1">
            <button
              type="button"
              onClick={() => setPxPerSec((p) => Math.max(24, p - 12))}
              aria-label="Отдалить таймлайн"
              className="p-1 text-zinc-400 hover:text-white"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <input
              type="range"
              min={24}
              max={180}
              value={pxPerSec}
              onChange={(e) => setPxPerSec(Number(e.target.value))}
              className="w-16 md:w-24 accent-[#00E5FF]"
            />
            <button
              type="button"
              onClick={() => setPxPerSec((p) => Math.min(180, p + 12))}
              aria-label="Приблизить таймлайн"
              className="p-1 text-zinc-400 hover:text-white"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Scrollable Multi-Track Canvas */}
      <div
        ref={scrollRef}
        className="overflow-x-auto overflow-y-auto max-h-48 sm:max-h-56 relative"
      >
        <div style={{ width: timelineWidth + GUTTER_W }} className="relative min-h-[168px]">
          {/* Time Ruler */}
          <div
            onPointerDown={startScrubPlayhead}
            className="h-6 border-b border-white/[0.08] flex items-end sticky top-0 z-20 bg-[#0B0B0D] cursor-pointer"
          >
            <div
              style={{ width: GUTTER_W }}
              className="shrink-0 text-[9px] font-mono-tabular text-zinc-500 pl-2 pb-1 bg-[#0B0B0D] sticky left-0 z-30 border-r border-white/[0.07]"
            >
              TIMELINE
            </div>
            <div className="relative flex-1 h-full">
              {secMarks.map((s) => (
                <div
                  key={s}
                  style={{ left: s * pxPerSec }}
                  className="absolute bottom-0 border-l border-white/20 h-3 pl-1 text-[9px] font-mono-tabular text-zinc-400"
                >
                  {s}s
                  {pxPerSec >= 55 && (
                    <span
                      style={{ left: pxPerSec * 0.5 }}
                      className="absolute bottom-0 border-l border-white/10 h-1.5"
                    />
                  )}
                </div>
              ))}
              {state.markers.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSeek(m.timeMs);
                  }}
                  style={{ left: (m.timeMs / 1000) * pxPerSec, backgroundColor: m.color || '#FF2D6F' }}
                  title={m.label}
                  className="absolute top-0.5 -translate-x-1/2 w-2.5 h-2.5 rounded-full border border-white/80 shadow"
                />
              ))}
            </div>
          </div>

          {/* CapCut Playhead Needle */}
          <div
            style={{ left: playheadX + GUTTER_W }}
            className="absolute top-0 bottom-0 w-[2px] bg-white z-30 pointer-events-none shadow-[0_0_8px_rgba(0,229,255,0.6)]"
          >
            <div
              onPointerDown={startScrubPlayhead}
              className="w-3.5 h-3.5 -ml-[6px] rounded-b-md bg-[#00E5FF] pointer-events-auto cursor-ew-resize flex items-center justify-center shadow"
            >
              <div className="w-1 h-1.5 bg-black/70 rounded-full" />
            </div>
          </div>

          {/* Track Rows */}
          <div className="divide-y divide-white/[0.05] py-1">
            {/* V1: Main Video Filmstrip Track */}
            <TrackRow label="V1" tall gutterW={GUTTER_W}>
              {v1Clips.map((c, idx) => {
                const isSel = selected?.kind === 'clip' && selected.id === c.id;
                const widthPx = Math.max(36, (c.durationMs / 1000) * pxPerSec);
                const leftPx = (c.startMs / 1000) * pxPerSec;
                const hasTransition = c.transitionIn && c.transitionIn !== 'none';
                return (
                  <div key={c.id} className="contents">
                    <div
                      onPointerDown={(e) =>
                        startDragClip(e, 'clip', c.id, c.startMs, c.durationMs, 'move')
                      }
                      style={{ left: leftPx, width: widthPx }}
                      className={`absolute top-1 bottom-1 rounded-md overflow-hidden cursor-grab active:cursor-grabbing flex items-center border-2 transition-shadow ${
                        isSel
                          ? 'border-white shadow-[0_0_0_1px_rgba(0,229,255,0.85)] z-10'
                          : 'border-white/15 bg-[#18181C]'
                      }`}
                    >
                      {/* Visual Filmstrip Tile Background */}
                      {c.src && c.type !== 'video' ? (
                        <div
                          className="absolute inset-0 opacity-65 pointer-events-none"
                          style={{
                            backgroundImage: `url(${c.src})`,
                            backgroundRepeat: 'repeat-x',
                            backgroundSize: 'auto 100%',
                          }}
                        />
                      ) : (
                        <div
                          className="absolute inset-0 opacity-45 pointer-events-none"
                          style={{
                            backgroundImage:
                              'repeating-linear-gradient(90deg, rgba(0,229,255,0.16) 0 42px, rgba(255,255,255,0.06) 42px 44px)',
                          }}
                        />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/15 to-black/65 pointer-events-none" />

                      {/* Trim Left Handle */}
                      <div
                        onPointerDown={(e) =>
                          startDragClip(e, 'clip', c.id, c.startMs, c.durationMs, 'trim-left')
                        }
                        className={`w-2.5 h-full absolute left-0 top-0 cursor-ew-resize z-20 flex items-center justify-center ${
                          isSel ? 'bg-white' : 'bg-white/15 hover:bg-[#00E5FF]'
                        }`}
                      >
                        {isSel && <div className="w-[2px] h-3.5 bg-black rounded-full" />}
                      </div>

                      {/* Clip Metadata & Badges */}
                      <div className="relative z-10 flex items-center gap-1.5 px-3.5 w-full min-w-0">
                        <span className="text-[10px] font-semibold text-white truncate drop-shadow">
                          {c.name}
                        </span>
                        {c.speed !== 1 && (
                          <span className="text-[9px] font-mono-tabular text-[#00E5FF] bg-black/75 px-1 rounded shrink-0">
                            {c.speed.toFixed(1)}x
                          </span>
                        )}
                        {c.muted && (
                          <VolumeX className="w-3 h-3 text-zinc-300 shrink-0 drop-shadow" />
                        )}
                      </div>

                      {/* Keyframe Diamonds rendered at exact clip timing */}
                      {c.keyframes.map((kf) => {
                        const pct =
                          c.durationMs > 0
                            ? Math.max(4, Math.min(96, (kf.timeMs / c.durationMs) * 100))
                            : 50;
                        return (
                          <div
                            key={kf.id}
                            style={{ left: `${pct}%` }}
                            title={`Ключевой кадр ${(kf.timeMs / 1000).toFixed(1)}s`}
                            className="absolute bottom-1 -translate-x-1/2 w-2 h-2 rotate-45 bg-[#00E5FF] border border-black z-20 pointer-events-none"
                          />
                        );
                      })}

                      {/* Trim Right Handle */}
                      <div
                        onPointerDown={(e) =>
                          startDragClip(e, 'clip', c.id, c.startMs, c.durationMs, 'trim-right')
                        }
                        className={`w-2.5 h-full absolute right-0 top-0 cursor-ew-resize z-20 flex items-center justify-center ${
                          isSel ? 'bg-white' : 'bg-white/15 hover:bg-[#00E5FF]'
                        }`}
                      >
                        {isSel && <div className="w-[2px] h-3.5 bg-black rounded-full" />}
                      </div>
                    </div>

                    {/* CapCut Transition Connector Badge between adjacent clips */}
                    {idx > 0 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelect({ kind: 'clip', id: c.id });
                          onSelectTransition?.(c.id);
                        }}
                        style={{ left: leftPx }}
                        title={
                          hasTransition
                            ? `Переход: ${c.transitionIn} (${c.transitionDurationMs}ms)`
                            : 'Добавить переход CapCut'
                        }
                        className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-20 w-5 h-5 rounded-md border flex items-center justify-center shadow transition-transform hover:scale-110 ${
                          hasTransition
                            ? 'bg-[#FF2D6F] border-white text-white'
                            : 'bg-[#1E1E24] border-white/40 text-white hover:border-[#00E5FF]'
                        }`}
                      >
                        <Sparkles className="w-2.5 h-2.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </TrackRow>

            {/* V2: PIP / Overlays */}
            {v2Clips.length > 0 && (
              <TrackRow label="PIP" gutterW={GUTTER_W}>
                {v2Clips.map((c) => {
                  const isSel = selected?.kind === 'clip' && selected.id === c.id;
                  return (
                    <div
                      key={c.id}
                      onPointerDown={(e) =>
                        startDragClip(e, 'clip', c.id, c.startMs, c.durationMs, 'move')
                      }
                      style={{
                        left: (c.startMs / 1000) * pxPerSec,
                        width: Math.max(28, (c.durationMs / 1000) * pxPerSec),
                      }}
                      className={`absolute top-1 bottom-1 rounded-md px-2.5 flex items-center border cursor-grab overflow-hidden ${
                        isSel
                          ? 'border-white bg-sky-500/35'
                          : 'border-sky-400/35 bg-sky-950/70'
                      }`}
                    >
                      <div
                        onPointerDown={(e) =>
                          startDragClip(e, 'clip', c.id, c.startMs, c.durationMs, 'trim-left')
                        }
                        className="w-1.5 h-full absolute left-0 top-0 cursor-ew-resize bg-white/15 hover:bg-white"
                      />
                      <span className="text-[10px] text-sky-100 truncate">{c.name}</span>
                      <div
                        onPointerDown={(e) =>
                          startDragClip(e, 'clip', c.id, c.startMs, c.durationMs, 'trim-right')
                        }
                        className="w-1.5 h-full absolute right-0 top-0 cursor-ew-resize bg-white/15 hover:bg-white"
                      />
                    </div>
                  );
                })}
              </TrackRow>
            )}

            {/* FX Track */}
            {state.effects.length > 0 && (
              <TrackRow label="FX" gutterW={GUTTER_W}>
                {state.effects.map((fx) => {
                  const isSel = selected?.kind === 'effect' && selected.id === fx.id;
                  return (
                    <div
                      key={fx.id}
                      onPointerDown={(e) =>
                        startDragClip(e, 'effect', fx.id, fx.startMs, fx.durationMs, 'move')
                      }
                      style={{
                        left: (fx.startMs / 1000) * pxPerSec,
                        width: Math.max(28, (fx.durationMs / 1000) * pxPerSec),
                      }}
                      className={`absolute top-1 bottom-1 rounded-md px-2.5 flex items-center border cursor-grab overflow-hidden ${
                        isSel
                          ? 'border-white bg-[#FF2D6F]/40'
                          : 'border-[#FF2D6F]/45 bg-[#FF2D6F]/20'
                      }`}
                    >
                      <div
                        onPointerDown={(e) =>
                          startDragClip(e, 'effect', fx.id, fx.startMs, fx.durationMs, 'trim-left')
                        }
                        className="w-1.5 h-full absolute left-0 top-0 cursor-ew-resize bg-white/15 hover:bg-white"
                      />
                      <span className="text-[10px] text-pink-100 truncate">{fx.name}</span>
                      <div
                        onPointerDown={(e) =>
                          startDragClip(e, 'effect', fx.id, fx.startMs, fx.durationMs, 'trim-right')
                        }
                        className="w-1.5 h-full absolute right-0 top-0 cursor-ew-resize bg-white/15 hover:bg-white"
                      />
                    </div>
                  );
                })}
              </TrackRow>
            )}

            {/* T1: Text & Subtitles */}
            {state.texts.length > 0 && (
              <TrackRow label="TXT" gutterW={GUTTER_W}>
                {state.texts.map((tx) => {
                  const isSel = selected?.kind === 'text' && selected.id === tx.id;
                  return (
                    <div
                      key={tx.id}
                      onPointerDown={(e) =>
                        startDragClip(e, 'text', tx.id, tx.startMs, tx.durationMs, 'move')
                      }
                      style={{
                        left: (tx.startMs / 1000) * pxPerSec,
                        width: Math.max(28, (tx.durationMs / 1000) * pxPerSec),
                      }}
                      className={`absolute top-1 bottom-1 rounded-md px-2.5 flex items-center border cursor-grab overflow-hidden ${
                        isSel
                          ? 'border-white bg-amber-500/35'
                          : 'border-amber-400/35 bg-amber-950/70'
                      }`}
                    >
                      <div
                        onPointerDown={(e) =>
                          startDragClip(e, 'text', tx.id, tx.startMs, tx.durationMs, 'trim-left')
                        }
                        className="w-1.5 h-full absolute left-0 top-0 cursor-ew-resize bg-white/15 hover:bg-white"
                      />
                      <span className="text-[10px] text-amber-100 truncate">
                        {tx.isSubtitle ? 'CC: ' : ''}
                        {tx.text}
                      </span>
                      <div
                        onPointerDown={(e) =>
                          startDragClip(e, 'text', tx.id, tx.startMs, tx.durationMs, 'trim-right')
                        }
                        className="w-1.5 h-full absolute right-0 top-0 cursor-ew-resize bg-white/15 hover:bg-white"
                      />
                    </div>
                  );
                })}
              </TrackRow>
            )}

            {/* S1: Stickers */}
            {state.stickers.length > 0 && (
              <TrackRow label="STK" gutterW={GUTTER_W}>
                {state.stickers.map((st) => {
                  const isSel = selected?.kind === 'sticker' && selected.id === st.id;
                  return (
                    <div
                      key={st.id}
                      onPointerDown={(e) =>
                        startDragClip(e, 'sticker', st.id, st.startMs, st.durationMs, 'move')
                      }
                      style={{
                        left: (st.startMs / 1000) * pxPerSec,
                        width: Math.max(28, (st.durationMs / 1000) * pxPerSec),
                      }}
                      className={`absolute top-1 bottom-1 rounded-md px-2.5 flex items-center border cursor-grab overflow-hidden ${
                        isSel
                          ? 'border-white bg-violet-500/35'
                          : 'border-violet-400/35 bg-violet-950/70'
                      }`}
                    >
                      <div
                        onPointerDown={(e) =>
                          startDragClip(e, 'sticker', st.id, st.startMs, st.durationMs, 'trim-left')
                        }
                        className="w-1.5 h-full absolute left-0 top-0 cursor-ew-resize bg-white/15 hover:bg-white"
                      />
                      <span className="text-[10px] text-violet-100 truncate">
                        {st.kind === 'custom' ? st.label : `${st.content} ${st.label}`}
                      </span>
                      <div
                        onPointerDown={(e) =>
                          startDragClip(e, 'sticker', st.id, st.startMs, st.durationMs, 'trim-right')
                        }
                        className="w-1.5 h-full absolute right-0 top-0 cursor-ew-resize bg-white/15 hover:bg-white"
                      />
                    </div>
                  );
                })}
              </TrackRow>
            )}

            {/* A1 & A2: Audio & SFX with Waveform */}
            <TrackRow label="AUD" gutterW={GUTTER_W}>
              {[...a1Clips, ...a2Clips].map((a) => {
                const isSel = selected?.kind === 'audio' && selected.id === a.id;
                const widthPx = Math.max(32, (a.durationMs / 1000) * pxPerSec);
                const barCount = Math.max(8, Math.min(64, Math.floor(widthPx / 5)));
                const bars = buildWaveformBars(a.id, barCount);
                return (
                  <div
                    key={a.id}
                    onPointerDown={(e) =>
                      startDragClip(e, 'audio', a.id, a.startMs, a.durationMs, 'move')
                    }
                    style={{
                      left: (a.startMs / 1000) * pxPerSec,
                      width: widthPx,
                    }}
                    className={`absolute top-1 bottom-1 rounded-md px-2.5 flex items-center border cursor-grab overflow-hidden ${
                      isSel
                        ? 'border-white bg-[#00E5FF]/25'
                        : 'border-emerald-400/35 bg-emerald-950/65'
                    }`}
                  >
                    {/* Synthetic Waveform Backdrop */}
                    <div className="absolute inset-x-2 bottom-0.5 top-2 flex items-end gap-[2px] opacity-45 pointer-events-none">
                      {bars.map((h, i) => (
                        <div
                          key={i}
                          style={{ height: `${Math.min(100, Math.round((h * a.volume) / 100))}%` }}
                          className="flex-1 bg-[#00E5FF] rounded-t-[1px]"
                        />
                      ))}
                    </div>

                    <div
                      onPointerDown={(e) =>
                        startDragClip(e, 'audio', a.id, a.startMs, a.durationMs, 'trim-left')
                      }
                      className="w-1.5 h-full absolute left-0 top-0 cursor-ew-resize bg-white/15 hover:bg-white z-10"
                    />
                    <span className="relative z-10 text-[10px] font-medium text-emerald-100 truncate drop-shadow">
                      {a.name}
                    </span>
                    <div
                      onPointerDown={(e) =>
                        startDragClip(e, 'audio', a.id, a.startMs, a.durationMs, 'trim-right')
                      }
                      className="w-1.5 h-full absolute right-0 top-0 cursor-ew-resize bg-white/15 hover:bg-white z-10"
                    />
                  </div>
                );
              })}
            </TrackRow>
          </div>
        </div>
      </div>
    </div>
  );
}

function TrackRow({
  label,
  tall,
  gutterW,
  children,
}: {
  label: string;
  tall?: boolean;
  gutterW: number;
  children: React.ReactNode;
}) {
  return (
    <div className={`${tall ? 'h-12' : 'h-8'} flex items-center relative`}>
      <div
        style={{ width: gutterW }}
        className="shrink-0 h-full bg-[#0B0B0D] border-r border-white/[0.07] flex items-center justify-center text-[9px] font-mono-tabular text-zinc-500 sticky left-0 z-10"
      >
        {label}
      </div>
      <div className="flex-1 h-full relative">{children}</div>
    </div>
  );
}
