import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const execFileAsync = promisify(execFile);

export const MEDIA_DIR = path.resolve(process.cwd(), 'tmp_media');
if (!fs.existsSync(MEDIA_DIR)) {
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
}

let paidModelsBlockedUntil = 0;

function getGenAI(isPaidModel = false): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') return null;
  if (isPaidModel && Date.now() < paidModelsBlockedUntil) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function handleGeminiError(label: string, err: unknown, isPaidModel = false) {
  const msg = err instanceof Error ? err.message : String(err);
  if (
    isPaidModel &&
    (msg.includes('403') ||
      msg.includes('PERMISSION_DENIED') ||
      msg.includes('API_KEY_INVALID') ||
      msg.includes('401') ||
      msg.includes('429'))
  ) {
    paidModelsBlockedUntil = Date.now() + 60_000;
  }
  console.warn(`${label}:`, msg);
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Gemini timeout after ${ms}ms`)), ms),
    ),
  ]);
}

function extractJsonText(raw: string): string {
  const stripped = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  const firstBrace = stripped.indexOf('{');
  const lastBrace = stripped.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return stripped.slice(firstBrace, lastBrace + 1);
  }
  return stripped;
}

export interface GeneratedScene {
  id: string;
  order: number;
  durationSec: number;
  title: string;
  narration: string;
  visualPrompt: string;
  transition: string;
  accentHex: string;
}

export interface GeneratedScript {
  title: string;
  hook: string;
  musicMood: string;
  hashtags: string[];
  scenes: GeneratedScene[];
  resolvedStyle?: string;
  resolvedAspectRatio?: string;
  resolvedFilter?: string;
}

const DEFAULT_VIDEO_SYSTEM_INSTRUCTION = [
  'You are the strict Kinetix AI video director.',
  '1. STRICT OBEDIENCE: You MUST literally and faithfully execute EVERY user instruction from both the main prompt and the "Уточнить запрос" (refinement) parameters—exact subjects, characters, actions, visual style, color palette, camera framing, pacing/dynamics, and content details. NEVER replace the user topic with generic or unrelated scenes.',
  '2. REFINEMENT PRIORITY: Style, dynamics, and content constraints in the refinement field override generic defaults.',
  '3. STRICT JSON SCHEMA: Always return ONLY valid JSON matching the exact video schema: { title, hook, musicMood, hashtags, scenes: [{ order, durationSec, title, narration, visualPrompt, transition, accentHex }] }.',
].join('\n');

function composeVideoSystemInstruction(customPrompt?: string): string {
  const cleaned = customPrompt?.trim();
  if (!cleaned) return DEFAULT_VIDEO_SYSTEM_INSTRUCTION;
  return `${cleaned}\n\n[ENFORCED JSON & EXECUTION CONTRACT]\n${DEFAULT_VIDEO_SYSTEM_INSTRUCTION}`;
}

function buildSmartLocalScript(params: {
  idea: string;
  refinement?: string;
  durationSec: number;
  aspectRatio: string;
  style: string;
  language: string;
  includeVoiceover: boolean;
}): GeneratedScript {
  const cleanIdea = params.idea.trim() || 'Динамичный ролик о будущем технологий';
  const cleanRefinement = params.refinement?.trim() || '';
  const combinedText = `${cleanIdea} ${cleanRefinement}`.toLowerCase();
  const isFast = /быстр|динамич|экшн|энергич|fast|dynamic|action|glitch/.test(combinedText);
  const sceneCount = isFast
    ? Math.min(4, Math.max(3, Math.round(params.durationSec / 4)))
    : params.durationSec <= 10
      ? 2
      : params.durationSec <= 15
        ? 3
        : 4;
  const perScene = Math.max(2, Math.round(params.durationSec / sceneCount));
  const palette = ['#00E5FF', '#FF2D6F', '#38BDF8', '#F43F5E'];
  const transitions = isFast
    ? ['zoom', 'glitch', 'flash', 'slide']
    : ['dissolve', 'slide', 'zoom', 'dissolve'];

  const isEn = params.language === 'en';
  const words = cleanIdea
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 4)
    .map((w) => `#${w}`);

  return {
    title: cleanIdea.slice(0, 44),
    hook: cleanRefinement ? `${cleanIdea} (${cleanRefinement.slice(0, 48)})` : cleanIdea,
    musicMood:
      params.style === 'anime'
        ? 'Lo-Fi Synthwave'
        : params.style === 'cartoon'
          ? 'Upbeat Funk Pop'
          : isFast
            ? 'High-Energy Electro'
            : 'Cinematic Pulse',
    hashtags: Array.from(
      new Set([...words, '#kinetix', '#reels', '#tiktok', '#aivideo']),
    ),
    scenes: Array.from({ length: sceneCount }, (_, idx) => ({
      id: `scene_${Date.now()}_${idx}`,
      order: idx + 1,
      durationSec: perScene,
      title: isEn
        ? `${cleanIdea.slice(0, 26)} (${idx + 1}/${sceneCount})`
        : `${cleanIdea.slice(0, 26)} · кадр ${idx + 1}`,
      narration: params.includeVoiceover
        ? idx === 0
          ? cleanIdea
          : `${cleanIdea} — часть ${idx + 1}`
        : '',
      visualPrompt: `${params.style} style, ${params.aspectRatio}${cleanRefinement ? `, ${cleanRefinement}` : ''}, scene ${idx + 1} of ${sceneCount}: ${cleanIdea}`,
      transition: transitions[idx % transitions.length],
      accentHex: palette[idx % palette.length],
    })),
  };
}

