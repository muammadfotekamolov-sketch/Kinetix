import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Request, Response, NextFunction } from 'express';
import { adminAuth } from '../lib/firebase-admin.ts';

const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8')) as {
  projectId: string;
  appId: string;
};

export interface AuthUserPayload {
  uid: string;
  email?: string;
}

export interface AuthRequest extends Request {
  user?: AuthUserPayload;
}

const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  `kinetix-session-${firebaseConfig.projectId}-${firebaseConfig.appId}`;

export function signSessionToken(payload: AuthUserPayload): string {
  const data = Buffer.from(
    JSON.stringify({ ...payload, exp: Date.now() + 1000 * 60 * 60 * 24 * 30 }),
  ).toString('base64url');
  const sig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(data)
    .digest('base64url');
  return `kx_${data}.${sig}`;
}

export function verifySessionToken(token: string): AuthUserPayload | null {
  if (!token.startsWith('kx_')) return null;
  const raw = token.slice(3);
  const dotIdx = raw.indexOf('.');
  if (dotIdx === -1) return null;
  const data = raw.slice(0, dotIdx);
  const sig = raw.slice(dotIdx + 1);
  const expectedSig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(data)
    .digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    if (typeof parsed.exp === 'number' && parsed.exp < Date.now()) {
      return null;
    }
    if (typeof parsed.uid !== 'string' || !parsed.uid) {
      return null;
    }
    return { uid: parsed.uid, email: parsed.email };
  } catch {
    return null;
  }
}

export function signOtpToken(target: string, code: string): string {
  const data = Buffer.from(
    JSON.stringify({ target, code, exp: Date.now() + 10 * 60 * 1000 }),
  ).toString('base64url');
  const sig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(`otp:${data}`)
    .digest('base64url');
  return `otp_${data}.${sig}`;
}

export function verifyOtpToken(token: string, target: string, code: string): boolean {
  if (!token || !token.startsWith('otp_')) return false;
  const raw = token.slice(4);
  const dotIdx = raw.indexOf('.');
  if (dotIdx === -1) return false;
  const data = raw.slice(0, dotIdx);
  const sig = raw.slice(dotIdx + 1);
  const expectedSig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(`otp:${data}`)
    .digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return false;
  }
  try {
    const parsed = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    if (typeof parsed.exp !== 'number' || parsed.exp < Date.now()) {
      return false;
    }
    return parsed.target === target && parsed.code === code;
  } catch {
    return false;
  }
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing token' });
  }

  const token = authHeader.split('Bearer ')[1];
  if (token.startsWith('kx_')) {
    const sessionUser = verifySessionToken(token);
    if (!sessionUser) {
      return res.status(401).json({ error: 'Unauthorized: Invalid session' });
    }
    req.user = sessionUser;
    return next();
  }

  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
    };
    return next();
  } catch (error) {
    console.error('Error verifying auth token:', error);
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
};
