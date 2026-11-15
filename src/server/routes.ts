import crypto from 'node:crypto';
import type { Express, Request, Response } from 'express';
import express from 'express';
import { and, desc, eq } from 'drizzle-orm';
import Stripe from 'stripe';
import { db } from '../db/index.ts';
import {
  colorPresets,
  payments,
  projects,
  scheduledPosts,
  socialConnections,
  users,
} from '../db/schema.ts';
import { getOrCreateUser, updateUserProfile } from '../db/users.ts';
import { requireAuth, signSessionToken, type AuthRequest } from '../middleware/auth.ts';
import {
  executeEditorWish,
  generateImageAsset,
  generateTtsAudio,
  generateVideoAsset,
  generateVideoScript,
  MEDIA_DIR,
  suggestSocialHashtags,
} from './ai.ts';
import { transcodeToMp4 } from './export.ts';

interface PendingOtp {
  code: string;
  expiresAt: number;
  target: string;
}

const otpStore = new Map<string, PendingOtp>();

function calculateAge(birthDate: string): number {
  const dob = new Date(birthDate);
  if (Number.isNaN(dob.getTime())) return 0;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) {
    age--;
  }
  return age;
}

function getAppBaseUrl(req: Request): string {
  if (process.env.APP_URL && process.env.APP_URL !== 'MY_APP_URL') {
    return process.env.APP_URL.replace(/\/$/, '');
  }
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
  return `${proto}://${host}`;
}