export async function generateVideoScript(params: {
  idea: string;
  refinement?: string;
  systemPrompt?: string;
  durationSec: number;
  aspectRatio: string;
  style: string;
  language: string;
  includeVoiceover: boolean;
}): Promise<GeneratedScript> {
  const ai = getGenAI(false);
  const cleanRefinement = params.refinement?.trim() || '';
  const sceneCount =
    params.durationSec <= 10 ? 2 : params.durationSec <= 15 ? 3 : 4;
  const perScene = Math.max(2, Math.round(params.durationSec / sceneCount));

  if (ai) {
    try {
      const systemInstruction = composeVideoSystemInstruction(params.systemPrompt);
      const response = await withTimeout(
        ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: `Main user request: "${params.idea}"
User refinement details («Уточнить запрос» — style, pacing/dynamics, camera, content details): "${cleanRefinement || 'Not specified'}"

Base parameters (override if the user's request or refinement explicitly asks otherwise):
- totalDuration: ${params.durationSec}s (${sceneCount} scenes unless pacing in refinement suggests faster cuts)
- aspectRatio: ${params.aspectRatio}
- visualStyle: ${params.style}
- language for title/hook/narration: ${params.language}
- includeVoiceover: ${params.includeVoiceover}

Requirements:
- Each scene's "title" and "narration" must directly fulfill the user's exact request & refinement in "${params.language}".
- Each scene's "visualPrompt" must vividly specify exact characters, objects, action, camera framing, lighting, color palette, and motion/dynamics in English so the visual renderer produces the exact requested scene.`,
          config: {
            systemInstruction,
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                hook: { type: Type.STRING },
                musicMood: { type: Type.STRING },
                hashtags: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
                scenes: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      order: { type: Type.INTEGER },
                      durationSec: { type: Type.NUMBER },
                      title: { type: Type.STRING },
                      narration: { type: Type.STRING },
                      visualPrompt: { type: Type.STRING },
                      transition: { type: Type.STRING },
                      accentHex: { type: Type.STRING },
                    },
                    required: ['order', 'durationSec', 'title', 'visualPrompt', 'transition'],
                  },
                },
              },
              required: ['title', 'hook', 'musicMood', 'hashtags', 'scenes'],
            },
          },
        }),
        14000,
      );

      const raw = extractJsonText(response.text ?? '');
      if (raw) {
        const parsed = JSON.parse(raw) as Omit<GeneratedScript, 'scenes'> & {
          scenes: Array<Omit<GeneratedScene, 'id'>>;
        };
        if (Array.isArray(parsed.scenes) && parsed.scenes.length > 0) {
          return {
            title: parsed.title || params.idea.slice(0, 42),
            hook: parsed.hook || params.idea,
            musicMood: parsed.musicMood || 'Atmospheric Synth',
            hashtags: Array.isArray(parsed.hashtags)
              ? parsed.hashtags
              : ['#kinetix', '#aivideo'],
            scenes: parsed.scenes.map((s, idx) => ({
              id: `scene_${Date.now()}_${idx}`,
              order: s.order || idx + 1,
              durationSec: Math.max(2, Number(s.durationSec) || perScene),
              title: s.title || `Сцена ${idx + 1}`,
              narration: params.includeVoiceover ? s.narration || s.title || '' : '',
              visualPrompt: s.visualPrompt || params.idea,
              transition: s.transition || 'dissolve',
              accentHex: s.accentHex || (idx % 2 === 0 ? '#00E5FF' : '#FF2D6F'),
            })),
          };
        }
      }
    } catch (err) {
      handleGeminiError('Gemini script fallback triggered', err, false);
    }
  }

  return buildSmartLocalScript(params);
}

function getDimsForAspect(aspectRatio: string, hd = false): { w: number; h: number } {
  if (aspectRatio === '16:9') {
    return hd ? { w: 1280, h: 720 } : { w: 854, h: 480 };
  }
  if (aspectRatio === '1:1') {
    return hd ? { w: 720, h: 720 } : { w: 540, h: 540 };
  }
  if (aspectRatio === '4:3') {
    return hd ? { w: 960, h: 720 } : { w: 640, h: 480 };
  }
  if (aspectRatio === '4:5') {
    return hd ? { w: 720, h: 900 } : { w: 480, h: 600 };
  }
  return hd ? { w: 720, h: 1280 } : { w: 480, h: 854 };
}

function sanitizeSvg(rawSvg: string, w: number, h: number): string | null {
  const match = rawSvg.match(/<svg[\s\S]*?<\/svg>/i);
  if (!match) return null;
  let svg = match[0]
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+="[^"]*"/gi, '')
    .replace(/\son\w+='[^']*'/gi, '')
    .replace(/<image[^>]*>/gi, '')
    .replace(/xlink:href="https?:[^"]*"/gi, '');

  // Normalize root <svg> attributes so librsvg renders at exact target aspect
  svg = svg.replace(/<svg[^>]*>/i, (openTag) => {
    const vbMatch = openTag.match(/viewBox="([^"]+)"/i);
    const viewBox = vbMatch ? vbMatch[1] : `0 0 ${w} ${h}`;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${viewBox}" preserveAspectRatio="xMidYMid slice">`;
  });
  return svg;
}

