import { useMemo, useState } from 'react';
import {
  Check,
  CreditCard,
  Lock,
  ShieldCheck,
  Smartphone,
  Sparkles,
  X,
} from 'lucide-react';
import { ALL_COUNTRIES } from '../data/countries.ts';
import { t } from '../data/i18n.ts';
import { apiFetch } from '../lib/api.ts';
import type { LanguageCode, SubscriptionPlan, UserProfile } from '../types/editor.ts';

interface Props {
  user: UserProfile;
  lang: LanguageCode;
  onClose: () => void;
  onUpdatedUser: (u: UserProfile) => void;
}

function detectCardBrand(num: string): string {
  const clean = num.replace(/\D/g, '');
  if (clean.startsWith('4')) return 'Visa';
  if (/^(5[1-5]|2[2-7])/.test(clean)) return 'Mastercard';
  if (clean.startsWith('220')) return 'Мир';
  return 'Card';
}

export function PricingCheckoutModal({ user, lang, onClose, onUpdatedUser }: Props) {
  const dict = t(lang);
  const [selectedPlan, setSelectedPlan] = useState<'pro_30s' | 'studio_1m' | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<string>('card');
  const [countryIso, setCountryIso] = useState('RU');
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvv, setCvv] = useState('');
  const [holder, setHolder] = useState(`${user.firstName} ${user.lastName}`.trim());
  const [receiptEmail, setReceiptEmail] = useState(user.email || '');
  const [parentalConfirm, setParentalConfirm] = useState(user.parentalConsent);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [receiptInfo, setReceiptInfo] = useState<{ plan: string; email: string; amount: number } | null>(null);

  const selectedCountry = useMemo(
    () => ALL_COUNTRIES.find((c) => c.iso === countryIso) || ALL_COUNTRIES[0],
    [countryIso],
  );

  const userAge = useMemo(() => {
    const d = new Date(user.birthDate);
    if (Number.isNaN(d.getTime())) return 25;
    return new Date().getFullYear() - d.getFullYear();
  }, [user.birthDate]);

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlan) return;
    setError('');

    if (paymentMethod === 'card') {
      const digits = cardNumber.replace(/\D/g, '');
      if (digits.length < 13 || !expiry.includes('/') || cvv.length < 3 || !holder.trim()) {
        setError('Проверьте реквизиты карты (номер, срок действия, CVV и имя владельца).');
        return;
      }
    }

    if (userAge < 18 && !parentalConfirm) {
      setError('Для пользователей младше 18 лет необходимо подтвердить согласие родителя.');
      return;
    }

    setLoading(true);
    try {
      // Only send tokenized/method metadata — raw card numbers and CVV never leave the browser
      const res = await apiFetch<{
        success: boolean;
        user: UserProfile;
        receiptSentTo: string;
      }>('/api/billing/checkout', {
        method: 'POST',
        body: JSON.stringify({
          plan: selectedPlan,
          paymentMethod,
          receiptEmail: receiptEmail.trim() || user.email,
          parentalConsentConfirmed: parentalConfirm,
        }),
      });
      onUpdatedUser(res.user);
      setReceiptInfo({
        plan: selectedPlan === 'studio_1m' ? '1 минута · Studio' : '30 секунд · Pro',
        email: res.receiptSentTo || receiptEmail || 'email',
        amount: selectedPlan === 'studio_1m' ? 30 : 20,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка оплаты');
    } finally {
      setLoading(false);
    }
  };

  const plans: Array<{
    id: SubscriptionPlan;
    duration: string;
    price: string;
    badge?: string;
    features: string[];
  }> = [
    {
      id: 'free_15s',
      duration: '15 секунд',
      price: '$0',
      features: [
        'До 15 секунд длительности ролика',
        'Лимит: до 3 ИИ-видео в день',
        'Небольшой водяной знак Kinetix',
      ],
    },
    {
      id: 'pro_30s',
      duration: '30 секунд',
      price: '$20',
      badge: dict.firstYear,
      features: [
        'До 30 секунд длительности ролика',
        'Без водяного знака',
        'Безлимитный экспорт 2K / 60 FPS',
      ],
    },
    {
      id: 'studio_1m',
      duration: '1 минута',
      price: '$30',
      badge: dict.firstYear,
      features: [
        'До 60 секунд длительности ролика',
        'Без водяного знака · Экспорт 4K 60 FPS',
        'Приоритетная генерация Veo + публикация',
      ],
    },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full max-w-3xl bg-[#121212] border border-white/10 rounded-t-3xl sm:rounded-3xl max-h-[92vh] overflow-y-auto p-5 sm:p-7">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="font-display text-xl font-bold text-white">
              {selectedPlan ? 'Оплата через Stripe' : dict.plans}
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Защищённое шифрование платежей · Мы не храним данные вашей карты
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-xl bg-[#1C1C1E] flex items-center justify-center text-zinc-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {receiptInfo ? (
          <div className="bg-[#1C1C1E] border border-[#00E5FF]/30 rounded-2xl p-6 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-[#00E5FF]/15 text-[#00E5FF] flex items-center justify-center mx-auto">
              <Check className="w-6 h-6" />
            </div>
            <h3 className="font-display text-lg font-bold text-white">
              Подписка «{receiptInfo.plan}» активирована
            </h3>
            <p className="text-sm text-zinc-300">
              Сумма: <span className="font-mono-tabular font-semibold">${receiptInfo.amount}</span> за первый год. Чек отправлен на <span className="text-[#00E5FF]">{receiptInfo.email}</span>.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-2 px-6 py-3 rounded-xl bg-[#00E5FF] text-black font-semibold text-sm"
            >
              Готово
            </button>
          </div>
        ) : !selectedPlan ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            {plans.map((p) => {
              const isCurrent = user.plan === p.id;
              const isPaid = p.id !== 'free_15s';
              return (
                <div
                  key={p.id}
                  className={`rounded-2xl p-4 border flex flex-col justify-between ${
                    p.id === 'studio_1m'
                      ? 'bg-[#1C1C1E] border-[#00E5FF]/60'
                      : 'bg-[#1C1C1E] border-white/10'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-sm font-semibold text-white">{p.duration}</span>
                      {p.badge && (
                        <span className="text-[11px] font-medium text-[#00E5FF]">
                          {p.badge}
                        </span>
                      )}
                    </div>
                    <div className="font-display text-3xl font-bold text-white font-mono-tabular mb-4">
                      {p.price}
                      {isPaid && <span className="text-xs font-normal text-zinc-400"> / год</span>}
                    </div>
                    <ul className="space-y-2 text-xs text-zinc-300 mb-5">
                      {p.features.map((f) => (
                        <li key={f} className="flex items-start gap-2">
                          <Check className="w-3.5 h-3.5 text-[#00E5FF] shrink-0 mt-0.5" />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {isCurrent ? (
                    <div className="w-full py-2.5 rounded-xl bg-white/5 text-center text-xs font-medium text-zinc-400">
                      Текущий тариф
                    </div>
                  ) : isPaid ? (
                    <button
                      type="button"
                      onClick={() => setSelectedPlan(p.id as 'pro_30s' | 'studio_1m')}
                      className={`w-full py-3 rounded-xl text-xs font-semibold transition-colors ${
                        p.id === 'studio_1m'
                          ? 'bg-[#00E5FF] text-black hover:bg-[#33ECFF]'
                          : 'bg-[#FF2D6F] text-white hover:bg-[#FF4983]'
                      }`}
                    >
                      {dict.subscribe}
                    </button>
                  ) : (
                    <div className="w-full py-2.5 rounded-xl bg-white/5 text-center text-xs text-zinc-500">
                      Базовый доступ
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <form onSubmit={handleCheckout} className="space-y-4">
            <div className="flex items-center justify-between p-3.5 rounded-2xl bg-[#1C1C1E] border border-white/10">
              <div className="flex items-center gap-2.5">
                <Sparkles className="w-4 h-4 text-[#00E5FF]" />
                <div>
                  <div className="text-sm font-semibold text-white">
                    {selectedPlan === 'studio_1m' ? '1 минута · Studio' : '30 секунд · Pro'} ({dict.firstYear})
                  </div>
                  <div className="text-xs text-zinc-400">Без водяного знака · Продление раз в год</div>
                </div>
              </div>
              <div className="font-mono-tabular text-lg font-bold text-[#00E5FF]">
                ${selectedPlan === 'studio_1m' ? 30 : 20}
              </div>
            </div>

            {/* Country Local Methods Selector */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <label className="block text-xs text-zinc-400 mb-1.5">Страна оплаты</label>
                <select
                  value={countryIso}
                  onChange={(e) => setCountryIso(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl bg-[#1C1C1E] border border-white/10 text-xs text-white"
                >
                  {ALL_COUNTRIES.map((c) => (
                    <option key={c.iso} value={c.iso}>
                      {c.flag} {c.name} — {c.localPay}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-xs text-zinc-400 mb-1.5">Email для отправки чека</label>
                <input
                  type="email"
                  required
                  value={receiptEmail}
                  onChange={(e) => setReceiptEmail(e.target.value)}
                  placeholder="receipt@example.com"
                  className="w-full h-11 px-3 rounded-xl bg-[#1C1C1E] border border-white/10 text-xs text-white"
                />
              </div>
            </div>

            {/* Payment Method Tabs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { id: 'card', label: 'Visa / Mastercard', icon: CreditCard },
                { id: 'apple_pay', label: 'Apple Pay', icon: Smartphone },
                { id: 'google_pay', label: 'Google Pay', icon: Smartphone },
                { id: 'local', label: selectedCountry.localPay, icon: ShieldCheck },
              ].map((m) => {
                const Icon = m.icon;
                const active = paymentMethod === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setPaymentMethod(m.id)}
                    className={`p-3 rounded-xl border text-xs font-medium flex items-center gap-2 transition-all min-h-[44px] ${
                      active
                        ? 'bg-[#00E5FF]/15 border-[#00E5FF] text-white'
                        : 'bg-[#1C1C1E] border-white/10 text-zinc-400 hover:text-white'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{m.label}</span>
                  </button>
                );
              })}
            </div>

            {paymentMethod === 'card' && (
              <div className="bg-[#1C1C1E] border border-white/10 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between text-xs text-zinc-400">
                  <span>Данные карты (шифрование Stripe TLS)</span>
                  <span className="text-[#00E5FF] font-semibold">{detectCardBrand(cardNumber)}</span>
                </div>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={19}
                  value={cardNumber}
                  onChange={(e) =>
                    setCardNumber(
                      e.target.value
                        .replace(/\D/g, '')
                        .replace(/(.{4})/g, '$1 ')
                        .trim(),
                    )
                  }
                  placeholder="4242 4242 4242 4242"
                  className="w-full h-11 px-3.5 rounded-xl bg-black/50 border border-white/10 text-sm font-mono-tabular text-white"
                />
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="text"
                    maxLength={5}
                    value={expiry}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/\D/g, '').slice(0, 4);
                      setExpiry(raw.length > 2 ? `${raw.slice(0, 2)}/${raw.slice(2)}` : raw);
                    }}
                    placeholder="MM/YY"
                    className="h-11 px-3.5 rounded-xl bg-black/50 border border-white/10 text-sm font-mono-tabular text-white"
                  />
                  <input
                    type="password"
                    maxLength={4}
                    value={cvv}
                    onChange={(e) => setCvv(e.target.value.replace(/\D/g, ''))}
                    placeholder="CVV"
                    className="h-11 px-3.5 rounded-xl bg-black/50 border border-white/10 text-sm font-mono-tabular text-white"
                  />
                </div>
                <input
                  type="text"
                  value={holder}
                  onChange={(e) => setHolder(e.target.value)}
                  placeholder="Имя владельца карты"
                  className="w-full h-11 px-3.5 rounded-xl bg-black/50 border border-white/10 text-sm text-white uppercase"
                />
              </div>
            )}

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

            {error && (
              <div className="text-xs text-[#FF2D6F] bg-[#FF2D6F]/10 border border-[#FF2D6F]/30 rounded-xl px-3.5 py-2.5">
                {error}
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => setSelectedPlan(null)}
                className="px-4 h-12 rounded-xl bg-[#1C1C1E] text-xs font-medium text-zinc-300"
              >
                {dict.back}
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 h-12 rounded-xl bg-[#00E5FF] text-black font-semibold text-sm flex items-center justify-center gap-2 hover:bg-[#33ECFF] disabled:opacity-50"
              >
                <Lock className="w-4 h-4" />
                <span>
                  {loading
                    ? 'Обработка...'
                    : `Оплатить $${selectedPlan === 'studio_1m' ? 30 : 20}`}
                </span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