export function registerRoutes(app: Express) {
  app.use('/media', express.static(MEDIA_DIR));

  // 1. Auth & OTP Registration
  app.post('/api/auth/send-code', (req: Request, res: Response) => {
    const { contact } = req.body as { contact?: string };
    if (!contact || !contact.trim()) {
      return res.status(400).json({ error: 'Contact email or phone is required.' });
    }
    const normalized = contact.trim().toLowerCase();
    const code = String(Math.floor(100000 + Math.random() * 900000));
    otpStore.set(normalized, {
      code,
      target: normalized,
      expiresAt: Date.now() + 10 * 60 * 1000,
    });
    return res.json({
      sent: true,
      target: normalized,
      verificationCodePreview: code,
    });
  });

  app.post('/api/auth/verify-register', async (req: Request, res: Response) => {
    try {
      const {
        contact,
        contactType,
        code,
        firstName,
        lastName,
        birthDate,
        gender,
        language,
        acceptedTerms,
        acceptedPrivacy,
        parentalConsent,
      } = req.body as {
        contact: string;
        contactType: 'email' | 'phone';
        code: string;
        firstName: string;
        lastName: string;
        birthDate: string;
        gender: string;
        language: string;
        acceptedTerms: boolean;
        acceptedPrivacy: boolean;
        parentalConsent?: boolean;
      };

      if (!acceptedTerms || !acceptedPrivacy) {
        return res.status(400).json({ error: 'Terms and Privacy Policy acceptance required.' });
      }

      const age = calculateAge(birthDate);
      if (age < 13) {
        return res.status(403).json({ error: 'AGE_UNDER_13_PROHIBITED' });
      }

      const normalized = (contact || '').trim().toLowerCase();
      const pending = otpStore.get(normalized);
      if (!pending || pending.expiresAt < Date.now() || pending.code !== String(code).trim()) {
        return res.status(400).json({ error: 'INVALID_OR_EXPIRED_CODE' });
      }
      otpStore.delete(normalized);

      const uid = `otp_${crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 20)}`;
      const user = await getOrCreateUser({
        uid,
        email: contactType === 'email' ? normalized : '',
        phone: contactType === 'phone' ? normalized : '',
        firstName: (firstName || '').trim(),
        lastName: (lastName || '').trim(),
        birthDate,
        gender: gender || 'unspecified',
        language: language || 'ru',
        parentalConsent: Boolean(parentalConsent),
      });

      const updated = await updateUserProfile(uid, {
        firstName: (firstName || '').trim() || user.firstName,
        lastName: (lastName || '').trim() || user.lastName,
        birthDate: birthDate || user.birthDate,
        gender: gender || user.gender,
        language: language || user.language,
        parentalConsent: Boolean(parentalConsent) || user.parentalConsent,
        email: contactType === 'email' ? normalized : user.email,
        phone: contactType === 'phone' ? normalized : user.phone,
      });

      const token = signSessionToken({ uid, email: normalized });
      return res.json({ token, user: updated ?? user });
    } catch (err) {
      console.error('Register verify error:', err);
      return res.status(500).json({ error: 'Registration failed.' });
    }
  });

  app.post('/api/auth/session', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const uid = req.user!.uid;
      const body = req.body as {
        firstName?: string;
        lastName?: string;
        birthDate?: string;
        gender?: string;
        language?: string;
        parentalConsent?: boolean;
      };
      const user = await getOrCreateUser({
        uid,
        email: req.user!.email ?? '',
        firstName: body.firstName,
        lastName: body.lastName,
        birthDate: body.birthDate,
        gender: body.gender,
        language: body.language,
        parentalConsent: body.parentalConsent,
      });
      return res.json({ user });
    } catch (err) {
      console.error('Auth session error:', err);
      return res.status(500).json({ error: 'Failed to sync session.' });
    }
  });

  // 2. User Profile & Settings
  app.get('/api/user/me', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const user = await getOrCreateUser({
        uid: req.user!.uid,
        email: req.user!.email ?? '',
      });
      const userPayments = await db
        .select()
        .from(payments)
        .where(eq(payments.userId, user.id))
        .orderBy(desc(payments.createdAt));
      return res.json({ user, payments: userPayments });
    } catch (err) {
      console.error('GET /api/user/me error:', err);
      return res.status(500).json({ error: 'Failed to load profile.' });
    }
  });

  app.patch('/api/user/me', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const patch = req.body as Record<string, unknown>;
      const allowed: Record<string, unknown> = {};
      for (const key of [
        'firstName',
        'lastName',
        'birthDate',
        'gender',
        'language',
        'parentalConsent',
        'email',
        'phone',
      ]) {
        if (patch[key] !== undefined) allowed[key] = patch[key];
      }
      if (typeof allowed.birthDate === 'string' && calculateAge(allowed.birthDate) < 13) {
        return res.status(403).json({ error: 'AGE_UNDER_13_PROHIBITED' });
      }
      const updated = await updateUserProfile(req.user!.uid, allowed);
      return res.json({ user: updated });
    } catch (err) {
      console.error('PATCH /api/user/me error:', err);
      return res.status(500).json({ error: 'Failed to update profile.' });
    }
  });

  // 3. Projects CRUD
  app.get('/api/projects', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const user = await getOrCreateUser({ uid: req.user!.uid, email: req.user!.email ?? '' });
      const list = await db
        .select()
        .from(projects)
        .where(eq(projects.userId, user.id))
        .orderBy(desc(projects.updatedAt));
      return res.json({ projects: list });
    } catch (err) {
      console.error('GET /api/projects error:', err);
      return res.status(500).json({ error: 'Failed to list projects.' });
    }
  });

  app.post('/api/projects', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const user = await getOrCreateUser({ uid: req.user!.uid, email: req.user!.email ?? '' });
      const { title, aspectRatio, resolution, fps, durationMs, thumbnailUrl, stateJson } = req.body;
      const inserted = await db
        .insert(projects)
        .values({
          userId: user.id,
          title: title || 'Новый проект',
          aspectRatio: aspectRatio || '9:16',
          resolution: resolution || '1080p',
          fps: Number(fps) || 30,
          durationMs: Number(durationMs) || 15000,
          thumbnailUrl: thumbnailUrl || '',
          stateJson: stateJson || {},
        })
        .returning();
      return res.json({ project: inserted[0] });
    } catch (err) {
      console.error('POST /api/projects error:', err);
      return res.status(500).json({ error: 'Failed to create project.' });
    }
  });

  app.put('/api/projects/:id', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const user = await getOrCreateUser({ uid: req.user!.uid, email: req.user!.email ?? '' });
      const projectId = Number(req.params.id);
      const { title, aspectRatio, resolution, fps, durationMs, thumbnailUrl, stateJson } = req.body;
      const updated = await db
        .update(projects)
        .set({
          title,
          aspectRatio,
          resolution,
          fps: Number(fps) || 30,
          durationMs: Number(durationMs) || 15000,
          thumbnailUrl: thumbnailUrl || '',
          stateJson,
          updatedAt: new Date(),
        })
        .where(and(eq(projects.id, projectId), eq(projects.userId, user.id)))
        .returning();
      if (updated.length === 0) {
        return res.status(404).json({ error: 'Project not found.' });
      }
      return res.json({ project: updated[0] });
    } catch (err) {
      console.error('PUT /api/projects/:id error:', err);
      return res.status(500).json({ error: 'Failed to save project.' });
    }
  });

  app.delete('/api/projects/:id', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const user = await getOrCreateUser({ uid: req.user!.uid, email: req.user!.email ?? '' });
      const projectId = Number(req.params.id);
      await db
        .delete(projects)
        .where(and(eq(projects.id, projectId), eq(projects.userId, user.id)));
      return res.json({ deleted: true });
    } catch (err) {
      console.error('DELETE /api/projects/:id error:', err);
      return res.status(500).json({ error: 'Failed to delete project.' });
    }
  });

  // 4. Custom Color Grading Presets
  app.get('/api/presets', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const user = await getOrCreateUser({ uid: req.user!.uid, email: req.user!.email ?? '' });
      const list = await db
        .select()
        .from(colorPresets)
        .where(eq(colorPresets.userId, user.id))
        .orderBy(desc(colorPresets.createdAt));
      return res.json({ presets: list });
    } catch (err) {
      console.error('GET /api/presets error:', err);
      return res.status(500).json({ error: 'Failed to fetch presets.' });
    }
  });

  app.post('/api/presets', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const user = await getOrCreateUser({ uid: req.user!.uid, email: req.user!.email ?? '' });
      const { name, settingsJson } = req.body;
      const inserted = await db
        .insert(colorPresets)
        .values({
          userId: user.id,
          name: name || 'My Preset',
          settingsJson: settingsJson || {},
        })
        .returning();
      return res.json({ preset: inserted[0] });
    } catch (err) {
      console.error('POST /api/presets error:', err);
      return res.status(500).json({ error: 'Failed to save preset.' });
    }
  });

  // 5. AI Studio Routes
  app.post('/api/ai/script', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const { idea, refinement, systemPrompt, durationSec, aspectRatio, style, language, includeVoiceover } =
        req.body;
      const script = await generateVideoScript({
        idea: String(idea || ''),
        refinement: refinement ? String(refinement) : undefined,
        systemPrompt: systemPrompt ? String(systemPrompt) : undefined,
        durationSec: Number(durationSec) || 15,
        aspectRatio: String(aspectRatio || '9:16'),
        style: String(style || 'cinematic'),
        language: String(language || 'ru'),
        includeVoiceover: Boolean(includeVoiceover),
      });
      return res.json({ script });
    } catch (err) {
      console.error('POST /api/ai/script error:', err);
      return res.status(500).json({ error: 'Script generation failed.' });
    }
  });

  app.post('/api/ai/generate-video', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const user = await getOrCreateUser({ uid: req.user!.uid, email: req.user!.email ?? '' });
      const { prompt, refinement, systemPrompt, aspectRatio, durationSec, style, scenes } = req.body;
      const requestedDur = Number(durationSec) || 15;

      // Enforce plan limits
      if (user.plan === 'free_15s' && requestedDur > 15) {
        return res.status(402).json({ error: 'PLAN_UPGRADE_REQUIRED' });
      }
      if (user.plan === 'pro_30s' && requestedDur > 30) {
        return res.status(402).json({ error: 'PLAN_UPGRADE_REQUIRED' });
      }

      const today = new Date().toISOString().slice(0, 10);
      const currentCount = user.dailyAiDate === today ? user.dailyAiCount : 0;
      if (user.plan === 'free_15s' && currentCount >= 3) {
        return res.status(429).json({ error: 'DAILY_FREE_LIMIT_REACHED' });
      }

      const result = await generateVideoAsset({
        prompt: String(prompt || ''),
        refinement: refinement ? String(refinement) : undefined,
        systemPrompt: systemPrompt ? String(systemPrompt) : undefined,
        aspectRatio: String(aspectRatio || '9:16'),
        durationSec: requestedDur,
        style: String(style || 'cinematic'),
        watermark: user.plan === 'free_15s',
        scenes: Array.isArray(scenes) ? scenes : undefined,
      });

      await updateUserProfile(user.uid, {
        dailyAiCount: currentCount + 1,
        dailyAiDate: today,
      });

      return res.json(result);
    } catch (err) {
      console.error('POST /api/ai/generate-video error:', err);
      return res.status(500).json({ error: 'Video generation failed.' });
    }
  });

  app.post('/api/ai/generate-image', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const { prompt, refinement, systemPrompt, aspectRatio } = req.body;
      const result = await generateImageAsset({
        prompt: String(prompt || ''),
        refinement: refinement ? String(refinement) : undefined,
        systemPrompt: systemPrompt ? String(systemPrompt) : undefined,
        aspectRatio: String(aspectRatio || '9:16'),
      });
      return res.json(result);
    } catch (err) {
      console.error('POST /api/ai/generate-image error:', err);
      return res.status(500).json({ error: 'Image generation failed.' });
    }
  });

  app.post('/api/ai/tts', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const { text, voiceName, style } = req.body;
      const result = await generateTtsAudio({
        text: String(text || ''),
        voiceName: String(voiceName || 'Kore'),
        style: style ? String(style) : undefined,
      });
      return res.json(result);
    } catch (err) {
      console.error('POST /api/ai/tts error:', err);
      return res.status(500).json({ error: 'TTS failed.' });
    }
  });

  app.post('/api/ai/hashtags', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const { topic, platforms, language } = req.body;
      const result = await suggestSocialHashtags({
        topic: String(topic || ''),
        platforms: Array.isArray(platforms) ? platforms : ['instagram', 'tiktok'],
        language: String(language || 'ru'),
      });
      return res.json(result);
    } catch (err) {
      console.error('POST /api/ai/hashtags error:', err);
      return res.status(500).json({ error: 'Failed to suggest hashtags.' });
    }
  });

  app.post('/api/ai/edit-command', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const { prompt, aspectRatio, resolution, language } = req.body;
      if (!prompt || !String(prompt).trim()) {
        return res.status(400).json({ error: 'Command prompt is required.' });
      }
      const plan = await executeEditorWish({
        prompt: String(prompt),
        aspectRatio: String(aspectRatio || '9:16'),
        resolution: String(resolution || '1080p'),
        language: String(language || 'ru'),
      });
      return res.json({ plan });
    } catch (err) {
      console.error('POST /api/ai/edit-command error:', err);
      return res.status(500).json({ error: 'AI command failed.' });
    }
  });

  // 6. MP4 FFmpeg Export Endpoint
  app.post(
    '/api/export/transcode',
    requireAuth,
    express.raw({ type: 'application/octet-stream', limit: '150mb' }),
    async (req: AuthRequest, res: Response) => {
      try {
        const resolution = String(req.headers['x-export-resolution'] || '1080p');
        const fps = Number(req.headers['x-export-fps'] || 30);
        const quality = String(req.headers['x-export-quality'] || 'high');
        const aspectRatio = String(req.headers['x-export-aspect'] || '9:16');
        const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body);
        if (!buf || buf.length === 0) {
          return res.status(400).json({ error: 'Empty media stream.' });
        }
        const result = await transcodeToMp4({
          inputBuffer: buf,
          resolution,
          fps,
          quality,
          aspectRatio,
        });
        return res.json(result);
      } catch (err) {
        console.error('POST /api/export/transcode error:', err);
        return res.status(500).json({ error: 'MP4 transcoding failed.' });
      }
    },
  );

  // 7. Billing & Stripe Checkout (Never stores raw card numbers or CVV!)
  app.post('/api/billing/checkout', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const user = await getOrCreateUser({ uid: req.user!.uid, email: req.user!.email ?? '' });
      const age = calculateAge(user.birthDate);
      const { plan, paymentMethod, receiptEmail, parentalConsentConfirmed } = req.body as {
        plan: 'pro_30s' | 'studio_1m';
        paymentMethod: string;
        receiptEmail?: string;
        parentalConsentConfirmed?: boolean;
      };

      if (age < 18 && !user.parentalConsent && !parentalConsentConfirmed) {
        return res.status(403).json({ error: 'PARENTAL_CONSENT_REQUIRED' });
      }

      if (parentalConsentConfirmed && !user.parentalConsent) {
        await updateUserProfile(user.uid, { parentalConsent: true });
      }

      const amountUsd = plan === 'studio_1m' ? 30 : 20;
      let stripeSessionId = `tok_stripe_${crypto.randomUUID().slice(0, 14)}`;

      if (process.env.STRIPE_SECRET_KEY) {
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
        const intent = await stripe.paymentIntents.create({
          amount: amountUsd * 100,
          currency: 'usd',
          description: `Kinetix ${plan === 'studio_1m' ? '1 Minute Studio' : '30 Seconds Pro'} (First Year)`,
          receipt_email: receiptEmail || user.email || undefined,
          automatic_payment_methods: { enabled: true },
        });
        stripeSessionId = intent.id;
      }

      const expiresAt = new Date();
      expiresAt.setFullYear(expiresAt.getFullYear() + 1);

      const updatedUser = await updateUserProfile(user.uid, {
        plan,
        planExpiresAt: expiresAt,
        planAutoRenew: true,
      });

      const receipt = await db
        .insert(payments)
        .values({
          userId: user.id,
          plan,
          amountUsd,
          paymentMethod: paymentMethod || 'card',
          stripeSessionId,
          receiptEmail: receiptEmail || user.email || '',
          status: 'paid',
        })
        .returning();

      return res.json({
        success: true,
        user: updatedUser,
        receipt: receipt[0],
        receiptSentTo: receiptEmail || user.email,
      });
    } catch (err) {
      console.error('POST /api/billing/checkout error:', err);
      return res.status(500).json({ error: 'Payment processing failed.' });
    }
  });

  app.post('/api/billing/cancel', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const updatedUser = await updateUserProfile(req.user!.uid, {
        planAutoRenew: false,
      });
      return res.json({ user: updatedUser });
    } catch (err) {
      console.error('POST /api/billing/cancel error:', err);
      return res.status(500).json({ error: 'Failed to cancel subscription.' });
    }
  });

  // 8. Social Connections & Publishing (Instagram + TikTok)
  app.get('/api/social/connections', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const user = await getOrCreateUser({ uid: req.user!.uid, email: req.user!.email ?? '' });
      const connections = await db
        .select({
          id: socialConnections.id,
          platform: socialConnections.platform,
          handle: socialConnections.handle,
          connectedAt: socialConnections.connectedAt,
        })
        .from(socialConnections)
        .where(eq(socialConnections.userId, user.id));
      const posts = await db
        .select()
        .from(scheduledPosts)
        .where(eq(scheduledPosts.userId, user.id))
        .orderBy(desc(scheduledPosts.createdAt));
      return res.json({ connections, posts });
    } catch (err) {
      console.error('GET /api/social/connections error:', err);
      return res.status(500).json({ error: 'Failed to fetch social accounts.' });
    }
  });

  app.get('/api/social/oauth-url/:platform', requireAuth, (req: AuthRequest, res: Response) => {
    const platform = req.params.platform;
    const baseUrl = getAppBaseUrl(req);
    const redirectUri = `${baseUrl}/auth/callback/${platform}`;

    if (platform === 'tiktok' && process.env.TIKTOK_CLIENT_KEY) {
      const params = new URLSearchParams({
        client_key: process.env.TIKTOK_CLIENT_KEY,
        scope: 'user.info.basic,video.publish,video.upload',
        response_type: 'code',
        redirect_uri: redirectUri,
        state: req.user!.uid,
      });
      return res.json({
        configured: true,
        url: `https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`,
        redirectUri,
      });
    }

    if (platform === 'instagram' && process.env.INSTAGRAM_CLIENT_ID) {
      const params = new URLSearchParams({
        client_id: process.env.INSTAGRAM_CLIENT_ID,
        redirect_uri: redirectUri,
        scope: 'instagram_basic,instagram_content_publish',
        response_type: 'code',
        state: req.user!.uid,
      });
      return res.json({
        configured: true,
        url: `https://api.instagram.com/oauth/authorize?${params.toString()}`,
        redirectUri,
      });
    }

    return res.json({ configured: false, redirectUri });
  });

  app.get(
    ['/auth/callback/:platform', '/auth/callback/:platform/'],
    async (req: Request, res: Response) => {
      const platform = String(req.params.platform || 'instagram');
      const code = String(req.query.code || '');
      const stateUid = String(req.query.state || '');
      if (code && stateUid) {
        try {
          const user = await getOrCreateUser({ uid: stateUid });
          await db.insert(socialConnections).values({
            userId: user.id,
            platform,
            handle: `@${platform}_creator`,
            accessToken: `oauth_${code.slice(0, 12)}`,
          });
        } catch (err) {
          console.error('OAuth callback save error:', err);
        }
      }
      res.send(`<!doctype html><html><body style="background:#000;color:#fff;font-family:sans-serif;padding:24px;">
        <script>
          if (window.opener) {
            window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS', platform: '${platform}' }, '*');
            window.close();
          } else {
            window.location.href = '/';
          }
        </script>
        <p>Authorization complete. This window will close automatically.</p>
      </body></html>`);
    },
  );

  app.post('/api/social/connect-account', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const user = await getOrCreateUser({ uid: req.user!.uid, email: req.user!.email ?? '' });
      const { platform, handle, password } = req.body as {
        platform: string;
        handle: string;
        password?: string;
      };
      const cleanHandle = String(handle || '').trim();
      const cleanPassword = String(password || '').trim();
      if (!cleanHandle) {
        return res.status(400).json({ error: 'ACCOUNT_HANDLE_REQUIRED' });
      }
      if (!cleanPassword || cleanPassword.length < 4) {
        return res.status(400).json({ error: 'ACCOUNT_PASSWORD_REQUIRED' });
      }
      await db
        .delete(socialConnections)
        .where(
          and(
            eq(socialConnections.userId, user.id),
            eq(socialConnections.platform, platform),
          ),
        );
      const credHash = crypto
        .createHash('sha256')
        .update(`${platform}:${cleanHandle}:${cleanPassword}`)
        .digest('hex')
        .slice(0, 24);
      const formattedHandle =
        cleanHandle.startsWith('@') || cleanHandle.includes('@')
          ? cleanHandle
          : `@${cleanHandle}`;
      const inserted = await db
        .insert(socialConnections)
        .values({
          userId: user.id,
          platform,
          handle: formattedHandle,
          accessToken: `cred_${credHash}`,
        })
        .returning();
      return res.json({
        connection: {
          id: inserted[0].id,
          platform: inserted[0].platform,
          handle: inserted[0].handle,
          connectedAt: inserted[0].connectedAt,
        },
      });
    } catch (err) {
      console.error('POST /api/social/connect-account error:', err);
      return res.status(500).json({ error: 'Failed to connect account.' });
    }
  });

  app.delete(
    '/api/social/connections/:platform',
    requireAuth,
    async (req: AuthRequest, res: Response) => {
      try {
        const user = await getOrCreateUser({ uid: req.user!.uid, email: req.user!.email ?? '' });
        const platform = String(req.params.platform);
        await db
          .delete(socialConnections)
          .where(
            and(
              eq(socialConnections.userId, user.id),
              eq(socialConnections.platform, platform),
            ),
          );
        return res.json({ disconnected: true });
      } catch (err) {
        console.error('DELETE social connection error:', err);
        return res.status(500).json({ error: 'Failed to disconnect account.' });
      }
    },
  );

  app.post('/api/social/publish', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const user = await getOrCreateUser({ uid: req.user!.uid, email: req.user!.email ?? '' });
      const age = calculateAge(user.birthDate);
      const {
        projectId,
        platforms,
        caption,
        hashtags,
        scheduledAt,
        mediaUrl,
        parentalConsentConfirmed,
      } = req.body;

      if (age < 18 && !user.parentalConsent && !parentalConsentConfirmed) {
        return res.status(403).json({ error: 'PARENTAL_CONSENT_REQUIRED' });
      }

      if (parentalConsentConfirmed && !user.parentalConsent) {
        await updateUserProfile(user.uid, { parentalConsent: true });
      }

      const scheduleDate = scheduledAt ? new Date(scheduledAt) : new Date();
      const isFuture = scheduleDate.getTime() > Date.now() + 60000;

      const inserted = await db
        .insert(scheduledPosts)
        .values({
          userId: user.id,
          projectId: projectId ? Number(projectId) : null,
          platforms: Array.isArray(platforms) ? platforms : ['instagram'],
          caption: String(caption || ''),
          hashtags: Array.isArray(hashtags) ? hashtags : [],
          scheduledAt: scheduleDate,
          status: isFuture ? 'scheduled' : 'published',
          mediaUrl: String(mediaUrl || ''),
        })
        .returning();

      return res.json({ post: inserted[0] });
    } catch (err) {
      console.error('POST /api/social/publish error:', err);
      return res.status(500).json({ error: 'Failed to publish post.' });
    }
  });
}