function buildKeywordSceneSvg(
  prompt: string,
  w: number,
  h: number,
  sceneIdx = 0,
  style = 'cinematic',
): string {
  const p = prompt.toLowerCase();
  const isSpace =
    /космос|марс|луна|планет|звезд|ракет|галактик|space|mars|moon|planet|rocket|star|galaxy/.test(p);
  const isCat = /кот|кошк|котён|cat|kitten/.test(p);
  const isCar = /машин|авто|дрифт|гонк|тачк|car|drift|race|sportscar/.test(p);
  const isCity = /город|неон|киберпанк|улиц|ноч|city|neon|cyberpunk|street/.test(p);
  const isOcean = /море|океан|пляж|волн|корабл|вода|ocean|sea|beach|wave/.test(p);
  const isNature = /гор|лес|дерев|закат|природ|mountain|forest|sunset|nature|sun/.test(p);
  const isLove = /любов|сердц|романт|love|heart/.test(p);

  const skyTop = isSpace
    ? '#040717'
    : isCity
      ? '#09071a'
      : isOcean
        ? '#072a4f'
        : isNature
          ? '#1e1b4b'
          : style === 'anime'
            ? '#240b36'
            : '#091124';
  const skyBot = isSpace
    ? '#3a1026'
    : isCity
      ? '#260b3d'
      : isOcean
        ? '#0e7490'
        : isNature
          ? '#db2777'
          : '#1b1038';

  const shift = (sceneIdx % 3) * 40;
  const cx = Math.round(w * 0.5);
  const cy = Math.round(h * 0.48);

  const elements: string[] = [
    `<defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${skyTop}"/>
        <stop offset="65%" stop-color="${skyBot}"/>
        <stop offset="100%" stop-color="#09090b"/>
      </linearGradient>
      <radialGradient id="glow" cx="50%" cy="45%" r="55%">
        <stop offset="0%" stop-color="${isSpace ? '#ff6b35' : '#00e5ff'}" stop-opacity="0.45"/>
        <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="${w}" height="${h}" fill="url(#sky)"/>
    <rect width="${w}" height="${h}" fill="url(#glow)"/>`,
  ];

  // Stars for night / space / city
  if (isSpace || isCity || (!isOcean && !isNature)) {
    for (let i = 0; i < 24; i++) {
      const sx = ((i * 79 + sceneIdx * 43) % (w - 40)) + 20;
      const sy = ((i * 53 + sceneIdx * 29) % Math.round(h * 0.58)) + 20;
      const sr = (i % 3) + 1;
      elements.push(`<circle cx="${sx}" cy="${sy}" r="${sr}" fill="#ffffff" opacity="${0.4 + (i % 5) * 0.12}"/>`);
    }
  }

  if (isSpace) {
    // Mars / glowing planet
    const px = Math.round(w * 0.68) - shift * 0.5;
    const py = Math.round(h * 0.28);
    const pr = Math.round(Math.min(w, h) * 0.22);
    elements.push(`
      <circle cx="${px}" cy="${py}" r="${pr}" fill="#e25822"/>
      <circle cx="${px - pr * 0.25}" cy="${py - pr * 0.15}" r="${pr * 0.18}" fill="#b83b14"/>
      <circle cx="${px + pr * 0.3}" cy="${py + pr * 0.25}" r="${pr * 0.12}" fill="#c9461a"/>
      <path d="M ${cx - 35} ${cy + 150} Q ${cx} ${cy + 260} ${cx + 35} ${cy + 150}" fill="#f59e0b" opacity="0.85"/>
    `);
  }

  if (isNature || isOcean) {
    // Sun & mountains or sea horizon
    const sunY = Math.round(h * 0.42);
    elements.push(`<circle cx="${cx}" cy="${sunY}" r="${Math.round(Math.min(w, h) * 0.16)}" fill="#fb7185" opacity="0.9"/>`);
    if (isOcean) {
      elements.push(`<rect x="0" y="${Math.round(h * 0.55)}" width="${w}" height="${h}" fill="#083344"/>`);
      elements.push(`<path d="M 0 ${Math.round(h * 0.62)} Q ${w * 0.25} ${Math.round(h * 0.58)} ${w * 0.5} ${Math.round(h * 0.62)} T ${w} ${Math.round(h * 0.62)} L ${w} ${h} L 0 ${h} Z" fill="#06b6d4" opacity="0.45"/>`);
    } else {
      elements.push(`<polygon points="0,${h} 0,${Math.round(h * 0.64)} ${Math.round(w * 0.35)},${Math.round(h * 0.46)} ${Math.round(w * 0.72)},${Math.round(h * 0.65)} ${w},${Math.round(h * 0.52)} ${w},${h}" fill="#18181b"/>`);
      elements.push(`<polygon points="0,${h} ${Math.round(w * 0.2)},${Math.round(h * 0.68)} ${Math.round(w * 0.55)},${Math.round(h * 0.55)} ${w},${Math.round(h * 0.72)} ${w},${h}" fill="#09090b"/>`);
    }
  }

  if (isCity) {
    // Neon skyline
    const base = Math.round(h * 0.78);
    for (let i = 0; i < 8; i++) {
      const bw = Math.round(w / 7);
      const bh = 120 + ((i * 67 + sceneIdx * 31) % 220);
      const bx = i * (bw - 4);
      elements.push(`<rect x="${bx}" y="${base - bh}" width="${bw - 6}" height="${bh + 300}" fill="#0f172a" stroke="#00e5ff" stroke-opacity="0.35" stroke-width="2"/>`);
      elements.push(`<rect x="${bx + 10}" y="${base - bh + 20}" width="12" height="12" fill="#ff2d6f" opacity="0.8"/>`);
      elements.push(`<rect x="${bx + 30}" y="${base - bh + 44}" width="12" height="12" fill="#00e5ff" opacity="0.8"/>`);
    }
  }

  if (isCar) {
    // Sleek neon sports car silhouette on perspective road
    const roadY = Math.round(h * 0.68);
    elements.push(`
      <polygon points="${cx - 60},${roadY} ${cx + 60},${roadY} ${w},${h} 0,${h}" fill="#18181b"/>
      <line x1="${cx}" y1="${roadY}" x2="${cx}" y2="${h}" stroke="#00e5ff" stroke-width="4" stroke-dasharray="18 14"/>
      <g transform="translate(${cx + (sceneIdx - 1) * 28}, ${Math.round(h * 0.72)})">
        <path d="M -110 20 L -85 -28 L -20 -44 L 55 -40 L 105 -8 L 115 20 Z" fill="#1e293b" stroke="#00e5ff" stroke-width="3"/>
        <circle cx="-65" cy="24" r="22" fill="#09090b" stroke="#ff2d6f" stroke-width="4"/>
        <circle cx="68" cy="24" r="22" fill="#09090b" stroke="#ff2d6f" stroke-width="4"/>
        <rect x="88" y="-2" width="22" height="8" rx="4" fill="#fde047"/>
      </g>
    `);
  }

  if (isCat) {
    // Stylized astronaut / neon cat character
    const catX = cx + (sceneIdx === 1 ? -24 : sceneIdx === 2 ? 24 : 0);
    const catY = cy + 40;
    elements.push(`
      <g transform="translate(${catX}, ${catY})">
        <ellipse cx="0" cy="70" rx="52" ry="74" fill="#f1f5f9"/>
        <rect x="-26" y="42" width="52" height="28" rx="6" fill="#00e5ff" opacity="0.8"/>
        <circle cx="0" cy="-28" r="56" fill="#0f172a" stroke="#00e5ff" stroke-width="4"/>
        <polygon points="-36,-66 -18,-108 0,-74" fill="#fb923c"/>
        <polygon points="36,-66 18,-108 0,-74" fill="#fb923c"/>
        <circle cx="0" cy="-26" r="40" fill="#fb923c"/>
        <circle cx="-14" cy="-30" r="6" fill="#09090b"/>
        <circle cx="14" cy="-30" r="6" fill="#09090b"/>
        <polygon points="-5,-18 5,-18 0,-12" fill="#ff2d6f"/>
      </g>
    `);
  }

  if (isLove) {
    elements.push(`
      <path d="M ${cx} ${cy + 70} C ${cx + 150} ${cy - 40}, ${cx + 100} ${cy - 160}, ${cx} ${cy - 65} C ${cx - 100} ${cy - 160}, ${cx - 150} ${cy - 40}, ${cx} ${cy + 70} Z" fill="#ff2d6f" opacity="0.88"/>
    `);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${elements.join('\n')}</svg>`;
}

async function generateAiSvgIllustrations(params: {
  scenes: Array<{ visualPrompt: string; title?: string }>;
  w: number;
  h: number;
  style: string;
  refinement?: string;
  systemPrompt?: string;
}): Promise<string[]> {
  const ai = getGenAI(false);
  if (!ai) {
    return params.scenes.map((sc, i) =>
      buildKeywordSceneSvg(
        `${sc.visualPrompt} ${params.refinement || ''}`,
        params.w,
        params.h,
        i,
        params.style,
      ),
    );
  }

  try {
    const promptList = params.scenes
      .map((s, i) => `Scene ${i + 1}: ${s.visualPrompt}`)
      .join('\n');

    const response = await withTimeout(
      ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Create custom SVG artwork for each scene in "${params.style}" visual style.
${params.refinement ? `Mandatory refinement directives (style, colors, lighting, framing, content): ${params.refinement}\n` : ''}Canvas size: width=${params.w}, height=${params.h}, viewBox="0 0 ${params.w} ${params.h}".

Scenes to illustrate faithfully:
${promptList}

Rules for EVERY SVG string:
1. Draw the EXACT subjects, characters, objects, setting, lighting, color palette, and mood described by the user and refinement!
2. Use 15-35 crisp SVG elements (<defs><linearGradient>/<radialGradient>, <rect>, <circle>, <ellipse>, <polygon>, <path>, <g>) with rich colors, lighting glow, background + midground + hero foreground.
3. Do NOT render large plain text blocks inside the SVG; let the illustration visually depict the scene!
4. Each SVG MUST be self-contained, valid XML starting with <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${params.w} ${params.h}"> and ending with </svg>. No <script> or external URLs.`,
        config: {
          systemInstruction:
            params.systemPrompt?.trim() ||
            'Strictly execute all user visual instructions and refinement parameters. Return valid JSON matching the schema.',
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              svgs: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
            },
            required: ['svgs'],
          },
        },
      }),
      18000,
    );

    const raw = extractJsonText(response.text ?? '');
    if (raw) {
      const parsed = JSON.parse(raw) as { svgs?: string[] };
      if (Array.isArray(parsed.svgs) && parsed.svgs.length > 0) {
        return params.scenes.map((sc, idx) => {
          const candidate = parsed.svgs?.[idx] || parsed.svgs?.[0] || '';
          const clean = sanitizeSvg(candidate, params.w, params.h);
          return (
            clean ||
            buildKeywordSceneSvg(sc.visualPrompt, params.w, params.h, idx, params.style)
          );
        });
      }
    }
  } catch (err) {
    handleGeminiError('Gemini SVG illustration fallback triggered', err, false);
  }

  return params.scenes.map((sc, i) =>
    buildKeywordSceneSvg(sc.visualPrompt, params.w, params.h, i, params.style),
  );
}

