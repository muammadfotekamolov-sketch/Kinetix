import { useMemo, useState } from 'react';
import { signInWithPopup } from 'firebase/auth';
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Globe,
  Mail,
  Phone,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { ALL_COUNTRIES } from '../data/countries.ts';
import { LANGUAGES, t } from '../data/i18n.ts';
import { apiFetch, setLocalSessionToken } from '../lib/api.ts';
import { auth, googleAuthProvider } from '../lib/firebase.ts';
import type { LanguageCode, UserProfile } from '../types/editor.ts';
import { KinetixLogo } from './KinetixLogo.tsx';

interface Props {
  initialLanguage: LanguageCode;
  onLanguageChange: (lang: LanguageCode) => void;
  onAuthenticated: (user: UserProfile) => void;
}

function calcAge(birthDate: string): number {
  const dob = new Date(birthDate);
  if (Number.isNaN(dob.getTime())) return 99;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
  return age;
}

export function OnboardingFlow({
  initialLanguage,
  onLanguageChange,
  onAuthenticated,
}: Props) {
  const [step, setStep] = useState<'language' | 'register' | 'verify'>('language');
  const [lang, setLang] = useState<LanguageCode>(initialLanguage);
  const dict = t(lang);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [birthDate, setBirthDate] = useState('2002-05-14');
  const [gender, setGender] = useState<'male' | 'female' | 'unspecified'>('unspecified');
  const [contactType, setContactType] = useState<'email' | 'phone'>('email');
  const [email, setEmail] = useState('');
  const [countryIso, setCountryIso] = useState('RU');
  const [countrySearch, setCountrySearch] = useState('');
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [phoneDigits, setPhoneDigits] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
  const [parentalConsent, setParentalConsent] = useState(false);

  const [otpCode, setOtpCode] = useState('');
  const [previewCode, setPreviewCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const selectedCountry = useMemo(
    () => ALL_COUNTRIES.find((c) => c.iso === countryIso) || ALL_COUNTRIES[0],
    [countryIso],
  );

  const filteredCountries = useMemo(() => {
    const q = countrySearch.trim().toLowerCase();
    if (!q) return ALL_COUNTRIES;
    return ALL_COUNTRIES.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.dial.includes(q) ||
        c.iso.toLowerCase().includes(q),
    );
  }, [countrySearch]);

  const age = calcAge(birthDate);
  const isUnder13 = age < 13;
  const isUnder18 = age >= 13 && age < 18;

  const fullContact =
    contactType === 'email'
      ? email.trim()
      : `${selectedCountry.dial}${phoneDigits.replace(/\D/g, '')}`;

  const handleLanguagePick = (code: LanguageCode) => {
    setLang(code);
    onLanguageChange(code);
  };

  const handleGoogleSignIn = async () => {
    setError('');
    if (isUnder13) {
      setError(dict.under13Blocked);
      return;
    }
    if (!acceptedTerms || !acceptedPrivacy) {
      setError('Необходимо принять Условия использования и Политику конфиденциальности.');
      return;
    }
    setLoading(true);
    try {
      await signInWithPopup(auth, googleAuthProvider);
      const data = await apiFetch<{ user: UserProfile }>('/api/auth/session', {
        method: 'POST',
        body: JSON.stringify({
          firstName: firstName || undefined,
          lastName: lastName || undefined,
          birthDate,
          gender,
          language: lang,
          parentalConsent,
        }),
      });
      onAuthenticated(data.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google Sign-In error');
    } finally {
      setLoading(false);
    }
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (isUnder13) {
      setError(dict.under13Blocked);
      return;
    }
    if (!firstName.trim() || !lastName.trim()) {
      setError('Введите имя и фамилию.');
      return;
    }
    if (!fullContact || fullContact.length < 4) {
      setError('Введите корректный email или номер телефона.');
      return;
    }
    if (!acceptedTerms || !acceptedPrivacy) {
      setError('Примите Условия использования и Политику конфиденциальности.');
      return;
    }

    setLoading(true);
    try {
      const res = await apiFetch<{ sent: boolean; verificationCodePreview?: string }>(
        '/api/auth/send-code',
        {
          method: 'POST',
          body: JSON.stringify({ contact: fullContact }),
        },
      );
      setPreviewCode(res.verificationCodePreview || '');
      setStep('verify');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось отправить код');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await apiFetch<{ token: string; user: UserProfile }>(
        '/api/auth/verify-register',
        {
          method: 'POST',
          body: JSON.stringify({
            contact: fullContact,
            contactType,
            code: otpCode,
            firstName,
            lastName,
            birthDate,
            gender,
            language: lang,
            acceptedTerms,
            acceptedPrivacy,
            parentalConsent,
          }),
        },
      );
      setLocalSessionToken(res.token);
      onAuthenticated(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Неверный код подтверждения');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      dir={LANGUAGES.find((l) => l.code === lang)?.rtl ? 'rtl' : 'ltr'}
      className="min-h-screen bg-black text-white flex flex-col justify-between p-4 sm:p-8"
    >
      <div className="max-w-3xl w-full mx-auto my-auto">
        <div className="flex items-center justify-between mb-8">
          <KinetixLogo size={36} />
          {step !== 'language' && (
            <button
              type="button"
              onClick={() => setStep('language')}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#1C1C1E] border border-white/10 text-xs text-zinc-300 hover:text-white transition-colors min-h-[40px]"
            >
              <Globe className="w-4 h-4 text-[#00E5FF]" />
              <span>{LANGUAGES.find((l) => l.code === lang)?.flag}</span>
              <span>{LANGUAGES.find((l) => l.code === lang)?.nativeName}</span>
            </button>
          )}
        </div>

        {/* STEP 1: LANGUAGE GATE BEFORE LOGIN */}
        {step === 'language' && (
          <div className="bg-[#121212] border border-white/10 rounded-3xl p-6 sm:p-8">
            <div className="mb-6">
              <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-white">
                {dict.chooseLanguage}
              </h1>
              <p className="text-sm text-zinc-400 mt-1.5">{dict.appTagline}</p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 max-h-[52vh] overflow-y-auto pr-1">
              {LANGUAGES.map((item) => {
                const active = item.code === lang;
                return (
                  <button
                    key={item.code}
                    type="button"
                    onClick={() => handleLanguagePick(item.code)}
                    className={`flex items-center gap-3 p-3.5 rounded-2xl border text-left transition-all min-h-[52px] ${
                      active
                        ? 'bg-[#00E5FF]/12 border-[#00E5FF] text-white'
                        : 'bg-[#1C1C1E] border-white/8 text-zinc-300 hover:border-white/25'
                    }`}
                  >
                    <span className="text-xl shrink-0">{item.flag}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{item.nativeName}</div>
                      <div className="text-[11px] text-zinc-500 truncate">{item.name}</div>
                    </div>
                    {active && <Check className="w-4 h-4 text-[#00E5FF] shrink-0" />}
                  </button>
                );
              })}
            </div>

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setStep('register')}
                className="w-full sm:w-auto px-7 py-3.5 rounded-2xl bg-[#00E5FF] text-black font-semibold text-sm flex items-center justify-center gap-2 hover:bg-[#33ECFF] active:scale-[0.98] transition-all min-h-[48px]"
              >
                <span>{dict.continueBtn}</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: PERSONAL DATA, CONTACT & AGE/CONSENT */}
        {step === 'register' && (
          <form
            onSubmit={handleSendOtp}
            className="bg-[#121212] border border-white/10 rounded-3xl p-6 sm:p-8 space-y-5"
          >
            <div>
              <h1 className="font-display text-2xl font-bold text-white">
                {dict.createAccount}
              </h1>
              <p className="text-sm text-zinc-400 mt-1">
                Создайте профиль Kinetix для облачного сохранения проектов и ИИ-генерации
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5">{dict.firstName}</label>
                <input
                  type="text"
                  required
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Алишер"
                  className="w-full h-11 px-3.5 rounded-xl bg-[#1C1C1E] border border-white/10 text-sm text-white focus:outline-none focus:border-[#00E5FF]"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5">{dict.lastName}</label>
                <input
                  type="text"
                  required
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Каримов"
                  className="w-full h-11 px-3.5 rounded-xl bg-[#1C1C1E] border border-white/10 text-sm text-white focus:outline-none focus:border-[#00E5FF]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5">
                  {dict.birthDate} ({age >= 0 && age < 120 ? `${age} лет` : '—'})
                </label>
                <input
                  type="date"
                  required
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                  className="w-full h-11 px-3.5 rounded-xl bg-[#1C1C1E] border border-white/10 text-sm text-white focus:outline-none focus:border-[#00E5FF]"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5">{dict.gender}</label>
                <select
                  value={gender}
                  onChange={(e) =>
                    setGender(e.target.value as 'male' | 'female' | 'unspecified')
                  }
                  className="w-full h-11 px-3.5 rounded-xl bg-[#1C1C1E] border border-white/10 text-sm text-white focus:outline-none focus:border-[#00E5FF]"
                >
                  <option value="male">{dict.male}</option>
                  <option value="female">{dict.female}</option>
                  <option value="unspecified">{dict.unspecified}</option>
                </select>
              </div>
            </div>

            {isUnder13 && (
              <div className="p-3.5 rounded-2xl bg-[#FF2D6F]/15 border border-[#FF2D6F]/40 flex items-center gap-3 text-sm text-[#FF7DA6]">
                <AlertTriangle className="w-5 h-5 shrink-0 text-[#FF2D6F]" />
                <span>{dict.under13Blocked}</span>
              </div>
            )}

            {isUnder18 && (
              <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-2 text-xs text-amber-200">
                <div className="flex items-center gap-2 font-medium">
                  <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>{dict.under18Warning}</span>
                </div>
                <label className="flex items-center gap-2.5 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={parentalConsent}
                    onChange={(e) => setParentalConsent(e.target.checked)}
                    className="w-4 h-4 accent-[#00E5FF]"
                  />
                  <span>{dict.parentalConsentLabel}</span>
                </label>
              </div>
            )}

            {/* Contact Method Toggle */}
            <div>
              <div className="flex items-center gap-1 p-1 rounded-xl bg-[#1C1C1E] w-fit mb-3">
                <button
                  type="button"
                  onClick={() => setContactType('email')}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium transition-colors min-h-[36px] ${
                    contactType === 'email'
                      ? 'bg-[#00E5FF] text-black'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <Mail className="w-3.5 h-3.5" />
                  <span>{dict.email}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setContactType('phone')}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium transition-colors min-h-[36px] ${
                    contactType === 'phone'
                      ? 'bg-[#00E5FF] text-black'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <Phone className="w-3.5 h-3.5" />
                  <span>{dict.phone}</span>
                </button>
              </div>

              {contactType === 'email' ? (
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full h-11 px-3.5 rounded-xl bg-[#1C1C1E] border border-white/10 text-sm text-white focus:outline-none focus:border-[#00E5FF]"
                />
              ) : (
                <div className="relative flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowCountryPicker((v) => !v)}
                    className="h-11 px-3 rounded-xl bg-[#1C1C1E] border border-white/10 text-sm text-white flex items-center gap-1.5 shrink-0 hover:border-white/25"
                  >
                    <span>{selectedCountry.flag}</span>
                    <span className="font-mono-tabular">{selectedCountry.dial}</span>
                  </button>
                  <input
                    type="tel"
                    value={phoneDigits}
                    onChange={(e) => setPhoneDigits(e.target.value)}
                    placeholder="90 123 45 67"
                    className="flex-1 h-11 px-3.5 rounded-xl bg-[#1C1C1E] border border-white/10 text-sm text-white font-mono-tabular focus:outline-none focus:border-[#00E5FF]"
                  />

                  {showCountryPicker && (
                    <div className="absolute left-0 top-12 z-30 w-72 bg-[#1C1C1E] border border-white/15 rounded-2xl p-2 shadow-2xl">
                      <div className="flex items-center gap-2 px-2.5 py-1.5 bg-black/40 rounded-xl mb-1.5">
                        <Search className="w-3.5 h-3.5 text-zinc-400" />
                        <input
                          type="text"
                          value={countrySearch}
                          onChange={(e) => setCountrySearch(e.target.value)}
                          placeholder="Поиск страны или кода..."
                          className="w-full bg-transparent text-xs text-white focus:outline-none"
                        />
                      </div>
                      <div className="max-h-48 overflow-y-auto space-y-0.5">
                        {filteredCountries.map((c) => (
                          <button
                            key={c.iso}
                            type="button"
                            onClick={() => {
                              setCountryIso(c.iso);
                              setShowCountryPicker(false);
                            }}
                            className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs text-zinc-200 hover:bg-white/10"
                          >
                            <span className="flex items-center gap-2 truncate">
                              <span>{c.flag}</span>
                              <span className="truncate">{c.name}</span>
                            </span>
                            <span className="font-mono-tabular text-zinc-400">{c.dial}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Legal Checkboxes */}
            <div className="space-y-2.5 pt-1 text-xs text-zinc-300">
              <label className="flex items-center gap-3 cursor-pointer min-h-[32px]">
                <input
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={(e) => setAcceptedTerms(e.target.checked)}
                  className="w-4 h-4 accent-[#00E5FF]"
                />
                <span>{dict.acceptTerms}</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer min-h-[32px]">
                <input
                  type="checkbox"
                  checked={acceptedPrivacy}
                  onChange={(e) => setAcceptedPrivacy(e.target.checked)}
                  className="w-4 h-4 accent-[#00E5FF]"
                />
                <span>{dict.acceptPrivacy}</span>
              </label>
            </div>

            {error && (
              <div className="text-xs text-[#FF2D6F] bg-[#FF2D6F]/10 border border-[#FF2D6F]/30 rounded-xl px-3.5 py-2.5">
                {error}
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                type="submit"
                disabled={loading || isUnder13}
                className="flex-1 h-12 rounded-2xl bg-[#00E5FF] text-black font-semibold text-sm hover:bg-[#33ECFF] disabled:opacity-40 transition-all"
              >
                {loading ? '...' : dict.sendCode}
              </button>
              <button
                type="button"
                disabled={loading || isUnder13}
                onClick={handleGoogleSignIn}
                className="flex-1 h-12 rounded-2xl bg-[#1C1C1E] border border-white/15 text-white font-medium text-sm hover:bg-white/10 disabled:opacity-40 transition-all"
              >
                {dict.signInGoogle}
              </button>
            </div>
          </form>
        )}

        {/* STEP 3: OTP VERIFICATION */}
        {step === 'verify' && (
          <form
            onSubmit={handleVerifyOtp}
            className="bg-[#121212] border border-white/10 rounded-3xl p-6 sm:p-8 space-y-5 max-w-md mx-auto"
          >
            <div>
              <h2 className="font-display text-xl font-bold text-white">
                Подтверждение контакта
              </h2>
              <p className="text-xs text-zinc-400 mt-1">
                Код отправлен на <span className="text-white font-medium">{fullContact}</span>
              </p>
            </div>

            {previewCode && (
              <div className="p-3 rounded-xl bg-[#00E5FF]/10 border border-[#00E5FF]/30 text-xs text-[#00E5FF]">
                Тестовый код подтверждения: <strong className="font-mono-tabular text-sm">{previewCode}</strong>
              </div>
            )}

            <div>
              <label className="block text-xs text-zinc-400 mb-1.5">{dict.enterCode}</label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                required
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value)}
                placeholder="000000"
                className="w-full h-12 px-4 rounded-xl bg-[#1C1C1E] border border-white/10 text-center text-xl tracking-[0.35em] font-mono-tabular text-white focus:outline-none focus:border-[#00E5FF]"
              />
            </div>

            {error && (
              <div className="text-xs text-[#FF2D6F] bg-[#FF2D6F]/10 border border-[#FF2D6F]/30 rounded-xl px-3 py-2">
                {error}
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStep('register')}
                className="px-4 h-12 rounded-2xl bg-[#1C1C1E] text-sm text-zinc-300 hover:text-white"
              >
                {dict.back}
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 h-12 rounded-2xl bg-[#00E5FF] text-black font-semibold text-sm hover:bg-[#33ECFF] disabled:opacity-50"
              >
                {loading ? '...' : dict.verifyCode}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
