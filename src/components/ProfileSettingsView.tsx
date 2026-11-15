import { useEffect, useState } from 'react';
import { signOut } from 'firebase/auth';
import {
  Calendar,
  CreditCard,
  Globe,
  Instagram,
  LogOut,
  Music2,
  Receipt,
  Shield,
} from 'lucide-react';
import { LANGUAGES, t } from '../data/i18n.ts';
import { apiFetch, setLocalSessionToken } from '../lib/api.ts';
import { auth } from '../lib/firebase.ts';
import type { LanguageCode, UserProfile } from '../types/editor.ts';

interface PaymentRecord {
  id: number;
  plan: string;
  amountUsd: number;
  paymentMethod: string;
  receiptEmail: string;
  createdAt: string;
}

interface SocialConn {
  id: number;
  platform: string;
  handle: string;
}

interface PostRecord {
  id: number;
  platforms: string[];
  caption: string;
  status: string;
  scheduledAt: string;
}

interface Props {
  user: UserProfile;
  lang: LanguageCode;
  onLanguageChange: (lang: LanguageCode) => void;
  onUserUpdated: (u: UserProfile) => void;
  onOpenPricing: () => void;
  onLoggedOut: () => void;
}

export function ProfileSettingsView({
  user,
  lang,
  onLanguageChange,
  onUserUpdated,
  onOpenPricing,
  onLoggedOut,
}: Props) {
  const dict = t(lang);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [connections, setConnections] = useState<SocialConn[]>([]);
  const [posts, setPosts] = useState<PostRecord[]>([]);
  const [canceling, setCanceling] = useState(false);

  const loadDetails = async () => {
    try {
      const [me, soc] = await Promise.all([
        apiFetch<{ user: UserProfile; payments: PaymentRecord[] }>('/api/user/me'),
        apiFetch<{ connections: SocialConn[]; posts: PostRecord[] }>('/api/social/connections'),
      ]);
      onUserUpdated(me.user);
      setPayments(me.payments || []);
      setConnections(soc.connections || []);
      setPosts(soc.posts || []);
    } catch (err) {
      console.error('Failed loading profile details:', err);
    }
  };

  useEffect(() => {
    void loadDetails();
  }, []);

  const handleLanguageSwitch = async (nextLang: LanguageCode) => {
    onLanguageChange(nextLang);
    try {
      const res = await apiFetch<{ user: UserProfile }>('/api/user/me', {
        method: 'PATCH',
        body: JSON.stringify({ language: nextLang }),
      });
      if (res.user) onUserUpdated(res.user);
    } catch {
      // keep local language active
    }
  };

  const handleCancelSubscription = async () => {
    setCanceling(true);
    try {
      const res = await apiFetch<{ user: UserProfile }>('/api/billing/cancel', {
        method: 'POST',
      });
      if (res.user) onUserUpdated(res.user);
    } finally {
      setCanceling(false);
    }
  };

  const handleDisconnectSocial = async (platform: string) => {
    await apiFetch(`/api/social/connections/${platform}`, { method: 'DELETE' });
    setConnections((prev) => prev.filter((c) => c.platform !== platform));
  };

  const handleLogout = async () => {
    setLocalSessionToken(null);
    await signOut(auth).catch(() => {});
    onLoggedOut();
  };

  const planLabel =
    user.plan === 'studio_1m'
      ? '1 минута · Studio ($30/год)'
      : user.plan === 'pro_30s'
        ? '30 секунд · Pro ($20/год)'
        : '15 секунд · Бесплатный';

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-24">
      {/* User Summary */}
      <div className="bg-[#121212] border border-white/10 rounded-3xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-[#00E5FF]/15 border border-[#00E5FF]/40 flex items-center justify-center text-xl font-bold text-[#00E5FF]">
            {(user.firstName?.[0] || user.email?.[0] || 'K').toUpperCase()}
          </div>
          <div>
            <h2 className="font-display text-lg font-bold text-white">
              {`${user.firstName} ${user.lastName}`.trim() || 'Kinetix Creator'}
            </h2>
            <div className="text-xs text-zinc-400 flex flex-wrap items-center gap-2 mt-1">
              <span>{user.email || user.phone || 'Аккаунт подтверждён'}</span>
              <span aria-hidden="true">·</span>
              <span>Дата рождения: {user.birthDate}</span>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="px-4 py-2.5 rounded-xl bg-[#1C1C1E] border border-white/10 text-xs font-medium text-zinc-300 hover:text-white flex items-center gap-2 w-fit"
        >
          <LogOut className="w-4 h-4" />
          <span>Выйти</span>
        </button>
      </div>

      {/* Subscription & Billing */}
      <div className="bg-[#121212] border border-white/10 rounded-3xl p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <CreditCard className="w-5 h-5 text-[#00E5FF]" />
            <div>
              <h3 className="text-sm font-semibold text-white">{planLabel}</h3>
              {user.planExpiresAt && (
                <p className="text-xs text-zinc-400 mt-0.5 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>
                    Действует до{' '}
                    {new Date(user.planExpiresAt).toLocaleDateString('ru-RU')}
                    {!user.planAutoRenew && ' (автопродление отменено)'}
                  </span>
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onOpenPricing}
              className="px-4 py-2.5 rounded-xl bg-[#00E5FF] text-black text-xs font-semibold hover:bg-[#33ECFF]"
            >
              {dict.plans}
            </button>
            {user.plan !== 'free_15s' && user.planAutoRenew && (
              <button
                type="button"
                disabled={canceling}
                onClick={handleCancelSubscription}
                className="px-4 py-2.5 rounded-xl bg-[#1C1C1E] border border-[#FF2D6F]/40 text-xs font-medium text-[#FF7DA6] hover:bg-[#FF2D6F]/15"
              >
                {dict.cancelSubscription}
              </button>
            )}
          </div>
        </div>

        {payments.length > 0 && (
          <div className="pt-3 border-t border-white/8 space-y-2">
            <div className="text-xs font-medium text-zinc-400 flex items-center gap-1.5">
              <Receipt className="w-3.5 h-3.5" />
              <span>История чеков</span>
            </div>
            {payments.map((pay) => (
              <div
                key={pay.id}
                className="flex items-center justify-between text-xs bg-[#1C1C1E] rounded-xl px-3.5 py-2.5"
              >
                <span className="text-zinc-200">
                  {pay.plan === 'studio_1m' ? '1 минута · Studio' : '30 секунд · Pro'} ·{' '}
                  {pay.paymentMethod}
                </span>
                <span className="font-mono-tabular text-[#00E5FF]">${pay.amountUsd}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Language Switcher in Settings */}
      <div className="bg-[#121212] border border-white/10 rounded-3xl p-6 space-y-3">
        <div className="flex items-center gap-2.5">
          <Globe className="w-5 h-5 text-[#00E5FF]" />
          <h3 className="text-sm font-semibold text-white">Язык интерфейса</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-2">
          {LANGUAGES.map((item) => (
            <button
              key={item.code}
              type="button"
              onClick={() => handleLanguageSwitch(item.code)}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-xs transition-colors min-h-[40px] ${
                lang === item.code
                  ? 'bg-[#00E5FF]/15 border-[#00E5FF] text-white'
                  : 'bg-[#1C1C1E] border-white/8 text-zinc-400 hover:text-white'
              }`}
            >
              <span>{item.flag}</span>
              <span className="truncate">{item.nativeName}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Social Connections & Scheduled Posts */}
      <div className="bg-[#121212] border border-white/10 rounded-3xl p-6 space-y-4">
        <div className="flex items-center gap-2.5">
          <Shield className="w-5 h-5 text-[#FF2D6F]" />
          <h3 className="text-sm font-semibold text-white">Подключённые соцсети и публикации</h3>
        </div>
        {connections.length === 0 ? (
          <p className="text-xs text-zinc-400">
            Аккаунты Instagram и TikTok подключаются перед публикацией готового видео.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {connections.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between bg-[#1C1C1E] rounded-xl px-4 py-3"
              >
                <div className="flex items-center gap-2.5 text-xs">
                  {c.platform === 'instagram' ? (
                    <Instagram className="w-4 h-4 text-[#FF2D6F]" />
                  ) : (
                    <Music2 className="w-4 h-4 text-[#00E5FF]" />
                  )}
                  <span className="font-medium text-white capitalize">{c.platform}</span>
                  <span className="text-zinc-400">{c.handle}</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleDisconnectSocial(c.platform)}
                  className="text-[11px] text-zinc-400 hover:text-[#FF2D6F]"
                >
                  Отключить
                </button>
              </div>
            ))}
          </div>
        )}

        {posts.length > 0 && (
          <div className="pt-3 border-t border-white/8 space-y-2">
            <div className="text-xs text-zinc-400">Недавние и запланированные публикации</div>
            {posts.slice(0, 5).map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between bg-[#1C1C1E] rounded-xl px-3.5 py-2.5 text-xs"
              >
                <div className="truncate max-w-[70%]">
                  <span className="text-white font-medium">{p.platforms.join(', ')}</span>
                  <span className="text-zinc-500"> · {p.caption || 'Без описания'}</span>
                </div>
                <span className="text-[#00E5FF]">
                  {p.status === 'scheduled'
                    ? new Date(p.scheduledAt).toLocaleString('ru-RU', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : 'Опубликовано'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