async function svgToPngWithFallback(
  svgCode: string,
  fallbackSvg: string,
  outPngPath: string,
): Promise<void> {
  const tmpSvg = `${outPngPath}.svg`;
  fs.writeFileSync(tmpSvg, svgCode, 'utf8');
  try {
    await execFileAsync('/usr/bin/ffmpeg', ['-y', '-i', tmpSvg, outPngPath]);
  } catch {
    fs.writeFileSync(tmpSvg, fallbackSvg, 'utf8');
    await execFileAsync('/usr/bin/ffmpeg', ['-y', '-i', tmpSvg, outPngPath]);
  } finally {
    fs.rmSync(tmpSvg, { force: true });
  }
}

function getAudioFreqForStyle(style: string): number {
  switch (style) {
    case 'anime':
      return 261;
    case 'realistic':
      return 196;
    case 'cartoon':
      return 293;
    case '3d':
      return 246;
    default:
      return 220;
  }
}

export async function generateVideoAsset(params: {
  prompt: string;
  refinement?: string;
  systemPrompt?: string;
  aspectRatio: string;
  durationSec: number;
  style: string;
  watermark: boolean;
  scenes?: Array<{
    title?: string;
    narration?: string;
    visualPrompt: string;
    durationSec?: number;
    transition?: string;
  }>;
}): Promise<{
  videoUrl: string;
  source: 'gemini-omni' | 'ffmpeg-render';
  note?: string;
}> {
  const paidAi = getGenAI(true);
  const safeRatio = params.aspectRatio === '9:16' ? '9:16' : '16:9';
  const clampedDur = Math.max(3, Math.min(15, Math.round(params.durationSec)));
  const cleanRefinement = params.refinement?.trim() || '';
  const combinedInput = cleanRefinement
    ? `${params.style} aesthetic video: ${params.prompt}. Refinement directives: ${cleanRefinement}`
    : `${params.style} aesthetic video: ${params.prompt}`;

  if (paidAi) {
    try {
      const interaction = await paidAi.interactions.create(
        {
          model: 'gemini-omni-1.2-flash',
          input: combinedInput,
          background: false,
          store: false,
          stream: false,
          response_format: {
            type: 'video',
            aspect_ratio: safeRatio,
            duration: `${clampedDur}s` as '5s',
            resolution: '720p',
          },
        },
        { timeout: 45000 },
      );

      const videoPart = interaction.output_video;
      if (videoPart?.data) {
        const fileName = `ai_vid_${crypto.randomUUID()}.mp4`;
        const outPath = path.join(MEDIA_DIR, fileName);
        fs.writeFileSync(outPath, Buffer.from(videoPart.data, 'base64'));
        return { videoUrl: `/media/${fileName}`, source: 'gemini-omni' };
      }
    } catch (err) {
      handleGeminiError(
        'Omni video generation unavailable (using AI scene director synthesis)',
        err,
        true,
      );
    }
  }

  // AI Director Multi-Scene SVG -> Zoompan + Xfade MP4 Engine
  const { w, h } = getDimsForAspect(params.aspectRatio, false);
  const totalDur = Math.max(4, Math.min(60, Math.round(params.durationSec)));
  const rawScenes =
    params.scenes && params.scenes.length > 0
      ? params.scenes.slice(0, 4)
      : [
          {
            visualPrompt: `${params.prompt}${cleanRefinement ? ` (${cleanRefinement})` : ''} — opening establishing view`,
            transition: 'dissolve',
          },
          {
            visualPrompt: `${params.prompt}${cleanRefinement ? ` (${cleanRefinement})` : ''} — main action close-up`,
            transition: 'slide',
          },
          {
            visualPrompt: `${params.prompt}${cleanRefinement ? ` (${cleanRefinement})` : ''} — dramatic finale`,
            transition: 'zoom',
          },
        ];

  const dynLower = `${params.prompt} ${cleanRefinement}`.toLowerCase();
  const isFastPacing = /быстр|динамич|экшн|энергич|fast|dynamic|action|rapid/.test(dynLower);
  const isSlowPacing = /плавн|медлен|спокойн|smooth|slow|calm|ambient/.test(dynLower);

  // Keep render under ~3s even for 30s/60s by rendering a crisp multi-scene master (~4s/scene) and looping if needed
  const sceneDurSec = totalDur <= 16 ? Math.max(2.5, totalDur / rawScenes.length) : 3.5;
  const xfadeDur = isFastPacing ? 0.25 : isSlowPacing ? 0.65 : 0.45;
  const framesPerScene = Math.round((sceneDurSec + xfadeDur) * 24);
  const zoomStep = isFastPacing ? 0.004 : isSlowPacing ? 0.0014 : 0.0022;
  const panStep = isFastPacing ? 2.4 : isSlowPacing ? 0.9 : 1.4;

  const svgs = await generateAiSvgIllustrations({
    scenes: rawScenes,
    w,
    h,
    style: params.style,
    refinement: cleanRefinement,
    systemPrompt: params.systemPrompt,
  });

  const pngPaths: string[] = [];
  const fileName = `ai_scene_vid_${crypto.randomUUID()}.mp4`;
  const outPath = path.join(MEDIA_DIR, fileName);
  const masterPath = path.join(MEDIA_DIR, `master_${crypto.randomUUID()}.mp4`);

  try {
    for (let i = 0; i < svgs.length; i++) {
      const pngPath = path.join(MEDIA_DIR, `sc_${crypto.randomUUID()}.png`);
      const fallbackSvg = buildKeywordSceneSvg(
        `${rawScenes[i].visualPrompt} ${cleanRefinement}`,
        w,
        h,
        i,
        params.style,
      );
      await svgToPngWithFallback(svgs[i], fallbackSvg, pngPath);
      pngPaths.push(pngPath);
    }

    const args: string[] = ['-y'];
    for (const p of pngPaths) {
      args.push('-i', p);
    }
    const masterDur =
      pngPaths.length * sceneDurSec + xfadeDur;
    args.push(
      '-f',
      'lavfi',
      '-i',
      `sine=frequency=${getAudioFreqForStyle(params.style)}:sample_rate=44100:duration=${masterDur.toFixed(2)}`,
    );

    const scaleW = Math.round(w * 1.45);
    const scaleH = Math.round(h * 1.45);
    const filterParts: string[] = [];

    for (let i = 0; i < pngPaths.length; i++) {
      // Alternate camera motion per scene (zoom in, zoom out, pan right, pan left)
      let zpExpr = `z='min(zoom+${zoomStep},1.22)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`;
      if (i % 4 === 1) {
        zpExpr = `z='1.22-${zoomStep}*on':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`;
      } else if (i % 4 === 2) {
        zpExpr = `z='1.14':x='min(iw-iw/zoom,on*${panStep})':y='ih/2-(ih/zoom/2)'`;
      } else if (i % 4 === 3) {
        zpExpr = `z='1.14':x='max(0,(iw-iw/zoom)-on*${panStep})':y='ih/2-(ih/zoom/2)'`;
      }
      filterParts.push(
        `[${i}:v]scale=${scaleW}:${scaleH},zoompan=${zpExpr}:d=${framesPerScene}:s=${w}x${h}:fps=24,setpts=PTS-STARTPTS[v${i}]`,
      );
    }

    let lastLabel = 'v0';
    if (pngPaths.length > 1) {
      const xfadeNames = ['fade', 'slideleft', 'circleopen', 'dissolve'];
      let offset = sceneDurSec;
      for (let i = 1; i < pngPaths.length; i++) {
        const nextOut = i === pngPaths.length - 1 ? 'vout' : `vx${i}`;
        const tr = xfadeNames[(i - 1) % xfadeNames.length];
        filterParts.push(
          `[${lastLabel}][v${i}]xfade=transition=${tr}:duration=${xfadeDur}:offset=${offset.toFixed(2)}[${nextOut}]`,
        );
        lastLabel = nextOut;
        offset += sceneDurSec;
      }
    } else {
      filterParts[0] = filterParts[0].replace('[v0]', '[vout]');
      lastLabel = 'vout';
    }

    const targetRenderPath = totalDur > masterDur + 1 ? masterPath : outPath;
    args.push(
      '-filter_complex',
      filterParts.join(';'),
      '-map',
      `[${lastLabel}]`,
      '-map',
      `${pngPaths.length}:a`,
      '-af',
      `volume=0.06,afade=t=in:st=0:d=0.4,afade=t=out:st=${Math.max(0.5, masterDur - 0.5).toFixed(2)}:d=0.5`,
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-shortest',
      targetRenderPath,
    );

    await execFileAsync('/usr/bin/ffmpeg', args);

    if (targetRenderPath === masterPath) {
      await execFileAsync('/usr/bin/ffmpeg', [
        '-y',
        '-stream_loop',
        '-1',
        '-i',
        masterPath,
        '-t',
        String(totalDur),
        '-c',
        'copy',
        outPath,
      ]);
    }
  } finally {
    for (const p of pngPaths) fs.rmSync(p, { force: true });
    fs.rmSync(masterPath, { force: true });
  }

  return {
    videoUrl: `/media/${fileName}`,
    source: 'ffmpeg-render',
    note: 'Видео сгенерировано ИИ-режиссёром Kinetix по вашему сценарию. Для фотореалистичного рендера Veo добавьте платный GEMINI_API_KEY в Settings > Secrets.',
  };
}

