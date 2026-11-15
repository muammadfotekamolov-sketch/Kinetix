import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { MEDIA_DIR } from './ai.ts';

const execFileAsync = promisify(execFile);

const RESOLUTION_MAP: Record<string, { w: number; h: number }> = {
  '720p': { w: 1280, h: 720 },
  '1080p': { w: 1920, h: 1080 },
  '2k': { w: 2560, h: 1440 },
  '4k': { w: 3840, h: 2160 },
};

const BITRATE_MAP: Record<string, string> = {
  low: '2500k',
  medium: '6000k',
  high: '12000k',
  ultra: '24000k',
};

export async function transcodeToMp4(params: {
  inputBuffer: Buffer;
  resolution: string;
  fps: number;
  quality: string;
  aspectRatio: string;
}): Promise<{ downloadUrl: string; sizeBytes: number; fileName: string }> {
  const id = crypto.randomUUID();
  const inPath = path.join(MEDIA_DIR, `export_in_${id}.webm`);
  const outFileName = `kinetix_export_${id}.mp4`;
  const outPath = path.join(MEDIA_DIR, outFileName);

  fs.writeFileSync(inPath, params.inputBuffer);

  try {
    const base = RESOLUTION_MAP[params.resolution.toLowerCase()] || RESOLUTION_MAP['1080p'];
    let targetW = base.w;
    let targetH = base.h;

    if (params.aspectRatio === '9:16') {
      targetW = base.h;
      targetH = base.w;
    } else if (params.aspectRatio === '1:1') {
      targetW = base.h;
      targetH = base.h;
    } else if (params.aspectRatio === '4:5') {
      targetH = base.h;
      targetW = Math.round((base.h * 4) / 5);
    } else if (params.aspectRatio === '4:3') {
      targetH = base.h;
      targetW = Math.round((base.h * 4) / 3);
    } else if (params.aspectRatio === '21:9') {
      targetW = base.w;
      targetH = Math.round((base.w * 9) / 21);
    }

    // Ensure even dimensions for libx264
    targetW = targetW % 2 === 0 ? targetW : targetW + 1;
    targetH = targetH % 2 === 0 ? targetH : targetH + 1;

    const bitrate = BITRATE_MAP[params.quality] || BITRATE_MAP.high;
    const fps = [24, 30, 60].includes(params.fps) ? params.fps : 30;

    await execFileAsync('/usr/bin/ffmpeg', [
      '-y',
      '-i',
      inPath,
      '-vf',
      `scale=${targetW}:${targetH}:force_original_aspect_ratio=decrease,pad=${targetW}:${targetH}:(ow-iw)/2:(oh-ih)/2:black`,
      '-r',
      String(fps),
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-b:v',
      bitrate,
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      '-movflags',
      '+faststart',
      outPath,
    ]);

    const stat = fs.statSync(outPath);
    return {
      downloadUrl: `/media/${outFileName}`,
      sizeBytes: stat.size,
      fileName: outFileName,
    };
  } finally {
    if (fs.existsSync(inPath)) {
      fs.unlinkSync(inPath);
    }
  }
}