export async function generateImageAsset(params: {
  prompt: string;
  refinement?: string;
  systemPrompt?: string;
  aspectRatio: string;
}): Promise<{ imageUrl: string; source: 'gemini-image' | 'svg-render'; note?: string }> {
  const paidAi = getGenAI(true);
  const ratio = ['1:1', '3:4', '4:3', '9:16', '16:9'].includes(params.aspectRatio)
    ? params.aspectRatio
    : '9:16';
  const cleanRefinement = params.refinement?.trim() || '';
  const combinedPrompt = cleanRefinement
    ? `${params.prompt}. Refinement details: ${cleanRefinement}`
    : params.prompt;

  if (paidAi) {
    try {
      const response = await withTimeout(
        paidAi.models.generateContent({
          model: 'gemini-3.1-flash-lite-image',
          contents: { parts: [{ text: combinedPrompt }] },
          config: {
            imageConfig: { aspectRatio: ratio },
          },
        }),
        12000,
      );
      for (const part of response.candidates?.[0]?.content?.parts ?? []) {
        if (part.inlineData?.data) {
          const ext = (part.inlineData.mimeType ?? 'image/png').includes('jpeg')
            ? 'jpg'
            : 'png';
          const fileName = `ai_img_${crypto.randomUUID()}.${ext}`;
          const outPath = path.join(MEDIA_DIR, fileName);
          fs.writeFileSync(outPath, Buffer.from(part.inlineData.data, 'base64'));
          return { imageUrl: `/media/${fileName}`, source: 'gemini-image' };
        }
      }
    } catch (err) {
      handleGeminiError('Gemini image fallback triggered', err, true);
    }
  }

  const { w, h } = getDimsForAspect(ratio, true);
  const fileName = `ai_art_${crypto.randomUUID()}.png`;
  const outPath = path.join(MEDIA_DIR, fileName);
  const svgs = await generateAiSvgIllustrations({
    scenes: [{ visualPrompt: combinedPrompt }],
    w,
    h,
    style: 'cinematic',
    refinement: cleanRefinement,
    systemPrompt: params.systemPrompt,
  });
  const fallbackSvg = buildKeywordSceneSvg(combinedPrompt, w, h, 0, 'cinematic');
  await svgToPngWithFallback(svgs[0], fallbackSvg, outPath);

  return {
    imageUrl: `/media/${fileName}`,
    source: 'svg-render',
    note: 'Изображение проиллюстрировано ИИ по вашему запросу. Для фотореалистичной генерации Imagen добавьте платный GEMINI_API_KEY в Settings > Secrets.',
  };
}

export async function generateTtsAudio(params: {
  text: string;
  voiceName: string;
  style?: string;
}): Promise<{ audioDataUrl?: string; fallbackWebSpeech: boolean }> {
  const ai = getGenAI(false);
  if (ai) {
    try {
      const response = await withTimeout(
        ai.models.generateContent({
          model: 'gemini-3.8-flash-lite-tts',
          contents: [
            {
              role: 'user',
              parts: [{ text: params.text }],
            },
          ],
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: params.voiceName || 'Kore',
                },
              },
            },
          },
        }),
        7000,
      );
      const base64Audio =
        response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        return {
          audioDataUrl: `data:audio/wav;base64,${base64Audio}`,
          fallbackWebSpeech: false,
        };
      }
    } catch (err) {
      handleGeminiError('Gemini TTS fallback to browser speech', err, false);
    }
  }
  return { fallbackWebSpeech: true };
}

export async function suggestSocialHashtags(params: {
  topic: string;
  platforms: string[];
  language: string;
}): Promise<{ caption: string; hashtags: string[] }> {
  const ai = getGenAI(false);
  if (ai) {
    try {
      const response = await withTimeout(
        ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: `Generate an engaging short-form social media caption and 8 relevant trending hashtags for ${params.platforms.join(' & ')} in language "${params.language}" for this video topic: "${params.topic}".`,
          config: {
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                caption: { type: Type.STRING },
                hashtags: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
            },
          },
        }),
        12000,
      );
      const raw = extractJsonText(response.text ?? '');
      if (raw) {
        const parsed = JSON.parse(raw) as {
          caption?: string;
          hashtags?: string[];
        };
        return {
          caption: parsed.caption || params.topic,
          hashtags: Array.isArray(parsed.hashtags)
            ? parsed.hashtags
            : ['#kinetix', '#reels', '#tiktok'],
        };
      }
    } catch (err) {
      handleGeminiError('Hashtag suggestion fallback', err, false);
    }
  }

  const topicWords = params.topic
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 4)
    .map((w) => `#${w}`);

  return {
    caption: `${params.topic} — смонтировано в Kinetix`,
    hashtags: Array.from(
      new Set([
        ...topicWords,
        '#kinetix',
        '#videoedit',
        '#reels',
        '#tiktok',
        '#fyp',
        '#creator',
      ]),
    ),
  };
}

export interface EditorAiPlan {
  reply: string;
  aspectRatio?: '9:16' | '16:9' | '1:1' | '4:5' | '4:3' | '21:9';
  resolution?: '720p' | '1080p' | '2k' | '4k';
  speed?: number;
  reverse?: boolean;
  rotation?: number;
  flipH?: boolean;
  volume?: number;
  filterPreset?: 'none' | 'cinema' | 'vintage' | 'bw' | 'vivid' | 'warm' | 'cool';
  brightness?: number;
  contrast?: number;
  saturation?: number;
  vignette?: number;
  transitionIn?: 'none' | 'dissolve' | 'slide' | 'zoom' | 'flash' | 'glitch' | 'spin';
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
}

function buildLocalEditPlan(prompt: string): EditorAiPlan {
  const p = prompt.toLowerCase();
  const plan: EditorAiPlan = { reply: 'Команда выполнена' };
  const done: string[] = [];

  if (/ч[её]рно-?бел|чб|black.*white|bw|монохром/.test(p)) {
    plan.filterPreset = 'bw';
    done.push('фильтр Ч/Б');
  } else if (/винтаж|ретро|vintage/.test(p)) {
    plan.filterPreset = 'vintage';
    done.push('фильтр Винтаж');
  } else if (/кино|cinema/.test(p)) {
    plan.filterPreset = 'cinema';
    done.push('фильтр Кино');
  } else if (/ярк|сочн|vivid/.test(p)) {
    plan.filterPreset = 'vivid';
    done.push('яркий фильтр');
  }

  const speedMatch = p.match(/(\d+(?:[.,]\d+)?)\s*(?:x|х|раз)/);
  if (speedMatch) {
    plan.speed = Math.max(0.1, Math.min(100, Number(speedMatch[1].replace(',', '.'))));
    done.push(`скорость ${plan.speed}x`);
  } else if (/ускор|быстр/.test(p)) {
    plan.speed = 2;
    done.push('скорость 2x');
  } else if (/замедл|slow/.test(p)) {
    plan.speed = 0.5;
    done.push('замедление 0.5x');
  }

  if (/реверс|назад|reverse/.test(p)) {
    plan.reverse = true;
    done.push('реверс');
  }
  if (/зеркал|отраз/.test(p)) {
    plan.flipH = true;
    done.push('отражение');
  }
  if (/поверн|90/.test(p)) {
    plan.rotation = 90;
    done.push('поворот 90°');
  }
  if (/16:9|горизонт|youtube/.test(p)) {
    plan.aspectRatio = '16:9';
    done.push('формат 16:9');
  } else if (/9:16|вертик|reels|tiktok/.test(p)) {
    plan.aspectRatio = '9:16';
    done.push('формат 9:16');
  } else if (/1:1|квадрат/.test(p)) {
    plan.aspectRatio = '1:1';
    done.push('формат 1:1');
  }

  if (/глитч|glitch/.test(p)) {
    plan.transitionIn = 'glitch';
    plan.addEffect = 'chromatic';
    done.push('глитч-эффект');
  } else if (/неон|neon/.test(p)) {
    plan.addEffect = 'neon';
    done.push('эффект Неон');
  } else if (/vhs|пл[её]нк/.test(p)) {
    plan.addEffect = 'vhs';
    done.push('эффект VHS');
  } else if (/искр|блеск|sparkle/.test(p)) {
    plan.addEffect = 'sparkle';
    done.push('эффект Искры');
  }

  if (/lofi|лоу-?фай|спокойн/.test(p)) {
    plan.addAudio = 'lofi';
    done.push('музыка Lo-Fi');
  } else if (/trap|трэп|кач|бит/.test(p)) {
    plan.addAudio = 'trap';
    done.push('музыка Trap');
  } else if (/музык|трек|саундтрек/.test(p)) {
    plan.addAudio = 'synthwave';
    done.push('музыка Synthwave');
  }

  const quoted = prompt.match(/[«"']([^»"']+)[»"']/);
  if (quoted) {
    plan.addText = {
      text: quoted[1],
      position: /верх|top/.test(p) ? 'top' : /низ|bottom/.test(p) ? 'bottom' : 'center',
      isMarquee: /бегущ/.test(p),
    };
    done.push(`текст «${quoted[1]}»`);
  }

  if (/удал.*фон|выреж.*фон/.test(p)) {
    plan.bgRemove = true;
    done.push('удаление фона');
  }
  if (/виньет/.test(p)) {
    plan.vignette = 60;
    done.push('виньетка');
  }

  if (done.length > 0) {
    plan.reply = `Выполнено: ${done.join(', ')}`;
  }
  return plan;
}

export async function executeEditorWish(params: {
  prompt: string;
  aspectRatio: string;
  resolution: string;
  language: string;
}): Promise<EditorAiPlan> {
  const localPlan = buildLocalEditPlan(params.prompt);
  const ai = getGenAI(false);
  if (ai) {
    try {
      const response = await withTimeout(
        ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: `You are the Kinetix video editor AI executor. Convert the user's editing wish into exact JSON actions.
Current format: ${params.aspectRatio}, resolution: ${params.resolution}.
User wish: "${params.prompt}"
Reply language: ${params.language}.

CRITICAL RULES:
1. Only output fields that the user explicitly asked to change or add! Do NOT include transitionIn, vignette, volume, speed, etc. unless the user mentioned them.
2. If the user asks to add text/title/caption, you MUST set "addText": { "text": "...", "position": "top"|"center"|"bottom" }.
3. If the user asks for an effect (neon, glitch, vhs, sparkle, film_burn, chromatic), you MUST set "addEffect" (e.g. "neon").
4. If the user asks for music/soundtrack (synthwave, lofi, trap, ambient), you MUST set "addAudio".
5. If the user asks for a sticker/emoji, you MUST set "addSticker" (emoji char).
6. Set "reply" to a brief confirmation in ${params.language}.

Allowed enum values:
- aspectRatio: "9:16" | "16:9" | "1:1" | "4:5" | "4:3" | "21:9"
- resolution: "720p" | "1080p" | "2k" | "4k"
- filterPreset: "none" | "cinema" | "vintage" | "bw" | "vivid" | "warm" | "cool"
- transitionIn: "none" | "dissolve" | "slide" | "zoom" | "flash" | "glitch" | "spin"
- addEffect: "chromatic" | "vhs" | "film_burn" | "sparkle" | "neon"
- addAudio: "synthwave" | "lofi" | "trap" | "ambient"`,
          config: {
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                reply: { type: Type.STRING },
                aspectRatio: { type: Type.STRING },
                resolution: { type: Type.STRING },
                speed: { type: Type.NUMBER },
                reverse: { type: Type.BOOLEAN },
                rotation: { type: Type.INTEGER },
                flipH: { type: Type.BOOLEAN },
                volume: { type: Type.INTEGER },
                filterPreset: { type: Type.STRING },
                brightness: { type: Type.INTEGER },
                contrast: { type: Type.INTEGER },
                saturation: { type: Type.INTEGER },
                vignette: { type: Type.INTEGER },
                transitionIn: { type: Type.STRING },
                addText: {
                  type: Type.OBJECT,
                  properties: {
                    text: { type: Type.STRING },
                    color: { type: Type.STRING },
                    isMarquee: { type: Type.BOOLEAN },
                    position: { type: Type.STRING },
                  },
                },
                addEffect: { type: Type.STRING },
                addAudio: { type: Type.STRING },
                addSticker: { type: Type.STRING },
                bgRemove: { type: Type.BOOLEAN },
                retouchSmooth: { type: Type.INTEGER },
              },
              required: ['reply'],
            },
          },
        }),
        10000,
      );

      const raw = extractJsonText(response.text ?? '');
      if (raw) {
        const parsed = JSON.parse(raw) as EditorAiPlan;
        if (parsed && parsed.reply) {
          // Strip unrequested zero/none placeholders and merge deterministic matches so nothing requested is dropped
          if (parsed.transitionIn === 'none' && !/убер.*переход|без переход|no transition/i.test(params.prompt)) {
            delete parsed.transitionIn;
          }
          if (parsed.vignette === 0 && !/виньет|vignette/i.test(params.prompt)) {
            delete parsed.vignette;
          }
          if (parsed.volume === 100 && !/громк|звук|volume/i.test(params.prompt)) {
            delete parsed.volume;
          }
          return {
            ...localPlan,
            ...parsed,
            addText: parsed.addText?.text ? parsed.addText : localPlan.addText,
            addEffect: parsed.addEffect || localPlan.addEffect,
            addAudio: parsed.addAudio || localPlan.addAudio,
            addSticker: parsed.addSticker || localPlan.addSticker,
          };
        }
      }
    } catch (err) {
      handleGeminiError('AI edit-command fallback triggered', err, false);
    }
  }

  return localPlan;
}
